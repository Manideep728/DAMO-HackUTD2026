#!/usr/bin/env bash
# Prints every collaborator's login except yours, comma-separated, ready for
# `gh issue create -a`. Prints an empty line if nobody else has joined yet.
set -euo pipefail
cd "$(dirname "$0")/.."

me=$(gh api user --jq .login)
gh api 'repos/{owner}/{repo}/collaborators?per_page=100' \
  --jq "[.[].login | select(. != \"$me\")] | join(\",\")"
