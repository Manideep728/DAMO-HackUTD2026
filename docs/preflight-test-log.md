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
| 6 | Intermittent `500` on `/findings` and `/facility`: one sqlite connection shared by FastAPI worker threads with no lock; the page loads both at once, queries interleave, rows come back corrupt (`IndexError` in `store.decisions`) | High (data layer) | **Fixed:** `Store` serializes access with a re-entrant lock; regression test `test_store_threads.py`; 200/200 concurrent requests OK |
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
2. **Portrait iPad and phones:** pan and zoom work, but the full 9-column graph is small on phones; consider a "focus on selection" zoom on small screens.
3. **Findings decisions in the browser test:** run them against a throwaway database (`PREFLIGHT_DB` env var) so the click-through covers Confirm/Reject too.

## iPad pass (grouped racks, trace view, tablet layout)

| Device (touch) | Node size at default zoom | Map and verdict on one screen | Horizontal overflow |
|---|---|---|---|
| iPad Air landscape 1180×820 | 101×43 | Yes | None |
| iPad Air portrait 820×1180 | 71×30 (overview; pinch to zoom) | Yes | None |
| iPad Pro 13" landscape 1366×1024 | 118×50 | Yes | None |
| iPad Pro 13" portrait 1024×1366 | 87×37 | Yes | None |
| Desktop 1440×900 (side rail) | 87×37 | Yes | None |

Functional click-through after the change: 11/11 pass, no browser errors. pytest preflight: 90 passed (89 + the thread-safety regression).

## Meters pass (Tiger Data, PR #13)

8 Nov 2026 · branch `5`. Live service: Tiger, Postgres 18.6, TimescaleDB 2.31. Tests: local `timescale/timescaledb:2.17.2-pg16` on :5434.

| Check | Result |
|---|---|
| `make meters-seed` (28 days, as-built wiring) | 115,584 rows in 4.4 s |
| `make meters-sync` | 3.6 s; one difference: MCC-B on ATS-1, 16.7 kW gap, r = 0.96 / −0.97 |
| MCC-B finding with meters | 0.97 → 0.99, Meters row shown in the UI |
| Meters from the documented wiring (3 seeds) | no difference found |
| Tiger unreachable at startup | app starts from the snapshot, `offline: true`; sync returns 503 "(Connection refused)" |
| Planner, measured load, after confirming | Pump A hour 6–12 every day; UTIL-A hour 0–6 with restore Mon–Fri, hour 6–12 Sat–Sun (CRAH-3 headroom 17% overnight) |
| pytest | 127 passed + 4 skipped without a DB; 131 passed with `TEST_DATABASE_URL` |
| `make rehearse` (meters off) | 4/4 |
| Mutations (two-sided rule, SQL subtraction, discovery merge) | 5, 1 and 4 tests fail; restored |

