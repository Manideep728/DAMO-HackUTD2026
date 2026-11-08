# DAMO

**Make existing data centers AI-ready.**

DAMO helps engineers plan liquid-cooled GPU retrofits, modernize inherited monitoring, and carry the resulting equipment context into daily operations.

HackUTD 2026 · **NMC²** · **NVIDIA Nemotron** · **8090** · MLH: **Best Use of Tiger Data**

<img width="1268" height="662" alt="image" src="https://github.com/user-attachments/assets/021b2d8f-aeb9-4a67-95a2-db836d65c110" />

## Why we built it

Adding GPU racks and liquid cooling to an operating data center requires more than installing pipes.

An engineer has to determine where a cooling distribution unit (CDU) fits, whether existing cooling and electrical infrastructure can support it, and how to install it without interrupting the customers already running there. Then the building management system (BMS) needs to understand the new equipment.

The answers are scattered across floor plans, cooling schematics, equipment manuals, BMS point lists and maintenance records. Those sources can disagree.

A revised drawing might show that a leak sensor moved to Rack A, while the BMS still assigns its alarm to Rack B. A cooling plan might show two independent pumps, while a maintenance record reveals that both depend on the same transfer switch.

DAMO brings those records into a workflow where engineers can inspect the evidence, review proposed changes and test the intended behavior before handover.

## Modernize: from scattered records to a reviewed handover

The retrofit walkthrough follows an existing hall adding two liquid-cooled GPU racks.

1. **Connect the inputs.** Review equipment records, drawings, point lists and maintenance history. Keep missing information visible.
2. **Map the site.** Connect racks, cooling equipment, sensors and power dependencies. Surface conflicting records for an engineer to resolve.
3. **Compare cooling options.** Review capacity, water conditions, power, space, access and interface requirements.
4. **Plan the work.** Identify affected equipment, shared dependencies, installation constraints and maintenance risks.
5. **Review the integration.** Inspect the proposed BMS mappings and configuration changes, with supporting evidence.
6. **Test and hand over.** Compare expected and observed behavior, correct discrepancies, and retain the accepted configuration and test results.

The sample story includes a leak sensor assigned to the wrong rack. The complete chain stays visible: source record → discrepancy → engineer decision → configuration change → retest.

The current walkthrough uses prepared sample records and replayed results. It does not parse arbitrary uploaded PDFs or perform physical commissioning.

### Executable legacy-monitoring verification

DAMO also includes a separate modernization workflow built around the real Texas Tech HPCC Nagios–Redfish integration.

It imports the legacy check, recovers its behavior, generates a candidate replacement, and evaluates the alert path: missing or extra alerts, severity, timing, recipient and recovery.

The harness uses the original plugin, `promtool` and `amtool`. Held-out cases, a wrong-recipient mutant and an alert-everything decoy help establish that the tests can reject incorrect behavior.

Passing those cases is evidence about the tested scenarios, not proof that every possible failure is covered.

## Operate: catch a wrong answer behind a green dashboard

A GPU can return an incorrect result without crashing or raising an obvious error. Normal temperatures and utilization do not establish computational correctness.

The current operations demo follows a **simulated silent-GPU-error incident**:

1. GPU-07 fails a scheduled known-answer test while conventional health indicators remain green.
2. A repeated check reproduces the mismatch; peer GPU-06 passes.
3. The operator reviews evidence and possible causes, then dispatches a work order to the GPU platform team.
4. Technician notes preserve what was done and any corrections to the record.
5. The incident remains open until repeated checks and a peer comparison support recovery.
6. The incoming shift receives the work history, remaining uncertainty, owner and next action.

These are prepared scenario results, not tests executed on a connected GPU. A live implementation would need approved workload access, trusted references, appropriate numerical tolerances and validated test coverage. A mismatch alone does not prove defective hardware, and a passing test does not establish correctness for every workload.

The console connects incidents to equipment, dependencies, records and prior work. Accepted alert rules can run without requiring an LLM response; model-assisted investigation is separate from deterministic alerting.

## Preflight: check dependencies before maintenance

Preflight models power and cooling dependencies and evaluates proposed equipment work.

In the sample hall, two pumps can each carry the cooling load. The drawings suggest separate power paths, but maintenance records identify a shared transfer switch. Once an engineer confirms that relationship, the simulator exposes the common failure point.

The engine calculates capacity, dependency failures, redundancy and minimal cut sets. It can compare maintenance windows and candidate plans.

These are simplified infrastructure calculations, not CFD, hydraulic simulation, electrical load flow or engineering certification.

## Where NVIDIA Nemotron fits

Nemotron supports behavior recovery, rule generation and repair, document-backed investigation, and tool-based planning.

The Preflight agent can call tools including:

