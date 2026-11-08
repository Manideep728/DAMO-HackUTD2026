# DAMO
 
**Change your data center without guessing.** DAMO retires legacy monitoring checks by proof, and lets you rehearse equipment work before anyone touches a panel.
 
HackUTD 2026 · Tracks: **NMC²** · **NVIDIA Nemotron** · **8090** · MLH: **Best Use of Tiger Data**
 
<img width="1268" height="662" alt="image" src="https://github.com/user-attachments/assets/021b2d8f-aeb9-4a67-95a2-db836d65c110" />

## The problem
 
About half of the world's data centers are more than ten years old. They still page their night shift through static checks: Nagios plugins, BMS limits and DCIM alarms that nobody dares retune. Their records disagree with the wiring in the field. Two things break as a result:
 
- **Monitoring can't be modernized safely.** Moving off the old checks is done by hand over months, because nobody can prove the replacement catches everything the old one did.
- **Maintenance is a gamble.** "Pump B can carry the load" is true on paper, until a 2023 work order reveals that both pumps run through the same transfer switch.
DAMO turns both into something you can check before you act.
 
## What DAMO does
 
| Screen | Route | What it does |
|---|---|---|
| **Modernize** | `/modernize/*` | Takes a real legacy check (the Texas Tech HPCC Redfish plugin) through five steps. **M1** imports it and lists the gaps. **M2**: Nemotron recovers its behaviour and asks the operator where the code is ambiguous. **M3** generates the new rules. **M4** tests them. **M5** repairs, reviews, runs in shadow, rolls back or releases. |
| **Verify a change** | `/verify` | Proves the alarm path still works. Candidate rules v1 and v2 run through the harness: the real plugin, `promtool` and `amtool`. Held-out cases, a wrong-recipient mutant and an alert-everything decoy make sure the tests can actually fail. |
| **Console** | `/` | The night shift on hall H1. Fan 4 on Compute2 (rack R1-03) stops, and the released rules warn before the old Nagios check would page. The alarm comes first, with steps to acknowledge, investigate, dispatch, verify recovery and hand off. Alerting never depends on the model. |
| **Preflight** | `/preflight` | A what-if simulator for equipment work. Before you take a pump offline or add a row of GPUs, see what depends on it, what could fail, and the safest window and plan. |
 
`/about` is the landing page. Rack and feed chips on the Console open the same equipment in Preflight.
 
### The finding Preflight is built to show
 
*Enough capacity is not the same as independent backup.* In the demo hall, Pump A and Pump B can each carry the full cooling load, and the one-line diagram puts them on separate power paths. A 2023 work order and a 2024 IR scan show both pump panels running through **ATS-1**. When an engineer confirms that finding, every critical service drops from **2N to N**, and ATS-1 shows up as the shared single point of failure.
 
## Why this isn't "just pasting the script into an LLM"
 
An LLM gives you a translation. DAMO gives you a translation plus evidence that it's right.
 
- **The real legacy code is the reference.** The harness runs the original plugin, not the model's reading of it.
- **The tests can fail.** Held-out cases, a mutant and a decoy check that the test suite catches a wrong rule rather than passing everything.
- **Every model claim is checked.** The agent's validator rejects any answer that names a node or number not in the tool results it cites. Discovery rejects quotes that are not verbatim.
- **People decide.** An engineer confirms or rejects every discovered dependency, and every rule goes through review, shadow mode and rollback before release, with an audit log throughout.
Nemotron writes sentences, rules and plans. Execution decides whether they're right.
 
## Where Nemotron fits
 
| Job | How |
|---|---|
| Recover legacy behaviour (Modernize M2) | Reads the plugin and its Nagios objects, explains what they do, asks the operator where the code is ambiguous |
| Generate and repair rules (M3–M5) | Drafts rules; harness failures are fed back until they pass |
| Preflight agent | Tool calling over `simulate`, `find_cut_sets`, `evaluate_plan`, `search_plans`, `search_docs`, `get_node`, `get_neighbors`, `propose_dependency` |
| Console investigation | Optional; the offline path is labelled and alerting works without it |
 
