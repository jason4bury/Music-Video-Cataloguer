# Music Video Cataloguer history before v1.00

This is the changelog as it stood before versioning restarted at v1.00 on 2026-11-07. Newer changes are in [CHANGELOG.md](../CHANGELOG.md).

## [1.5.0] - Published image & config path rename
- `docker-compose.yml` now pulls the published `jason4bury/music-video-cataloguer`
  image from Docker Hub instead of building locally (`build: .` still works
  as a drop-in replacement if you'd rather build from source)
- Renamed the `DATA_PATH` env var to `CONFIGS`; the app's data/thumbnails
  now live under `<CONFIGS>/music-video-cataloguer` on the host
- Removed the built-in `:-default` fallbacks from `docker-compose.yml`'s
  env vars — values now come from `.env` (see `.env.example`)

## [1.4.0] - GitHub-ready packaging
- Added `.gitignore`, `.env.example`, and `LICENSE`
- `docker-compose.yml` now reads library path, data path, port, and login
  credentials from `.env` instead of having them hardcoded

## [1.3.0] - Scan progress
- Live progress bar in the sidebar while a scan is running, showing file
  count and percentage
- Removed the manual Scan button — scans now run automatically on
  container start and on the configured interval (`SCAN_INTERVAL_MINUTES`)

## [1.2.0] - Quick playlist actions
- "+" button on each video thumbnail to add it to a playlist without
  opening the player
- Delete-playlist option (✕) in the sidebar, with confirmation

## [1.1.0] - Login screen
- Session-based login gating the entire app (grid, thumbnails, streaming,
  and API)
- One account auto-created on first start from `AUTH_USERNAME` /
  `AUTH_PASSWORD`; a random password is generated and logged if none is set
- Sign out button in the top bar

## [1.0.0] - Initial release
- Docker-based cataloguer/viewer: Node.js/Express backend, vanilla JS
  frontend, SQLite for metadata, ffmpeg for thumbnails and durations
- Library scanning parses artist and title from an `Artist/Artist -
  Title.ext` folder layout
- Search by artist/title, filter by artist or tag, favorites-only toggle
- Sort by artist, title, date added, or duration
- Tagging, favoriting, and watched-status tracking
- Playlists: create, add videos, filter the grid by playlist
- Range-request video streaming so scrubbing works properly in the browser

## After 1.5.0 (not given a version number)

- New icon and README image (2026-10-14).
- Added `.gitignore` (2026-11-06).
