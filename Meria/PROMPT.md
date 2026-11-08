# Build the Gauntlet front-end mock-up

> **For Cursor.** Open this folder in Cursor, open the Agent panel (Cmd/Ctrl+I), choose a strong model, and paste this file as the first message, followed by: "Follow this prompt. Start with Phase 0 and stop for my review at the end of each phase." The rules in `.cursor/rules/` load automatically by file path; `@`-mention one when you want it in context explicitly (for example `@nemotron-api.mdc`).

---

## 0. Your role and the job

You are a senior product designer and full-stack engineer. You are building **The Gauntlet**: a React front end plus a small FastAPI backend that calls **NVIDIA Nemotron** on build.nvidia.com. The front end is fixture-driven first (so the UI is finished and demoable early), then wired to the backend, which runs live with caching and an offline fallback.

The product in one sentence: **Old monitoring scripts go in. Verified new ones come out. Along the way, the process finds real problems in the data hall that the old scripts were hiding.**

Three steps, three screens:

1. **Read**: Nemotron reads a legacy Nagios check and writes a plain-English rule card. The real plugin is run to confirm every statement on the card.
2. **Find**: the old check is replayed against recorded hall data. Deterministic detectors find what it was hiding (a faulty sensor, a clogged filter, a dead mailbox, a retired rack). Nemotron writes each one as a card a technician can act on. Staff accept or dismiss.
3. **Prove**: Nemotron writes Prometheus rules. A verifier runs the real plugin on every value the sensor can report and on generated timing traces, and compares. A one-shot LLM translation fails the same verifier with three counterexamples; the Gauntlet loop passes. Certificate, human sign-off, tombstone.

The mock-up is **for the people who do this work**: the monitoring engineer retiring old checks, and the night-shift technician and facilities staff who act on the findings. Hackathon judges are the second audience. If a choice helps the judge but hurts the technician, choose the technician.

You have about **6 hours**. Ship a polished fixture-driven UI first (Phases 0–6), then the real Nemotron backend (Phases 7–8). Never leave the app broken between phases. Stop at the end of each phase and wait for review.

---

## 1. Rules: read them before you build

Each rule is a file under `.cursor/rules/<name>.mdc`. Some are always on; others attach when you edit matching files. **Read the rules listed for a phase before starting that phase** (`@` them). Don't invent what a rule already specifies.

| Rule | What it gives you | Read before |
|---|---|---|
| `gauntlet-domain` | What the product does, the hall layout, realistic numbers, vocabulary, the six findings, legacy vs new | Phase 1 (read first, always) |
| `nightshift-ux` | Worker-first UX rules: 5-second readability, one primary action, status words, keyboard, trust cues, humans decide, copy voice | Phase 1, then before every screen |
| `gauntlet-design-system` | Tokens (colour, type, spacing), component specs, floor-map rendering rules, dark/light themes | Phase 2 |
| `mock-scenario-engine` | The fixtures: the recording, replay results, findings, rule cards, verify results; TypeScript contracts; the `DataSource` interface; streaming playback | Phase 3 |
| `verification-ui` | The Prove screen: rule card, source-to-rules, value coverage strip, counterexamples, one-shot vs Gauntlet, certificate, tombstone | Phase 6 |
| `mockup-qa` | Self-review checklist, screenshot pass, judge click-paths | After every phase, and at the end |
| `nemotron-api` | The NVIDIA API client, model roles, the four calls, SSE streaming, caching, fallback, prompts | Phase 7 |

If a rule and this prompt disagree, **this prompt wins**. Say so in your summary.

---

## 2. Users and their jobs

