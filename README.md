# The Gauntlet

Old monitoring scripts go in. Verified new ones come out. Along the way, the process finds real problems in the data hall that the old scripts were hiding.

**HackUTD 2026 · tracks: NMC² · 8090 · NVIDIA Nemotron**

| Step | What happens | Who decides |
|---|---|---|
| **Read** | Nemotron Super reads a real Nagios check (plugin + config) and writes a plain-English rule card. The real plugin binary is then run to confirm every threshold statement. | Execution |
| **Find** | The old check is replayed over 21 days of recorded readings. Deterministic detectors find what it hid (a lying sensor, a clogged filter, a dead mailbox, a retired rack). Nemotron Nano writes each as two sentences and an action. | A person accepts (→ work order) or dismisses |
| **Prove** | Nemotron Super writes Prometheus rules. The verifier runs the real plugin on every value the sensor can report and on generated timing traces, and compares with `promtool`. A one-shot translation goes through the same verifier and fails with concrete counterexamples; the Gauntlet loop feeds them back until zero. | A person signs the certificate; then the tombstone |

Nemotron writes sentences and rules. Execution decides whether they're right. That is the answer to "isn't this just pasting the script into an LLM?"

## Run it

```bash
# backend
cd backend && pip install -r requirements.txt && cp .env.example .env   # add your NVIDIA_API_KEY from build.nvidia.com
make promtool                                                           # fetches promtool into backend/bin
python -m app.smoke                                                     # one Super call, one Nano call
# frontend
cd frontend && npm install
# both
make dev          # backend :8000, frontend :5173
```

Open http://localhost:5173/#/ for the fixture-driven UI (no backend needed), or http://localhost:5173/?source=api#/ to run against the backend.

**Modes** (`GAUNTLET_MODE` in `backend/.env`): `live` calls Nemotron and caches every response · `cached` serves the cache only (demo with Wi-Fi off; run `make warm` first) · `mock` serves fixtures. The badge in the top bar always shows which. The verifier (plugin + promtool) runs locally in every mode.

**Legacy plugin.** The verifier runs whatever `LEGACY_PLUGIN` points at and reads its exit code. On the demo machine: `sudo apt install monitoring-plugins-basic` and `LEGACY_PLUGIN=/usr/lib/nagios/plugins/check_snmp`. Without it, `legacy/check_snmp` is a stand-in with the same Monitoring Plugins range semantics (see `legacy/README.md`).

**Model IDs.** `backend/app/models.py` has defaults; copy the exact current Nemotron IDs from build.nvidia.com into `NEMOTRON_SUPER` / `NEMOTRON_NANO`.

**Real work orders.** Set `GAUNTLET_GITHUB_REPO=owner/repo` (with `gh auth login`) and Accept opens a GitHub issue.

## Demo (2 minutes)

1. **Checks** → open `check_rack_inlet`.
2. **Read** → *Read with Nemotron*. Watch statements verify by execution (`27.1 → WARNING ✓`). Director toggle shows a flagged statement.
3. **Find** → *Replay and find*. Six findings. Hand the judge the mouse: `A` accepts, `D` dismisses. Work order #482 opens.
4. **Prove** → *Generate and verify*. Coverage strip over every value. One-shot: 3 counterexamples. Gauntlet: 0. "Same model both times. The difference is the proof." `S` signs off → tombstone.
5. **Handoff** → everything the shift decided, with names and times.

Keyboard: `1–5` screens · `A` accept · `D` dismiss · `S` sign off · `U` undo · `→` next step · `?` help · `Ctrl+Shift+D` Director (replay, jump to end, planned failures, speed).

## Layout

```
frontend/   React + Vite + Tailwind. src/screens (Checks, Read, Find, Prove, Handoff), src/data (DataSource, Mock, Api), src/fixtures
backend/    FastAPI. app/main.py (SSE endpoints), app/llm.py (Nemotron via build.nvidia.com, cache), app/verify (sweep.py, traces.py), app/prompts
legacy/     the real Nagios config for check_rack_inlet, inventory.csv, oncall_roster.csv, plugin stand-in, README with declared drift
.cursor/    build rules used to design this (domain, UX, design system, engine, verification UI, Nemotron API, QA)
docs/       build spec, DEMO.md, DESIGN.md, PROMPT.md (the build prompt)
```

## Honest limits

- Guaranteed on the stated domain and timing model, not "correct forever". The certificate says what is not covered.
- Timing equivalence uses a Python model of Nagios soft/hard states; check it against a real Nagios Core before claiming more.
- The replay and findings run on a simulated 21-day recording with realistic ranges; the plugin, promtool and the verifier are real.

## Joining

1. Accept the collaborator invite: https://github.com/Manideep728/DAMO-HackUTD2026/invitations
2. `gh auth login` (the agent channel runs on the GitHub CLI)
3. `gh repo clone Manideep728/DAMO-HackUTD2026` and open the folder in Claude Code

## How we coordinate

Every teammate's Claude agent talks to the others through this repo's **Issues**. The protocol (message types, body formats, reply keywords) is in [CLAUDE.md](CLAUDE.md), which Claude Code loads automatically. Humans use the same issue types from the "New issue" button.

Your agent's inbox is the open issues assigned to you. It is printed at the start of every Claude Code session, and you can print it any time with `scripts/inbox.sh`.