Models come from [build.nvidia.com](https://build.nvidia.com) through the OpenAI-compatible API. Without a key, the agent runs a scripted planner over the same tools and labels itself **"scripted planner (no model)"**.
 
## Quick start
 
```bash
make setup        # backend venv + pip, frontend npm ci
make dev          # backend :8000, frontend :5173
make test         # engine, discovery, API and agent eval
```
 
Open **http://localhost:5173/#/** for the Console, or **/#/preflight** for the simulator.
 
To run the Verify harness on your own machine, install the real plugin and fetch `promtool`:
 
```bash
sudo apt install monitoring-plugins-basic
make promtool
```
 
**Deploy the frontend on Vercel:** import the repo and deploy; the root `vercel.json` installs and builds `frontend/` and serves `frontend/dist` (leave Root Directory empty in the Vercel dashboard). Routes use the hash (`/#/preflight`), so no rewrites are needed. The Python backend does not run on Vercel: the Console, the retrofit setup, Modernize and Verify fall back to their committed demo data, and Preflight shows "backend unreachable" until a backend is hosted elsewhere.

## Configuration
 
All settings live in `backend/.env` (start from `.env.example`).
 
| Variable | Purpose |
|---|---|
| `NVIDIA_API_KEY` | Nemotron access, from build.nvidia.com |
| `NVIDIA_BASE_URL` | Defaults to `https://integrate.api.nvidia.com/v1` |
| `NEMOTRON_MODEL` | The current tool-calling model ID from build.nvidia.com; falls back to `NEMOTRON_SUPER` |
| `NEMOTRON_SUPER`, `NEMOTRON_NANO` | Model IDs for the larger and faster roles |
| `GAUNTLET_MODE` | `live` calls Nemotron and caches every response · `cached` replays the cache (demo offline) · `mock` serves fixtures. The badge in the top bar always shows which |
| `LEGACY_PLUGIN` | Path to the real plugin, e.g. `/usr/lib/nagios/plugins/check_snmp` |
| `METERS_DATABASE_URL` | A Tiger (TimescaleDB) service for meter data |
| `GAUNTLET_GITHUB_REPO` | `owner/repo`; with `gh auth login`, accepted findings open real GitHub issues |
 
**Tiger meters:** set `METERS_DATABASE_URL`, then run `make meters-check meters-seed`. Every sync is also written to `backend/.work/telemetry.json`, and the app starts from that snapshot when Tiger is unreachable. Venue Wi-Fi often blocks Tiger's port; a phone hotspot works. `make db-up test-db` runs the meter SQL tests against a local TimescaleDB container, never against Tiger.
 
**Agent eval:** `make eval` runs the 24-question eval against the scripted planner. Run it with `EVAL_MODE=live` and a key set to test Nemotron. See `docs/devpost.md` for the latest live results.
 
## Demos
 
- **Preflight (2–3 min):** [`docs/DEMO.md`](docs/DEMO.md). `make rehearse` clicks through it and checks every number.
- **Modernize + Console (3 min):** [`docs/modernize-demo.md`](docs/modernize-demo.md).
- **Keyboard:** `?` help · `Ctrl+Shift+D` Director panel (replay, jump to end, planned failures, speed).
## How it's built
 
**Preflight engine** (`backend/engine/`, pure Python, no model):
 
| Part | What it does | File |
|---|---|---|
| Simulator | Requirement groups (`all`, `any`, `k_of_n`, `capacity`) over a power and cooling graph. Support is a least fixpoint, so cycles are safe. Overloaded suppliers shed the lowest-criticality load first. Every failed node gets a causal trace. | `engine/propagate.py` |
| Weak points | Minimal cut sets up to order 3 by exact MOCUS expansion, checked by the simulator and cross-checked against brute-force enumeration in tests. A maintenance view shows which sets shrink during a work window. | `engine/cutsets.py` |
| Independence | For each redundant group, how many failures it takes to lose every supplier, and the shared nodes when that number is 1. | `engine/redundancy.py` |
| Planner | Scores hourly windows on critical loss, shed load, cut-set order and headroom. Tries shedding flexible GPU load, postponing overlapping work, temporary cooling, and moving equipment back to its documented feed. Returns ranked plans, plus rejected ones with reasons. | `engine/planner.py` |
 
**Application** (`backend/app/`):
 
| Part | What it does | File |
|---|---|---|
| Discovery | Reads work orders, logs, tickets and the one-line diagram text. Resolves names like "transfer sw 1" or "ATS1" to node IDs. Extracts feeds with exact quotes, rejects quotes that aren't verbatim, and rejects claims that were temporary or never built. Shows the impact if a claim is true; an engineer confirms or rejects it. | `app/preflight/discovery.py` |
| Meters | Power readings in Tiger: a hypertable plus an hourly continuous aggregate. The load profile is the worst hourly average at each hour of the week over 4 weeks. Reconciliation correlates each meter's unexplained load with candidate consumers to catch equipment wired to a different supplier than documented. | `app/preflight/meters.py`, `telemetry.py` |
| Agent | Nemotron tool calling with a citation validator | `app/preflight/agent.py` |
| Modernize | Inputs, agent, harness and release operations for the TTU Redfish check | `app/ttu/` |
| Verify | Real plugin + `promtool` + `amtool` harness | `app/verify/` |
 
**Repo layout**
 
```
frontend/   React + Vite + Tailwind
            src/console (Console, Verify) · src/preflight (Preflight, FacilityMap, Panels)
            src/modern (Modernize M1–M5) · src/components (shell, ui) · src/screens (Landing, older screens)
backend/    FastAPI · engine/ (simulator, cut sets, planner) · app/preflight · app/ttu · app/verify · app/prompts
legacy/     pinned TTU Redfish plugins and Nagios objects (legacy/ttu); the earlier check_rack_inlet config
docs/       DEMO.md · modernize-demo.md · devpost.md · DESIGN.md · ux-audit.md · v4-gaps.md
```
 
## What's real and what's simulated
 
**Real:** the legacy plugins (pinned, unmodified), `promtool`, `amtool`, the simulator and cut-set math, the discovery validator, the Tiger SQL, and Nemotron tool calling (smoke-tested with a key).
 
**Simulated or simplified:**
 
- The facility, records and load profiles are synthetic. Meter data is generated from the as-built wiring (28 days, 15-minute steps, 0.2% meter error); the queries are what would run on real meters.
- Power and cooling are kW budgets on a dependency graph. There is no CFD, no electrical load flow and no protection coordination, and the UI says so on every screen.
- Demand splits across live suppliers in proportion to capacity (first-available for transfer switches). Real busbars and chilled-water hydraulics don't split that neatly.
- Transients are steady-state snapshots with default timings: generator start 15 s, UPS 5–8 min, chiller restart 6 min, rack ride-through 4 min.
- Cut sets treat whole nodes as failing. Every candidate is re-checked with the full simulator, but above order 1 a set that matters only through load moving far from the failure can be missed.
- Meters can only check suppliers whose consumers each have one feed. Dual (2N) rack feeds and transfer-switch sources can't be separated from meters alone.
- Discovery scores 1.0 precision and recall on the hand-written demo corpus. On 10 seeded sets of noisy records it keeps 1.0 precision with 0.867–0.983 recall; most misses are digit-swap typos that spell another real tag.
## What's next
 
Make existing data centers ready for AI hardware. The next step is helping controls engineers integrate a liquid-cooled GPU retrofit (CDU, leak sensors, rack mapping) into the existing BMS with tested, reviewable changes, then using that verified equipment map for incident response. The checklist is in [`docs/v4-gaps.md`](docs/v4-gaps.md).
 
## Team workflow
 
1. Accept the collaborator invite: https://github.com/Manideep728/DAMO-HackUTD2026/invitations
2. `gh auth login`
3. `gh repo clone Manideep728/DAMO-HackUTD2026` and open the folder in Claude Code.
Each teammate's Claude agent coordinates through this repo's Issues, following the protocol in `CLAUDE.md`. Your inbox is the open issues assigned to you; it prints at the start of every Claude Code session, or run `scripts/inbox.sh`.
 