| Persona | Context | Job to be done | Their nightmare | What the UI must do |
|---|---|---|---|---|
| **Sam T.**, monitoring engineer (primary) | Owns the old Nagios box; cautious | "Can I turn this old check off without losing anything?" | Turning off a check and missing an incident it would have caught | Rule card verified by execution, coverage strip, counterexamples, certificate, sign-off before cutover |
| **Maya R.**, night-shift tech | 3 AM, tired, 40 pages tonight | "Which of these findings are real, and what do I do?" | Acting on a lying sensor; a nightly false page nobody fixes | Finding cards: two sentences, evidence chart, one action, Accept / Dismiss |
| **Luis O.**, facilities tech | On the floor with a tablet | "What do I replace or clean, and where?" | A work order with no location or part | Work order: unit, location, likely part, evidence link |
| **Dev K.**, day shift lead | 7 AM, 5 minutes | "What was found and accepted overnight?" | Handoff scattered across Slack and memory | Handoff: accepted findings, open work orders, what to watch |
| Judge (secondary) | 3-minute booth visit | "Is this real? Is it different from Claude Code?" | A chat box; a spinner; "AI-powered" | Real plugin source, execution checks, one-shot vs Gauntlet, the certificate |

---

## 3. Non-negotiable principles (details in `nightshift-ux`)

1. **Glanceable in 5 seconds** on every screen: what this is, what it found, what to do.
2. **One primary action per screen.** Everything else is secondary or collapsed.
3. **Humans decide.** Findings are accepted by a person. Rules are signed off by a person. Nothing is retired without a click. Every decision is logged with a name and time.
4. **Status is never colour alone.** Every colour has a word and an icon.
5. **Plain English first, evidence on demand.** Plugin source, PromQL, exit codes and tool calls live behind "Show evidence" or "Show source".
6. **Show what checked what.** Every Nemotron sentence sits next to the thing that verified it: "Verified by execution", "Found by: neighbour-disagreement detector", "Checked on 1,654 inputs". A cached response always carries a `Cached` badge.
7. **Calm by default.** Grey floor map; colour only for a selected finding. Red is reserved for real mismatches and real danger.
8. **Keyboard first, touch friendly.** Targets at least 44 px. `A` accepts, `D` dismisses, `S` signs off, `Esc` closes, `?` shows shortcuts.
9. **Never a dead end.** Every empty, loading and error state says what's happening and what still works ("Nemotron offline. Showing cached card from 02:14. Verifier still runs locally.").
10. **No chat box anywhere.** Nemotron's work appears as cards and streamed steps, never as a transcript.

---

## 4. Tech stack and constraints

- **React + TypeScript + Vite + Tailwind CSS**. **lucide-react** for icons. No component library beyond that.
- **Code display:** `react-syntax-highlighter` (or Monaco if already familiar) for plugin source, Nagios config and YAML, with line numbers and highlightable ranges.
- **Charts:** hand-rolled SVG (sparklines, the coverage strip, small step charts). No chart library.
- **State:** React context + reducer (Zustand is fine). No Redux.
- **Routing:** URL per screen so the team can deep-link during the demo.
- **Data:** everything through a `DataSource` interface (see `mock-scenario-engine`). `MockDataSource` first; `ApiDataSource` in Phase 8 talks to the backend over SSE and `fetch`. A `?source=mock|api` URL param switches them.
- **Backend:** Python 3.11, FastAPI, `sse-starlette`, `openai` (pointed at `https://integrate.api.nvidia.com/v1`), Pydantic, `hypothesis`, `pyyaml`. `promtool` binary in `backend/bin/` (download the Prometheus release for the demo OS). Runs with `uvicorn app.main:app --reload` on :8000; Vite proxies `/api`.
- **Secrets:** `NVIDIA_API_KEY` only in `backend/.env`. Never in the frontend bundle, never in a commit.
- **Deterministic:** fixtures are static; "streaming" is a scripted playback with fixed timings. No `Math.random()` without a seeded PRNG.
- **Runs offline:** no external fonts or CDNs at runtime. With `GAUNTLET_MODE=cached` the whole demo runs with Wi-Fi off.
- **Target screens:** 1440×900 laptop (primary), 1920×1080 projector, 1024×768 tablet.

---

## 5. Information architecture

Top bar, always visible: product name · the current check (`check_rack_inlet`) as a dropdown · stage stepper (`Read → Find → Prove → Retired`) · data badge (`Live` / `Cached` / `Mock`) · theme toggle · `?`.

Primary navigation (left rail; number keys 1–5):

1. **Checks**: the list of legacy checks and where each is in retirement (the Retirement table)
2. **Read**: `/read/:checkId`
3. **Find**: `/find/:checkId`
4. **Prove**: `/prove/:checkId`
5. **Handoff**: `/handoff`

