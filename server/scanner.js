const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { db, THUMB_DIR } = require('./db');

const LIBRARY_PATH = process.env.LIBRARY_PATH || '/videos';
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.webm', '.mov', '.m4v']);

function freshState() {
  return {
    running: false,
    scanned: 0,
    total: 0,
    added: 0,
    removed: 0,
    errors: [],
    warning: null,
    startedAt: null,
    finishedAt: null,
  };
}

let scanState = freshState();

function getScanState() {
  return { ...scanState, errors: scanState.errors.slice(-20) };
}

// "Artist - Title.mp4" -> { artist, title } using the folder name as the
// authoritative artist and stripping a redundant "Artist - " filename prefix.
function parseMetadata(folderArtist, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const prefix = `${folderArtist} - `;
  let title = base;
  if (base.toLowerCase().startsWith(prefix.toLowerCase())) {
    title = base.slice(prefix.length);
  } else {
    const dashIdx = base.indexOf(' - ');
    if (dashIdx !== -1) {
      title = base.slice(dashIdx + 3);
    }
  }
  return { artist: folderArtist.trim(), title: title.trim() || base.trim() };
}

function runFfprobe(filepath) {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filepath],
      { timeout: 15000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const val = parseFloat(stdout);
        resolve(Number.isFinite(val) ? val : null);
      }
    );
  });
}

// Resolves to true if a thumbnail was written.
function generateThumbnail(filepath, outPath, duration) {
  return new Promise((resolve) => {
    const seekTo = duration && duration > 4 ? Math.min(duration * 0.1, 30) : 1;
    execFile(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-ss', String(seekTo), '-i', filepath, '-frames:v', '1', '-vf', 'scale=480:-1', outPath],
      { timeout: 20000 },
      (err) => resolve(!err && fs.existsSync(outPath))
    );
  });
}

function removeFile(p) {
  try {
    fs.unlinkSync(p);
  } catch {
    // already gone
  }
}

// Lists every video one folder down (Artist/Video.ext). Also reports what couldn't be read, so
// the scan can tell "the file was deleted" apart from "the drive or share is offline".
function walkLibrary() {
  const result = { found: [], rootReadable: true, artistFolders: 0, unreadable: [] };
  let artistDirs;
  try {
    artistDirs = fs.readdirSync(LIBRARY_PATH, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    result.rootReadable = false;
    return result;
  }
  result.artistFolders = artistDirs.length;
  for (const dirent of artistDirs) {
    const artist = dirent.name;
    const artistPath = path.join(LIBRARY_PATH, artist);
    let files;
    try {
      files = fs.readdirSync(artistPath, { withFileTypes: true });
    } catch {
      result.unreadable.push(artistPath);
      continue;
    }
    for (const f of files) {
      if (!f.isFile()) continue;
      if (!VIDEO_EXTENSIONS.has(path.extname(f.name).toLowerCase())) continue;
      result.found.push({ artist, filepath: path.join(artistPath, f.name), filename: f.name });
    }
  }
  return result;
}

async function scanLibrary() {
  if (scanState.running) return scanState;
  scanState = { ...freshState(), running: true, startedAt: new Date().toISOString() };

  try {
    const walk = walkLibrary();
    const filesOnDisk = walk.found;
    scanState.total = filesOnDisk.length;

    const insertStmt = db.prepare(
      `INSERT INTO videos (artist, title, filepath, file_mtime) VALUES (@artist, @title, @filepath, @mtime)`
    );
    const changedStmt = db.prepare('UPDATE videos SET file_mtime = ?, thumbnail = NULL, duration = NULL WHERE id = ?');
    const mediaStmt = db.prepare('UPDATE videos SET thumbnail = ?, duration = ? WHERE id = ?');
    const existingByPath = new Map(
      db.prepare('SELECT id, filepath, file_mtime, thumbnail FROM videos').all().map((r) => [r.filepath, r])
    );
    const seenPaths = new Set();

    for (const file of filesOnDisk) {
      scanState.scanned++;
      let mtime;
      try {
        mtime = fs.statSync(file.filepath).mtime.toISOString();
      } catch (e) {
        // Deleted or locked between listing the folder and reading it: leave it for next time.
        scanState.errors.push(`${file.filepath}: ${e.message}`);
        if (existingByPath.has(file.filepath)) seenPaths.add(file.filepath);
        continue;
      }
      seenPaths.add(file.filepath);
      const existing = existingByPath.get(file.filepath);
      const thumbPath = (id) => path.join(THUMB_DIR, `${id}.jpg`);

      let videoId;
      let needsMedia;
      if (!existing) {
        const { artist, title } = parseMetadata(file.artist, file.filename);
        videoId = insertStmt.run({ artist, title, filepath: file.filepath, mtime }).lastInsertRowid;
        scanState.added++;
        needsMedia = true;
      } else if (existing.file_mtime !== mtime) {
        // The file was replaced or re-encoded: read its length and make its thumbnail again.
        videoId = existing.id;
        changedStmt.run(mtime, videoId);
        removeFile(thumbPath(videoId));
        needsMedia = true;
      } else {
        videoId = existing.id;
        // NULL = never tried (or the thumbnail file went missing). '' = ffmpeg couldn't read the
        // file last time, so don't spend 35 seconds retrying it on every scan.
        needsMedia = existing.thumbnail === null || (existing.thumbnail !== '' && !fs.existsSync(thumbPath(videoId)));
      }

      if (needsMedia) {
        const duration = await runFfprobe(file.filepath);
        const ok = await generateThumbnail(file.filepath, thumbPath(videoId), duration);
        // The ?v= part changes whenever the thumbnail is remade, so browsers don't show a cached
        // old one.
        mediaStmt.run(ok ? `/thumbnails/${videoId}.jpg?v=${Date.now()}` : '', duration, videoId);
        if (!ok) scanState.errors.push(`${file.filepath}: ffmpeg couldn't make a thumbnail`);
      }
    }

    // Remove entries for files that are gone, but only from folders that were actually read. If
    // the library root is missing, unreadable or completely empty (a NAS that's off, an unmounted
    // drive), or one artist folder can't be read, its videos are kept: deleting them would also
    // delete their tags, favourites and playlist entries.
    const libraryLooksOffline = !walk.rootReadable || (walk.artistFolders === 0 && existingByPath.size > 0);
    if (libraryLooksOffline) {
      scanState.warning = `library folder ${LIBRARY_PATH} is missing or empty, so nothing was removed`;
    } else {
      const skipPrefixes = walk.unreadable.map((p) => p + path.sep);
      if (walk.unreadable.length) {
        scanState.warning = `couldn't read ${walk.unreadable.length} artist folder(s), so their videos were kept`;
        for (const p of walk.unreadable) scanState.errors.push(`${p}: folder couldn't be read`);
      }
      const removeStmt = db.prepare('DELETE FROM videos WHERE id = ?');
      for (const [filepath, row] of existingByPath) {
        if (seenPaths.has(filepath)) continue;
        if (skipPrefixes.some((prefix) => filepath.startsWith(prefix))) continue;
        removeStmt.run(row.id);
        removeFile(path.join(THUMB_DIR, `${row.id}.jpg`));
        scanState.removed++;
      }
    }
  } catch (e) {
    scanState.errors.push(e.message);
  } finally {
    scanState.running = false;
    scanState.finishedAt = new Date().toISOString();
  }

  return scanState;
}

module.exports = { scanLibrary, getScanState, LIBRARY_PATH };
