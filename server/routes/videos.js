const express = require('express');
const fs = require('fs');
const mime = require('./mime');
const { db } = require('../db');
const { scanLibrary, getScanState } = require('../scanner');

const router = express.Router();

const MAX_TAG_LENGTH = 40;
const MAX_TAGS = 30;
// Tags are joined with the ASCII unit separator, which can't be typed into a tag.
const TAG_SEP = '\u001f';

const SELECT_VIDEOS = `
  SELECT v.*,
    (SELECT GROUP_CONCAT(name, char(31)) FROM (
       SELECT t.name FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
       WHERE vt.video_id = v.id ORDER BY t.name COLLATE NOCASE)) AS tag_list
  FROM videos v`;

function serializeVideo(row) {
  return {
    id: row.id,
    artist: row.artist,
    title: row.title,
    thumbnail: row.thumbnail || null,
    duration: row.duration,
    favorite: !!row.favorite,
    watched: !!row.watched,
    addedAt: row.added_at,
    tags: row.tag_list ? row.tag_list.split(TAG_SEP) : [],
  };
}

// Query-string values arrive as arrays if a name is repeated (?tag=a&tag=b); use the first.
function str(value) {
  if (Array.isArray(value)) value = value[0];
  return typeof value === 'string' ? value : '';
}

