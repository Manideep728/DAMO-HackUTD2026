#!/usr/bin/env bash
# Agent inbox: open issues assigned to the GitHub account `gh` is logged in as.
# Runs at every Claude Code session start (.claude/settings.json), so it must
# never break a session: every gh failure is printed as text and we exit 0.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 0

if ! login=$(gh api user --jq .login 2>/dev/null); then
  echo "Agent inbox unavailable: gh is not logged in or GitHub is unreachable (check 'gh auth status')."
  exit 0
fi

# Blocking issues first, then oldest first.
if ! inbox=$(gh issue list --assignee @me --state open --limit 100 \
    --json number,title,labels,createdAt \
    --jq 'sort_by([(any(.labels[]; .name == "blocking") | not), .createdAt])
          | .[] | "  #\(.number) [\(.labels | map(.name) | join(", "))] \(.title)"' 2>&1); then
  echo "Agent inbox unavailable: $(tail -n 1 <<<"$inbox")"
  exit 0
fi

echo "Agent inbox for $login (assignee = who must act next; protocol in CLAUDE.md)"
echo "${inbox:-  (empty)}"

up_for_grabs=$(gh issue list --state open --search "no:assignee" --limit 100 --json labels \
  --jq '[.[] | select(any(.labels[]; .name == "type:task" or .name == "type:bug"))] | length' \
  2>/dev/null) || up_for_grabs="?"
echo "Unassigned tasks/bugs up for grabs: $up_for_grabs"
