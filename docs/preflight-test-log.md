# Preflight: functionality test log

8 Nov 2026 · screen `/preflight` (PR #8) before and after the UX redesign. Backend on :8001, frontend on :5174.

## How it was tested

- **API:** every `/api/preflight` endpoint the UI uses, with real scenarios (`pf_api_check.py`).
- **UI:** an 11-step click-through in headless Chromium, logging browser and HTTP errors (`pf_ui_check.py`).
- **Unit tests:** `pytest tests/preflight` (89 tests) and `python -m tests.test_harness`.
- **Safety:** `backend/.work/preflight.sqlite` was backed up first. Finding decisions (which write to it) are covered by `test_api.py` and were not clicked in the browser.

## Results

| Area | Before redesign | After redesign | Notes |
|---|---|---|---|
| API: facility, simulate, traces, redundancy, cut sets (±maintenance), findings, plan search, plan compare, audit, scenarios | 12/12 pass | 12/12 pass | 1–572 ms per call |
| Agent (Ask) | Works (scripted planner, no key) | Same | 1 tool call, final answer, every claim traced |
| Map renders all 43 items | Pass | Pass | |
| Put equipment in maintenance / fail it | Pass (click to cycle) | Pass (click to select, then Maintenance / Fail / In service) | Same capability, explicit controls |
| Impact and verdict update | Pass | Pass | |
| Redundancy row highlights shared dependencies | Pass | Pass | |
| Weak points, Findings, Plan (search + compare), Ask tabs | Pass | Pass | |
| Zone filter | Pass | Pass | |
| Reset scenario | Pass | Pass | |
| Browser errors | None | None | |
| pytest preflight | 89 passed | 89 passed | |

## Errors found

| # | Error | Severity | Status |
|---|---|---|---|
| 1 | React Flow disables pointer events on nodes that are neither draggable nor selectable, so clicks on the new map fell through to the pane | Blocker (new map) | **Fixed:** clicks and hover routed through `onNodeClick` / `onNodeMouseEnter` |
| 2 | First click on a node was swallowed: the hover highlight re-rendered the map, and the hover lift moved the node, between press and release | High (new map) | **Fixed:** hover is debounced (140 ms) and the lift removed |
| 3 | Column-label nodes exposed `role="button"`, so "PDU · plant" counted as a "Plan" button for screen readers and tests | Medium (accessibility) | **Fixed:** labels are `focusable: false`, `ariaRole: presentation` |
| 4 | The outage verdict showed "Tightest 90%" about surviving equipment, which reads as reassurance during an outage | Medium (misleading) | **Fixed:** an outage shows "Load lost" instead |
| 5 | "kW" rendered as "KW" (capitalize style) | Low | **Fixed** |
| 6 | One `500 Internal Server Error` seen during one UI run; not reproduced in 3 later full runs | Unknown | **Open:** watch backend logs; likely a race between overlapping simulate calls |
| 7 | Agent answer "Losing ATS-1 takes down nothing" omits that 9 services drop from 2N to N | Medium (content) | **Open:** see plan |
| 8 | Original map unreadable (~40 px boxes, 110 crossing lines); the key insight (2N → N) buried in a table | High (UX) | **Fixed by the redesign** |

## What's good

- The simulator is fast (tens of ms) and its results are rich: lost services and kW, degraded equipment, per-node headroom, failure traces, before/after redundancy, maintenance cut sets.
- Findings carry evidence quotes, and the precision/recall metrics are 1.0 on the demo corpus.
- The plan search evaluates 45 windows in about 0.6 s and explains rejections.
- The agent never claims anything a tool didn't return ("Every claim traces to a tool result").
- Test coverage is strong: 89 unit tests including properties, fuzzing and golden demo cases.

## Fix plan (remaining)

1. **Agent wording (#7):** when nothing is lost but redundancy drops, the answer should lead with "Nothing goes down, but N services drop to a single path", using the redundancy tool already available to it.
2. **Intermittent 500 (#6):** log request bodies on 500 in `app/preflight/api.py`, and cancel stale simulate calls in the UI (the effect already ignores stale responses; also abort them).
3. **Mobile map:** pan and zoom work, but the full 9-column graph is small on phones; consider a "focus on selection" zoom on small screens.
4. **Findings decisions in the browser test:** run them against a throwaway database (`PREFLIGHT_DB` env var) so the click-through covers Confirm/Reject too.
