# API image: FastAPI plus the tools the verifier shells out to (promtool, amtool, jq).
# Build from the repository root: docker build -f deploy/api.Dockerfile .

FROM debian:bookworm-slim AS tools
RUN apt-get update -q && apt-get install -y -q --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /dl
# Same versions as scripts/get-tools.ps1. Each download is checked against its release's checksum file.
RUN set -eu; arch=$(dpkg --print-architecture); \
    fetch() { curl -fsSLO "$1/$2"; curl -fsSL "$1/$3" | grep " $2\$" | sha256sum -c -; }; \
    fetch https://github.com/prometheus/prometheus/releases/download/v3.2.1 prometheus-3.2.1.linux-$arch.tar.gz sha256sums.txt; \
    fetch https://github.com/prometheus/alertmanager/releases/download/v0.28.1 alertmanager-0.28.1.linux-$arch.tar.gz sha256sums.txt; \
    fetch https://github.com/jqlang/jq/releases/download/jq-1.7.1 jq-linux-$arch sha256sum.txt; \
    mkdir /out; \
    tar -xzf prometheus-3.2.1.linux-$arch.tar.gz -C /out --strip-components=1 --wildcards '*/promtool'; \
    tar -xzf alertmanager-0.28.1.linux-$arch.tar.gz -C /out --strip-components=1 --wildcards '*/amtool'; \
    install -m 755 jq-linux-$arch /out/jq

FROM python:3.11-slim-bookworm
# curl is the TTU plugin's HTTP client; openssl makes the Redfish mock's self-signed certificate.
RUN apt-get update -q && apt-get install -y -q --no-install-recommends curl openssl \
 && rm -rf /var/lib/apt/lists/*
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install -q -r requirements.txt
# The backend reads files outside backend/ (legacy configs, frontend fixtures), so the repo layout is kept.
COPY legacy /app/legacy
COPY frontend/src/fixtures /app/frontend/src/fixtures
COPY backend/engine engine
COPY backend/app app
COPY --from=tools /out/ bin/
# .work (SQLite, snapshots) and cache (recorded model replies) are volumes in compose; the app user owns them.
RUN useradd --system --no-create-home damo && install -d -o damo -g damo .work cache .certs
USER damo
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/mode', timeout=2)"
# Exactly one worker: findings, hand-off and certificates live in one in-memory dict (app/main.py STATE).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
