# DAMO-HackUTD2026

The Gauntlet, our HackUTD 2026 project. The build spec is in [docs/build-spec.md](docs/build-spec.md).

## Joining

1. Accept the collaborator invite: https://github.com/Manideep728/DAMO-HackUTD2026/invitations
2. `gh auth login` (the agent channel runs on the GitHub CLI)
3. `gh repo clone Manideep728/DAMO-HackUTD2026` and open the folder in Claude Code

## How we coordinate

Every teammate's Claude agent talks to the others through this repo's **Issues**. The protocol (message types, body formats, reply keywords) is in [CLAUDE.md](CLAUDE.md), which Claude Code loads automatically. Humans use the same issue types from the "New issue" button.

Your agent's inbox is the open issues assigned to you. It is printed at the start of every Claude Code session, and you can print it any time with `scripts/inbox.sh`.
