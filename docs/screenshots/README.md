# DAMO screenshots

Captured 2026-11-08 from `main` at 1440px wide (backend in `cached` mode, live Nemotron key set). Synthetic example data throughout.

## Landing

- [dark-first-screen.png](1-landing/dark-first-screen.png): Landing page, dark mode, first screen
- [dark-full-page.png](1-landing/dark-full-page.png): dark full page
- [light-first-screen.png](1-landing/light-first-screen.png): Landing page, light mode, first screen
- [light-full-page.png](1-landing/light-full-page.png): light full page

## Setup

- [1a-connect-sources.png](2-setup/1a-connect-sources.png): Setup step 1 (connect-sources): on arrival, agent work shown, awaiting the engineer
- [1b-connect-sources-done.png](2-setup/1b-connect-sources-done.png): Setup step 1 (connect-sources): completed
- [2a-map-the-site.png](2-setup/2a-map-the-site.png): Setup step 2 (map-the-site): on arrival, agent work shown, awaiting the engineer
- [2b-map-the-site-done.png](2-setup/2b-map-the-site-done.png): Setup step 2 (map-the-site): completed
- [3a-select-the-cdu.png](2-setup/3a-select-the-cdu.png): Setup step 3 (select-the-cdu): on arrival, agent work shown, awaiting the engineer
- [3b-select-the-cdu-done.png](2-setup/3b-select-the-cdu-done.png): Setup step 3 (select-the-cdu): completed
- [4a-plan-installation.png](2-setup/4a-plan-installation.png): Setup step 4 (plan-installation): on arrival, agent work shown, awaiting the engineer
- [4b-plan-installation-done.png](2-setup/4b-plan-installation-done.png): Setup step 4 (plan-installation): completed
- [5a-review-mappings.png](2-setup/5a-review-mappings.png): Setup step 5 (review-mappings): on arrival, agent work shown, awaiting the engineer
- [5b-review-mappings-done.png](2-setup/5b-review-mappings-done.png): Setup step 5 (review-mappings): completed
- [6a-commission-and-handover.png](2-setup/6a-commission-and-handover.png): Setup step 6 (commission-and-handover): on arrival, agent work shown, awaiting the engineer
- [6b-commission-and-handover-done.png](2-setup/6b-commission-and-handover-done.png): Setup step 6 (commission-and-handover): completed

## Console

- [1-night-shift-watching.png](3-console/1-night-shift-watching.png): Console: night shift, all racks watched
- [2-early-warning.png](3-console/2-early-warning.png): Console: verified rule warns before the legacy check would page
- [3-acknowledged.png](3-console/3-acknowledged.png): Console: alert acknowledged, escalation timer stopped
- [4-investigated.png](3-console/4-investigated.png): Console: Nemotron investigation and ranked hypotheses
- [5-dispatched.png](3-console/5-dispatched.png): Console: work order WO-1042 dispatched
- [6-recovery-verified.png](3-console/6-recovery-verified.png): Console: recovery verified with the known-answer test
- [7-handed-off.png](3-console/7-handed-off.png): Console: shift handoff accepted
- [8-rack-detail.png](3-console/8-rack-detail.png): Console: rack R3-02 detail

## Work Order

- [1-wo-1042.png](4-work-order/1-wo-1042.png): Work order WO-1042
- [2-source-document.png](4-work-order/2-source-document.png): Work order: source document opened at the cited line

## Verify

- [1-verify.png](5-verify/1-verify.png): Verify a change: candidate rules v1 and v2
- [2-tests-run.png](5-verify/2-tests-run.png): Verify: harness results (plugin, promtool, amtool, mutant, decoy)

## Preflight

- [01-overview.png](6-preflight/01-overview.png): Preflight: facility map and impact panel
- [02-scenario-chiller-ch-1-maintenance.png](6-preflight/02-scenario-chiller-ch-1-maintenance.png): Preflight scenario: Chiller CH-1 maintenance
- [03-scenario-ups-a-maintenance.png](6-preflight/03-scenario-ups-a-maintenance.png): Preflight scenario: UPS-A maintenance
- [04-scenario-ats-1-fails.png](6-preflight/04-scenario-ats-1-fails.png): Preflight scenario: ATS-1 fails
- [05-scenario-ups-a-in-maintenance-then-ups-b-fails.png](6-preflight/05-scenario-ups-a-in-maintenance-then-ups-b-fails.png): Preflight scenario: UPS-A in maintenance, then UPS-B fails
- [06-scenario-crah-1-in-maintenance-then-crah-2-fails.png](6-preflight/06-scenario-crah-1-in-maintenance-then-crah-2-fails.png): Preflight scenario: CRAH-1 in maintenance, then CRAH-2 fails
- [20-ats-1-impact-tab.png](6-preflight/20-ats-1-impact-tab.png): Preflight, ATS-1 fails: Impact tab
- [21-ats-1-weak-points-tab.png](6-preflight/21-ats-1-weak-points-tab.png): Preflight, ATS-1 fails: Weak points tab
- [22-ats-1-findings-tab.png](6-preflight/22-ats-1-findings-tab.png): Preflight, ATS-1 fails: Findings tab
- [23-ats-1-plan-tab.png](6-preflight/23-ats-1-plan-tab.png): Preflight, ATS-1 fails: Plan tab
- [24-ask-pump-independence.png](6-preflight/24-ask-pump-independence.png): Preflight agent: "Are Pump A and Pump B independent?"

## Modernize

- [1a-m1-import.png](7-modernize/1a-m1-import.png): Modernize M1: import the legacy TTU Redfish check
- [1b-m1-imported.png](7-modernize/1b-m1-imported.png): Modernize M1: imported, gaps listed
- [2a-m2-recover.png](7-modernize/2a-m2-recover.png): 2a m2 recover
- [2b-m2-agent-running.png](7-modernize/2b-m2-agent-running.png): Modernize M2: Nemotron 3.5 Super agent making live tool calls against the legacy plugin
- [2c-m2-recovered.png](7-modernize/2c-m2-recovered.png): 2c m2 recovered
- [2d-m2-decisions-confirmed.png](7-modernize/2d-m2-decisions-confirmed.png): Modernize M2: operator decisions confirmed (recommended options)
- [3a-m3-generate.png](7-modernize/3a-m3-generate.png): Modernize M3: generate candidate rules
- [3b-m3-generated.png](7-modernize/3b-m3-generated.png): Modernize M3: candidate v1 generated (scripted animation: no model call in this step)
- [4a-m4-test.png](7-modernize/4a-m4-test.png): Modernize M4: test the candidate against the legacy behaviour
- [4b-m4-tested.png](7-modernize/4b-m4-tested.png): Modernize M4: test results
- [5a-m5-release.png](7-modernize/5a-m5-release.png): Modernize M5: repair and release
- [5b-m5-released.png](7-modernize/5b-m5-released.png): Modernize M5: reviewed, shadowed and released

## Shell

- [1-keyboard-help.png](8-shell/1-keyboard-help.png): Keyboard help overlay
- [2-director-panel.png](8-shell/2-director-panel.png): Director panel (demo controls)
