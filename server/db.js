const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const THUMB_DIR = path.join(DATA_DIR, 'thumbnails');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(THUMB_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'catalogue.db'));
db.pragma('journal_mode = WAL');
// better-sqlite3 turns foreign keys on by default; set it explicitly because the playlist and tag
// tables rely on ON DELETE CASCADE.
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist TEXT NOT NULL,
    title TEXT NOT NULL,
    filepath TEXT NOT NULL UNIQUE,
    thumbnail TEXT,
    duration REAL,
    favorite INTEGER NOT NULL DEFAULT 0,
    watched INTEGER NOT NULL DEFAULT 0,
    file_mtime TEXT,
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
  );

  CREATE TABLE IF NOT EXISTS video_tags (
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (video_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playlist_videos (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (playlist_id, video_id)
  );

  -- Sign-in sessions, so a container restart doesn't sign everyone out.
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    expires INTEGER,
    data TEXT NOT NULL
  );

  -- Small key/value store for app settings (currently the generated session secret).
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_videos_artist ON videos(artist);
  CREATE INDEX IF NOT EXISTS idx_videos_title ON videos(title);
  CREATE INDEX IF NOT EXISTS idx_video_tags_tag ON video_tags(tag_id);
`);

module.exports = { db, DATA_DIR, THUMB_DIR };
