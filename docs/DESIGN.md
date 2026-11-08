# Damo UI/UX style (source of truth for future versions)

Version 5 · 8 Nov 2026. Update the **Iteration log** at the bottom whenever the UI changes.

## 1. Product principles

1. **The most repeated job is the front door.** Responding to an alarm happens every shift, so `/` is the live **Console**. Verifying a change recurs after every firmware, mapping or ownership change: it is one click away (`/verify`). Full modernization (M1–M5) happens once per check and is the deep dive (`/modernize/*`). Marketing lives at `/about`.
2. **One next action at a time.** Each incident stage shows exactly one primary button (full width, 48 px, `Enter` shortcut) and a one-line hint saying why. Earlier steps collapse into the lifecycle bar with timestamps.
3. **Alive on first look.** The console autoplays a scripted night 600 ms after load. The first event lands at about 2 s and the incident card at about 4 s. No user input is needed to understand the product.
4. **Show the insight, don't state it.** The "6 minutes earlier" claim is drawn three ways: chart markers, two-lane race bars, and a pill that only says "6 min" after the old check has actually paged ("old check still silent" before).
5. **Honest by default.** "Scripted night, illustrative data" sits under the clock and a "Scripted demo" badge sits in the header. Live backend paths say "live"; agent runs say "scripted run" or "cached replay". Never show a number that isn't produced or measured.
6. **The model is never the judge.** Copy, layout and labels keep "rules, paging and work orders never call the model" visible. Nemotron actions are marked with ✦ (Sparkles) and appear only where a person asked for help.

## 2. Color tokens (`frontend/src/index.css`)

Brand: cream paper and ink, sampled from the Damo logo. **Light is the default.**

| Token | Paper (light, default) | Ink (dark) | Use |
|---|---|---|---|
| `--bg` | `#F0EDE1` | `#131312` | Page |
| `--surface` / `-2` / `-3` | `#FAF8F1` / `#E8E4D6` / `#DDD8C7` | `#1B1B19` / `#232320` / `#2D2C28` | Cards → nested → pressed |
| `--border` / `-strong` | `#D9D3C1` / `#C2BBA6` | `#2F2E2A` / `#42403A` | Hairlines / hover |
| `--text` / `-muted` / `-faint` | `#161616` / `#55514A` / `#8A8577` | `#F0EDE1` / `#ABA697` / `#767264` | Text hierarchy |
| `--inverse` / `-ink` | ink / paper | paper / ink | Primary buttons, logo tile |
| `--accent` | `#1F5FAE` | `#7FAEF0` | New-guard data, focus, model badges (never primary buttons) |
| `--ok` `--warning` `--critical` `--untrusted` | `#1E7A55` `#A86200` `#B8322A` `#6A43B5` | `#4DBB8F` `#E3A640` `#E8625A` `#B79CF2` | Status only, always with a word or icon |
| `--legacy` | `#7D7A70` | `#8C887C` | The old check, always grey |

**Instrument panel** (same in both themes, so the hall always reads as equipment): `--panel #161615`, `--panel-2 #1F1F1D`, `--panel-3 #2A2A27`, `--panel-border #33332F`, `--panel-text #F0EDE1`, `--panel-muted #A39E90`, `--panel-ok #5FC79A`, `--panel-accent #7FAEF0`. Use the `.panel` class.

Rack states: `.rack-ok` (neutral, with a faint warm tint only on the warmest racks via `--heat`, max 16%), `.rack-warning`, `.rack-critical` (with a `.ring-pulse` outline), `.rack-stale` (hatched, "—"), `.rack-recovered` (green), `.rack-liquid` (accent bottom edge).

## 3. Type

Geist 400–800 for the UI and Geist Mono for clocks, IDs, readings and code (`font-variant-numeric: tabular-nums` everywhere numbers change).

| Role | Spec |
|---|---|
| Console clock | Geist Mono 38 / 600, −0.04em |
| Incident title | 22 / 600, −0.02em |
| Page title (`.page-title`) | 30 / 600, −0.03em |
| Section / card title | 13–17 / 600 |
| Body | 13.5–14.5 / 400, line-height 1.55 |
| Meta, hints | 11.5–12.5, `--text-faint` |
| Severity (`.sev`) | 11 / 600 uppercase, the only uppercase |

## 4. Layout

- Max width 1360 px, centered; page padding 20–32 px.
- **Console grid:** status ribbon → [hall panel 1.3fr | incident + race 1fr] → event log. On mobile, the **incident comes first** (`order-1`), racks go 4 per row, and the header badge hides.
- Radius: 8 for controls, 12 for chips and inner blocks, 14–18 for cards and panels.
- Elevation: cards are flat with a hairline; the hall panel and overlays use `--shadow`.

## 5. Components and patterns

