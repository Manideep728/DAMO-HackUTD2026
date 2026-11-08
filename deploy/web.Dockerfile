# Web image: the built frontend, served by Caddy, with /api passed to the api container.
# Build from the repository root: docker build -f deploy/web.Dockerfile .

FROM node:24-slim AS build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build && test -f dist/index.html

FROM caddy:2.10.0-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
# Caddy keeps locks and its instance id under /data and /config even with automatic HTTPS off.
RUN chown -R nobody:nobody /data /config
USER nobody
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
