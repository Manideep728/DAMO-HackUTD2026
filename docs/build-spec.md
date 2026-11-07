# THE GAUNTLET — Build Spec (HackUTD 2026)

Nov 7, 2026 · @Deep C

## Pitch

Under the dashboards, data center paging still leans on static threshold checks: Nagios plugins, BMS limits and DCIM alarms nobody dares retune. The Gauntlet retires them safely. Real Nagios runs real open-source plugins against a simulated hall. Nemotron reads each plugin, and a replay proves what it has been blind to. Nemotron then writes Prometheus alerting rules that keep every alert the old check got right and catch the faults it missed, proven on faults the rules never saw. Then the judge breaks the hall: a sensor lies while a cooling unit really fails, and the agent distrusts the liar, still catches the real failure, moves workloads once a human approves, and opens the work order.

**Tracks entered (cap is 3):** NMC² ("Keep the World Running"), NVIDIA ("Use Nemotron Beyond a Chatbot") and 8090 (legacy modernization: real Nagios in, verified Prometheus rules out). 8090's brief is on slide 25: "Build agents and tools that accelerate legacy system modernization. Make it easier to understand, improve, or replace." Map the pitch to its three verbs: the rule card is *understand*, the blind-spot matrix is *improve*, and held-out parity plus the tombstone is *replace*.

**Why it can win:**

- **Proven combination, crowded category.** In 2025, DataDriver won both NMC² and NVIDIA with a modest Flask + LangChain + Nemotron Nano build. The category is also crowded:
  - Alchemetrics won NVIDIA in 2025 with trend detection, forecasts and a Nemotron planner over deterministic tools.
  - EOG's 2026 brief (slide 42) asks for a night-shift console that shows what's failing, the time before it worsens, and the lowest-cost path. That is our incident card.

  The agent loop is common this weekend. The lying sensor, the live old-versus-new side-by-side and held-out parity must carry the novelty.
- **NMC²'s 2025 winners were all technician workflow** (DataDriver, TaskFlow, DCDaddy: work plans, tickets, routing, AR). None did telemetry. Our work order (unit, location, likely part, handoff attached) is what connects us to that pattern.
- **Real systems on both ends (8090).** Nagios → Prometheus is a migration teams actually do by hand. We run the real Nagios plugins, and the output is a real Prometheus rules file that `promtool` validates and Prometheus evaluates. Nothing on either end is a toy written to lose.
- **Verification wins with judges.** StateFarm's three 2025 winners (MirrorAPI, UpGuardian, qAPIbara) were all "prove nothing broke" regression tools. Parity on held-out faults is that idea applied to modernization.
- **Judge-driven demo.** The judge breaks the hall live, and the headline fault combination is unseen by the rules by construction.
- **The lying sensor on top of a real failure.** Threshold checks can't tell a faulty sensor from a real problem, and they certainly can't do it while a real problem is happening next to it. The agent can, and the rules-only counterfactual shows it.
- **Covers all three of NMC²'s failure modes:** missed warning, unclear handoff, wrong information at the wrong time.

