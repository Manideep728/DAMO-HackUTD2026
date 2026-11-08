#!/usr/bin/env bash
# Deploy this working tree to the server and wait until it is healthy. From the repo root:
#   SSH_KEY=~/.ssh/<key> deploy/deploy.sh
# Only files git can see are sent (tracked, plus untracked files that are not ignored), so .env, .venv and
# node_modules never leave the laptop. New images are built before the running containers are replaced,
# so a failed build leaves the current version serving.
set -euo pipefail

host=${HOST:-root@45.32.219.190}
remote_dir=${REMOTE_DIR:-/opt/damo}
health_timeout_s=${HEALTH_TIMEOUT_S:-180}
ssh_cmd=(ssh -o BatchMode=yes)
if [ -n "${SSH_KEY:-}" ]; then ssh_cmd+=(-i "$SSH_KEY"); fi
cd "$(git rev-parse --show-toplevel)"

dirty=$(git status --porcelain | grep -q . && echo " + uncommitted changes" || true)
echo "deploying $(git rev-parse --short HEAD)$dirty to $host"

# A tracked file deleted in the working tree is still listed by git, so keep only paths that exist.
git ls-files -z --cached --others --exclude-standard \
  | while IFS= read -r -d '' f; do if [ -e "$f" ]; then printf '%s\0' "$f"; fi; done \
  | COPYFILE_DISABLE=1 tar --null -T - --no-xattrs --no-mac-metadata -czf - \
  | "${ssh_cmd[@]}" "$host" "rm -rf '$remote_dir.new' && mkdir -p '$remote_dir.new' && tar -xzf - -C '$remote_dir.new'"

"${ssh_cmd[@]}" "$host" bash -s -- "$remote_dir" "$health_timeout_s" <<'REMOTE'
set -euo pipefail
dir=$1 timeout_s=$2
docker compose -p damo -f "$dir.new/deploy/compose.yaml" build --quiet
rm -rf "$dir.old"
if [ -d "$dir" ]; then mv "$dir" "$dir.old"; fi
mv "$dir.new" "$dir"
compose=(docker compose -p damo -f "$dir/deploy/compose.yaml")
"${compose[@]}" up -d --remove-orphans
# "Started" only means the process launched; each image's HEALTHCHECK says when it actually serves.
deadline=$((SECONDS + timeout_s))
for service in api web; do
  container=$("${compose[@]}" ps -q "$service")
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$container")" = healthy ]; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      "${compose[@]}" logs --tail 50 "$service" >&2
      echo "$service not healthy after ${timeout_s}s" >&2
      exit 1
    fi
    sleep 2
  done
done
docker image prune -f --filter label=project=damo >/dev/null
echo "healthy"
REMOTE