function videoId(param) {
  const id = Number(param);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getVideo(id) {
  return id ? db.prepare(`${SELECT_VIDEOS} WHERE v.id = ?`).get(id) : undefined;
}

// GET /api/videos?q=&artist=&tag=&favorite=1&watched=0&sort=artist|title|added|duration&dir=asc|desc&playlist=ID
router.get('/videos', (req, res) => {
  const q = str(req.query.q).trim();
  const artist = str(req.query.artist);
  const tag = str(req.query.tag);
  const favorite = str(req.query.favorite);
  const watched = str(req.query.watched);
  const playlist = str(req.query.playlist);
  const sortKey = str(req.query.sort);
  const sort = ['artist', 'title', 'added', 'duration'].includes(sortKey) ? sortKey : 'artist';
  const dir = str(req.query.dir) === 'desc' ? 'DESC' : 'ASC';
  const sortCol = { artist: 'v.artist', title: 'v.title', added: 'v.added_at', duration: 'v.duration' }[sort];

  const clauses = [];
  const params = {};

  if (q) {
    // Escape LIKE wildcards so searching for "100%" or "_" finds them literally.
    clauses.push("(v.artist LIKE @q ESCAPE '\\' OR v.title LIKE @q ESCAPE '\\')");
    params.q = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }
  if (artist) {
    clauses.push('v.artist = @artist');
    params.artist = artist;
  }
  if (favorite === '1') clauses.push('v.favorite = 1');
  if (watched === '0') clauses.push('v.watched = 0');
  if (watched === '1') clauses.push('v.watched = 1');
  if (tag) {
    clauses.push('v.id IN (SELECT vt.video_id FROM video_tags vt JOIN tags t ON t.id = vt.tag_id WHERE t.name = @tag)');
    params.tag = tag;
  }
  if (playlist) {
    clauses.push('v.id IN (SELECT pv.video_id FROM playlist_videos pv WHERE pv.playlist_id = @playlist)');
    params.playlist = Number(playlist) || 0;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  // "Recently Added" means newest first unless a direction is asked for.
  const order = sort === 'added' && !req.query.dir ? 'DESC' : dir;
  const rows = db
    .prepare(`${SELECT_VIDEOS} ${where} ORDER BY ${sortCol} COLLATE NOCASE ${order}, v.title COLLATE NOCASE ASC`)
    .all(params);

  res.json(rows.map(serializeVideo));
});

router.get('/artists', (_req, res) => {
  const rows = db.prepare('SELECT artist, COUNT(*) as count FROM videos GROUP BY artist ORDER BY artist COLLATE NOCASE').all();
  res.json(rows);
});

router.get('/tags', (_req, res) => {
  // Only tags that are on at least one video (a tag removed from its last video drops off).
  const rows = db
    .prepare(
      `SELECT t.name, COUNT(vt.video_id) as count FROM tags t JOIN video_tags vt ON vt.tag_id = t.id GROUP BY t.id ORDER BY t.name COLLATE NOCASE`
    )
    .all();
  res.json(rows);
});

router.get('/videos/:id', (req, res) => {
  const row = getVideo(videoId(req.params.id));
  if (!row) return res.status(404).json({ error: 'not found' });
  const playlists = db.prepare('SELECT playlist_id AS id FROM playlist_videos WHERE video_id = ?').all(row.id).map((p) => p.id);
  res.json({ ...serializeVideo(row), playlists });
});

// PATCH /api/videos/:id  { favorite, watched, tags: [..] }
router.patch('/videos/:id', (req, res) => {
  const row = getVideo(videoId(req.params.id));
  if (!row) return res.status(404).json({ error: 'not found' });

  const { favorite, watched, tags } = req.body || {};

  if (typeof favorite === 'boolean') {
    db.prepare('UPDATE videos SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, row.id);
  }
  if (typeof watched === 'boolean') {
    db.prepare('UPDATE videos SET watched = ? WHERE id = ?').run(watched ? 1 : 0, row.id);
  }
  if (Array.isArray(tags)) {
    const cleanTags = [...new Set(tags.map((t) => String(t).replace(/\s+/g, ' ').trim()).filter(Boolean))];
    if (cleanTags.length > MAX_TAGS) return res.status(400).json({ error: `a video can have at most ${MAX_TAGS} tags` });
    if (cleanTags.some((t) => t.length > MAX_TAG_LENGTH)) {
      return res.status(400).json({ error: `tags can be at most ${MAX_TAG_LENGTH} characters` });
    }
    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    const getTagId = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');
    const clearVideoTags = db.prepare('DELETE FROM video_tags WHERE video_id = ?');
    const linkTag = db.prepare('INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)');

    db.transaction(() => {
      clearVideoTags.run(row.id);
      for (const t of cleanTags) {
        insertTag.run(t);
        linkTag.run(row.id, getTagId.get(t).id);
      }
      db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM video_tags)').run();
    })();
  }

  res.json(serializeVideo(getVideo(row.id)));
});

// GET /api/videos/:id/stream: range-request video streaming
router.get('/videos/:id/stream', (req, res) => {
  const id = videoId(req.params.id);
  const row = id && db.prepare('SELECT filepath FROM videos WHERE id = ?').get(id);
  if (!row) return res.status(404).end();

  let stat;
  try {
    stat = fs.statSync(row.filepath);
  } catch {
    return res.status(404).end();
  }
  const fileSize = stat.size;
  const contentType = mime.lookup(row.filepath);

  const send = (status, headers, opts) => {
    res.writeHead(status, { 'Accept-Ranges': 'bytes', 'Content-Type': contentType, ...headers });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(row.filepath, opts);
    // Without this, a read error (file removed mid-play, share dropped) would crash the server.
    stream.on('error', (err) => {
      console.error(`Stream error for ${row.filepath}: ${err.message}`);
      res.destroy();
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  };

  const range = req.headers.range;
  if (!range) return send(200, { 'Content-Length': fileSize });

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  // A Range header that isn't a single byte range (or is malformed) is ignored, as the HTTP spec
  // says, and the whole file is sent.
  if (!match || (match[1] === '' && match[2] === '')) return send(200, { 'Content-Length': fileSize });
  let start;
  let end;
  if (match[1] !== '') {
    start = parseInt(match[1], 10);
    end = match[2] !== '' ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1;
  } else {
    // "bytes=-500" means the last 500 bytes.
    const suffix = parseInt(match[2], 10);
    start = Math.max(fileSize - suffix, 0);
    end = fileSize - 1;
  }
  if (start > end || start >= fileSize) {
    res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
    return res.end();
  }

  return send(206, { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Content-Length': end - start + 1 }, { start, end });
});

router.post('/scan', (_req, res) => {
  if (getScanState().running) return res.status(409).json(getScanState());
  scanLibrary(); // runs in the background; poll /api/scan/status
  res.json({ started: true });
});

router.get('/scan/status', (_req, res) => {
  res.json(getScanState());
});

module.exports = router;