**Judging criteria (2025, confirm on this year's Devpost):** Innovation, Technical Complexity, Completeness, Design, Impact, Presentation.

**Odds (unanchored guesses; we have no entrant counts):**

| Track | Estimate |
|---|---|
| NMC² | About 30–45% for top 3 |
| NVIDIA | 10–18% for top 2 (the most crowded track) |
| 8090 | 25–35%, toward 40% only if real Nagios, `promtool`-verified rules and the live fourth plugin all work on stage (one prize; expect many code-generation entries) |

About 50% for at least one prize. A feature counts only once it works on stage.

**Mock-judging scorecard** (Nov 7, assuming every feature ships):

| Innovation | Technical complexity | Completeness | Design | Impact | Presentation |
|---|---|---|---|---|---|
| 7 | 9 | 8 | 7 | 5 | 6 |

The main losses were circular parity, a thin role for Nemotron, toy legacy input, an unverified premise and two stories in one pitch. This revision targets each of those.

## Users and problems

Each persona maps to one phrase in NMC²'s challenge slide.

| Persona | Pain (NMC²'s words) | How Might We | What answers it |
| --- | --- | --- | --- |
| Night-shift NOC / facilities tech | "A missed warning": one failure fires 100+ alerts; fixed thresholds trip only after damage starts | Turn an alert storm into one cause, one countdown and one action, before a threshold trips? | Incident card with time-to-impact countdown |
| Incoming shift lead / on-call technician | "An unclear handoff": notes scattered across Slack, whiteboards and memory | Make every handoff complete and free to write, and send the fix to someone who can do it? | Auto-written handoff plus a work order: unit, location, likely part |
| Capacity / thermal engineer | "The wrong information at the wrong time": faulty sensors trigger false emergencies; finding where load can move is manual | Show which data to trust and where load can safely go, in seconds? | Lying-sensor check + multi-constraint migration plan |

**Premise check (ask at the NMC² booth):** "Does your hall page off static thresholds, and in what: Nagios-style checks, the BMS or DCIM?" If the answer is BMS or DCIM, say "static thresholds in any system" and keep Nagios as the open, runnable stand-in. Quote their answer in the pitch.

**Supporting facts for the pitch** ([Uptime Institute 2026](https://www.businesswire.com/news/home/20260513289344/en/Uptime-Announces-Annual-Outage-Analysis-Report-2026)):

- Power is the leading cause of impactful outages (UPS, transfer switches, generators).
- Failing to follow procedures is the top driver of human-error outages.
- 1 in 5 operators said their latest major outage cost over $1M (2025 survey).

## What it does

One data hall, two guardians, one scoreboard. Real Nagios and the agent watch the same simulated telemetry. The judge injects faults, and the scoreboard shows who saved the hall.

**Core loop:**

1. The judge drags fault cards onto the floor map. The headline is a lying sensor on B7 plus a degraded cooling-unit fan in the same row.
2. The simulator changes the physics; temperatures and loads drift in real time.
3. Nagios Core runs the legacy plugins and pages into the "Legacy pager" (left panel): late, in a flood, and with a false emergency for B7.
4. The generated Prometheus rules fire early, and Alertmanager's webhook wakes the agent. The agent investigates with tools (PromQL queries, sensor cross-checks, forecasts) and posts **one incident card**: cause, countdown to impact and a proposed plan. A rules-only planner's answer sits beside it for comparison.
5. The operator clicks **Approve**. Workloads move and the map cools.
6. The agent then:
   - opens a **work order as a real GitHub Issue** (unit, location, likely part, handoff link)
   - pages through Discord
   - writes the shift handoff

   The scoreboard updates.

**Fault cards (all modelled in the simulator, combinable):**

| Card | What changes in the sim | What the legacy checks do (site-style `-w`/`-c` thresholds) | What the agent does |
| --- | --- | --- | --- |
| **Lying sensor + cooling fan degraded (headline)** | B7 reports +10°C while its true inlet is unchanged; the cooling unit serving row B loses X% cooling, so B5–B9 really drift up | False emergency on B7 first, then a flood once the real racks cross critical | Flags B7's sensor as unreliable, still catches the real degrade from neighbours and outlet temperatures, and moves load off the racks that are really at risk, not off B7 |
| PDU breaker creep | A job pushes one PDU's load steadily toward its breaker limit; utility power stays up | Fires once, past 80% | Forecasts time to trip, moves load to racks with power headroom |
| Cooling unit fan degraded | That unit's cooling drops by X%; nearby inlets drift up slowly | Silent until critical, then floods | Flags the trend minutes early with a countdown |
| Cooling unit failed | That unit's cooling goes to 0 | Status-flag alert, no impact estimate | Maps which racks are affected and when |
| Job spike | Load on one rack jumps | Temperature alerts later | Spots the load source, proposes rebalancing |
| Lying sensor (alone) | One sensor reports +10°C; real temperature unchanged | False emergency, pages someone | Cross-checks neighbours and the inlet/outlet gap, flags the sensor, moves nothing |
| Harmless spike | A scheduled batch job; temperatures rise and stay within limits | May page | Stays quiet |

**Rule of trust:** the agent proposes; a human approves. Never pitch autonomous changes to cooling or power.

**Not a fault card: UPS on battery.** Losing utility power is a generator and runtime problem, and moving load between racks doesn't fix it. Quote the Uptime power stat without implying migration solves outages.

### The modernization pipeline (8090)

The old checks get retired by proof, not by trust. Five steps, run once per legacy plugin:

1. **Read.** Nemotron 3 Super (reasoning on) reads the unabridged plugin source together with its Nagios command definition and `-w`/`-c` thresholds. It writes a rule card: what the plugin checks, its thresholds, and what it ignores (trends, neighbours, sensor health). The replay verifies each card.
2. **Replay.** The harness runs the same plugin binaries Nagios runs, tick by tick, against the SNMP responder serving each recorded fault run. The plugins' exit codes (0 OK, 1 WARNING, 2 CRITICAL, 3 UNKNOWN) become the blind-spot matrix: caught early, caught late, missed, or false alarm. It comes from execution, not the LLM's opinion.
3. **Rebuild.** Nemotron writes a **Prometheus alerting rules file**. Every legacy alert that was right becomes a must-keep rule. Every blind spot gets a new rule, labelled with the fault card that found it. `promtool check rules` must pass.
4. **Prove (leave-one-out).** For each fault card:
   - Regenerate the rules *without* that card's blind spots.
   - Replay the held-out card through `promtool test rules`, with the recorded series as `input_series` and the legacy run's correct alerts as the expected alerts.
   - **Parity:** every alarm the old check got right must also be raised by the new rules on the same rack, at the same tick or earlier.
   - Also report the **catch rate on the held-out fault** (blind spots the rules were never shown).

   Any regression blocks the next step. The judge's live combination is held out by construction.
5. **Retire.** 100% parity on every fold, zero regressions and a better held-out catch rate earn the old check its tombstone, with the evidence attached.

**Say the limit before they do:** the fault library is ours. Leave-one-out shows the rules generalize beyond the faults that shaped them, not to every fault in the world. The judge's live combination is the real out-of-sample test, and that's why we hand them the mouse.

## Architecture

Six build components and one WebSocket:

| Component | Owns |
|---|---|
| 1 | Simulator, Prometheus exporter, SNMP responder |
| 2 | Legacy stack: Nagios Core + plugins |
| 3 | Agent |
| 4 | Frontend |
| 5 | Modernization pipeline: generated rules, folds, gauntlet CLI / MCP tools |
| 6 | Modern stack: Prometheus + Alertmanager |

Python backend, React frontend, and Nemotron through build.nvidia.com's OpenAI-compatible API. Nagios Core, Prometheus and Alertmanager run in Docker Compose on localhost.

&#91;embedded content: system architecture · 9 parts, 1 approval loop\]

*The diagram predates this revision. Add the exporter, SNMP responder, Nagios Core, Prometheus and Alertmanager.*

The simulator feeds both guardians the same reported readings. Only the agent's plan, once a human approves it, changes the simulation.

**1. Simulator** (Python + FastAPI)

- Layout: 4 rows × 10 racks (A1–D10), 4 cooling units, 8 power strips (PDUs).
- One tick per second; each tick = 1 simulated minute. Show the sim clock on screen. Prometheus scrapes and evaluates every 1 s, so a rule's `for:` duration in seconds equals sim minutes.
- Rack inlet temperature per tick:

```latex
T \leftarrow T + \alpha\,(T_{supply} + \beta \cdot load - \sum_j cooling_j \cdot w_{ij} - T)
```

- w = how much each cooling unit cools each rack (falls off with distance). Faults only change parameters.
- Each rack exposes: inlet temp, outlet temp, load (kW), PDU %, reported inlet reading.
  - A lying-sensor fault offsets only the reported value; true inlet, outlet and neighbours stay honest.
  - Outlet = true inlet + k · load / airflow, so a lying inlet sensor shows up as an inlet/outlet gap that shrinks or goes negative.
  - Start the lying-sensor target rack at 25°C or above so +10°C crosses the critical threshold and the legacy false alarm actually fires.
- Three outputs, all carrying the **reported** values (the true values exist only inside the sim, for scoring):
  - **WebSocket:** full state as JSON, for the frontend.
  - **`/metrics` exporter:** `rack_inlet_celsius{rack="B7"}`, `rack_outlet_celsius`, `rack_load_kw`, `pdu_load_percent{pdu=…}`, `cooling_unit_up{unit=…}`, for Prometheus.
  - **SNMP responder:** serves the same values on the OIDs the legacy plugins query. It serves live state in the arena and recorded runs in replay, so no plugin is edited.

**2. Legacy stack** (Nagios Core in Docker + unabridged open-source plugins)

- Pick plugins that query SNMP, so one responder serves all of them. Examples: `check_snmp` from the [Monitoring Plugins](https://www.monitoring-plugins.org/) project with temperature, PDU and cooling-status OIDs, or Perl/shell environment and PDU checks from Nagios Exchange. Verify each one runs unmodified against the responder before committing to it.
- Unmodified source, version, license (most are GPL) and link go in `legacy/README`. `legacy/` keeps its own license; say so in the top-level README.
- Configure thresholds the way a typical site would: inlet warning 27°C / critical 32°C, PDU warning 80%, cooling unit status flag. Check every tick; this creates the flood.
- Nagios notifications feed the Legacy pager through a notification command that posts to the backend.

**3. Agent**

- **Models:**
  - Live incidents run on **Nemotron Nano**, which is fast. DataDriver won two 2025 tracks on Nano 9B.
  - Rule cards and rule generation run on **Nemotron 3 Super with reasoning on**: offline for the shipped rules and the folds, live for the fourth plugin.
  - Copy the exact model IDs from build.nvidia.com.
  - At 6 PM, time one full Nano investigation. Target under 20 s with each tool call streamed to the card.
- **Woken by Alertmanager's webhook** when a generated Prometheus rule fires, not on every tick. The new detection layer wakes the agent, so detection is reproducible. `cross_check_sensor` stays deterministic.
- **What Nemotron decides** (the answer to "why not if/else"):
  1. Whether conflicting readings are one incident or two (lying sensor plus a real degrade).
  2. Which destination wins when power headroom, cooling headroom, job priority and SLA disagree.
  3. The rules for a plugin it has never seen.
- **Tools (9; three hit real services):**
  - `get_topology()`: racks, cooling units, PDUs, adjacency
  - `query_telemetry(promql)`: PromQL against **Prometheus**
  - `forecast_breach(rack)`: linear fit, minutes to 35°C throttle or PDU trip
  - `cross_check_sensor(id)`: compares with neighbours and the inlet/outlet gap (deterministic; the LLM only explains it)
  - `propose_migration(from, candidates)`: returns power headroom, cooling headroom, job priority and SLA impact for each candidate. Nemotron picks one and states the trade-off.
  - `execute_migration(plan_id)`: only after a human clicks Approve
  - `open_work_order()`: a real **GitHub Issue** via `gh` with the unit, location, likely part and handoff link
  - `page_oncall()`: a real **Discord** webhook
  - `write_handoff()`
- **Counterfactual baseline:** a rules-only planner (a fixed decision tree over Alertmanager alerts) runs on the same incidents. Its answer appears on the incident card's evidence and in the reliability table.
- **Output:** an incident card JSON (cause, countdown, evidence, plan, reasoning steps, the rules-only answer).

**4. Frontend** (React + Vite + SVG)

- Center: the floor map. Racks are coloured by temperature, heat spreads as faults bite, and fault cards are dragged onto it.
- Left: Legacy pager (Nagios notification flood).
- Right: the agent incident card. It shows:
  - the countdown
  - reasoning steps and tool calls streamed as they happen
  - a live / cached badge
  - the rules-only answer
  - the work order link
  - the Approve button
- Top: scoreboard (warning lead time, alerts generated, jobs at risk). The tombstone appears when the agent wins.

**5. Modernization pipeline** (the 8090 layer, mostly deterministic)

- **Legacy reader:** one Super prompt per plugin (source plus Nagios command config) produces a rule card JSON (condition, thresholds, inputs used, inputs ignored). Generate once, cache, show in the UI. The live fourth plugin is the exception.
- **Replay harness:**
  - Records one run per fault card (simulator seed fixed).
  - Legacy side: runs each plugin binary per tick against the SNMP responder serving the recording.
  - Modern side: converts each recording to `promtool test rules` input series.
  - Output: the blind-spot matrix (plugin × fault → early / late / missed / false alarm, plus minutes of warning).
- **Rule generator:** Super writes the Prometheus rules file from the rule card plus the blind spots. One full-library file ships, and one file per leave-one-out fold proves generalization. All must pass `promtool check rules`.
- **Parity checker:**
  - For each fold and each legacy alert that was correct, look for an alert from that fold's rules on the same rack, raised at the same tick or earlier. No other kind of "replacement" counts.
  - Result: parity %, regressions list, improvements list, held-out catch rate.
  - The tombstone unlocks only at 0 regressions across all folds.
  - Run the replay 3 times and show "3/3 runs" so judges see it's reproducible.
- **Verify the reader:** each rule card is checked against the replay. If the card says "critical above 32°C", the replay must show exit code 2 above 32°C; a mismatch flags the card.

**6. Modern stack** (Prometheus + Alertmanager in Docker)

- Prometheus scrapes the exporter every 1 s and evaluates the shipped generated rules.
- Alertmanager routes to two receivers: the agent's webhook (wakes the investigation) and Discord.
- `promtool` runs inside `gauntlet verify` and in the replay.

**Fallback mode:** cache agent responses for each fault preset so the demo runs if the API is slow or rate-limited. Always show the live / cached badge: a judge who catches an unlabeled cache stops trusting everything else.

## 2-minute demo script

The judge's hands on the mouse in the first 20 seconds is the moment that wins it. Rehearse this 10 times. The shared core is 90 seconds and names three concepts at most: **lying sensor, parity, tombstone**. Everything else lives in the judge's minute.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00–0:20 | Shadow mode. The live hall; the legacy pager already noisy from real Nagios; the agent quiet. Hand the judge the mouse with the headline card. | "Left is real Nagios running real plugins: what pages your night shift today. Right is what replaces it. Break it." The judge drops *lying sensor + cooling degraded* on row B. |
| 0:20–0:50 | Nagios pages a false emergency on B7, then floods. The incident card streams Nano's tool calls (PromQL, cross-check, forecast, migration candidates). B7 goes dashed with its reading struck through. | Read the card: "Sensor B7 is unreliable. The row B cooling unit's fan is degraded: B5–B9 reach 35°C in 18 min. Move 2 jobs to D6; power and cooling headroom checked." Hover Approve to show the preview, click; the map cools. The phone buzzes; the work order opens as a GitHub issue. |
| 0:50–1:10 | Scoreboard and the rules-only line on the card | "47 Nagios alerts, 1 incident, 12 minutes earlier, zero false pages. A rules-only planner would have moved load off B7, the one rack that was fine." |
| 1:10–1:30 | Parity on the held-out fold, then the tombstone | "Every alert the old check got right, the new Prometheus rules raise too, on faults they never saw. That's how the old check retires: by proof." |
| 1:30–2:30 | The judge's minute (see Judge playbook) | NMC²: read the handoff and work order, then a harmless batch-job spike where the agent stays quiet. NVIDIA: expand the trace, show the rules-only counterfactual, force a tool error, show the reliability table. 8090: paste the fourth plugin live (read → replay → matrix → rules, Super trace with timer), click a rule to its source line, show the tombstone blocked at one regression, run `gauntlet verify`. |

The numbers above are placeholders. Say the real numbers the scoreboard shows.

## Team and timeline

Assumes a team of 4. If you are 3, merge P1 and P4 and cut combining faults now (except the headline combination). The hard gate is the simulator streaming by 6 PM; everything else builds on it.

| Person | Owns | Done when |
| --- | --- | --- |
| P1 | Simulator, fault primitives, WebSocket, `/metrics` exporter, SNMP responder, fixed-seed recordings for replay; after 4 AM: Devpost and pitch with P4 | All fault cards change the physics believably, replay identically, and real plugins and Prometheus both read the sim |
| P2 | Agent (Nano), tools, prompts, rules-only baseline, legacy reader and rule generator (Super), leave-one-out fold generation, response cache | Incident card, rule card and rules file for every fault, plugin and fold, live and cached; the fourth-plugin pipeline runs live |
| P3 | Frontend: floor map, fault cards, incident card, rule cards, handoff view, design. Floor map and incident card first; nothing else before 11 PM | Map animates from the stream; incident card streams tool calls |
| P4 | Docker Compose (Nagios Core, Prometheus, Alertmanager), legacy plugin selection and config, replay harness, `promtool` tests, parity checker, blind-spot matrix and parity screens, scoreboard, tombstone, backup video | Matrix and per-fold parity numbers come from real runs; video recorded |

**Milestones (tick them off):**

- [ ] 3:30 PM: booth visits.
  - NMC²: ask the premise question ("Does your hall page off static thresholds, and in what?"), what breaks on night shifts, and "Would your night shift approve a load move suggested by an agent?" Quote both answers.
  - 8090: their brief is on slide 25. Ask what "proof" of a safe modernization looks like to them.
- [ ] 4:00 PM: repo up. All 4 agree the JSON schemas for telemetry, incident cards, rule cards, replay results and folds, plus the Prometheus metric names/labels and the SNMP OID map. Nemotron API keys for all 4; rate limits checked.
- [ ] 6:00 PM:
  - The simulator streams over WebSocket, `/metrics` and SNMP; Prometheus scrapes it; the map renders it.
  - One plugin runs unmodified against the responder and returns an exit code.
  - One PromQL tool call works end to end.
  - One Nano investigation timed.
- [ ] 11:00 PM:
  - The headline round (lying sensor + cooling degraded) works end to end on Nano.
  - Nagios Core pages into the Legacy pager.
  - Rule cards generated and cached.
  - Grey map, reordered incident card and trace panel in.
  - Confirm where sponsor judging happens.
  - **Submit the initial Devpost as a real write-up, not a placeholder.**
- [ ] 4:00 AM:
  - All fault cards, including the harmless spike.
  - Replay harness, blind-spot matrix, shipped Prometheus rules passing `promtool`, leave-one-out folds and per-fold parity.
  - Alertmanager → agent webhook and Discord.
  - GitHub work-order tool and rules-only baseline.
  - Live fourth-plugin pipeline.
  - CLI, Shadow / Live switch, traceability click-through.
  - Reliability run started overnight.
- [ ] 8:00 AM:
  - Scoreboard, tombstone, handoff with Acknowledge, phone page, Approve preview, Retirement tab.
  - MCP tools, evidence pack, reliability table with the counterfactual column.
  - Cached fallback for every preset, design polish.
- [ ] 8:00–11:00 AM: rehearse the 90-second core and the three judge minutes 10 times, and record the backup video (not a placeholder). The presenter has slept 3–4 hours by now.
- [ ] 12:00 PM: **Final Devpost deadline.** Judging 1–4 PM.

**Booth kit:**

- [ ] Second monitor so judges aren't leaning over a laptop
- [ ] Phone set up to receive the Discord page
- [ ] Power strip
- [ ] QR code to the repo and a sample evidence pack
- [ ] Docker images pulled ahead of time (no venue Wi-Fi dependency)
- [ ] Sleep shifts planned; the presenter sleeps first

## Cut list, risks, and fallbacks

Never cut the headline lying-sensor round or held-out parity. They are the moments that win.

**Already cut (do not build):** free-text disasters, open-ended code analysis (rule cards only for the plugins in `legacy/` plus the one pasted live), 3D, real hardware, multiplayer, auto-acting without approval.

| Risk | Likelihood | Fallback |
| --- | --- | --- |
| Nemotron tool calls flaky or rate-limited | Medium | Cached responses per fault preset; keep tools ≤ 9 with strict JSON schemas |
| Nano still too slow for a 30 s round | Low–medium | Stream each tool call to the card; cached runs carry a visible badge |
| Super is slow on the live fourth plugin | Medium | Stream the trace with a visible timer; show a pre-run fold result beside it while it finishes |
| Real plugins need inputs the sim doesn't speak | Medium | Choose only SNMP-based plugins; verify each one against the responder at 6 PM before committing to it |
| Prometheus timing differs from the sim clock | Medium | Replay uses `promtool test rules` with explicit timestamps (deterministic); the live arena scrapes and evaluates at 1 s |
| Docker stack misbehaves on the demo laptop | Low–medium | Images pulled ahead; replay results come from the same recorded runs and are labelled as recorded |
| Simulator looks fake to NMC² engineers | Medium | Use realistic numbers (inlet 18–27°C normal, throttle ~35°C, PDU 80% warn); ask them at the booth |
| Combining faults breaks the physics | Medium | Get the headline combination right first; run every other fault one at a time |
| Live migration animation eats hours | Low–medium | Show the plan + Approve, recolour racks instantly |
| Wi-Fi fails during judging | Low | Everything except Nemotron, GitHub and Discord runs on localhost; backup video on the laptop |
| Another team builds an alert copilot (EOG's brief guarantees it) | High | Lean on the side-by-side against real Nagios, the judge-breaks-it format, the lying sensor and held-out parity |

**Cut order if behind:**
1. Cache the agent and the rule cards.
2. Drop combining faults (keep the headline combination).
3. Parity on 1 plugin instead of all of them.
4. Drop the migration animation.
5. Drop the handoff view to a text box.

Never cut the replay matrix, held-out parity or the lying sensor.

## Pitch lines and judge Q&A

**One line per sponsor:**

- **NMC²:** "Missed warnings, unclear handoffs, wrong information at the wrong time: your slide named three failures. You just watched us fix all three live, and the fix ended in a work order a technician can act on."
- **NVIDIA:** "Nemotron isn't chatting here. It reads legacy Nagios plugins and writes Prometheus rules that `promtool` and replay verify. Then it runs the incident with 9 tools, three of them real services (Prometheus, GitHub, Discord). It decides what to distrust and where load goes, and a human approves."
- **8090:** "Real Nagios plugins in, verified Prometheus rules out, proven on faults the rules never saw. Any coding agent can call the gate before it retires legacy code."
- **Design:** "An operator understands the hall's state in one glance at 3 AM."

**Likely questions:**

| Question | Answer |
| --- | --- |
| Is the data real? | Simulated, with realistic ranges. The legacy and modern stacks are real: Nagios Core with unmodified plugins, and Prometheus with Alertmanager. The agent only sees telemetry, never the fault you picked; that's why we let you pick. |
| Who wrote the legacy checks? | Nobody on our team. They're unmodified open-source plugins; source, version, license and link are in `legacy/`. We didn't write the old guard to lose. |
| Does our hall even page off scripts? | Static thresholds live in Nagios, BMS and DCIM alike. We used Nagios because it's open and runnable here. (Quote the booth answer.) |
| What does Nemotron decide that if/else couldn't? | Three things: whether conflicting readings are one incident or two, which destination wins when power, cooling, priority and SLA disagree, and the rules for a plugin it has never seen. The rules-only column shows the decision tree getting the headline case wrong. |
| Why not let it act on its own? | Operators won't trust that, and they're right. It proposes; a human approves; every action is logged. |
| How is this different from DCIM alarm correlation? | We prove the replacement against the checks you run today, on a scoreboard, on faults it never saw, before anything is retired. |
| What if the LLM is wrong? | Forecasts, sensor checks, replay and parity are deterministic, and `promtool` validates every rules file. Nemotron chooses tools, ties the evidence together and writes the plan; the human gate catches the rest. |
| (8090) Isn't parity trivially 100%? You kept the old rule. | Keeping the old rule is the requirement, not the proof. The proof is the held-out column: rules generated without a fault still catch it, and your live combination was unseen by construction. |
| (8090) Isn't the rule card just an LLM summary? | Each card is checked against the replay. If it says "critical above 32°C", the plugin's exit code has to show it, or the card is flagged. |
| (8090) What if the new system drops something the old one did? | That's a regression, and it blocks the tombstone. Parity has to be 100% on every fold before anything is retired. |
| (8090) Does this generalize beyond data centers? | The pattern does: read the legacy logic, replay it to map its blind spots, require parity on held-out cases, retire with evidence. Nagios → Prometheus is a migration teams already do by hand. |
| How would this deploy? | Read-only connectors to existing DCIM / BMS / Prometheus telemetry first; actions go through existing ticketing and schedulers. |

## Judge playbook

The 3-minute booth is the 90-second core, then a judge's minute aimed at the person in front of you. Each judge has seen about 30 projects and is looking for a reason to walk away.

**For every judge:** the first 15 seconds is the live hall, the noisy legacy pager and one sentence: *"Left is real Nagios: what pages your night shift today. Right is what replaces it. Break it."* No title slide. Hand over the mouse in the first 20 seconds. Show one failure on purpose.

|  | NMC² (runs real facilities) | NVIDIA (Nemotron must do real work) | 8090 (modernization is their business) |
| --- | --- | --- | --- |
| Their question | "Show me you understand a 3 AM page from a lying sensor." | "Prove this isn't a chatbot with Nemotron bolted on." | "How do you know nothing was lost?" |
| Wins the first 15 s | A floor map that looks like a real hall (rows, aisles, cooling units, PDUs), temps already drifting; Nagios paging, agent quiet | Tool calls streaming on the incident card (query_telemetry as PromQL → cross_check_sensor → forecast_breach → propose_migration) with model, tool count and seconds | The real plugin source, its rule card, and a green check that execution verified the card; blind-spot matrix filled from real runs. Say: "We don't trust the AI's reading of the code. We run the code to check it." |
| Loses them in 15 s | A README or Devpost on screen; normal inlet temps outside 18–27°C; "AI-powered monitoring" | A chat box; a spinner with no steps; finding out GPT or Gemini does the real work | Checks obviously written to lose; rule cards with no link to source; the word "rewrite" |
| The extra minute | Countdown in real minutes ("PDU B2 trips in 22 min"); destination headroom check before any move; read the handoff and work order aloud for 10 s; a harmless batch-job spike where the agent stays quiet | Expand one trace and explain why it moved load off B5, not B7; show the rules-only counterfactual; force one tool error and show it retries or says it doesn't know; one Nano vs Super line with numbers; run one incident live with the badge showing | Paste a fourth plugin live: read → replay → matrix → rules, Super trace with a timer; click a rule to its source line; click a parity row to open the replay run; show the tombstone blocked at 97% by one regression, then what fixed it; a rule card the verifier flagged ("Nemotron said 30°C, execution says 32°C") |
| Genuinely impressed | The judge stacks a PDU creep on top of the headline combination; the agent keeps all three straight | An unprepared fault combination runs live and is right, then the reliability table: every fault card × 10 runs, correct actions out of total, rules-only baseline beside it, misses explained | The held-out column: rules that never saw a fault still catching it, and `gauntlet verify` passing in a terminal |
| Answer ready | "What if the agent is down?" → "Nagios keeps running until the tombstone. That's the point." | "Is that cached?" → say so before they ask, then run one live | "Does it scale?" → "The pipeline runs per plugin, and the replay library grows with each incident." Don't claim more than you built |

## Booth build additions

These turn the playbook into things on screen. They fit inside the existing milestones; the first three are the cheapest wins.

| Addition | For | Owner | Done by | Cost |
| --- | --- | --- | --- | --- |
| Trace panel: each tool call with reason, timing, model, and "skipped because…" lines | NVIDIA | P2 data, P3 UI | 11:00 PM | Low (tool calls already stream) |
| Rules-only counterfactual on the incident card and in the reliability table | NVIDIA | P2 | 4:00 AM | Low |
| Click-through traceability: rule → source line; parity row → replay run | 8090 | P4 data, P3 UI | 4:00 AM | A few hours of frontend |
| Held-out column on the parity screen: per-fold parity and held-out catch rate | 8090 | P4 data, P3 UI | 4:00 AM | Low (falls out of the folds) |
| Live fourth plugin: paste → read → replay → matrix → rules, with Super's trace and a timer | 8090, NVIDIA | P2 + P4 | 4:00 AM | Medium (fault library already exists: one Super call + one replay + one `promtool` run) |
| Reliability table: every fault card × 10 runs, correct actions / total, rules-only baseline beside it, misses explained | NVIDIA | P2 | 4:00 AM (run overnight) | One script run |
| Harmless spike fault card (scheduled batch job) where the agent stays quiet | NMC² | P1 | 4:00 AM | Low |
| Destination headroom shown on every migration proposal | NMC² | P2 | 4:00 AM | Low |
| Planned failures: tombstone blocked at one regression; a rule card the verifier flags; a toggle that makes one tool return an error | 8090, NVIDIA | P4 (first two), P2 (toggle) | 8:00 AM | Low–medium |
| Nano vs Super comparison: one line with latency and accuracy | NVIDIA | P2 | 8:00 AM | Low (falls out of the reliability run) |

- [ ] 8:00–11:00 AM: rehearse the three judge-minute variants (NMC² = handoff + work order + harmless spike, NVIDIA = trace + counterfactual + tool error, 8090 = live fourth plugin + held-out column + blocked tombstone) as well as the 90-second core.

**Cut order for these if behind:** the Nano vs Super line, then the tool-error toggle. Never cut the trace panel, the counterfactual, the held-out column or the blocked-tombstone run.

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
