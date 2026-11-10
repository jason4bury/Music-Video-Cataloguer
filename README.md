<p align="center">
  <img src="assets/Music-Video-Cataloguer.png" alt="Music Video Cataloguer icon" width="128">
</p>

# Music Video Cataloguer

A self-hosted web app for browsing, tagging and playing your music video collection, run in Docker.

![Version](https://img.shields.io/badge/version-v1.00-blue)
![Platform](https://img.shields.io/badge/platform-Docker-2496ED?logo=docker&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![Licence](https://img.shields.io/badge/licence-MIT-green)
![Last commit](https://img.shields.io/github/last-commit/jason4bury/Music-Video-Cataloguer)

Music Video Cataloguer scans a folder of music videos (one subfolder per artist), reads each video's length and makes a thumbnail with ffmpeg, and keeps it all in a SQLite database. You search, filter, tag and play everything from a browser.

## ✨ Features

- **Library scanning**: picks up new, changed and removed videos on start-up and every hour (or whatever `SCAN_INTERVAL_MINUTES` says), with a progress bar in the sidebar. If the library folder is offline or empty, or an artist folder can't be read, its videos are kept (with a warning) rather than removed, so tags, favourites and playlists are never lost to an unplugged drive.
- **Artist and title from the file name**: the folder name is the artist; a matching `Artist - ` at the start of the file name is dropped from the title.
- **Thumbnails and lengths** from ffmpeg and ffprobe (included in the Docker image). A replaced or re-encoded video gets a new thumbnail on the next scan.
- **Search and filters**: search by artist or title, filter by artist, tag, playlist or favourites, and sort by artist, title, recently added or length.
- **Player**: streams in the browser with proper seeking. A video counts as watched after 5 seconds, or tick Watched yourself.
- **Tags and favourites** on every video.
- **Playlists**: create and delete them, add a video from the "+" on its thumbnail or from the player, and remove it again from the player while viewing that playlist.
- **Sign-in**: one account from `.env`, sessions that survive a restart, and a lockout after 10 wrong passwords in 15 minutes.
- **Health check**: `GET /healthz` for Docker, Portainer and uptime monitors.

## 📋 Requirements

- Docker with Docker Compose v2 (Docker Desktop on Windows, or Docker Engine on Linux or a NAS)
- Your music video folder reachable from the Docker host, laid out as one folder per artist:

  ```
  Music Videos/
    Daft Punk/
      Daft Punk - Around the World.mp4
      One More Time.mp4
    Sia/
      Sia - Chandelier.mp4
  ```

  Supported types: `.mp4`, `.m4v`, `.mkv`, `.webm`, `.mov` and `.avi`. Videos in deeper subfolders are not picked up. Browsers play MP4 (H.264) and WebM best; MKV, MOV and AVI depend on the browser and codec.
- To run without Docker: Node.js 22 or later, and ffmpeg on the PATH

## 📦 Installation

1. Download or clone this repository onto the Docker host.
2. Copy `.env.example` to `.env` and set at least `LIBRARY_HOST_DIR` (your music video folder) and `AUTH_PASSWORD` (see Configuration below).
3. Start it from the repository folder:

   ```
   docker compose up -d
   ```

   This pulls `jason4bury/music-video-cataloguer` from Docker Hub. To build the image from the source instead, run `docker compose up -d --build`.
4. Open `http://<your-server>:3001` (or the `PORT` you set) and sign in. The first scan starts on its own.

If you left `AUTH_PASSWORD` blank, the generated password is in `docker compose logs music-video-cataloguer`. It's only shown on the very first start.

**Updating:** `docker compose pull` then `docker compose up -d`. Tags, favourites and playlists are kept.

## 🚀 Usage

- Click a video to play it. Favourite, Watched, tags and "Add to playlist" are under the player.
- The **+** on a thumbnail adds the video to a playlist without opening it.
- Click an artist, tag or playlist in the sidebar to filter; click the artist or tag again to clear it.
- **About** shows the version, licence and a link to this repository.

### If a scan finds no videos

The app can't see anything at the path you gave it. Check the mount from inside the container:

```
docker compose exec music-video-cataloguer ls -la /videos
```

If that's empty, check `LIBRARY_HOST_DIR` in `.env`. On Windows with Docker Desktop's older Hyper-V backend, also check the drive is shared under Settings > Resources > File sharing (the WSL 2 backend shares all drives).

## ⚙️ Configuration

All settings live in `.env` next to `docker-compose.yml`. `.env` is gitignored; `.env.example` shows every setting.

| Setting | Required | What it does |
| --- | --- | --- |
| `PORT` | | Port on the host (default `3001`) |
| `MUSIC_VIDEO_CATALOGUER_TAG` | | Image tag to run: `latest` (default) or a version such as `1.00` |
| `LIBRARY_HOST_DIR` | Yes | Your music video folder on the host, mounted read-only |
| `DATA_HOST_DIR` | | Host folder for the database and thumbnails. Blank uses the `music-video-cataloguer-data` Docker volume |
| `SCAN_INTERVAL_MINUTES` | | Rescan interval in minutes (default `60`); `0` turns it off |
| `AUTH_USERNAME` | | Sign-in username (default `admin`) |
| `AUTH_PASSWORD` | | Sign-in password, at least 8 characters. Blank generates one on the first start |
| `SESSION_SECRET` | | Random string of 32+ characters that signs session cookies. Blank generates one and keeps it in the database |
| `TRUST_PROXY` | | `true` behind a reverse proxy, so the lockout sees real client addresses |

The account always matches `.env`: change `AUTH_USERNAME` or `AUTH_PASSWORD` and restart the container to change it in the app (everyone is signed out). The app refuses to start with an example password such as `changeme`, and says why in `docker compose logs music-video-cataloguer`.

### Where data is stored

The database (`catalogue.db`: videos, tags, favourites, watched status, playlists and sessions) and the `thumbnails` folder are in the container's `/data` folder, which is the `music-video-cataloguer-data` Docker volume, or `DATA_HOST_DIR` if you set it. It survives rebuilds and updates. Back it up if you've spent time tagging: it's the only thing that can't be rebuilt from your video files. The app never writes to your video folder.

### Putting it on the internet

- Put it behind a reverse proxy with HTTPS (Nginx Proxy Manager, Caddy, Traefik, Synology) rather than forwarding the port from your router, and set `TRUST_PROXY=true`. The session cookie is marked secure automatically over HTTPS.
- Use a strong `AUTH_PASSWORD`.
- If you only need it yourself, a WireGuard or Tailscale tunnel avoids exposing it at all.

### Running without Docker

Install Node.js 22+ and ffmpeg, run `npm ci --omit=dev`, set `LIBRARY_PATH` and `DATA_DIR` in `.env` to real folders on that machine, and start it with `npm start` (it reads `.env` itself). It listens on port `3211` unless you set `PORT`.

### Project layout

```
server/
  index.js               Express app, start-up checks, sessions, security headers
  auth.js                sign-in account, sign-in and lockout
  db.js                  SQLite schema
  scanner.js             scans the library, ffprobe lengths and ffmpeg thumbnails
  sqliteSessionStore.js  keeps sessions in SQLite
  version.js             shows package.json's version as v1.00
  routes/videos.js       videos, artists, tags, streaming and scan endpoints
  routes/playlists.js    playlist endpoints
  routes/mime.js         video content types
public/                  the browser app (index.html, login.html, app.js, style.css, icons)
assets/                  icon and README image
docs/                    history before v1.00
```

Run `npm run lint` (ESLint) before committing.

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md). Changes before v1.00 are in [docs/HISTORY-before-1.00.md](docs/HISTORY-before-1.00.md).

## 📄 Licence

MIT, see [LICENSE](LICENSE). Copyright (c) 2026 Jason Rhodes.
