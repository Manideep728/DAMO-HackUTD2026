# Deploy

**Live:** <https://damo.45.32.219.190.sslip.io>

One Vultr instance (`45.32.219.190`, Ubuntu 24.04, 1 vCPU, 2 GB, 2 GB swap), shared with the HackTX
ghostseats backup. The host's Caddy terminates HTTPS (Let's Encrypt on `sslip.io`) and proxies DAMO's
hostname to `127.0.0.1:8100`, where this compose project runs:

```
browser ─HTTPS─► host Caddy ─► web (Caddy: frontend/dist, /api/* ─►) api (uvicorn, 1 worker)
                                                                   └─ volumes: backend/.work, backend/cache
```

- **One worker, one server.** Console findings, hand-off and certificates live in one in-memory dict
  (`backend/app/main.py`), and Preflight and retrofit decisions in SQLite under `backend/.work`. Meter
  readings come from Tiger over the network; the last sync is kept in the volume as `telemetry.json`.
- **Secrets** live only in `/etc/damo.env` on the server (root, mode 600), written from the deploy keys in
  `backend/.env`. `LEGACY_PLUGIN` and `GAUNTLET_GITHUB_REPO` are left out: the first is a laptop path, the
  second needs `gh`, which the image does not have.
- **Restarts** clear the in-memory Console state, as `make dev` does locally.

```bash
SSH_KEY=~/.ssh/<key> deploy/setup-server.sh   # once: /etc/damo.env + the host Caddy site
SSH_KEY=~/.ssh/<key> deploy/deploy.sh         # every deploy: ships the working tree, waits for health
```

`deploy.sh` sends the files git can see (tracked, plus untracked files that are not ignored), builds both
images, and only then replaces the running containers, so a failed build leaves the old version up. It waits
for both containers' health checks and exits non-zero with the failing one's last 50 log lines if they do not
pass within 180 s.

Logs and a shell on the server:

```bash
ssh root@45.32.219.190 'docker compose -p damo -f /opt/damo/deploy/compose.yaml logs -f --tail 100'
ssh root@45.32.219.190 'docker compose -p damo -f /opt/damo/deploy/compose.yaml exec api sh'
```

Build and run both containers locally without the host Caddy (`GAUNTLET_MODE=mock` needs no key), then open
<http://127.0.0.1:8100/>:

```bash
printf 'GAUNTLET_MODE=mock\n' > /tmp/damo.env
ENV_FILE=/tmp/damo.env docker compose -p damo-local -f deploy/compose.yaml up -d --build
```
