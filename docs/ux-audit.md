# Damo UX audit: a technician on an iPad

8 Nov 2026 · iPad Air landscape (1180×820, touch) and portrait, every screen and main flow tapped through in a real browser. 34 screenshots, touch-target and type-size measurements, 0 console errors.

Reviewer stance: senior UI/UX designer who has worked shifts as a data center technician. The question is not "is it pretty" but "would I trust this at 3 AM, gloved, standing at a rack, with a supervisor on the phone".

## Verdict

**Pitch: 8/10. Floor tool: 4/10.** It demos beautifully on a laptop. On the floor it fails on fundamentals: touch targets, one consistent facility, and a workflow that stops dead when the AI is down. The visual polish is ahead of the operational design.

| Area | Score | One line |
|---|---|---|
| Console (home) | 6 | Great story for a judge; the incident action is the third thing you see, and the hall is mostly decoration |
| Incident flow (ack → handoff) | 6 | Clear single next action, but it scrolls off-screen and dead-ends with the model offline |
| Verify a change | 7 | Best screen: red → repair → green is instantly legible |
| Preflight map | 6 | Huge improvement; expanding a row breaks the layout and the map doesn't re-fit |
| Preflight Why panel | 8 | Exactly what a tech needs; it hides when you tap anything |
| Preflight tabs (Plan, Ask, Findings) | 3 | Below the fold on iPad, typed equipment IDs, hour numbers 0–48 |
| Modernize M1–M5 | 5 | Engineer tool shown to technicians; backend warnings leak into the UI |
| Navigation and consistency | 3 | Two different facilities, orphan screens, mixed vocabulary |

## What stands out (keep it)

- **One primary action per incident stage**, with a plain hint ("A closed ticket is not proof. Take fresh readings."). This is how ops tools should work.
- **Verify a change**: the results matrix turning red, then green after the repair, communicates proof in about 3 seconds without reading anything.
- **The Why panel's root-cause chain** ("needs PDU-A1 or PDU-B1, and all of them are out") is the single most useful thing in the product for a technician.
- **The trace panel** answers "what feeds this rack" in one tap, in big type, with state words.
- **Honesty labels** ("scripted night, illustrative data") build trust with engineers.

## Red flags (brutal)

1. **Touch targets fail almost everywhere.** On the console, 10 of 11 interactive elements are under 44 pt. The top nav items are 36 px tall, and the logo is 57×30. In Preflight, 72 of 88 elements on screen are under 44 pt: map nodes render at 101×43 and below, and the zoom controls are about 24 px. With nitrile gloves on, I would mis-tap constantly.
2. **Two different facilities.** The console hall has racks R10–R47 with Compute2 in R12 and a CDU pod. Preflight's "Demo hall H1" has racks R1-01 to R2-08, UPS-A/B and PDUs. Same app, same night shift, different buildings. A technician will immediately ask "which one is real?" That kills trust in both.
3. **The workflow dead-ends when the AI is down.** With Nemotron offline, the only button reads "Investigation needs Nemotron", greyed out. I can't dispatch a technician or verify recovery. The product's own claim is "alerts work without the model"; the human workflow doesn't. Investigation must be optional, never a gate.
4. **The alarm is the third thing I see.** On iPad landscape the order is clock, story line, race card (200 px), *then* the incident card. That card's primary action sits at the bottom edge. On a real console, the active alarm owns the top of the screen; the Damo-vs-Nagios race is a pitch device, not an operator need.
5. **The primary action scrolls away.** After "Investigate", the hypotheses push "Dispatch technician" below the fold at 1180×820. The one thing I must press next is the thing I can't see.
6. **The hall map is mostly decoration.** 31 of 32 racks show 22–24 °C inlet numbers that never change meaning. The liquid pod and the stale rack R13 are unexplained on iPad (the tooltip needs hover). It burns 60% of the left column to say "R12 is hot".
7. **Expanding a rack row breaks the Preflight map.** The map doesn't re-fit: R1-08 is cut at the bottom, row R2 is off-screen, and the crossing-line fan comes back. The verdict strip then sits on top of the nodes.
8. **The Why panel disappears when I touch the map.** Tapping any equipment (the natural next move) hides the root cause on iPad. Explanation and investigation should coexist.
9. **Preflight's deeper tools are a desk-job UI.** Plan asks me to type "CRAH-3" into a text field and enter hours as integers 0–48. Findings, Weak points and Ask sit below the fold on iPad. On the floor, I pick equipment from the map and times from a picker.
10. **Header chrome for the wrong user.** Preflight shows Whole site, Reset, Import, Export and Restore demo before any equipment. The Modernize screens show "Backend: Nemotron API unavailable · TTU plugin execution unavailable". Admin and developer state is shown to a technician.
11. **Jargon without help.** "cites e1 e2 e4", "2N/N+1 → N", "6/6 alarm paths verified", "what-if", "M1–M5" in the nav. Engineers get it; a new tech on nights doesn't.
12. **Orphan and duplicate screens.** `/operate` (old R1–R5) still exists, with its own incident state that disagrees with the console. `/checks` is the even older demo. Any link or bookmark lands a user in a contradictory world.
13. **Truncation in critical places.** "Acknowled…" in the lifecycle, "MAINTENA…" on map nodes. If a label carries state, it never truncates.
14. **Text too small for arm's length.** Large areas use 10–11 px (11 px appears about 50 times per console screen): step labels, captions, kW values on nodes, map column headers.

