#!/usr/bin/env bash
# One-time setup of a server that already runs Docker and Caddy (the HackTX backup box). From the repo root:
#   SSH_KEY=~/.ssh/<key> deploy/setup-server.sh
# 1. Writes /etc/damo.env (root, mode 600) from the deploy keys in backend/.env. Re-running rewrites it.
# 2. Adds DAMO's site to the host Caddyfile once, validated before Caddy reloads; other sites keep serving.
set -euo pipefail

host=${HOST:-root@45.32.219.190}
site=${SITE:-damo.45.32.219.190.sslip.io}
web_port=${WEB_PORT:-8100}
ssh_cmd=(ssh -o BatchMode=yes)
if [ -n "${SSH_KEY:-}" ]; then ssh_cmd+=(-i "$SSH_KEY"); fi
cd "$(git rev-parse --show-toplevel)"

# Only what the server needs: LEGACY_PLUGIN is a laptop path, and GAUNTLET_GITHUB_REPO needs gh, which the
# image does not have. Inline "# comments" are stripped because Docker's env_file keeps them in the value.
deploy_keys='NVIDIA_API_KEY|NVIDIA_BASE_URL|NEMOTRON_MODEL|NEMOTRON_SUPER|NEMOTRON_NANO|GAUNTLET_MODE|METERS_DATABASE_URL'
env_lines=$(grep -E "^($deploy_keys)=" backend/.env | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' || true)
if [ -z "$env_lines" ]; then
  echo "backend/.env has none of: ${deploy_keys//|/ }" >&2
  exit 1
fi
printf '%s\n' "$env_lines" | "${ssh_cmd[@]}" "$host" \
  'umask 077 && cat > /etc/damo.env.tmp && mv /etc/damo.env.tmp /etc/damo.env'
echo "wrote /etc/damo.env with: $(printf '%s\n' "$env_lines" | cut -d= -f1 | tr '\n' ' ')"

"${ssh_cmd[@]}" "$host" bash -s -- "$site" "$web_port" <<'REMOTE'
set -euo pipefail
site=$1 port=$2 file=/etc/caddy/Caddyfile
if grep -qF "$site {" "$file"; then
  echo "$site is already in $file"
  exit 0
fi
tmp=$(mktemp)
cat "$file" > "$tmp"
printf '\n# DAMO (HackUTD 2026), from DAMO-HackUTD2026/deploy\n%s {\n\treverse_proxy 127.0.0.1:%s\n}\n' "$site" "$port" >> "$tmp"
caddy validate --config "$tmp" --adapter caddyfile >/dev/null
cp "$file" "$file.bak"
cat "$tmp" > "$file"
rm -f "$tmp"
systemctl reload caddy
echo "added $site -> 127.0.0.1:$port to $file (previous version in $file.bak)"
REMOTE
