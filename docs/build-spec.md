# The Gauntlet — Merged Build Plan (HackUTD 2026)

> **Historical.** The original HackUTD build plan (7 Nov). The app has moved on: see the README for current screens and [v4-gaps.md](v4-gaps.md) for the current direction.

Nov 7, 2026 · @Odey

## Decisions

We build the Gauntlet's verification spine: real plugins in, `promtool`-verified Prometheus rules out, held-out parity. On top go DAMO's audit agent, its fallbacks and its operator features. We enter three tracks: NMC², NVIDIA and 8090.

| Area | Decision | From | Why |
|---|---|---|---|
| Old checks | Unmodified open-source SNMP plugins running in Nagios Core | Gauntlet | "Checks written to lose" is the fastest way to lose 8090 |
| Fallback for old checks | DAMO's gauntlet-legacy scripts on PATH shims, labelled a test set, plus Munin `apc_status` as unseen code | DAMO | Used only if Gate A fails at 9 PM |
| Nagios config | Declared site drift: one decommissioned rack still checked, one new rack missing, one contact not on the roster | DAMO | Gives the audit real coverage and escalation gaps without touching plugin code |
| New guard | Generated Prometheus alerting rules that pass `promtool check` and `test` | Gauntlet | A real target system, deterministic and verifiable. Replaces DAMO's custom Python SDK |
| Reference rules | DAMO's R1–R10 rewritten by hand as one PromQL rules file | DAMO | Style example for the generator, and the labelled fallback if a generated file fails |
| Audit | Super agent: survey, cross-check, hypothesize, prove by running the plugin, submit | Both | Nemotron does real agent work; the replay matrix checks every claim |
| Rebuild | Rule generator with a visible fix loop, up to 3 rounds on `promtool` failures | Both | A red test turns green on screen, in a real target format |
| Proof | Leave-one-out held-out parity per fault card, plus the judge's live combination | Gauntlet | Answers "isn't parity trivially 100%?" |
| Headline fault | Lying B7 sensor plus the row B compressor dying silently while the unit reports up | Merged | The legacy status check says OK while the temperature check pages the liar |
| Scoring | One visible hall plus a headless "nobody acted" twin on the same seed | DAMO | Racks lost becomes a fair comparison |
| Judge input | Drag fault cards onto the map; no free text | Gauntlet | Reliable on stage |
| Incident agent | Nano with 9 tools, plus a rules-only counterfactual | Gauntlet | Speed, and the answer to "why not if/else" |
| Decision card | Plan options with headroom, simulator-predicted outcome and a runbook checklist | DAMO | Hits the procedures stat; numbers come from the sim, not the model |
| Approval | A human approves every action, always | Gauntlet | NMC² trust. DAMO's auto-run face-off is removed |
| Storage | Prometheus as the time-series store, SQLite for runs, alerts and actions | Gauntlet | No cloud dependency on stage. Tiger Data is dropped |
| Tracks | NMC², NVIDIA, 8090 | Gauntlet | Cap is 3. Add Design or MLH prizes only if Devpost says they don't count |

**Cut from both plans:** the Python SDK rewrite, drill mode (pitched as the next step), free-text disasters, the UPS fault card, Tiger Data, a hosted copy, 3D, real hardware and auto-acting without approval.

