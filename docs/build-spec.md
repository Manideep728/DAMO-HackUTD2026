# THE GAUNTLET — Build Spec (HackUTD 2026)

Nov 7, 2026 · @Deep C

## Pitch

Under the dashboards, much of a data center's paging still runs on old threshold scripts nobody dares touch. The Gauntlet replaces them safely. Nemotron reads each script and turns it into plain-English rules. A replay against a library of faults then proves what each script has been blind to. A new agent guardian must catch every alarm the old script got right and beat it live before the script gets a tombstone. Then the judge breaks the hall, and the agent finds the real cause, ignores the sensor that's lying, moves workloads to safety, and writes the handoff.

**Tracks entered (cap is 3):** NMC² ("Keep the World Running") + NVIDIA ("Use Nemotron Beyond a Chatbot") + 8090 (legacy modernization: old scripts are retired only after the new system beats them live). 8090's brief is on slide 25: "Build agents and tools that accelerate legacy system modernization. Make it easier to understand, improve, or replace." Map the pitch to its three verbs: the rule card is understand, the blind-spot matrix is improve, parity plus the tombstone is replace.

**Why it can win:**

- **Proven combination.** In 2025, one data-center agent project (DataDriver) won both NMC² and NVIDIA with a modest Flask + LangChain + Nemotron Nano build. It cuts both ways: judges have seen this category, and teams that studied 2025's winners will build alert copilots. The side-by-side, the lying sensor and parity must carry the novelty, not the agent.
- **Modernization you can verify (8090).** Moving legacy logic into a new system without losing behavior is 8090's world. The parity check proves it: no old rule dropped, new failures caught, then the tombstone.
- **Judge-driven demo.** The judge breaks the hall live, so nothing looks scripted.
- **The lying sensor.** Threshold scripts can't tell a faulty sensor from a real problem. The agent can, and that proves it reasons.
- **Covers all three of NMC²'s failure modes:** missed warning, unclear handoff, wrong information at the wrong time.

