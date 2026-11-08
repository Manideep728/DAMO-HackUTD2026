# Damo — AI retrofit workflows

Proposed direction • 8 November 2026 • 8090 + NMC² + NVIDIA

> **Status:** proposed, mostly not built. The later V4 review keeps these two workflows but changes the headline demo: a leak sensor **mapped to the wrong rack** (schema passes, behavior test fails, engineer confirms from the drawing, fix kept as a regression test, rerun on a second site) instead of a missing leak alarm, and adds a low-flow monitoring incident where the job slows while the CDU reports running. What main has and lacks against V4 is in [v4-gaps.md](v4-gaps.md).

Help existing data centers add liquid-cooled AI/HPC equipment by updating and verifying the monitoring their operators already use. Two connected workflows: modernize the integration during the retrofit, then use the verified configuration and procedures for ongoing monitoring.

**Initial users:** controls/BMS integrators, commissioning engineers, and facility operations teams. BMS means building management system; DCIM means data center infrastructure management; CDU means coolant distribution unit. A point list identifies the sensor readings and equipment alarms a monitoring system should receive.

## Workflow 1 — Retrofit integration and commissioning

**Trigger:** a facility adds a liquid-cooled rack/pod, replaces a CDU, or changes equipment firmware. The new equipment must be connected to the existing monitoring and its behavior verified before operational handover.

### Existing workflow

Engineers review equipment manuals and approved design requirements → integrators map signals into the BMS/DCIM and update alarms → commissioning staff execute tests and resolve issues → operations receives settings, procedures, and training. This work already exists and can be partly automated; we accelerate its configuration and verification steps. [1]

### Agent-enabled workflow

Equipment documents + current configuration → Understand → Compare → Propose change → Test and repair → Engineer approval → Verified handover

**Inputs:** version-pinned equipment manual and protocol map; existing point list, adapter code, and alarm configuration; approved site settings and operating procedures; asset/location/owner map; acceptance cases and test destinations.

- **Discovery agent** — Read the existing integration and the new equipment documentation. Extract available readings, units, equipment alarms, configurable delays, clearing behavior, and dependencies. Attach a source reference to each requirement; flag missing site decisions instead of inventing limits or shutdown policies.
- **Gap-analysis agent** — Compare the documented, approved behavior with the configured system. Find missing alarms, wrong units or scaling, stale labels, missing communications-failure handling, and incorrect destinations. Separate changes needed for the new equipment from behavior that must remain unchanged.
- **Modernization agent** — Produce a reviewable update to the supported adapter, point mapping, alert rules, and handoff procedure. Show the before/after difference and why each change is needed. The existing BMS/DCIM can remain the operating system of record.
- **Verification agent** — Run deterministic checks and replay simulated device events through the integration. Compare observed alarms, equipment identity, recipients, and recovery behavior against independently approved expectations. Inspect failures, repair the candidate, and rerun affected tests.
- **Engineer review** — A controls or commissioning engineer reviews the configuration diff, supporting sources, test results, unresolved questions, and rollback steps. Approved changes progress through the site's commissioning and deployment process; simulations do not certify plumbing, sensor placement, or cooling capacity.
- **Handover agent** — Package the accepted configuration, equipment versions, owner map, test evidence, and operating procedures. Record outstanding issues. This becomes the baseline for Workflow 2.

**Tools the agents call:** document extraction/search, configuration parsers, source-controlled file editing, a device simulator, configuration validators, an alert replay runner, and a local notification collector. Nemotron interprets and proposes; executable tools determine test outcomes.

**Output:** a reviewed integration change plus evidence that the supported alarm paths work. Measure engineering time, missed/extra test alarms, asset and recipient mismatches, and time to resolve failed tests. Improvement claims require measured results.

## Workflow 2 — Ongoing monitoring and change verification

**Trigger:** an equipment alarm, loss of telemetry, an operator investigation, or a change to firmware, mappings, thresholds, or ownership. The accepted commissioning baseline gives the agents equipment-specific context.

### Existing workflow

The BMS/DCIM raises an alarm → an operator checks dashboards, equipment documentation, recent changes, and ownership → the responsible team investigates → operations records the response and updates procedures. Rechecking integrations after changes is an additional maintenance task.

### Agent-enabled workflow

Deterministic alert or configuration change → Gather evidence → Check context → Prepare handoff → Operator action → Verify recovery → Maintain the baseline

**Inputs:** current equipment events and telemetry quality; a bounded window of related readings; the accepted configuration and test suite; recent changes; equipment dependencies; approved procedures and owner directory.