**Update (8 Nov):** Tiger Data is back, for Preflight only and entered under the MLH Best Use of Tiger Data prize (MLH prizes don't count toward the 3-track cap). It holds the meter readings that the planner's measured load profile and discovery's meter reconciliation read. Stage risk is handled by a local snapshot: the app starts from the last sync when Tiger is unreachable. See README → Preflight → Meters.

## Pitch and tracks

Data center paging still leans on static threshold checks: Nagios plugins, BMS limits and DCIM alarms nobody dares retune. The Gauntlet retires them by proof, not by trust.

Real Nagios runs unmodified open-source plugins against a simulated hall. A Nemotron agent reads each plugin and its config, then proves what it misses by running it. Nemotron then writes Prometheus rules that keep every alert the old check got right and catch the faults it missed, proven on faults the rules never saw. Then the judge breaks the hall: a sensor lies while a cooling unit dies silently. The agent distrusts the liar, catches the real failure, moves load once a human approves, and opens the work order.

| Track | What the judge must see | Our answer |
|---|---|---|
| 8090 (slide 25: understand, improve or replace legacy systems) | Old code understood, blind spots proven, replacement verified | Understand = a rule card checked by execution. Improve = the blind-spot matrix. Replace = held-out parity plus the tombstone |
| NMC² (slide 36: missed warning, unclear handoff, wrong information) | A failure caught early and handed to someone who can fix it | Countdown before thresholds trip, auto-written handoff plus a GitHub work order, and the lying-sensor check |
| NVIDIA (slide 64: Nemotron beyond a chatbot) | A multi-step agent calling real tools | Super audits code and writes rules. Nano runs incidents with 9 tools, three of them real services (Prometheus, GitHub, Discord) |

**Why it can win:**

- **Proven combination.** DataDriver won both NMC² and NVIDIA in 2025 with a modest Nemotron Nano build.
- **Verification wins.** StateFarm's three 2025 winners were all "prove nothing broke" tools. Held-out parity applies that idea to modernization.
- **The work order connects us to NMC²'s 2025 pattern.** All their winners were technician workflow tools; none did telemetry.
- **The category is crowded.** EOG's brief (slide 42) guarantees other alert copilots. Our novelty is the lying sensor, the live side-by-side against real Nagios, and held-out parity.

A feature counts only once it works on stage. Our rough guess is about a 50% chance of at least one prize.

**Premise check at the NMC² booth:** "Does your hall page off static thresholds, and in what: Nagios-style checks, the BMS or DCIM?" If BMS or DCIM, say "static thresholds in any system" and keep Nagios as the open, runnable stand-in. Quote their answer in the pitch.

**Supporting facts** (Uptime Institute 2026 outage analysis; recheck on the report before quoting): power is the leading cause of impactful outages (UPS, transfer switches, generators). Failing to follow procedures is the top driver of human-error outages. One in five operators said their latest major outage cost over $1M.

## What it does

There's one data hall, two guardians and one scoreboard. Real Nagios and the agent watch the same reported telemetry; only a human-approved plan changes the simulation.

**Core loop:**

1. The judge drags fault cards onto the floor map. The headline is a lying sensor on B7 plus a silent compressor failure on the row B cooling unit.
2. The simulator changes the physics, and temperatures and loads drift in real time.
3. Nagios Core runs the legacy plugins and pages into the Legacy pager (left panel): a false emergency on B7, cooling status "OK" throughout, then a flood.
4. The generated Prometheus rules fire early. Alertmanager's webhook wakes the agent.
5. The agent investigates with tools (PromQL, sensor cross-check, forecast, migration candidates) and posts one incident card: cause, countdown, plan options and a runbook checklist. The rules-only planner's answer sits beside it.
6. The operator clicks **Approve**. Workloads move and the map cools.
7. The agent opens a GitHub Issue as the work order, pages through Discord and writes the shift handoff.
8. The scoreboard updates against the "nobody acted" twin: lead time, alerts versus incidents, false pages and racks lost.

**Fault cards.** All are modelled in the simulator and can be combined. Legacy thresholds are set the way a typical site would: inlet warning 27°C, critical 32°C, PDU warning 80%, plus a cooling unit status flag.

| Card | What changes in the sim | What the legacy checks do | What the agent does |
|---|---|---|---|
| **Headline: lying sensor + silent compressor failure** | B7 reports +10°C while its true inlet is unchanged (start B7 at 25°C or above). Row B's unit keeps reporting up, but its cooling and power draw drop, so B5–B9 really warm | False CRITICAL on B7 first, cooling status OK the whole time, then a flood once real racks cross 32°C | Flags B7's sensor, infers the compressor from zone warming plus a power drop, and moves load off B5–B9, not B7 |
| Silent compressor failure | Unit reports up; its cooling and power draw drop | Status OK; temperature alerts arrive late | Cooling-effectiveness rule fires early with a countdown |
| Cooling unit fan degraded | That unit loses X% of its cooling; nearby inlets drift up slowly | Silent until critical, then floods | Flags the trend minutes early with a countdown |
| Cooling unit failed | Cooling goes to 0 and status goes down | Status alert with no impact estimate | Maps which racks are affected and when |
| PDU breaker creep | A job pushes one PDU's load steadily toward its breaker limit | Fires once, past 80% | Forecasts time to trip and moves load to racks with power headroom |
| Sensor dark | One rack's SNMP reads time out while it keeps heating | UNKNOWN, which many sites don't page on (verify the real exit code at Gate A) | Treats missing data as its own incident, never a pass |
| Job spike | Load on one rack jumps | Temperature alerts later | Spots the load source and proposes rebalancing |
| Lying sensor (alone) | One sensor reports +10°C; real temperature unchanged | False emergency, pages someone | Cross-checks neighbours and the inlet/outlet gap, flags the sensor, moves nothing |
| Harmless spike | A scheduled batch job; temperatures rise but stay within limits | May page | Stays quiet |

**Rule of trust:** the agent proposes; a human approves; every action is logged. Never pitch autonomous changes to cooling or power.

**Not a fault card: UPS on battery.** Losing utility power is a generator and runtime problem, and moving load between racks doesn't fix it. Quote the Uptime power stat without implying migration solves outages.

### Modernization pipeline (the 8090 layer)

Each legacy plugin retires through five steps. Nemotron proposes; execution decides. Steps 2, 4 and 5 are deterministic code.

1. **Read and audit** (Super agent, reasoning on). The agent gets the unabridged plugin source, its Nagios command definition and `-w`/`-c` thresholds, the Nagios host and contact config, `inventory.csv` and `oncall_roster.csv`.
   - Tools: `list_files`, `read_file` (line-numbered), `read_table`, `read_nagios_config`, `run_plugin(plugin, fault_card)`, `submit_rule_card`.
   - Loop: survey what it checks, cross-check config against inventory and roster, hypothesize blind spots with file and line, prove each one with `run_plugin`, then submit.
   - Output: a rule card JSON with condition, thresholds, inputs used, inputs ignored (trends, neighbours, sensor health) and findings marked verified or suspected.
   - Guards: every cited line must exist and contain the quoted snippet, or the agent is re-asked. The loop is capped at 25 tool calls and stops on a repeated call. Each step streams to the UI.
   - Card check: if the card says "critical above 32°C", the replay must show exit code 2 above 32°C. A mismatch flags the card on screen.
2. **Replay** (deterministic). One fixed-seed recording per fault card. The harness runs the same plugin binaries Nagios runs, tick by tick, against the SNMP responder serving that recording. Exit codes (0 OK, 1 WARNING, 2 CRITICAL, 3 UNKNOWN) fill the blind-spot matrix: plugin × fault → early, late, missed or false alarm, plus minutes of warning. Run it three times and show "3/3 runs".
3. **Rebuild** (Super). The generator gets the rule card, the matrix, the metric names and the hand-written reference rules as a style example. It writes one Prometheus alerting rules file.
   - Every legacy alert that was right becomes a must-keep rule.
   - Every blind spot gets a new rule with labels `found_by: <fault card>` and `replaces: <plugin>:<line>`.
   - `promtool check rules` must pass. On failure, the `promtool` output goes back to Super for up to 3 rounds, streamed so judges watch red turn green.
   - Still failing after 3 rounds: the reference rules run instead, and the UI says so.
4. **Prove** (leave-one-out). For each of the 8 single-fault cards:
   - Regenerate the rules without that card's blind spots.
   - Run `promtool test rules` with the held-out recording as `input_series` and the legacy run's correct alerts as the expected alerts.
   - Parity means every alarm the old check got right is also raised by the new rules on the same rack, at the same tick or earlier. Nothing else counts as a replacement.
   - Report the held-out catch rate on blind spots the rules were never shown. The legacy false alarms are listed separately.
   - Any regression blocks step 5. The judge's live combination is held out by construction.
5. **Retire.** 100% parity on every fold, zero regressions and a better held-out catch rate earn the plugin its tombstone. An evidence pack (JSON plus Markdown) carries the rule card with source links, the matrix, per-fold parity, held-out catch rate, regressions and sign-off.

The same three functions ship as a CLI (`gauntlet read`, `gauntlet replay`, `gauntlet verify`) and as MCP tools, so any coding agent can call `verify` before retiring legacy code.

**Say the limit before they do.** The fault library is ours. Leave-one-out shows the rules generalize beyond the faults that shaped them, not to every fault in the world. The judge's live combination is the real out-of-sample test, which is why we hand them the mouse. This covers the rule layer (checks, thresholds, alerts); stateful transaction systems would need recorded transactions as replay input.

## Architecture

We use a Python backend, a React frontend and Nemotron through build.nvidia.com. Nagios Core, Prometheus and Alertmanager run in Docker Compose on localhost. Everything except Nemotron, GitHub and Discord works without Wi-Fi.

Nagios and Prometheus read the same reported values. The operator's approval is the only path back into the simulation. The pipeline runs offline for the shipped rules and live for the fourth plugin.

| # | Component | Owns | Owner |
|---|---|---|---|
| 1 | Simulator | Physics, fault cards, migration, the "nobody acted" twin, WebSocket, `/metrics` exporter, SNMP responder, fixed-seed recordings | P1 |
| 2 | Legacy stack | Nagios Core, unmodified plugins, site config, notification command into the Legacy pager | P4 |
| 3 | Agents | Nano incident agent and its 9 tools, Super audit agent and rule generator, rules-only baseline, response cache | P2 |
| 4 | Frontend | Floor map, Legacy pager, incident card, audit, rebuild and parity screens, scoreboard | P3 |
| 5 | Pipeline | Replay harness, blind-spot matrix, folds, parity checker, CLI, MCP tools, evidence pack | P4 (MCP: P2) |
| 6 | Modern stack | Prometheus, Alertmanager, `promtool` | P4 |

| Piece | Choice |
|---|---|
| Backend | Python 3.11, FastAPI, Pydantic for every agent output |
| Frontend | React, Vite, Tailwind, an SVG floor map, Recharts, Monaco or react-syntax-highlighter for plugin source |
| LLM | The openai client with `base_url=https://integrate.api.nvidia.com/v1`. Copy exact model IDs from build.nvidia.com |
| SNMP responder | pysnmp agent serving live state; snmpsim is an option for recorded runs |
| Storage | Prometheus for time series, SQLite for runs, alerts, actions and decisions |
| Real services | Prometheus (PromQL), GitHub Issues via `gh`, a Discord webhook |

### Simulator (Python + FastAPI)

- Layout loads from `inventory.csv`. Ship 4 rows × 10 racks (A1–D10), 4 cooling units (one per row) and 8 PDUs. The fallback floor is DAMO's 11-rack inventory.
- Clock: one tick per second, each tick = 1 simulated minute. Show the sim clock on screen. Prometheus scrapes and evaluates every 1 s, so a rule's `for:` in seconds equals sim minutes.
- Rack inlet per tick (w = how much each cooling unit cools each rack, falling off with distance; faults only change parameters):

  ```latex
  T \leftarrow T + \alpha\,(T_{supply} + \beta \cdot load - \sum_j cooling_j \cdot w_{ij} - T)
  ```

- Outlet = true inlet + k · load / airflow. A lying inlet sensor shows up as an inlet/outlet gap that shrinks or goes negative.
- Silent compressor failure: the unit's cooling and power draw drop, but `cooling_unit_up` stays 1.
- Limits: normal inlet 18–27°C, throttle at 35°C, thermal shutdown at 40°C. Shutdown drops the rack's load to 0 and logs it as a rack lost.
- Migration: `migrate(from, to, kw)` changes the physics. Only `execute_migration` calls it, after a human approves.
- Twin: a second, headless sim on the same seed where nobody acts. It supplies "racks lost without action" for the scoreboard.
- Determinism: seed all randomness; the same fault cards must give the same trace every run.
- Outputs (all carry reported values; true values stay inside the sim for scoring):
  - WebSocket: full state as JSON for the frontend.
  - `/metrics`: `rack_inlet_celsius{rack="B7"}`, `rack_outlet_celsius`, `rack_load_kw`, `pdu_load_percent{pdu=…}`, `cooling_unit_up{unit=…}`, `cooling_unit_power_kw{unit=…}`.
  - SNMP responder: the same values on the OIDs the plugins query. It serves live state in the arena and recordings in replay, so no plugin is edited.

### Legacy stack (Nagios Core in Docker)

- Pick plugins that query SNMP, so one responder serves them all. Example: `check_snmp` from the Monitoring Plugins project with temperature, PDU and cooling-status OIDs. Verify each runs unmodified against the responder before committing to it.
- Configure checks to run every sim minute (adjust Nagios's interval settings and verify). This creates the flood.
- A notification command posts each Nagios notification to the backend's Legacy pager.
- `legacy/README` lists each plugin's source, version, license (most are GPL) and link. It also declares the config drift we added. `legacy/` keeps its own license; say so in the top-level README.

### Agents

- **Models:** Nano runs live incidents and the handoff because it's fast; target under 20 s per investigation. Super with reasoning on runs the audit, rule generation, the fix loop and the live fourth plugin.
- **Wake-up:** Alertmanager's webhook wakes the incident agent when a generated rule fires, never on every tick.
- **What Nemotron decides** (the answer to "why not if/else"): whether conflicting readings are one incident or two; which destination wins when power, cooling, priority and SLA disagree; and the rules for a plugin it has never seen.
- **Incident tools** (9; three hit real services):
  1. `get_topology()`: racks, cooling units, PDUs, adjacency
  2. `query_telemetry(promql)`: PromQL against Prometheus
  3. `forecast_breach(rack)`: linear fit, minutes to the 35°C throttle or PDU trip
  4. `cross_check_sensor(id)`: neighbours and inlet/outlet gap (deterministic; the LLM only explains it)
  5. `propose_migration(from, candidates)`: for each candidate, power headroom, cooling headroom, job priority, SLA impact, and the simulator's 30-minute predicted peak temperature from a forked run
  6. `execute_migration(plan_id)`: only after Approve
  7. `open_work_order()`: a real GitHub Issue with unit, location, likely part and handoff link
  8. `page_oncall()`: a real Discord webhook to whoever is on shift in `oncall_roster.csv`
  9. `write_handoff()`: open, changed and timeline, with Acknowledge
- **Decision card:** 2–3 options, each with its predicted outcome from the sim, a recommendation in one sentence, and the matching runbook as a checklist. Write four short runbooks: cooling loss, sensor fault, breaker overload, load spike.
- **Counterfactual:** a rules-only planner (a fixed decision tree over Alertmanager alerts) runs on the same incidents. Its answer appears on the card and in the reliability table.
- **Fallback:** cache agent responses per fault preset. Always show a live or cached badge.

### Repo layout

```
gauntlet/
  legacy/           # unmodified plugins, nagios config, inventory.csv, oncall_roster.csv, README (licenses, declared drift)
  legacy-fallback/  # DAMO scripts + shims, only if Gate A fails
  sim/              # physics, fault cards, twin, exporter, snmp responder, recorder
  agent/            # llm.py, models.py, incident agent, audit agent, rule generator, baseline, cache
  pipeline/         # replay harness, matrix, folds, parity checker, evidence pack, cli.py, mcp server
  rules/            # reference.rules.yml, shipped.rules.yml, folds/*.rules.yml, tests/
  runbooks/         # four markdown runbooks
  deploy/           # docker-compose.yml, prometheus.yml, alertmanager.yml
  frontend/         # React app
  docs/             # architecture, pitch notes
```

### Shared contracts (agree by 7 PM; Pydantic in `models.py`)

| Object | Fields |
|---|---|
| Telemetry | sim_time, racks{id: inlet_reported, outlet, load_kw, pdu}, cooling{id: up, power_kw, row}, pdus{id: load_pct} |
| FaultCard | type, target, start_min, params |
| Recording | fault_cards[], seed, ticks[] of Telemetry |
| RuleCard | plugin, condition, thresholds, inputs_used, inputs_ignored, findings[], verified |
| Finding | id, file, line, snippet, category, fault_card, status (verified, suspected, flagged) |
| ReplayResult | plugin, fault_card, outcome (early, late, missed, false alarm), minutes_warning, exit_codes[] |
| Fold | held_out_card, rules_path, parity_pct, regressions[], improvements[], held_out_catch_rate |
| IncidentCard | cause, countdown_min, evidence[], options[], recommended, runbook[], reasoning_steps[], rules_only_answer, work_order_url, mode (live, cached) |
| Action | sim_time, kind (migrate, ticket, page, handoff), detail, approved_by |
| Alert | guard (legacy, modern), sim_time, severity, rack, text, recipient, delivered |

Also agree the Prometheus metric names and labels and the SNMP OID map in the same hour.

## Team and schedule

Four owners work in parallel from 7 PM. Gate A at 9 PM is the one that can change the plan: it decides real plugins or the fallback scripts.

Each gate's checklist follows. If a gate slips by more than an hour, cut from the cut list instead of letting the next gate slip.

| Owner | Builds | Done when |
|---|---|---|
| P1 | Simulator, fault cards, twin, WebSocket, `/metrics`, SNMP responder, recordings. After 4 AM: Devpost and pitch with the presenter | Every card changes the physics believably and replays identically, and real plugins and Prometheus both read the sim |
| P2 | Nano incident agent, 9 tools, decision card, runbooks, Super audit agent, rule generator, fix loop, fold generation, rules-only baseline, cache, MCP tools | Incident card, rule card and rules file exist for every fault, plugin and fold, live and cached; the fourth plugin runs live |
| P3 | Frontend: floor map and incident card first, nothing else before 11 PM; then audit, rebuild and parity screens, scoreboard, design | The map animates from the stream and the incident card streams tool calls |
| P4 | Docker Compose, plugin selection and config, replay harness, `promtool` tests, parity checker, matrix, scoreboard, tombstone, CLI, evidence pack, backup video | Matrix and per-fold parity numbers come from real runs; the video is recorded |

If you are three people, merge P1 and P4, and run every fault alone except the headline combination. Pick the presenter now; the presenter sleeps first (about 1–5 AM).

### 6:15–7:00 PM · Setup (everyone)

- [ ] Public repo up with the layout above; `.env` with `NVIDIA_API_KEY` in `.gitignore`
- [ ] Contracts, Prometheus metric names and the SNMP OID map agreed
- [ ] `llm.py` makes one Nano and one Super tool call; model IDs in `models.py`; rate limits checked
- [ ] Docker images pulled for Nagios Core, Prometheus and Alertmanager
- [ ] FastAPI `/ws` ticks into the React app (proves the full pipe)

### 7:00–8:00 PM · Booth visits (presenter; workshops end at 8 PM)

- [ ] NMC²: the premise question, what breaks on night shifts, and "Would your night shift approve a load move suggested by an agent?" Write down both answers.
- [ ] 8090: "What does proof of a safe modernization look like to you?"
- [ ] Confirm the 3-track cap, whether Design or MLH prizes count toward it, and where sponsor judging happens

### 9:00 PM · Gate A (hard)

- [ ] Sim streams over WebSocket, `/metrics` and SNMP; Prometheus scrapes it; the map renders it
- [ ] One plugin runs unmodified against the responder and returns correct exit codes for OK, CRITICAL and a timeout. If not, switch to `legacy-fallback/` now and stop fighting SNMP.
- [ ] One PromQL tool call works end to end
- [ ] One Nano investigation timed (target under 20 s)
- [ ] Audit agent reads one plugin and returns a rule card JSON

### 11:00 PM · Gate B

- [ ] Headline round (lying B7 + silent compressor) works end to end on Nano
- [ ] Nagios Core pages into the Legacy pager
- [ ] Rule cards for every plugin generated, checked against the replay and cached
- [ ] Grey map, incident card in final order, trace panel in
- [ ] Initial Devpost submitted as a real write-up with three tracks

### 2:00 AM · Gate C

- [ ] Replay harness and blind-spot matrix for every fault card, 3/3 runs
- [ ] Reference rules file written; shipped rules pass `promtool check rules`; the fix loop streams
- [ ] Alertmanager webhook wakes the agent; Discord receives pages
- [ ] GitHub work order and the rules-only baseline work
- [ ] Twin sim feeds the scoreboard

### 4:00 AM · Gate D

- [ ] All fault cards work, including sensor dark and the harmless spike
- [ ] Leave-one-out folds, per-fold parity and held-out catch rate from real runs
- [ ] Decision card with headroom, predicted outcome and runbook checklist
- [ ] CLI (read, replay, verify), Shadow/Live switch, click-through from rule to source line and from parity row to replay run
- [ ] Live fourth-plugin pipeline works
- [ ] Reliability run started: every fault card × 10 runs, rules-only baseline beside it

### 8:00 AM · Gate E (feature freeze at 8:30 AM)

- [ ] Scoreboard, tombstone, handoff with Acknowledge, phone page, Approve preview
- [ ] Audit, rebuild and parity screens; Retirement tab
- [ ] MCP tools, evidence pack, reliability table with the counterfactual column, one Nano-versus-Super line
- [ ] Planned failures: tombstone blocked by one regression, a flagged rule card, a tool-error toggle
- [ ] Cached fallback for every preset, tested with Wi-Fi off

### 8:30–11:45 AM · Rehearse and submit

- [ ] Rehearse the 90-second core and the three judge minutes 10 times on the demo laptop
- [ ] Backup video recorded by 10:00 AM (not a placeholder)
- [ ] README: what it does, architecture, `make demo`, where Nemotron is used, plugin credits and licenses
- [ ] Final Devpost by 11:45 AM (deadline 12:00). Judging runs 1–4 PM.

**Booth kit:** a second monitor, a phone set up for the Discord page, a power strip, a QR code to the repo and a sample evidence pack, and Docker images pulled ahead of time.

## Demo and judge playbook

The judge's hand on the mouse within 20 seconds is the moment that wins. The 90-second core names three concepts at most: lying sensor, parity, tombstone. Everything else goes in the judge's minute. No title slide.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:20 | Shadow mode: the live hall, the Legacy pager already noisy from real Nagios, the agent quiet | "Left is real Nagios running real plugins: what pages your night shift today. Right is what replaces it. Break it." The judge drops the headline card on row B |
| 0:20–0:50 | Nagios pages a false CRITICAL on B7. Its cooling status stays a calm green OK while B5–B9 turn red. The incident card streams Nano's tool calls; B7 goes dashed with its reading struck through | Read the card: "Sensor B7 is unreliable. Row B's cooling unit says it's running, but its compressor has likely failed. B5–B9 reach 35°C in N minutes. Moving 2 jobs to D6 peaks them at N°C." The judge clicks Approve; the map cools, the phone buzzes, the GitHub issue opens |
| 0:50–1:10 | Scoreboard and the rules-only line on the card | "N Nagios alerts, 1 incident, N minutes earlier, zero false pages. Without action, the twin lost N racks. A rules-only planner would have moved load off B7, the one rack that was fine." |
| 1:10–1:30 | Parity on the held-out fold, then the tombstone | "Every alert the old check got right, the new Prometheus rules raise too, on faults they never saw. That's how the old check retires: by proof." |
| 1:30–2:30 | The judge's minute (below) | Pick the column for the judge in front of you |

The N values are placeholders. Say the real numbers the scoreboard shows.

| | NMC² (runs real facilities) | NVIDIA (Nemotron must do real work) | 8090 (modernization is their business) |
|---|---|---|---|
| Their question | "Show me you understand a 3 AM page from a lying sensor." | "Prove this isn't a chatbot with Nemotron bolted on." | "How do you know nothing was lost?" |
| Wins the first 15 s | A floor map that looks like a real hall, temperatures drifting, Nagios paging, agent quiet | Tool calls streaming: PromQL, cross-check, forecast, migration, with model, tool count and seconds | Plugin source, its rule card and a green "verified by execution" check. Say: "We don't trust the AI's reading of the code. We run the code to check it." |
| Loses them | A README on screen; inlet temps outside 18–27°C; "AI-powered monitoring" | A chat box; a spinner with no steps; another model doing the real work | Checks that look written to lose; rule cards with no link to source; the word "rewrite" |
| The extra minute | Read the handoff and work order aloud; the decision card's runbook checklist; a harmless batch-job spike where the agent stays quiet | Expand one trace and explain why it moved load off B5, not B7; the rules-only counterfactual; force a tool error; the reliability table | Paste a fourth plugin live (read, replay, matrix, rules, with a timer); click a rule to its source line; the audit agent proving a config gap; the tombstone blocked by one regression |
| Genuinely impressed | The judge stacks a PDU creep on the headline; the agent keeps all three straight | An unprepared combination runs live and is right | The held-out column, and `gauntlet verify` passing in a terminal |
| Answer ready | "What if the agent is down?" Nagios keeps running until the tombstone. That's the point | "Is that cached?" Say so before they ask, then run one live | "Does it scale?" The pipeline runs per plugin, and the replay library grows with each incident |

### Screens

1. **Shadow arena:** floor map in the centre, Legacy pager on the left, incident card on the right, scoreboard on top.
2. **Audit:** plugin source with blind-spot lines highlighted, the agent's live step feed, finding cards marked verified, suspected or flagged. Clicking a card jumps to its line.
3. **Rebuild:** rule card beside the generated rules, `found_by` and `replaces` labels linking each rule to its source line, and a `promtool` panel turning green.
4. **Parity and Retirement:** per-fold parity, the held-out column, regressions, and one row per plugin with its tombstone.
5. **Live mode:** the operator console, with legacy alerts folded into incidents.

### Design rules

- Grey floor map by default; colour only off-normal racks. Red only for real danger (above 35°C).
- One accent colour for the new guard, neutral grey for the old one.
- Show silence on purpose: the legacy cooling status stays a calm green OK beside racks turning red.
- Untrusted sensor: dashed outline, struck-through reading, neighbour estimate beside it.
- Incident card order: what's happening, time left, one action, then collapsed evidence, rules-only answer and trace. Readable in five seconds at 3 AM.
- A status word beside every colour; the A key approves; small motion only.

## User-first UI features

Built for the night-shift tech first, the judge second. Two modes: **Shadow** (old and new guards side by side, the demo arena) and **Live** (the operator console, legacy alerts folded into incidents).

| Feature | Owner | Done by | Priority |
| --- | --- | --- | --- |
| Grey floor map by default; colour only off-normal racks | P3 | 11:00 PM | Must |
| Incident card reordered: what's happening, time left, one action, then collapsed evidence, rules-only answer and trace | P3 | 11:00 PM | Must |
| "47 legacy alerts → 1 incident" counter on the card | P4 | 4:00 AM | Must |
| Untrusted sensor: dashed outline, struck-through reading, neighbour estimate | P3 | 4:00 AM | Must |
| Work order link on the card (GitHub issue: unit, location, likely part, handoff) | P2 data, P3 UI | 4:00 AM | Must |
| Shadow / Live mode switch | P3 | 4:00 AM | Must |
| Phone-frame page next to the console, plus the real Discord page | P2 data, P3 UI | 8:00 AM | Should |
| Approve preview: ghost of post-move power and temperature on the map; undo window; approval log | P2 data, P3 UI | 8:00 AM | Should |
| One-tap reject reasons | P3 | 8:00 AM | Should |
| Handoff ordered open → changed → timeline, with Acknowledge | P2 | 8:00 AM | Should |
| Retirement tab: one row per plugin with mode, per-fold parity, regressions, sign-off | P4 | 8:00 AM | Should |
| Keyboard shortcut (A to approve) and status words beside every colour | P3 | 8:00 AM | Could |

**Cut order if behind:** Could items, then the Retirement tab (the tombstone stays in Shadow mode), then the Approve preview. Never cut the grey map, the card order, the untrusted-sensor look or the work order link.

## 8090 reusability features

The modernization output must be verified new rules running in a real modern system, with the agent as a layer on top. That turns the 8090 layer from a data center demo into a verification step usable after any rewrite.

| Feature | Owner | Done by | Priority |
| --- | --- | --- | --- |
| Generated Prometheus alerting rules: Super writes them from the rule card + blind spots; `promtool check rules` must pass; each blind-spot rule labelled with the fault card that found it. One shipped file plus one file per leave-one-out fold | P2 | 4:00 AM | Must |
| Parity runs the legacy plugins vs each fold's rules (via `promtool test rules`), not vs the agent | P4 | 4:00 AM | Must |
| CLI: `gauntlet read`, `gauntlet replay`, `gauntlet verify` (wraps `promtool test rules` + per-fold parity; pass / fail) | P4 | 4:00 AM | Must |
| Same three functions exposed as MCP tools, so any coding agent can call `verify` before retiring legacy code | P2 | 8:00 AM | Should |
| Evidence pack export per retirement (JSON + Markdown): rule cards with source links, matrix, per-fold parity, held-out catch rate, regressions, sign-off | P4 | 8:00 AM | Should |
| Plug-in boundary in the repo: `Reader`, `Environment`, `Oracle`, `Matcher`, `Gate`, with Nagios → Prometheus in a data center as one implementation | P1 | 8:00 AM | Could |

**Say the limit before they do:**

- This covers the rule layer (checks, thresholds, alerts, validations). Stateful transaction systems need recorded transactions as replay input; that's the next plug-in, not this weekend.
- The fault library is ours. Leave-one-out and the judge's live combination are how we keep that honest.

**Cut order if behind:** the plug-in boundary, then MCP (keep the CLI), then the evidence pack. Never cut the generated rules, `promtool` validation or held-out parity.

## Cut list, risks and fallbacks

Never cut the headline lying-sensor round, the replay matrix, held-out parity, the trace panel, the rules-only counterfactual, or the blocked-tombstone run. Those are the moments that win.

**Cut order if a gate slips** (cut the first item first):

1. Nano-versus-Super line, then the tool-error toggle
2. Plug-in boundary in the repo, then MCP tools (keep the CLI), then the evidence pack
3. Simulator-predicted outcomes on the decision card (keep headroom and the runbook checklist)
4. Combining faults, except the headline combination
5. Retirement tab (the tombstone stays in Shadow mode), then the Approve preview
6. Parity on one plugin instead of all of them
7. Live fourth plugin (show a pre-run one with its saved trace)
8. Migration animation (recolour racks instantly), then the handoff view (a text box)

| Risk | Likelihood | Fallback |
|---|---|---|
| Real plugins can't talk to our SNMP responder | Medium | Gate A at 9 PM: switch to `legacy-fallback/` (DAMO scripts on PATH shims, labelled a test set, Munin `apc_status` as unseen proof). The rest of the pipeline is unchanged |
| Nagios can't check every sim minute | Medium | Drive the plugins from the replay harness in the arena too, and feed the Legacy pager from it |
| Nemotron tool calls flaky or rate-limited | Medium | Cached responses per preset with a visible badge; at most 9 tools, strict JSON schemas |
| Nano too slow for a 30-second round | Low–medium | Stream each tool call to the card |
| Super slow on the live fourth plugin | Medium | Stream the trace with a timer; show a pre-run fold beside it |
| Generated rules fail `promtool` after 3 rounds | Medium | The reference rules run, labelled on screen |
| Prometheus timing drifts from the sim clock | Medium | Replay uses `promtool test rules` with explicit timestamps; the live arena scrapes and evaluates at 1 s |
| Docker misbehaves on the demo laptop | Low–medium | Images pulled ahead; replay results come from recorded runs, labelled as recorded |
| Simulator looks fake to NMC² engineers | Medium | Realistic numbers (inlet 18–27°C, throttle about 35°C, PDU warn at 80%); ask them at the booth |
| Combining faults breaks the physics | Medium | Get the headline combination right first; run every other fault alone |
| Wi-Fi fails during judging | Low | Everything except Nemotron, GitHub and Discord is local; cached runs and the backup video are on the laptop |
| Another team builds an alert copilot | High | Lean on the side-by-side against real Nagios, the judge-breaks-it format, the lying sensor and held-out parity |

## Pitch lines and judge Q&A

**One line per sponsor:**

- **NMC²:** "Missed warnings, unclear handoffs, wrong information at the wrong time: your slide named three failures. You just watched us fix all three live, ending in a work order a technician can act on."
- **NVIDIA:** "Nemotron isn't chatting here. Super audits legacy plugins with tools and writes Prometheus rules that `promtool` and replay verify. Nano runs the incident with 9 tools, three of them real services. It decides what to distrust and where load goes, and a human approves."
- **8090:** "Real Nagios plugins in, verified Prometheus rules out, proven on faults the rules never saw. Any coding agent can call the gate before it retires legacy code."
- **Design:** "An operator understands the hall's state in one glance at 3 AM."

| Question | Answer |
|---|---|
| Is the data real? | Simulated, with realistic ranges. The legacy and modern stacks are real: Nagios Core with unmodified plugins, and Prometheus with Alertmanager. The agent only sees telemetry, never the fault you picked; that's why we let you pick. |
| Who wrote the legacy checks? | Nobody on our team. They're unmodified open-source plugins; source, version, license and link are in `legacy/`. The config drift is ours and declared in the README, because every real site has some. |
| Does our hall even page off scripts? | Static thresholds live in Nagios, BMS and DCIM alike. We used Nagios because it's open and runnable here. (Quote the booth answer.) |
| What does Nemotron decide that if/else couldn't? | Whether conflicting readings are one incident or two; which destination wins when power, cooling, priority and SLA disagree; and the rules for a plugin it has never seen. The rules-only column shows the decision tree getting the headline wrong. |
| Why not let it act on its own? | Operators won't trust that, and they're right. It proposes, a human approves, and every action is logged. |
| How is this different from DCIM alarm correlation? | We prove the replacement against the checks you run today, on a scoreboard, on faults it never saw, before anything is retired. |
| What if the LLM is wrong? | Forecasts, sensor checks, replay and parity are deterministic, and `promtool` validates every rules file. Nemotron chooses tools, ties evidence together and writes the plan; the human gate catches the rest. |
| Isn't parity trivially 100%? You kept the old rule. | Keeping the old rule is the requirement, not the proof. The proof is the held-out column: rules generated without a fault still catch it, and your live combination was unseen by construction. |
| Isn't the rule card just an LLM summary? | Each card is checked against the replay. If it says "critical above 32°C", the plugin's exit code has to show it, or the card is flagged. |
| What if the new system drops something the old one did? | That's a regression, and it blocks the tombstone. Parity has to be 100% on every fold. |
| Does this generalize beyond data centers? | The pattern does: read the legacy logic, replay it to map blind spots, require parity on held-out cases, retire with evidence. Nagios to Prometheus is a migration teams already do by hand. |
| How would this deploy? | Read-only connectors to existing DCIM, BMS or Prometheus telemetry first, on open-weight Nemotron inside their network. Actions go through existing ticketing and schedulers. |
| What's next? | Drill mode: the same simulator and de… *(the rest of this answer was lost when the plan was pasted in; see the original merged plan)* |

## Sources

- [HackUTD 2025 Devpost (rules, criteria)](https://hackutd-2025.devpost.com/) · [2025 project gallery](https://hackutd-2025.devpost.com/project-gallery)
- 2025 NMC² winners: [DataDriver](https://devpost.com/software/datadriver) (also NVIDIA) · [TaskFlow](https://devpost.com/software/d-68uye4) · [DCDaddy](https://devpost.com/software/fun-dashboard)
- 2025 NVIDIA winners: [Alchemetrics](https://devpost.com/software/abc-xapnio) · [Toyotron](https://devpost.com/software/toyotron) (also Toyota)
- 2025 StateFarm winners (verification pattern): [MirrorAPI](https://devpost.com/software/mirror-api) · [UpGuardian](https://devpost.com/software/upguard) · [qAPIbara](https://devpost.com/software/in-progress-2awbie)
- [Uptime Institute Annual Outage Analysis 2026](https://www.businesswire.com/news/home/20260513289344/en/Uptime-Announces-Annual-Outage-Analysis-Report-2026)
- [Nemotron 3 on build.nvidia.com](https://dev.to/creeta/nemotron-3-ultra-went-live-june-4-heres-the-call-that-works-55g7)
- [Prometheus: unit testing rules with promtool](https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/)
- [Monitoring Plugins project](https://www.monitoring-plugins.org/) · [Nagios plugin guidelines (exit codes)](https://nagios-plugins.org/doc/guidelines.html)
- HackUTD 2026 opening ceremony slides (8090 challenge p.25, NMC² challenge p.36, EOG challenge p.42, NVIDIA challenge p.64)