**Judging criteria (2025, confirm on this year's Devpost):** Innovation, Technical Complexity, Completeness, Design, Impact, Presentation.

**Odds (estimate, if the demo works and the backup video exists):** about 30–45% for a top-3 finish in NMC², 10–18% for top 2 in NVIDIA (the most crowded track), and 25–35% in 8090, toward 40% only if the generated rules and the CLI work on stage (one prize; expect many code-generation entries). About 50% for at least one prize. A feature counts only once it works on stage.

## Users and problems

Each persona maps to one phrase in NMC²'s challenge slide.

| Persona | Pain (NMC²'s words) | How Might We | What answers it |
| --- | --- | --- | --- |
| Night-shift NOC / facilities tech | "A missed warning": one failure fires 100+ alerts; fixed thresholds trip only after damage starts | Turn an alert storm into one cause, one countdown and one action, before a threshold trips? | Incident card with time-to-impact countdown |
| Incoming shift lead / on-call SRE | "An unclear handoff": notes scattered across Slack, whiteboards and memory | Make every handoff complete and free to write? | Auto-written handoff at the end of the incident |
| Capacity / thermal engineer | "The wrong information at the wrong time": faulty sensors trigger false emergencies; finding where load can move is manual | Show which data to trust and where load can safely go, in seconds? | Lying-sensor check + migration plan with headroom check |

**Supporting facts for the pitch** ([Uptime Institute 2026](https://www.businesswire.com/news/home/20260513289344/en/Uptime-Announces-Annual-Outage-Analysis-Report-2026)):

- Power is the leading cause of impactful outages (UPS, transfer switches, generators).
- Failing to follow procedures is the top driver of human-error outages.
- 1 in 5 operators said their latest major outage cost over $1M (2025 survey).

## What it does

One data hall, two guardians, one scoreboard. The old scripts and the agent watch the same simulated telemetry; the judge injects faults; the scoreboard shows who saved the hall.

**Core loop:**

1. The judge drags a fault card onto the floor map.
2. The simulator changes the physics; temperatures and loads drift in real time.
3. The legacy guards fire per-sensor alerts into the "Legacy pager" (left panel), usually late and in a flood.
4. A cheap trend detector wakes the agent early. The agent investigates with tools and posts **one incident card**: cause, countdown to impact, and a proposed plan.
5. The operator clicks **Approve**. Workloads move and the map cools.
6. The agent opens a ticket, pages the right person and writes the shift handoff. The scoreboard updates.

**Fault cards (all modelled in the simulator, combinable):**

| Card | What changes in the sim | What the legacy scripts do | What the agent does |
| --- | --- | --- | --- |
| PDU breaker creep (lead with this) | A job pushes one PDU's load steadily toward its breaker limit; utility power stays up | Fires once, past 80% | Forecasts time to trip, moves load to racks with power headroom |
| Cooling unit fan degraded | That unit's cooling drops by X%; nearby inlets drift up slowly | Silent until 32°C, then floods | Flags the trend minutes early with a countdown |
| Cooling unit failed | That unit's cooling goes to 0 | Status-flag alert, no impact estimate | Maps which racks are affected and when |
| Job spike | Load on one rack jumps | Temperature alerts later | Spots the load source, proposes rebalancing |
| **Lying sensor** | One sensor reports +10°C; real temperature unchanged | False emergency, pages someone | Cross-checks neighbours and the inlet/outlet gap, flags the sensor, moves nothing |

**Rule of trust:** the agent proposes; a human approves. Never pitch autonomous changes to cooling or power.

**Not a fault card: UPS on battery.** Losing utility power is a generator and runtime problem; moving load between racks doesn't fix it. Quote the Uptime power stat without implying migration solves outages.

### The modernization pipeline (8090)

The old scripts get retired by proof, not by trust. Five steps, run once per legacy script:

1. **Read.** Nemotron reads the script and writes a rule card: what it checks, its threshold, and what it ignores (trends, neighbours, sensor health).
2. **Replay.** The script runs against a recorded run of every fault card. Each result is marked caught early, caught late, missed, or false alarm. This is the blind-spot matrix, and it comes from execution, not from the LLM's opinion.
3. **Rebuild.** Every legacy rule that was right becomes a must-keep rule in a rules file Nemotron writes, and each blind spot gets a new rule tagged with the fault card that found it. This file is the new guardian's detection layer; the agent sits on top.
4. **Prove.** The generated rules file runs the same replay, with the agent on top in the live Gauntlet. Parity check: every alarm the old script got right, the generated rules must also raise on the same rack, at the same time or earlier. Any regression blocks the next step.
5. **Retire.** 100% parity and a better score means the old script gets its tombstone, with the evidence attached.

## Architecture

Five build components (the diagram shows the 9 runtime pieces), one WebSocket. Component 5 also owns the generated rules file and the gauntlet CLI / MCP tools (see 8090 reusability features). Python backend, React frontend, Nemotron through build.nvidia.com's OpenAI-compatible API.

&#91;embedded content: system architecture · 9 parts, 1 approval loop\]

The simulator feeds both guardians the same data. Only the agent's plan, once a human approves it, changes the simulation.

**1. Simulator** (Python + FastAPI, about 200 lines)

- Layout: 4 rows × 10 racks (A1–D10), 4 cooling units, 8 power strips (PDUs).
- One tick per second; each tick = 1 simulated minute. Show the sim clock on screen.
- Rack inlet temperature per tick:

```latex
T \leftarrow T + \alpha\,(T_{supply} + \beta \cdot load - \sum_j cooling_j \cdot w_{ij} - T)
```

- w = how much each cooling unit cools each rack (falls off with distance). Faults only change parameters.
- Each rack exposes: inlet temp, outlet temp, load (kW), PDU %, reported inlet reading. A lying-sensor fault offsets only this reported value; true inlet, outlet and neighbours stay honest. Outlet = true inlet + k · load / airflow, so a lying inlet sensor shows up as an inlet/outlet gap that shrinks or goes negative. Start the lying-sensor target rack at 25°C or above so +10°C crosses 32°C and check\_temp.py's false alarm actually fires.
- Streams the full state as JSON over a WebSocket.

**2. Legacy guards** (3 scripts, about 30 lines each, ported from the logic of widely used open-source Nagios / Icinga checks; keep the original header, license and a link to the source. Most Nagios plugins are GPL: keep them in a separate legacy/ folder under their own license and say so in the README)

- `check_temp.py`: alert if any sensor > 32°C, every tick (this creates the flood).
- `check_pdu.py`: alert if any PDU > 80%.
- `check_crah.py`: reads only each cooling unit's on/off flag.

**3. Agent** (Nemotron 3 Super, reasoning on; copy the exact model ID from build.nvidia.com). At 6 PM, time one full investigation. Over \~20 s: stream each tool call to the card and keep Nemotron Nano as the fast fallback.

- Woken by a slope / z-score detector, not every tick. The generated rules file (the new detector) and cross\_check\_sensor decide whether an alert fired, so parity is reproducible; Nemotron investigates, explains and plans.
- Tools:
  - `get_topology()` — racks, cooling units, PDUs, adjacency
  - `query_telemetry(ids, window)` — recent readings
  - `forecast_breach(rack)` — linear fit, minutes to 35°C throttle or PDU trip
  - `cross_check_sensor(id)` — compares with neighbours and the inlet/outlet gap (deterministic; the LLM only explains it)
  - `propose_migration(from, to)` — checks power and capacity headroom
  - `execute_migration(plan_id)` — only after a human clicks Approve
  - `open_ticket()`, `page_oncall()`, `write_handoff()`
- Output: an incident card JSON (cause, countdown, evidence, plan, reasoning steps).

**4. Frontend** (React + Vite + SVG)

- Center: floor map, racks coloured by temperature, heat spreading as faults bite; fault cards to drag.
- Left: Legacy pager (alert flood).
- Right: agent incident card with countdown, reasoning steps and tool calls streamed as they happen, a live / cached badge, Approve button.
- Top: scoreboard — warning lead time, alerts generated, jobs at risk. Tombstone when the agent wins.

**5. Modernization pipeline** (the 8090 layer, mostly deterministic)

- **Legacy reader:** one Nemotron prompt per script → rule card JSON (condition, threshold, inputs used, inputs ignored). Generate once, cache, show in the UI.
- **Replay harness:** records 1 run per fault card (simulator seed fixed), then feeds each recording to every legacy script and to the agent. Output: the blind-spot matrix (script × fault → early / late / missed / false alarm, plus minutes of warning).
- **Parity checker:** for each legacy alert that was correct, look for an alert from the generated rules file on the same rack, raised at the same time or earlier. No other kind of "replacement" counts. Result: parity %, regressions list, improvements list. The tombstone unlocks only at 0 regressions. Run the replay 3 times and show "3/3 runs" so judges see it's reproducible.
- **Verify the reader:** each rule card is checked against the replay. If the card says "fires above 32°C", the replay must show it does; a mismatch flags the card.

**Fallback mode:** cache agent responses for each fault preset so the demo runs if the API is slow or rate-limited. Always show the live / cached badge: a judge who catches an unlabeled cache stops trusting everything else.

## 2-minute demo script

The judge's hands on the mouse in round 2 is the moment that wins it. Rehearse this 10 times.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00–0:15 | Shadow mode: the live hall, legacy pager already noisy, agent quiet | "Left is what pages your night shift today. Right is what replaces it. Break it." |
| 0:15–0:35 | `check_temp.py` → three blind spots light up → its replacement rules file appears beside it | "Here's what this old check misses, and here's its replacement as code: every old rule kept, one new rule per blind spot." One idea only; rule-card verification belongs in the 8090 minute. |
| 0:35–1:00 | **Round 1:** drag "PDU breaker creep" onto Row B; the phone frame buzzes with the page | "Power is the #1 cause of outages, and a creeping PDU is one the scripts see too late." Card: "PDU B2 trips in 22 min; move 3 jobs to D6, headroom checked." Hover Approve to show the preview, click; the map cools. "47 legacy alerts, 1 incident." |
| 1:00–1:30 | **Round 2:** hand the mouse to the judge | "Break it." Judge drops the lying sensor; it must win this round on its own. Legacy pages a false emergency. B7 goes dashed, its reading struck through: "Sensor B7 is unreliable. No action needed. Ticket opened." |
| 1:30–1:50 | Parity (old script vs generated rules, 3/3 runs) → tombstone → switch to Live mode → handoff with Acknowledge | "0 regressions, plus 3 failures it never saw. The old script is retired and the evidence pack is exported. This is what your night shift sees from now on." |
| 1:50–2:00 | Closing line | "Modernization stops being a leap of faith and becomes something you can watch and score." |
| 2:00–3:00 | The judge's minute (see Judge playbook) | NMC²: read the handoff, then a harmless batch-job spike where the agent stays quiet. NVIDIA: expand the trace, force a tool error, show the reliability table. 8090: show the rule card verified by execution, click a rule to its source line, show the tombstone blocked at one regression, run `gauntlet verify` in a terminal. |

The numbers above are placeholders. Say the real numbers the scoreboard shows.

## Team and timeline

Assumes a team of 4. If you are 3, merge P1 and P4 and cut combining faults now. The hard gate is the simulator streaming by 6 PM; everything else builds on it.

| Person | Owns | Done when |
| --- | --- | --- |
| P1 | Simulator + fault primitives + WebSocket + fixed-seed recordings for replay; after 4 AM: Devpost and pitch with P4 | All 5 faults change the physics believably and replay identically |
| P2 | Agent, tools, prompts, trend detector, legacy reader prompt (rule cards), response cache | Incident card and rule card JSON for every fault and script, live and cached |
| P3 | Frontend: floor map, fault cards, incident card, rule cards, handoff view, design. Floor map and incident card first; nothing else before 11 PM | Map animates from the stream; incident card streams tool calls |
| P4 | Legacy scripts (ported from open-source checks), replay harness, parity checker, blind-spot matrix and parity screens, scoreboard, tombstone, backup video | Matrix and parity numbers come from real runs; video recorded |

**Milestones (tick them off):**

- [ ] 3:30 PM — Booth visits. NMC²: what breaks on night shifts; ask "Would your night shift approve a load move suggested by an agent?" and quote the answer in the pitch. 8090: their brief is on slide 25; ask what "proof" of a safe modernization looks like to them.
- [ ] 4:00 PM — Repo up; JSON schemas for telemetry, incident cards, rule cards, generated rules and replay results agreed by all 4. Nemotron API keys for all 4; rate limits checked.
- [ ] 6:00 PM — Simulator streams; map renders it; one agent tool call works end to end; one full investigation timed; 3 legacy scripts ported.
- [ ] 11:00 PM — Round 1 works end to end; rule cards generated and cached; grey map, reordered incident card and trace panel in. Confirm where sponsor judging happens. **Submit the initial Devpost as a real write-up, not a placeholder.**
- [ ] 4:00 AM — All fault cards (including the harmless spike), lying sensor and its untrusted look, legacy pager, replay harness, blind-spot matrix, generated rules file, parity against it, CLI, Shadow / Live switch, traceability click-through; reliability run started overnight.
- [ ] 8:00 AM — Scoreboard, tombstone, handoff with Acknowledge, phone page, Approve preview, Retirement tab, MCP tools, evidence pack, reliability table, cached fallback for every preset, design polish.
- [ ] 8:00–11:00 AM — Rehearse the 2-minute core and the three judge minutes 10 times; record the backup video (not a placeholder). The presenter has slept 3–4 hours by now.
- [ ] 12:00 PM — **Final Devpost deadline.** Judging 1–4 PM.

**Booth kit:**

- [ ] Second monitor so judges aren't leaning over a laptop
- [ ] Phone set up to receive the Discord page
- [ ] Power strip
- [ ] QR code to the repo and a sample evidence pack
- [ ] Sleep shifts planned; the presenter sleeps first

## Cut list, risks, and fallbacks

Never cut the lying sensor. It is the moment that wins.

**Already cut (do not build):** free-text disasters, open-ended code analysis (only the 3 scripts get rule cards), 3D, real hardware, multiplayer, auto-acting without approval.

| Risk | Likelihood | Fallback |
| --- | --- | --- |
| Nemotron tool calls flaky or rate-limited | Medium | Cached responses per fault preset; keep tools ≤ 9 with strict JSON schemas |
| Nemotron latency (20–60 s per investigation) eats the 2-minute demo | Medium | Stream each tool call to the card; Nano as fast fallback; cached runs carry a visible badge |
| Simulator looks fake to NMC² engineers | Medium | Use realistic numbers (inlet 18–27°C normal, throttle \~35°C, PDU 80% warn); ask them at the booth |
| Combining faults breaks the physics | Medium | Cut combining first; run faults one at a time |
| Live migration animation eats hours | Low–medium | Show the plan + Approve, recolour racks instantly |
| Wi-Fi fails during judging | Low | Run everything on localhost; backup video on the laptop |
| Another team builds an alert copilot | High | Lean on the side-by-side, judge-breaks-it format and the lying sensor |

**Cut order if behind:** (1) cache the agent and the rule cards, (2) drop combining faults, (3) parity check on 1 script instead of 3, (4) drop the migration animation, (5) drop the handoff view to a text box. Never cut the replay matrix or the lying sensor.

## Pitch lines and judge Q&A

**One line per sponsor:**

- **NMC²:** "Missed warnings, unclear handoffs, wrong information at the wrong time — your slide named three failures. You just watched us fix all three live."
- **NVIDIA:** "Nemotron isn't chatting here. It reads the legacy code, writes the replacement code, and runs the incident with 9 tools. Execution checks all three, and it acts only with approval."
- **8090:** "Old script in, verified new code out, with an evidence pack that proves nothing was lost. Any coding agent can call the gate before it retires legacy code."
- **Design:** "An operator understands the hall's state in one glance at 3 AM."

**Likely questions:**

| Question | Answer |
| --- | --- |
| Is the data real? | Simulated, with realistic ranges. The agent only sees telemetry, never the fault you picked — that's why we let you pick. |
| Who wrote check\_temp.py? | Its logic is ported from a widely used open-source check; the header and link are in the repo. We didn't write the old guard to lose. |
| Why not let it act on its own? | Operators won't trust that, and they're right. It proposes; a human approves; every action is logged. |
| How is this different from DCIM alarm correlation? | We prove it against the scripts you run today, on your data, on a scoreboard, before anything is retired. |
| What if the LLM is wrong? | Forecasts, sensor checks, replay and parity are deterministic. Nemotron chooses tools, ties the evidence together and writes the plan; the human gate catches the rest. |
| (8090) Isn't the rule card just an LLM summary? | Each card is checked against the replay. If it says "fires above 32°C", execution has to show it does, or the card is flagged. |
| (8090) What if the new system drops something the old one did? | That's a regression, and it blocks the tombstone. Parity has to be 100% before anything is retired. |
| (8090) Does this generalize beyond data centers? | The pattern does: read the legacy logic, replay it to map its blind spots, require parity, retire with evidence. Data centers are where the cost of a dropped rule is highest. |
| How would this deploy? | Read-only connectors to existing DCIM / BMS telemetry first; actions go through existing ticketing and schedulers. |

## Judge playbook

The 3-minute booth = the 2-minute demo script, then 1 minute aimed at the judge in front of you. Each judge has seen about 30 projects and is looking for a reason to walk away.

**For every judge:** the first 15 seconds is the live hall, the noisy legacy pager and one sentence: *"Left is what pages your night shift today. Right is what replaces it. Break it."* No title slide. Hand over the mouse in the first minute. Show one failure on purpose.

|  | NMC² (runs real facilities) | NVIDIA (Nemotron must do real work) | 8090 (modernization is their business) |
| --- | --- | --- | --- |
| Their question | "Show me you understand a 3 AM page from a lying sensor." | "Prove this isn't a chatbot with Nemotron bolted on." | "How do you know nothing was lost?" |
| Wins the first 15 s | A floor map that looks like a real hall (rows, aisles, cooling units, PDUs), temps already drifting; legacy pager firing, agent quiet | Tool calls streaming on the incident card (query\_telemetry → cross\_check\_sensor → forecast\_breach → propose\_migration) with model, tool count and seconds | Old script source, its rule card, and a green check that execution verified the card; blind-spot matrix filled from real runs. Say: "We don't trust the AI's reading of the code. We run the code to check it." |
| Loses them in 15 s | A README or Devpost on screen; normal inlet temps outside 18–27°C; "AI-powered monitoring" | A chat box; a spinner with no steps; finding out GPT or Gemini does the real work | Scripts obviously written to lose; rule cards with no link to source; the word "rewrite" |
| The extra minute | Countdown in real minutes ("PDU B2 trips in 22 min"); destination headroom check before any move; read the handoff aloud for 10 s; a harmless batch-job spike where the agent stays quiet | Expand one trace and explain why it skipped propose\_migration on the lying sensor; force one tool error and show it retries or says it doesn't know; one Nano vs Super comparison with numbers; run one incident live with the badge showing | Click a rule to highlight its source line; click a parity row to open the replay run; show the tombstone blocked at 97% by one regression, then what fixed it; a rule card the verifier flagged ("Nemotron said 30°C, execution says 32°C") |
| Genuinely impressed | The judge stacks the lying sensor on a real cooling failure in the same row; the agent dismisses the sensor and still catches the real failure | An unprepared fault combo runs live and is right, then the reliability table: every fault card × 10 runs, correct actions out of total, with the misses explained | The judge hands you a fourth legacy script and it goes read → replay → matrix live (fault library already exists: one Nemotron call + one replay) |
| Answer ready | "What if the agent is down?" → "The legacy scripts keep running until the tombstone. That's the point." | "Is that cached?" → say so before they ask, then run one live | "Does it scale?" → "Three 30-line scripts here. The pipeline runs per script and the replay library grows with each incident." Don't claim more than you built |

## Booth build additions

These turn the playbook into things on screen. They fit inside the existing milestones; the first three are the cheapest wins.

| Addition | For | Owner | Done by | Cost |
| --- | --- | --- | --- | --- |
| Trace panel: each tool call with reason, timing, model, and "skipped because…" lines | NVIDIA | P2 data, P3 UI | 11:00 PM | Low (tool calls already stream) |
| Click-through traceability: rule → source line; parity row → replay run | 8090 | P4 data, P3 UI | 4:00 AM | A few hours of frontend |
| Reliability table: every fault card × 10 runs, correct actions / total, misses explained | NVIDIA | P2 | 4:00 AM (run overnight) | One script run |
| Harmless spike fault card (scheduled batch job) where the agent stays quiet | NMC² | P1 | 4:00 AM | Low |
| Destination headroom shown on every migration proposal | NMC² | P2 | 4:00 AM | Low |
| Planned failures: tombstone blocked at one regression; a rule card the verifier flags; a toggle that makes one tool return an error | 8090, NVIDIA | P4 (first two), P2 (toggle) | 8:00 AM | Low–medium |
| Nano vs Super comparison: one line with latency and accuracy | NVIDIA | P2 | 8:00 AM | Low (falls out of the reliability run) |
| Stretch: paste a fourth legacy script live, read → replay → matrix | 8090 | P2 + P4 | Only if the pipeline is solid by 4:00 AM | High risk on stage |

- [ ] 8:00–11:00 AM: rehearse the three 1-minute variants (NMC² = handoff + harmless spike, NVIDIA = trace + tool error, 8090 = traceability + blocked tombstone) as well as the 2-minute core.

**Cut order for these if behind:** stretch script first, then the Nano vs Super line, then the tool-error toggle. Never cut the trace panel or the blocked-tombstone run.

## User-first UI features

Built for the night-shift tech first, the judge second. Two modes: **Shadow** (old and new guards side by side, the demo arena) and **Live** (the operator console, legacy alerts folded into incidents).

| Feature | Owner | Done by | Priority |
| --- | --- | --- | --- |
| Grey floor map by default; colour only off-normal racks | P3 | 11:00 PM | Must |
| Incident card reordered: what's happening, time left, one action, then collapsed evidence and trace | P3 | 11:00 PM | Must |
| "47 legacy alerts → 1 incident" counter on the card | P4 | 4:00 AM | Must |
| Untrusted sensor: dashed outline, struck-through reading, neighbour estimate | P3 | 4:00 AM | Must |
| Shadow / Live mode switch | P3 | 4:00 AM | Must |
| Phone-frame page next to the console, plus the real Discord page | P2 data, P3 UI | 8:00 AM | Should |
| Approve preview: ghost of post-move power and temperature on the map; undo window; approval log | P2 data, P3 UI | 8:00 AM | Should |
| One-tap reject reasons | P3 | 8:00 AM | Should |
| Handoff ordered open → changed → timeline, with Acknowledge | P2 | 8:00 AM | Should |
| Retirement tab: one row per script with mode, parity, regressions, sign-off | P4 | 8:00 AM | Should |
| Keyboard shortcut (A to approve) and status words beside every colour | P3 | 8:00 AM | Could |

**Cut order if behind:** Could items, then the Retirement tab (the tombstone stays in Shadow mode), then the Approve preview. Never cut the grey map, the card order or the untrusted-sensor look.

## 8090 reusability features

The modernization output must be verified new code, with the agent as a layer on top. That turns the 8090 layer from a data center demo into a verification step usable after any rewrite.

| Feature | Owner | Done by | Priority |
| --- | --- | --- | --- |
| Generated detection rules: Nemotron writes a new rules file from the rule card + blind spots, and replay verifies it (Prometheus-style or a typed Python module); each blind-spot rule tagged with the fault card that found it. Generated ahead of time, never live | P2 | 4:00 AM | Must |
| Parity runs old script vs the generated rules file, not vs the agent | P4 | 4:00 AM | Must |
| CLI: `gauntlet read`, `gauntlet replay`, `gauntlet verify` (pass / fail) | P4 | 4:00 AM | Must |
| Same three functions exposed as MCP tools, so any coding agent can call `verify` before retiring legacy code | P2 | 8:00 AM | Should |
| Evidence pack export per retirement (JSON + Markdown): rule cards with source links, matrix, parity report, regressions, sign-off | P4 | 8:00 AM | Should |
| Plug-in boundary in the repo: `Reader`, `Environment`, `Oracle`, `Matcher`, `Gate`, with the data center as one implementation | P1 | 8:00 AM | Could |

**Say the limit before they do:** this covers the rule layer (checks, thresholds, alerts, validations). Stateful transaction systems need recorded transactions as replay input; that's the next plug-in, not this weekend.

**Cut order if behind:** plug-in boundary, then MCP (keep the CLI), then the evidence pack. Never cut generated rules or parity against them.

## Sources

- [HackUTD 2025 Devpost (rules, criteria)](https://hackutd-2025.devpost.com/)
- [DataDriver — won Northmark + NVIDIA in 2025](https://devpost.com/software/datadriver)
- [Uptime Institute Annual Outage Analysis 2026](https://www.businesswire.com/news/home/20260513289344/en/Uptime-Announces-Annual-Outage-Analysis-Report-2026)
- [Nemotron 3 on build.nvidia.com](https://dev.to/creeta/nemotron-3-ultra-went-live-june-4-heres-the-call-that-works-55g7)
- HackUTD 2026 opening ceremony slides (8090 challenge p.25, NMC² challenge p.36, NVIDIA challenge p.65)
