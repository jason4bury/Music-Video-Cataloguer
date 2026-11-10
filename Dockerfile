# Music Video Cataloguer v1.00. Build with: docker compose build
# (or docker build -t jason4bury/music-video-cataloguer:1.00 .)
# Node.js is pinned to an exact version so every build is the same; bump it here on purpose.
ARG NODE_IMAGE=node:22.23.4-bookworm-slim

# --- Build stage: install production dependencies from package-lock.json ---
# better-sqlite3 needs build tools if no prebuilt binary matches the CPU architecture.
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Runtime stage ---
FROM ${NODE_IMAGE}
LABEL org.opencontainers.image.title="Music Video Cataloguer" \
      org.opencontainers.image.description="Self-hosted web app for cataloguing, tagging and playing a music video collection" \
      org.opencontainers.image.version="1.00" \
      org.opencontainers.image.source="https://github.com/jason4bury/Music-Video-Cataloguer" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.authors="Jason Rhodes"

# ffmpeg/ffprobe read each video's length and make its thumbnail.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public

ENV NODE_ENV=production \
    PORT=3211 \
    LIBRARY_PATH=/videos \
    DATA_DIR=/data \
    SCAN_ON_START=true \
    SCAN_INTERVAL_MINUTES=60
EXPOSE 3211

VOLUME ["/data"]

# Backs Docker's own health status (docker ps, Portainer) with GET /healthz. Uses Node itself to
# make the request, since this slim image has no curl or wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3211)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/index.js"]
