# DAMO-HackUTD2026

HackUTD 2026 project. Spec: `docs/build-spec.md`.

Several teammates run Claude agents on this repo at the same time. **Agents talk to each other through this repo's GitHub Issues**, using the protocol below. It is built to be cheap to read and to never deadlock. Follow it exactly.

## Identity

You act through your human's GitHub account (`gh`), so `@me` is you. Several agents can share one account, so end every issue and comment you post with:

`— 🤖 <login>'s agent`

Leave the `@` off so the signature pings nobody. A comment without that footer came from a human, and a human's comment overrides any agent's.

## The one rule

**The assignee is whoever must act next.** Your inbox is every open issue assigned to you. When your part is done, either hand the issue on (`--remove-assignee @me --add-assignee <next>`) or close it. Never stay assigned to something you won't act on.

## Inbox

- Your inbox is printed at session start. Re-run `scripts/inbox.sh` before starting new work, after every push, and whenever you are waiting.
- Handle `blocking` issues first, then oldest first. Read an issue with `gh issue view N --comments`.
- Comment `CLAIMED` before you start working an issue. If another agent's `CLAIMED` is under 30 minutes old and has no `DONE` after it, skip that issue.
- Issues up for grabs are unassigned `type:task` and `type:bug` issues: `gh issue list --search "no:assignee"`. To take one, assign yourself and comment `CLAIMED`.

## Message types: exactly one `type:` label per issue

| Label | Send when | Assign | Ends when |
|---|---|---|---|
| `type:task` | you want work done | the doer, or nobody (up for grabs) | the doer's PR or commit says `Closes #N` |
| `type:question` | you need information to continue | whoever knows | the asker closes it after `ANSWER` |
| `type:bug` | something that already landed is broken | the last committer (`git log -1 -- <file>`), or nobody | the fix says `Closes #N` |
| `type:proposal` | proposing a shared interface (schema, API, file format, port) or a choice others will build on | everyone (`scripts/teammates.sh`) | all reply `ACK` → the author commits it and closes it as completed; rejected → `close -r "not planned"` |
| `type:announce` | FYI: something shipped, is ready to use, or changed | everyone (`scripts/teammates.sh`) | each reader comments `READ` and unassigns themselves; the last reader closes it |

- Add the `blocking` label only when you are stopped until the issue is resolved. It jumps the queue in every inbox, so use it honestly.
- Proposals closed as completed form the decision log. Check it before re-deciding anything: `gh issue list -l type:proposal -s closed`.

## Titles

70 characters or fewer, specific, no prefix (the label already carries the type).

- ✅ `WebSocket tick payload: add outlet_temp per rack?`
- ❌ `question about sim`

## Body skeletons

Fill in every line. Times are local (Central). Keep to one topic per issue.

```
task:      **Do:** <outcome, imperative>
           **Done when:** <checkable condition>
           **Context:** <files, links, related #N>

question:  **Q:** <one answerable question>
           **Context:** <why you need it, what you already checked>
           **Default:** <what you'll do if there's no answer by HH:MM>  ← then keep working

bug:       **Observed:** <what happens, exact error>
           **Expected:** <what should happen>
           **Repro:** <exact commands or steps>
           **Suspect:** <file:line or commit SHA, or "unknown">

proposal:  **Proposal:** <the interface or decision, inline or path on a branch>
           **Why:** <problem it solves, alternative rejected>
           **Affects:** <files or components that must change>
           **Reply by:** HH:MM with ACK, or NACK: <reason + counter-proposal>

announce:  **What:** <what shipped or changed>
           **Use it:** <command, URL, file path, or example>
           **Affects you if:** <who must change something, or "nobody">
```

## Replies: the first word of every comment is a keyword

`CLAIMED` · `ANSWER:` · `ACK` · `NACK:` · `DONE:` (+ PR, commit or result) · `BLOCKED:` (+ #N or reason) · `READ`

Put anything else after the keyword. Link code (`path:line`, commit SHA) instead of pasting it.

## Commands

```bash
scripts/teammates.sh                    # everyone's logins except yours, comma-separated, for -a
gh issue create -t "<title>" -l type:question -a <login> --body-file - <<'EOF'
**Q:** ...
**Context:** ...
**Default:** ...

— 🤖 <login>'s agent
EOF
gh issue comment N --body-file - <<'EOF'
ANSWER: ...

— 🤖 <login>'s agent
EOF
gh issue edit N --remove-assignee @me --add-assignee <login>   # hand off
gh issue close N -c "DONE: <PR/commit>"                        # finish; add -r "not planned" to drop it
gh issue list --search "<words>" -s all                        # search before creating
```

## Rules

- Search before you create an issue. If one already covers the topic, comment on it instead.
- Never put secrets, tokens or `.env` contents in issues or comments.
- Never wait silently. Every question carries a `Default:`, and if you are truly stuck, add `blocking`.
- Never edit someone else's issue body. Reply in a comment.
- Link your work to its issue by writing `Closes #N` in the PR body or the commit message.
- If you change a skeleton here, update `.github/ISSUE_TEMPLATE/` in the same commit.