Also a **Director panel** (`Ctrl+Shift+D`) for the presenter: replay a screen's streaming from the start, jump to the end state, toggle planned failures (flagged rule card, blocked sign-off, Nemotron offline), switch Live/Cached.

---

## 6. Screen specs

For every screen, build the layout, the components, **all states** (idle, streaming, done, empty, error, cached), keyboard support and the copy below or in the skills.

### 6.1 Checks (Sam's home)

A table, one row per legacy check: name and plugin, what it watches, stage stepper, findings (`6 · 4 accepted`), coverage (`1,654 / 1,654`), traces (`500 / 500`), open counterexamples, and an action (`Continue` to the next step, or `Cutover` disabled until signed off). Fixtures in `verification-ui` §2: one check at each stage, one blocked by a counterexample, one marked **Drop** (watches decommissioned rack D10). Primary action on the page: `Open check_rack_inlet`.

Calm state at the top: `6 legacy checks · 1 retired · 1 signed off · 1 blocked · 2 in progress · 1 to drop`.

### 6.2 Read (Sam)

**Purpose:** understand one old check, and trust the understanding because the code was run.

**Layout:** left 55%: the legacy source (plugin invocation, Nagios command definition, service definition with `check_interval`, `retry_interval`, `max_check_attempts`, `notification_options`, contact), line-numbered, read-only. Right 45%: the **rule card**.

**Rule card sections:** `What it checks` · `Thresholds` (in words: "warns outside 0–27 °C, critical outside 0–32 °C") · `When it actually pages` ("after 3 consecutive failed checks 1 minute apart; UNKNOWN is paged") · `Who it pages` (`rkowalski@`, flagged `Not on roster`) · `What it ignores` (trends, neighbouring racks, sensor agreement with outlet, cooling unit power).

**Streaming state:** click `Read with Nemotron` (primary). Steps stream down the right: `Reading check_rack_inlet.cfg` → `Reading commands.cfg` → `Cross-checking inventory.csv` → `Cross-checking oncall_roster.csv` → `Writing rule card` (Super, timer running). Then the **execution check** runs: each threshold statement gets a row `Ran plugin at 26.9 → OK · 27.1 → WARNING ✓` and a green `Verified by execution` badge. Hovering a card statement highlights the source lines it came from.

**Planned failure (Director toggle):** one statement flags: `Card said critical above 30 °C. Plugin returned CRITICAL only above 32 °C. Regenerated.` with the corrected statement beneath.

Primary action once done: `Continue to Find (→)`.

### 6.3 Find (Maya, Luis, Sam)

**Purpose:** show what the old check was hiding, and let staff turn it into action.