## The 5 things I would change first

1. **One facility, everywhere.** Pick one site model (Preflight's H1 graph is the richer one) and drive the console hall, the incident, Verify and Preflight from it, with the same IDs on every screen. *Done when:* the incident on the console names equipment you can tap in Preflight, and they match.
2. **The alarm owns the top of the screen; the action never leaves it.** On the console, put the active incident first and full-width, with its primary action pinned (a sticky bottom bar on iPad). Shrink the race to a one-line "Damo 02:07 · Nagios 02:13 (+6 min)" chip inside the incident header; keep the full race for `/about` or the pitch. *Done when:* at 1180×820 and 820×1180, the alarm title and its primary button are visible with zero scroll at every stage.
3. **Every action works without the model.** "Investigate with Nemotron" becomes optional ("Skip, dispatch now"); dispatch, verify and handoff never depend on it. Show "Nemotron offline: investigation unavailable, everything else works" as a banner, not a disabled main button. *Done when:* the offline path reaches "Handed off" in the same number of taps.
4. **Glove-sized touch.** At least 48 pt targets for nav, header buttons, chips, map controls and nodes (default zoom never below the size where nodes are 48 pt tall; pinch out for overview). Raise body text to ≥ 14 px and labels to ≥ 12 px, with no truncation of state words. *Done when:* the touch-target audit shows 0 interactive elements under 44 pt on every screen.
5. **Make Preflight's deep tools touch-native and in reach.** Re-fit the map on expand and collapse. Keep the Why panel open beside the trace panel. Move Plan, Findings and Ask into a bottom sheet on iPad. Plan picks equipment from the map (tap "Plan maintenance" in the trace panel) and time from a 48-hour slider. Hide Import, Export and Restore behind an "Admin" menu. *Done when:* every Preflight task is possible with no keyboard and no page scroll on iPad.

Also cheap and worth doing alongside: delete or redirect `/operate` and `/checks`; replace "cites e1 e2" with tappable evidence chips; add a one-line glossary tooltip for 2N/N.

## Result: all 5 changes done (8 Nov 2026, same day)

Re-tested on iPad Air landscape (1180×820) and portrait (820×1180), touch, with an automated tour that checks each "done when" (52 checks, 65 screens).

| Change | Done when | Result |
|---|---|---|
| 1. One facility | Console incident names equipment you can tap in Preflight | Console hall is H1 (R1-01…R2-08). Compute2 is in **R1-03**, fed by **PDU-A1/B1** and **CRAH-1/2**, read live from `/api/preflight/facility`. The rack and feed chips open `#/preflight?focus=<id>` with that trace open. ✅ |
| 2. Alarm first | Alarm title and primary button visible with zero scroll at every stage, both orientations | Incident card top-left, race shrunk to a header chip "Damo 02:07 · Nagios 02:13 (+6 min)", action placed above the details. 18/18 stage checks pass. The full race moved below the hall. ✅ |
| 3. Model optional | Offline path reaches Handed off in the same number of taps | "Skip, dispatch now" beside Investigate. Offline shows a banner and makes Dispatch the primary action. **Offline 4 taps, online 5.** ✅ |
| 4. Glove-sized touch | 0 interactive elements under 44 pt on every screen | **0 / 65 screens.** No visible text under 12 px, no truncated text. Map nodes never render below 48 px: the default zoom is clamped (pan, or Fit view for the overview). ✅ |
| 5. Touch-native Preflight | Every task possible with no keyboard and no page scroll | Map re-fits on row expand and collapse. Why stays open beside Trace (IDs in Why open the trace). Panels sit in a bottom sheet on iPad. Plan is picked from the trace ("Plan maintenance on X") or chips, with sliders for duration and the 48 h window. Ask runs from one-tap questions. Findings are prefilled with the engineer. Import/Export/Restore are in **Admin**. ✅ |

Also done: `/operate`, `/checks`, `/read`, `/find`, `/prove` and `/handoff` redirect to the console. Evidence is tappable chips. 2N/N+1/N has a tap glossary. Model notes moved into an ⓘ tip. The camera frames the affected equipment when Why opens. The agent's verdict shows as a line in the Why header.

Found and fixed along the way: the desktop rail was hidden at ≥1400 px (Tailwind variant order), and the Admin menu rendered under the rail. Regression suites: e2e 3/3 (import spec now opens Admin before Restore), Preflight click-through 11/11, pytest 109, tsc clean.

**Re-score: floor tool 9/10, pitch 9/10.** What keeps it from 10 on the floor is honest: at the full-site overview the map is a pan surface on iPad portrait, and the backend's scripted planner sends `UPS-A: failed` for a maintenance toggle (the answer is still right; logged, not changed).
