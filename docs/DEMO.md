# The Gauntlet: live setup and 3-minute demo

## Make it live (about 10 minutes)

| Piece | What turns it on | Check |
|---|---|---|
| Real harness (M4), real ops engine (R1–R2) | `powershell -ExecutionPolicy Bypass -File scripts\get-tools.ps1` (promtool, amtool, jq; checksums verified) | `/api/ttu/status` → `tools` true |
| Unmodified TTU plugin execution | jq from the step above, plus Git Bash (`bash`, `curl`, `openssl`) on PATH | `plugin_executable` true |
| Nemotron agents (M2 recover, M5 repair, R4 investigate) | Put a real key from build.nvidia.com in `backend/.env` as `NVIDIA_API_KEY=nvapi-…` | `nemotron_key` true |
| GitHub work orders (optional) | `GAUNTLET_GITHUB_REPO=owner/repo` and `GITHUB_TOKEN=…` in `backend/.env` | `github_work_orders` true |

Run: backend `cd backend && .venv\Scripts\python -m uvicorn app.main:app --port 8001`, frontend
`cd frontend && set GAUNTLET_API=http://localhost:8001 && npx vite --port 5174`. Open http://localhost:5174.

Every screen shows a **Backend** strip saying which parts are live. Anything that can't run falls back to the scripted demo and says so. After one successful live agent run, it is saved and can be replayed (labelled "cached") if the venue Wi-Fi dies.

Test the comparison logic without the tools: `cd backend && .venv\Scripts\python -m tests.test_harness`
(v1 fails 5/6 and 0/3 held-out, v2 passes 6/6 and 3/3, mutant and decoy rejected).

## What is real

- **Old check:** `legacy/ttu/redfishplugins/check_temperature.sh`, byte-for-byte from the TTU repo at `d55eadf`, run with bash against an HTTPS Redfish mock (`backend/app/ttu/redfish_mock.py`).
- **Old scheduling:** Nagios soft/hard states with values parsed from the real `templates.cfg` (4 attempts, 1 min retry, 5 min check, 60 min re-notify). Recipient parsed from `contacts.cfg` (`nagios@localhost`).
- **New check:** `promtool test rules` evaluates the candidate minute by minute; `amtool config routes test` resolves who gets paged.
- **Expectations:** derived from the old check's real behavior plus the operator's decisions, never from the candidate. Held-out cases return pass/fail only. A wrong-recipient mutant and an alert-everything decoy must be rejected.
- **M1 gaps:** computed from the pinned files (`backend/app/ttu/inputs.py`), not typed in.
- **Agents:** Nemotron chooses tools (`read_file`, `run_plugin`, `record_behavior`, `ask_operator`, `write_candidate`, `run_tests`, `query_telemetry`, …); the backend executes them. Native tool calling, with a JSON-action fallback.
- **Ops:** alerts come from promtool on the released rules (no model); delivery goes to local receivers with a failing primary; work orders are deduplicated by fingerprint; recovery needs real plugin runs. A modelled run never verifies recovery.

## 3-minute script (one beat per prompt)

1. **Landing (15 s).** "Data center paging still runs on checks nobody here wrote. We retire them by proof."
2. **M1 Import (20 s).** Real TTU repo pinned. "It found 8 scripts the config references that don't exist, and every page goes to nagios@localhost." *(Legacy: understand.)*
3. **M2 Recover (30 s).** Nemotron reads the plugin, runs it against the mock BMC for OK/Warning/Critical/missing, records each behavior with its source, and raises the critical question: who gets paged. *(Nemotron: plans and calls tools.)*
4. **M4 Test v1 (20 s).** Real promtool + amtool + the real plugin: 1/6 pass. "Pages too early, wrong team, no early warning."
5. **M5 Repair (30 s).** Nemotron reads the failures, rewrites the rules, re-runs the suite until green. Held-out stays sealed; the decoy and the mutant are rejected. "Same model both times. The difference is the proof." *(Nemotron: multi-step, self-correcting. Legacy: replace.)*
6. **One step ahead (20 s).** "Fan stops before heat": the new rules warn **8 minutes before the old check paged**. *(Data center: stay ahead. Legacy: improve.)*
7. **Operate (35 s).** Take Nemotron offline, play the night: alerts still fire, the primary pager fails, the fallback delivers, the duplicate reuses the work order. Bring the model back, investigate: cited hypotheses, "verify, not proven". Close the ticket: the incident stays open until the plugin confirms recovery. Incoming shift accepts the handoff. *(Data center: real workflow.)*
8. **Close (10 s).** "Bring one real check. Leave with a tested replacement."

## Judge questions to expect

- *"Isn't this just pasting the script into an LLM?"* No: the model writes; promtool, amtool and the real plugin decide. v1 failed, and the repair loop fixed it against fixed expectations.
- *"Isn't parity trivially 100%?"* Held-out cases are sealed, and the suite rejects a decoy that alerts on everything and a mutant that pages the wrong team.
- *"What if the model is down?"* Alerting, delivery, work orders and the harness never call it.
- *"Is this equivalence?"* No: bounded evidence on stated scenarios, and the evidence pack says what isn't covered.