`simulate` · `find_cut_sets` · `evaluate_plan` · `search_plans` · `search_docs` · `get_node` · `get_neighbors` · `propose_dependency`

Models are accessed through [build.nvidia.com](https://build.nvidia.com) using the OpenAI-compatible API. The application supports live, cached and mock paths. The Preflight fallback identifies itself as a scripted planner when no model is used. Prepared walkthrough narration is separate from live model execution.

Engineers approve changes. Model output does not substitute for test execution or physical inspection.

## Explore the demo

| Route | Experience |
|---|---|
| `/#/about` | Landing page |
| `/#/setup` | Liquid-cooling retrofit walkthrough |
| `/#/modernize/import` | Legacy monitoring modernization, M1–M5 |
| `/#/verify` | Alert-path verification |
| `/#/preflight` | Dependency and maintenance planning |
| `/#/` | Operations console after the setup handover |

Demo guides: [Preflight](docs/DEMO.md) · [Modernize and Console](docs/modernize-demo.md)

Keyboard: `?` for help · `Ctrl+Shift+D` for the Director panel.

## Run locally

```bash
make setup
make dev
```

The backend runs on port `8000`; the frontend runs on port `5173`.

Open [the landing page](http://localhost:5173/#/about) or [the retrofit walkthrough](http://localhost:5173/#/setup).

```bash
make test       # backend tests
make eval       # scripted-planner evaluation
make rehearse   # browser rehearsal
```

The Verify harness also requires the monitoring plugin and Prometheus tools:

```bash
sudo apt install monitoring-plugins-basic
make promtool
```

### Configuration

Start from the repository's `.env.example` and put backend settings in `backend/.env`.

| Variable | Purpose |
|---|---|
| `NVIDIA_API_KEY` | NVIDIA model access |
| `NVIDIA_BASE_URL` | Defaults to `https://integrate.api.nvidia.com/v1` |
| `NEMOTRON_MODEL` | Tool-calling model ID; falls back to `NEMOTRON_SUPER` |
| `NEMOTRON_SUPER`, `NEMOTRON_NANO` | Model IDs for larger and faster roles |
| `GAUNTLET_MODE` | `live`, `cached` or `mock` |
| `LEGACY_PLUGIN` | Path to the monitoring plugin |
| `METERS_DATABASE_URL` | Tiger/TimescaleDB connection for meter data |
| `GAUNTLET_GITHUB_REPO` | Optional issue integration, with authenticated `gh` access |

To create and seed the configured meter database with sample readings:

```bash
make meters-check meters-seed
```

Meter synchronization also saves a local telemetry snapshot for offline use. For database tests against a local TimescaleDB container:

```bash
make db-up test-db
```

For live model evaluation, configure a key and run:

```bash
EVAL_MODE=live make eval
```

### Frontend deployment

The root `vercel.json` builds `frontend/` and serves `frontend/dist`. Leave Vercel's Root Directory empty. The app uses hash routes, with a deployment fallback for direct paths.

The Python backend must be hosted separately. Frontend-only deployment uses committed demo data where supported; Preflight requires a reachable backend.

## Implementation and boundaries

- **Frontend:** React, Vite and Tailwind.
- **Backend:** FastAPI and a deterministic Python dependency engine.
- **Monitoring verification:** pinned legacy plugins, Prometheus and Alertmanager tooling.
- **Telemetry:** Tiger/TimescaleDB with local snapshot fallback.
- **AI:** NVIDIA Nemotron tool calling and evidence-backed investigation.

The repository includes executable harnesses, backend logic and tests alongside prepared demo flows. The facility, work records, load profiles and retrofit scenario are sample data. Replayed agent activity and sample commissioning records are not live hardware actions.

The system assists engineering review. It does not certify structural suitability, authorize maintenance, control production infrastructure or replace qualified physical commissioning.

## Repository

```text
frontend/   Application, operations console, retrofit walkthrough and modernization UI
backend/    FastAPI, dependency engine, monitoring harnesses and integrations
legacy/     Pinned legacy monitoring checks and configuration
docs/       Demo guides, design notes and implementation scope
```

See [the implementation gaps](docs/v4-gaps.md), [retrofit direction](docs/direction-ai-retrofit.md) and [Devpost notes](docs/devpost.md).

## Credits

The legacy-monitoring demonstration uses the [Texas Tech Nagios–Redfish API Integration](https://github.com/nsfcac/Nagios-Redfish-API-Integration), licensed under BSD-3-Clause. Preserve its notices when reusing the pinned source.

Built for HackUTD 2026.

## Team workflow

Clone the repository and follow `CLAUDE.md` for teammate and agent coordination.

```bash
gh auth login
gh repo clone Manideep728/DAMO-HackUTD2026
```

Assigned work is tracked through repository Issues. Run `scripts/inbox.sh` to view your inbox.