- **Status ribbon:** clock · live state ("Watching Hall 1" with a ping dot / "INC-1042 · Critical on Compute2" / "resolved") · insight pill · right side: "6/6 alarm paths verified" (link to `/verify`), a Nemotron online/offline toggle, play/pause, replay.
- **Incident card:** severity chip, ID, location, owner → title → one-sentence context → **lifecycle bar** (Detected, Acknowledged, Investigated, Fixed, Recovered, Handed off; timestamps under completed steps) → stage-specific content → primary action and hint.
- **Agent activity:** a dark panel block that streams tool calls (`›` prefix, mono 12 px), labelled "scripted run" or "live".
- **Delivery chips:** red ✕ for a failed receiver → arrow → green ✓ for the fallback.
- **Recovery readings:** three slots that flip to "✓ OK" one by one (`.cell-in`).
- **Race:** two lanes. Each fills only up to its own page time, then drops a dot. A tick marks the fault onset. The caption names the gap once both have paged.
- **Verify matrix:** 32 px status cells that sweep in sequence (45 ms per cell). Red ✕ and green ✓ on a tinted square. A failing row's subtitle turns into its reason. Held-out cases stay locked chips until the run finishes. Mutant and decoy show as "rejected" chips.
- **Empty and quiet states** always show live data (the 3 servers' readings) or the action that fills them, never a bare "nothing here".

## 6. Motion

Rule: every animation shows something real happening (a reading changing, an evaluation, a delivery, a state change). No idle decoration.

| Pattern | Where | Spec |
|---|---|---|
| Number tween (`useTween`, `<Num>`) | Temperatures, fan RPM, pass counter | Ease-out cubic, 450 ms (fan 700, inlet 600, counter 250) |
| Blinking colon (`<Clock>`) | Console clock | 1.04 s, step |
| Evaluation sweep (`.scan-line`) | Hall panel, once per simulated minute while running | 2 px solid rule, 900 ms left to right |
| Rack hover lift and tooltip (`.rack-tip`) | Every rack | −2 px lift; tooltip shows the reading that matters (CPU on the affected rack, "no sample" when stale) |
| Live line head (`Head`) | Chart, temperature and fan lines | 8 px dot plus ping; faint flat area (8%) under the temperature |
| Delivery sequence | Incident "Paged" row | Failed chip pops and shakes → arrow draws in (0.75 s) → fallback chip pops (1 s) → work order (1.3 s) |
| Lifecycle fill (`.seg-fill`) | Incident steps | Width 0 → 100%, 600 ms |
| Stage transition (`.stage-in`) | Incident body, keyed by stage | Fade and rise 8 px, 400 ms |
| Newest row (`.fresh-row`) | Event log | Slide in, then a 2.2 s accent tint fade |
| Switch (`.switch`) | Nemotron online/offline | 250 ms knob slide |
| Progress | Verify header | Determinate rule while testing; indeterminate accent bar while repairing |
| Type-in (`.type-in`) | Verify diff | One line every 280 ms |
| Existing | `pop-in` 320 ms, `enter-row` 350 ms, `cell-in` 220 ms, `ring-pulse` 1.4 s (critical racks only), fan icon spins only while the fan turns |

- The simulated clock runs at 520 ms per simulated minute. The technician fast-forward takes 1.6 s, and each recovery reading takes 600 ms.
- `prefers-reduced-motion` turns everything off, including the sweep, pings and colon blink. Tweens jump straight to the value.

## 7. Copy rules

- Sentence case, plain verbs, a name and a time on every human action.
- Say what the old check would do ("pages nagios@localhost. Nobody reads it."), not adjectives.
- Never claim a lead before it has happened. Never present scripted results as live.

## 8. Don'ts

1. No marketing page as the entry point. No more than one primary button per card.
2. No gradients, glows or blur. Color means status, accent means new-guard data.
3. No KPI tiles that show "—" on first load. Every number on screen must be meaningful the moment it appears.
4. No long scrolling incident card: collapse past stages.
5. No inlet temperature on the affected rack when the problem is the CPU; show the reading that matters.
6. Don't let a grid column grow past the viewport: use `min-w-0` on grid children that hold code.
7. No toast or popup notifications. Events show up in place: the incident card, the status ribbon and the event log.

## 9. Iteration log

| Version | Rating | What changed | Why |
|---|---|---|---|
| v1 | Console 6.5 · Verify 8 | Console with hall map, incident card, KPI row, event log; Verify matrix with a repair loop | First build around the repeated use case |
| v2 | 8 | KPI row replaced by a status ribbon; affected rack shows CPU °C with a pulse ring; incident shows only the current step plus a timestamped lifecycle; race bars; live readings in the quiet state | KPIs were dashes on first look; the card grew too long; the 6-minute insight wasn't visual |
| v3 | 8.5 | Heat tint limited to the warmest racks; step-tracker fix | The tint made the hall look muddy |
| v4 | 9 | Mobile puts the incident first, racks 4 per row; race lanes fill to their own page time; "6 minutes between the two pages" caption | On mobile the main job was below the fold; the race didn't show the gap |
| v5 | 9.5 | Insight pill says "old check still silent" until 02:13; Verify column overflow fixed | Never claim a lead before it happens; no horizontal overflow |

| v6 | 9.5 | Motion layer: tweened readings, blinking clock, evaluation sweep, rack tooltips, live chart heads with area, toasts, staged delivery sequence, lifecycle fills, stage transitions, Nemotron switch, Verify progress, counter and typed diff | Make the console feel like live equipment |
| v6.1 | 9.5 | Affected-rack tooltip shows CPU and fan, not inlet | The inlet tooltip contradicted "critical" |
| v6.2 | 9.5 | Toasts removed | Too popup-heavy; the incident card, ribbon and log already show every event in place |

**To reach a true 10:** the same flows driven live (install the tools and the NVIDIA key, so the matrix and agent panels show "live"), and a recorded backup run.
