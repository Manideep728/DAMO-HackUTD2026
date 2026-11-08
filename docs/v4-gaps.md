# V4 gap checklist

What `main` is missing against the V4 workflow ("Making existing data centers AI-ready"). V4 is a review, not the source of truth; this list compares it with the code on `main` at `cc1a3da` (8 November 2026). Tick items as they land and link the PR.

## Already on main (for reference)

- [x] Modernize M1–M5 on the real TTU Nagios check: pinned inputs, Nemotron recovery with operator questions, candidate diff, independent harness (real plugin, promtool, amtool), held-out cases, mutant and decoy rejected, repair loop, review / shadow / rollback / release gates
- [x] Preflight discovery: records vs. the documented graph, verbatim quotes only, engineer confirm/reject with audit log; Tiger meters cross-check the drawings
- [x] Redundancy check: enough capacity is not independent backup (2N → N through a shared ATS)
- [x] Console incident: alerts without the model, delivery fallback, dedupe into one work order, stale telemetry marked, cited hypotheses ("verify, not proven"), recovery needs a real plugin run, shift handoff
- [x] Nemotron writes and picks tools; detection, response authority and pass/fail stay deterministic
- [x] One facility (H1, R1-01..R2-08) shared by Console and Preflight (PR #14)

## 1. Liquid-cooling domain (blocks most of the rest)

- [ ] Node types for `cdu`, `leak_sensor`, `valve` (isolation / energy valve) in `backend/engine/model.py`
- [ ] Distinguish facility (primary) water from rack-facing (secondary) coolant loops
- [ ] Synthetic retrofit fixture: existing site + 2 liquid-cooled GPU racks + 1 CDU, labeled synthetic
- [ ] Add the CDU, secondary loop and leak sensors to the Preflight graph so the verified map covers them (additive; existing engine tests unchanged)

## 2. Modernization inputs (V4 §4)

- [ ] `existing_bms_points.csv` — point IDs, units, alarm refs, descriptions
- [ ] `rack_inventory.csv` + `cooling_topology.csv` — which CDU / valves / leak sensors serve which racks
- [ ] `cdu_vendor_points.csv` — device registers or API fields, with version
- [ ] `site_requirements.md` — approved responses, operating limits, ownership, fallback
- [ ] `logbook.csv` — maintenance notes, treated as context, not policy
- [ ] Rack drawing (text) used as the source for physical associations
- [ ] Pinned target interface contract. **Decision needed:** fetch and pin the real NVIDIA DSX Exchange spec, or label ours "synthetic target contract". Do not invent DSX fields; do not mix BCM rules
- [ ] Adapter / mapping config that publishes equipment data to the target contract

## 3. Headline demo: wrong-rack leak sensor (V4 §4, §8)

- [ ] Original config maps the leak sensor to Rack B
- [ ] Schema / type check passes on that config
- [ ] Behavior test injects a simulated leak event into the running integration; an independent consumer checks rack identity and approved response → **FAIL**
- [ ] Agent flags the mismatch with the drawing quote as evidence
- [ ] Engineer confirms the physical association (name, time, source, scope recorded)
- [ ] Agent produces the actual config / adapter diff
- [ ] Same test → **PASS**
- [ ] Correction saved as a regression test
- [ ] Second site variation (different names / layout) reuses the correction and tests
- [ ] UI shows all six artifacts: original config, source drawing, failed test, engineer decision, diff, passing regression test
- [ ] Labeled "constructed demo fault", not an Equinix incident

## 4. Behavior tests (V4 §4)

- [ ] Wrong rack association (correct format, wrong equipment)
- [ ] Primary / secondary loop swap
- [ ] Running vs. available: a running CDU is not automatically available redundancy (reuse the redundancy check)
- [ ] Communication loss and reconnection with the target contract's freshness / recovery rules (main only has the TTU "missing feed" case and the stale marker)
- [ ] Approved request / fallback: reject an invalid request, or show the fallback when its source disappears (main's fallback is pager delivery only)
- [ ] Regression: engineer's correction survives new equipment or a renamed point
- [ ] Expected outcomes defined independently of the generated config (same rule as the TTU harness)

## 5. Versioned decisions and change revalidation (Scenario B)

- [ ] Each engineer decision stored with source, author, scope and version
- [ ] Decisions invalidated when their supporting equipment / firmware version changes
- [ ] Firmware change demo: a CDU enum changes → affected mapping flagged → its tests rerun → approval requested before the accepted package changes
- [ ] Persistent regression suite that grows with each approved correction

## 6. Readiness and handover (V4 §9)

- [ ] Readiness view split into: software tests passed / field checks still required / ownership unresolved
- [ ] Attach witnessed physical results (sensor, valve tests); simulation never substitutes for them
- [ ] Handover package: diff, equipment map, test results, open issues, deploy + rollback steps, updated operator procedures

## 7. Monitoring: low-flow incident (V4 §6, Scenario C)

- [ ] CDU telemetry: flow, supply / return coolant temperature, state, with timestamps
- [ ] GPU thermal / throttle telemetry per rack
- [ ] Controlled job progress signal (steps/s) with a known baseline
- [ ] Functional rule: pump / CDU running ≠ adequate flow (deterministic)
- [ ] Inject gradual flow decline → coolant temp rises → GPUs throttle → job slows while heartbeats stay healthy
- [ ] Use the verified map to scope affected racks A/B; unaffected comparison rack / fixture shown
- [ ] Incident card wording: "cooling degradation suspected; cause unconfirmed", with source timestamps, procedure, ack state, exact closing evidence
- [ ] Retrieve the approved low-flow runbook and the recent maintenance note (lead, not root cause)
- [ ] Two owners: Facilities owns loop checks, IT owns workload-impact assessment
- [ ] Ack, action and recovery tracked separately
- [ ] Close only when flow / temperature **and** job progress recover for an approved observation window
- [ ] Variant: stale CDU telemetry with normal independent readings → "missing visibility", no invented failure, no shutdown advice
- [ ] Variant: equipment recovers, job stays slow → incident stays partially unresolved
- [ ] Facility-only view when workload data is unavailable (colocation); missing visibility shown explicitly

## 8. Continuity from modernization to operations

- [ ] Console incident context comes from the accepted retrofit package (equipment map, owners, rules), not hard-coded data
- [x] Ops asset map, harness scenario and Modernize data use H1 rack IDs (`R1-03`, `R1-04`), so a live investigation names the same rack as the console
- [ ] Reviewed incident lesson → proposed regression test → modernization review

## 9. Evaluation (V4 §6 "How we prove it is better", §7)

- [ ] Same monitoring scenarios against a documented threshold-only baseline
- [ ] Same scenarios against Claude + the same sources and tools
- [ ] Metrics: correct affected racks, missed incidents, unnecessary escalations, time to evidence-backed handoff, false recovery declarations
- [ ] Include healthy workload transitions and stale-data cases
- [ ] Modernization: net engineer time and independently scored defects on an unseen second site

## 10. Docs and pitch

- [ ] README / `direction-ai-retrofit.md` updated to the V4 framing (wrong-rack leak sensor, not the missing leak alarm)
- [ ] Demo script for the retrofit → monitoring flow
- [ ] Every synthetic fixture and estimate labeled as such

## Later (V4 marks these proposed or later)

- [ ] CDU research and selection packet (§3 upstream stage)
- [ ] Inference scenario: p95 latency / queue depth, traffic-shift proposal (Scenario D)
- [ ] Real BACnet / Modbus protocol integration
- [ ] Calibrated workload baselines, failure-risk models, scheduler actions
