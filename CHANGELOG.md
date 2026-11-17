# Changelog

All notable changes to Music Video Cataloguer are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), with versions in the form
v<major>.<minor> (two-digit minor) to match the Git tags and Docker image tags. Versioning
restarted at v1.00; earlier changes are in [docs/HISTORY-before-1.00.md](docs/HISTORY-before-1.00.md).

## [Unreleased]

## [1.03] - 2026-11-17

### Changed
- Your music video folder now goes straight into `docker-compose.yml` (replace the
  `/path/to/music-videos` example), so it isn't set twice. `.env` holds only the app settings.
- The host port is set in `docker-compose.yml` (`"3001:3211"`), and the compose file runs
  `jason4bury/music-video-cataloguer:latest`.

### Removed
- `PORT`, `MUSIC_VIDEO_CATALOGUER_TAG`, `LIBRARY_HOST_DIR` and `DATA_HOST_DIR` from
  `.env.example`.

## [1.02] - 2026-11-17

### Changed
- `docker-compose.yml` and `.env.example` work for anyone again, with no shared Docker folder
  needed: one `.env` next to the compose file holds the port, image tag, video and data folders
  and app settings. Compose stops with a clear message if `LIBRARY_HOST_DIR` is missing.
- The database and thumbnails go in the `music-video-cataloguer-data` Docker volume unless
  `DATA_HOST_DIR` is set.
- The image tag (`MUSIC_VIDEO_CATALOGUER_TAG`) and host port (`PORT`) can be set in `.env` again.

### Removed
- The `ENV`, `CONFIGS` and `MUSIC` variables from a shared main `.env`, and the `home.group`
  label.

## [1.01] - 2026-11-16

### Changed
- `docker-compose.yml` now fits a shared Docker setup: the app's settings come from its own
  `.env` through `env_file` (`${ENV}/music-video-cataloguer/.env`), and the data and video
  folders come from `CONFIGS` and `MUSIC` in the main `.env` next to the compose file (videos
  are read from `${MUSIC}/videos`). It runs the published image; it no longer builds from
  source (use `docker build -t jason4bury/music-video-cataloguer .` for that). Adds a
  `home.group=Music` label.
- The host port is fixed at 3001, and `PORT`, `LIBRARY_PATH`, `DATA_DIR` and `SCAN_ON_START`
  inside the container are fixed in the compose file.

- `.env.example` now holds only the settings the app reads: `SCAN_INTERVAL_MINUTES`, the
  sign-in settings and `TRUST_PROXY`.

### Removed
- The `music-video-cataloguer-data` named volume.
- `PORT`, `MUSIC_VIDEO_CATALOGUER_TAG`, `LIBRARY_HOST_DIR` and `DATA_HOST_DIR` from
  `.env.example`: the port is fixed in the compose file and the folders come from the main
  `.env`.

## [1.00] - 2026-11-07

First release in the house style. Includes everything in the earlier history, plus:

### Added
- About dialog with the version, copyright, MIT licence and a link to the GitHub repository.
- "Remove from playlist" in the player while viewing a playlist (the server could already do
  this, but nothing in the app used it).
- Sign-in lockout: 10 wrong passwords from one address within 15 minutes blocks further tries
  for 15 minutes.
- Sessions are kept in the database, so restarting the container no longer signs everyone out.
  `SESSION_SECRET` is optional: if it's blank, one is generated and kept in the database.
- A warning in the sidebar when the last scan found the library offline or couldn't read a
  folder.
- `GET /healthz` and a Docker `HEALTHCHECK`.
- Favicon, home-screen icon and the app icon in the top bar, sign-in page and About.
- Basic security headers (no framing, no MIME sniffing, same-origin referrer).
- `docker-compose.yml` can build the image itself (`docker compose up -d --build`), and the image
  tag can be set with `MUSIC_VIDEO_CATALOGUER_TAG`.
- ESLint config (`npm run lint`), `.dockerignore` and OCI labels on the image.

### Changed
- The sign-in account now always matches `AUTH_USERNAME` / `AUTH_PASSWORD` in `.env`: change
  them and restart to change the account. Before, they were only read on the very first start.
- The app refuses to start with an example password such as `changeme`, or one under 8
  characters. `.env.example` leaves `AUTH_PASSWORD` blank (a password is then generated on the
  first start) instead of suggesting `changeme`.
- Settings: `LIBRARY_HOST_DIR` replaces `LIBRARY_PATH`, `DATA_HOST_DIR` replaces `CONFIGS` (blank
  uses the `music-video-cataloguer-data` Docker volume) and `PORT` replaces `APP_PORT`.
- `X-Forwarded-For` is only trusted with `TRUST_PROXY=true`, so the lockout can't be dodged by
  sending a made-up address.
- The session cookie is marked secure when the app is reached over HTTPS, and is cleared at
  sign-out.
- "Recently Added" sorts newest first.
- A video that ffmpeg can't read is tried once per change instead of on every scan.
- The video list is fetched in one query instead of one extra query per video for its tags.
- British spelling in the app (Favourites).
- Docker image pinned to Node.js 22.23.4 (Node.js 20 is end of life) and built from
  `package-lock.json` with `npm ci`; runs with `NODE_ENV=production`.
- Dependencies updated: Express 4.22.3, better-sqlite3 12, bcryptjs 3, express-session 1.19.
  `npm audit` is clean.
- `GET /health` no longer shows the library path to anyone who hasn't signed in.

### Fixed
- A rescan with the library folder offline, unmounted or empty deleted every video from the
  catalogue, and with them all tags, favourites and playlist entries. An artist folder that
  couldn't be read lost its videos the same way. Those videos are now kept.
- The "+" button for a new playlist was pushed out of the sidebar and hidden under the video
  grid.
- A replaced or re-encoded video kept its old thumbnail and length.
- Closing a video within 5 seconds and then playing another marked the first one as watched.
- A tag or artist folder with a `"` in it broke the sidebar filter for it.
- Streaming: a range past the end of the file, or with start after end, now gets "416 Range Not
  Satisfiable" instead of the whole file, "last N bytes" requests are served correctly, and a
  read error while streaming (a file removed mid-play, a dropped share) no longer crashes the
  server.
- Adding a video that doesn't exist to a playlist showed an HTML error page with a stack trace;
  errors now come back as a short JSON message.
- The sign-in page could redirect to another website through its `?redirect=` parameter.
- The `.gitignore` lines started with spaces (and two ended with a carriage return), so none of
  them matched and `.env`, `node_modules/` and `data/` could be committed.
- The CHANGELOG header was written out twice.
- On touch screens, the "+" on thumbnails and the delete button on playlists were invisible
  (they only appeared on mouse hover).