- **Triage agent** — Identify the affected equipment and check whether readings are current. Distinguish an equipment-reported alarm, a sensor/communications problem, and a configuration mismatch. Retrieve the relevant approved procedure and explain uncertainty where evidence is incomplete.
- **Investigation agent** — Query related device status, upstream/downstream dependencies, and recent changes using read-only tools. Compare observations with the accepted configuration. Present supported hypotheses and the next diagnostic step; correlation alone does not establish a physical cause.
- **Handoff agent** — Prepare an incident packet with the asset and location, timestamps, observed alarm, supporting readings, affected dependencies, responsible team, and approved next action. Create or update a ticket through the site's authorized workflow; ownership comes from the directory.
- **Operator response** — Facilities or manufacturer technicians inspect and service equipment. The tenant/platform team handles workload decisions when required. The agent assists with evidence and procedure lookup; equipment controllers retain protection logic, and operational actions follow site authority.
- **Recovery agent** — Check telemetry freshness, alarm clearing, and any required recovery evidence. Record operator confirmation, unresolved issues, and the incident timeline. A cleared alert alone is not proof that the underlying fault has been fixed.
- **Change-verification agent** — Compare later configuration, firmware, and ownership changes with the accepted baseline. Select relevant regression tests, flag lost coverage, and open a reviewable update. Production changes and new baselines follow the same review process as Workflow 1.

**Tools the agents call:** read-only BMS/DCIM queries, device and asset inventory, time-series queries, runbook retrieval, configuration comparison, the regression runner, and an authorized ticketing integration.

**Output:** an evidence-backed incident handoff and a maintained integration baseline. Measure time to a usable handoff, correct asset/owner assignment, supported versus unsupported claims, and detection of seeded configuration regressions.

## One concrete demo connects both workflows

**Scenario:** an existing facility adds a direct-to-chip liquid-cooling unit for denser compute. Its local leak alarm works, but a deliberately incomplete site configuration omits that alarm from central monitoring. This is a simulated integration defect, not a reported incident at a named operator.

**Modernization:** the agent reads the manufacturer alarm description and approved site policy, finds the missing mapping, proposes a patch, and replays an alarm. Show the initial failed test and the corrected notification reaching a local test receiver.

**Monitoring:** replay a later device alarm. The agent retrieves the commissioned asset/owner map, gathers current evidence, and produces a facilities handoff. Then change the destination or remove a mapping; the change-verification agent catches the regression.

**Acceptance cases:** normal operation; alarm active; alarm cleared; unavailable telemetry; wrong equipment mapping; wrong recipient. Pin the equipment/manual version and verify protocol addresses before claiming a real BACnet/Modbus integration. Synthetic fixtures and site policies are labeled explicitly.

## Agent design and scope

The named agents are logical roles and can share one Nemotron endpoint and tool layer in the hackathon. Start with document/configuration analysis, patch generation, test execution, and the incident packet. Continuous polling and alarm evaluation stay deterministic; invoke the model on events, changes, or investigation requests.

- **8090:** modernize existing monitoring code/configuration.
- **NVIDIA:** demonstrate a Nemotron tool-use loop with observable actions and a failed-test/repair cycle.
- **NMC²:** verify that a warning reaches the correct operator with useful equipment context.

**Candidate differentiation:** checking the actual configuration and executing repeatable integration tests, then reusing that evidence after handover. Commissioning and AI checklist generation already exist; Facility Grid describes an AI checklist generator. Competitive coverage and willingness to pay remain validation questions. [5]

## Evidence behind the direction

- OCP documents controller configuration, communications, equipment identifiers, prescribed tests, recorded settings, and handover. This grounds the existing workflow; the agent roles above are our proposed product design. [1]
- Equinix HK1 deployed a 50 kW liquid-cooling pilot in an existing facility; the announcement does not identify its processor mix. NTT documents a planned transition to direct liquid cooling for Helmholtz Munich's HPC racks, including an existing GPU estate. These are market examples, not customer relationships or evidence of monitoring defects. [2] [3]
- Manufacturer documentation exposes equipment-specific alarm behavior. For example, the Vertiv CDU100 guide allows different configured responses to its internal-leak alarm. A model must use the approved configuration rather than assume that every leak signal commands shutdown. [4]

## References

1. OCP — Liquid Cooling Integration and Logistics, pp. 20–22
2. Equinix — HK1 liquid-cooling pilot, September 2025
3. NTT DATA — Helmholtz Munich HPC case study
4. Vertiv — CoolChip CDU100 operation and maintenance guide; pin the edition used
5. Facility Grid — AI commissioning checklist generation