**Layout:** left 40%: the **findings list**, sorted by severity. Centre 35%: the **floor map** (grey; the selected finding's rack or unit highlights, with a label). Right 25%: the selected finding's **evidence panel**.

**Replay header:** `Replayed check_rack_inlet over 21 days of recorded readings · 30,240 runs of the real plugin · it paged 214 times · 196 were the same false alarm`. A small timeline of legacy pages (grey ticks) with detector hits over it (accent dots).

**Finding card (collapsed):** severity pill + title · two sentences · `Found by: <detector>` · `Suggested: <action>` · `Accept (A)` primary, `Dismiss (D)` secondary. Expanded: the evidence chart (sparkline with the legacy threshold dashed, the neighbour estimate as a second line where relevant), the raw detector numbers, and `Nemotron Nano wrote this sentence · Cached`.

The six findings (full copy in `gauntlet-domain` §6):
1. **B7 inlet sensor faulty** (critical): reads 10 °C above neighbours and its own outlet; legacy paged 14 times
2. **CU-B losing cooling effectiveness** (warning): cooling per kW down 15% over 3 weeks; status still Running; likely clogged filter
3. **Nightly false alarm, row C** (watch): batch job at 02:00; pages every night, nobody acts
4. **D10 still monitored** (info): decommissioned 2024-03
5. **Pages go to a dead mailbox** (critical): `rkowalski@` not on roster
6. **A4 sensor drops out** (warning): timeout 3% of the time; legacy treated UNKNOWN as fine

**Accept** opens a confirm sheet with the work order preview (title, labels, unit, location `Hall 1 · Row B · rack 7`, likely part `Inlet temperature sensor`, evidence link), then `Create work order`. After: `Work order #482 opened · 03:16 · Maya R.` on the card, and the counter at the top updates: `6 findings · 4 accepted · 3 work orders`. **Dismiss** asks for a one-tap reason (`Known`, `Not a problem`, `Already fixed`, `Other…`).

Accepted findings carry forward: the Prove screen lists them as the source of each improvement rule, and the Handoff lists them.

Primary action once at least one finding is handled: `Continue to Prove (→)`.

### 6.4 Prove (Sam, and the 8090 judges)

Everything specified in `verification-ui`. Summary of the order on the page:
1. **Generated rules** beside the source, each rule labelled `replaces: <source line>` or `found_by: <finding>`; clicking a rule highlights source lines.
2. **Value coverage strip**: legacy band, new-rules band, match band, over −40.0…125.0 °C plus three error cases; zoom lens on 24–36 °C; summary `1,654 of 1,654 inputs match · real plugin run 1,654 times in 41 s`.
3. **Timing tests**: `500 generated traces · 0 mismatches`, six small example traces.
4. **One-shot vs Gauntlet**: two columns, same verifier. Left fails with three counterexample cards; right passes, with the round timeline `3 → 1 → 0`. Caption: **Same model both times. The difference is the proof.**
5. **Intentional differences** (each tied to an accepted finding).
6. **Certificate** with `Sign off (S)` primary. Then the **tombstone** and the Checks table moves the row to `Signed off`.

Streaming state: `Generate rules` runs Super with a timer; promtool output appears; round 1 counterexamples appear; the fix loop streams until green. Director can jump to the end.

### 6.5 Handoff (Dev)

`Night shift handoff · 23:00 → 07:00 · Written by agent, reviewed by Maya R.` Sections: **Accepted findings and their work orders** (owner, ETA, what to watch) · **Dismissed, with reasons** · **Checks signed off tonight** · **Timeline**. `Acknowledge handoff` primary, then `Acknowledged by Dev K. 07:02`.

---

## 7. Build phases (each ends runnable; stop for review after each)

| Phase | Build | Rules | Done when |
|---|---|---|---|
| 0 | Repo: `frontend/` (Vite) and `backend/` (FastAPI) folders, `.gitignore` with `.env`, `backend/.env.example`, `README` stub, `make dev` that starts both. Copy the exact Nemotron model IDs from build.nvidia.com into `backend/app/models.py` and run `python -m app.smoke` (one Super call, one Nano call, one JSON-schema call) | `nemotron-api` | Smoke test prints two model replies and their latency |
| 1 | Scaffold: Vite + TS + Tailwind, routes for 5 screens, top bar with check dropdown and stage stepper, left rail, shortcuts, theme toggle | `gauntlet-domain`, `nightshift-ux` | Every screen reachable by URL and number key |
| 2 | Design system: tokens + base components (Button, Badge, StatusPill, Card, Sheet, Toast, Sparkline, Stepper, Table, CodeView, TraceStep, CoverageStrip shell) | `gauntlet-design-system` | `/kitchen-sink` shows every component in every state, both themes |
| 3 | Fixtures + engine: types, `DataSource`, `MockDataSource` with scripted streaming playback, Director panel, `ApiDataSource` stub | `mock-scenario-engine` | Read/Find/Prove playback runs identically twice; Director jumps and toggles work |
| 4 | Checks table + Read screen with execution checks and the flagged-card variant | `nightshift-ux` | Rule card streams, statements verify, hover highlights source |
| 5 | Find screen: replay header, six finding cards, floor map highlight, evidence panel, Accept → work order, Dismiss reasons, counter | `gauntlet-domain`, `nightshift-ux` | Accepting B7 opens work order #482 and updates the counter and Handoff |
| 6 | Prove screen end to end + Handoff | `verification-ui` | One-shot fails with 3 counterexamples, Gauntlet passes, Sign off shows the tombstone |
| 7 | **Backend:** `legacy/` with the plugins and config; `app/verify/sweep.py` (run the real plugin per value, compare with `promtool test rules`), `traces.py` (Hypothesis), `nagios_state.py`; the four Nemotron calls with prompts in `app/prompts/`; SSE endpoints `/api/read`, `/api/find`, `/api/prove`; `/api/findings/{id}/accept` (creates a GitHub issue via `gh` if available, else a local work order); cache + `GAUNTLET_MODE`; `python -m app.warm` | `nemotron-api`, `verification-ui` | `curl -N localhost:8000/api/read/check_rack_inlet` streams a verified rule card from the live model; `prove` shows the one-shot failing and the loop passing with real promtool output |
| 8 | **Wire-up:** `ApiDataSource` consuming the SSE events; `?source=api`; Live/Cached badge from the backend's `mode`; Nemotron-offline state; `make warm` then test with Wi-Fi off | `mock-scenario-engine`, `nemotron-api` | The full click-path runs live, then runs identically from cache with Wi-Fi off |
| 9 | Polish and QA: all states, focus rings, reduced motion, projector check, screenshots | `mockup-qa` | Every item in `mockup-qa` passes |

After each phase: run the app, screenshot if you can, check against `mockup-qa`, fix, then **stop and report**. Don't start the next phase until told to.

---

## 8. Acceptance checklist

- [ ] One check, `check_rack_inlet`, runs Read → Find → Prove → Sign off with no errors, identically every time
- [ ] Every Nemotron sentence sits beside what verified it (execution rows, detector name, coverage count)
- [ ] The rule card shows at least one statement verified by running the plugin, and the flagged variant works
- [ ] Six findings with evidence charts; Accept creates a work order with unit, location and likely part; Dismiss takes a reason
- [ ] Nothing is accepted, signed off or retired without a click, and each decision is logged with a name and time
- [ ] Coverage strip, three one-shot counterexamples, zero Gauntlet counterexamples, certificate, sign-off, then tombstone
- [ ] Every colour has a status word; AA contrast in both themes; focus always visible
- [ ] `1`–`5`, `A`, `D`, `S`, `Esc`, `?`, `Ctrl+Shift+D` work
- [ ] Jargon (PromQL, OID, exit code) appears only inside evidence panels, never in headings
- [ ] `ApiDataSource` runs the same click-path against the live backend; `?source=mock` still works
- [ ] Rule-card statements are verified by actually running the plugin in `sweep.py`; the UI's `Verified by execution` rows come from those runs
- [ ] One-shot baseline and Gauntlet loop both go through the same verifier; the one-shot's counterexamples are real promtool/sweep mismatches, not hard-coded
- [ ] `GAUNTLET_MODE=cached` runs the whole demo with Wi-Fi off; the badge says Cached
- [ ] No API key in the frontend bundle or git history
- [ ] Works at 1440×900, 1920×1080, 1024×768; the only runtime network calls are to `/api` (and from the backend to build.nvidia.com in live mode)

---

## 9. Out of scope

Live incident response, decision cards, migration animation, auth, settings, i18n, marketing pages, chat UI of any kind, hosting (demo runs on the laptop).

---

## 10. How to report back

After each phase: what you built (3–6 bullets), screenshots or a description of each screen touched, any departure from a skill or this prompt and why, and the next phase.

At the end: a `README.md` with how to run it (`make dev`, `make warm`), the env vars and where to get the NVIDIA key, which Nemotron model does which job, shortcuts, the Director panel, `GAUNTLET_MODE`, and the demo click-path for each judge (NMC², 8090, NVIDIA).

## 11. Cursor working agreement

- Work in Agent mode. Make one phase per conversation turn; don't batch phases.
- Before editing a file that a rule covers, read the rule (`@gauntlet-design-system.mdc` for components, `@nemotron-api.mdc` for anything in `backend/`).
- Run the dev server and the backend yourself and paste real output (curl of an SSE stream, promtool output, the smoke test) in your report. Don't describe what "should" happen.
- When a Nemotron call misbehaves (bad JSON, refused schema, slow), fix it in `llm.py` with a fallback and say so. Don't silently switch to mock.
- Keep every prompt in `backend/app/prompts/*.md`. If you change a prompt, say why in the report.
- If `promtool` or a plugin binary isn't available on this machine, say so immediately and ask before stubbing it. The verifier running real binaries is the point of the product.
