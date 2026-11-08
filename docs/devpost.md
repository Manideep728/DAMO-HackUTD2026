# DAMO

### Retrofit the data center you already have, with evidence for every change.

DAMO reads the records an operating hall runs on, finds where they disagree, and tests every integration change before anyone touches the floor. Nemotron does the reading. Deterministic checks decide whether it was right.

`NMC²` · `NVIDIA Nemotron` · `8090` · `MLH Best Use of Tiger Data` · `MLH Best Use of Vultr`

> *Cover image:* `docs/screenshots/6-preflight/04-scenario-ats-1-fails.png`

---

## Inspiration

Data-center power demand is set to roughly double by 2030 (IEA, *Energy and AI*). New buildings take years, so operators are retrofitting the halls they already have: liquid-cooled GPU racks, a cooling distribution unit (CDU), new leak sensors, all wired into a building management system that was set up a decade ago.

The engineers doing that work don't lack tools. They lack one version of the truth. The floor plan, the cooling schematic, the BMS point list, the vendor manual and the maintenance log each describe the building a little differently, and the differences are where outages come from.

Two examples drove the whole project:

- **A backup that isn't independent.** The one-line diagram shows Pump A and Pump B on separate power paths. A 2023 work order and a 2024 IR scan show both pump panels running through the same transfer switch, ATS-1. On paper the cooling is 2N. In the field it's N.
- **An alarm that goes to the wrong rack.** A revised drawing moves leak sensor LD-2 to rack R3-01. The BMS mapping still says R3-02. The alarm fires, and the technician runs to the wrong rack with water on the floor.

Neither one shows up on a dashboard. Both show up when you read every record side by side, and that's work a model can speed up, as long as something other than the model checks the answer.

## What it does

DAMO takes a retrofit from scattered records to a tested handover, then carries that record into operations.

### Retrofit setup
> *Image:* `docs/screenshots/readme/setup-site-map.png`

Six steps. Connect the project's documents, and Nemotron maps the site: 21 components and 21 links, each marked confirmed, inferred, conflicting or missing, with the source line for every one. It recommends a CDU location against space, floor loading, pipe route, power and service clearance. The engineer picks the CDU, approves the install plan, and reviews the BMS mapping. Commissioning runs offline tests and a witnessed wet test. The wet test catches LD-2 naming the wrong rack, and the fix is a one-line config diff that cites the drawing it came from. A later firmware change renames every leak point; the regression suite catches it before handover.

### Modernize
> *Image:* `docs/screenshots/readme/modernize-agent.png`

Legacy monitoring is the other half of an old building. DAMO takes a real check, the Texas Tech HPCC Nagios–Redfish plugin, to Prometheus rules. A Nemotron 3.5 Super agent reads the plugin and its Nagios objects through tool calls (20 in our recorded run), records each behaviour with its source line, and raises six questions the code can't answer, such as "who should actually be paged?" when the inherited recipient is `nagios@localhost`. The operator's answers become test expectations. The first candidate passes 1 of 6 cases; Nemotron repairs it from the visible failures only, while held-out cases stay sealed.

### Preflight
> *Image:* `docs/screenshots/6-preflight/24-ask-pump-independence.png`

A what-if simulator for equipment work. Pick "ATS-1 fails" and the cascade runs across the graph: both switchgear feeds, both pumps, the chilled-water loop, 18 racks, 400 kW. It finds minimal cut sets, checks whether each redundant group is really independent, and ranks maintenance windows and plans. Ask "Are Pump A and Pump B independent?" and the agent answers through `simulate` and `find_cut_sets` calls, citing every number.

### Console
> *Image:* `docs/screenshots/3-console/2-early-warning.png`

The night shift on the retrofitted hall. GPU-07 passes every health check (61 °C, 94% utilization, online) and still returns the wrong checksum on a known-answer test. The console ties the mismatch to the rack, its power and cooling feeds and recent work, then walks the operator through acknowledge, investigate, dispatch, verify recovery and hand off. Paging and work orders never wait on the model.

## How we built it

> **Nemotron proposes. Something it can't influence decides.**

| Nemotron does | Checked by |
|---|---|
| Proposes "X is fed from Y" from work orders and logs | A quote validator. The quote must appear in the record word for word, read as a feed in that direction, and name two real inventory nodes. |
| Answers Preflight questions through eight engine tools | A citation validator. Any node or number not present in the tool results the answer cites is rejected. |
| Recovers legacy behaviour, then writes and repairs rules | A harness that runs the original plugin, promtool and amtool. Held-out cases, a wrong-recipient mutant and an alert-everything decoy make sure the suite can fail. |
| Investigates incidents | Kept out of the alert path. Rules, paging and work orders run with the model switched off. |

The Preflight agent's tools: simulate, find cut sets, evaluate plan, search plans, search docs, get node, get neighbors, and propose dependency.

### Engine
(`backend/engine/`, pure Python, no model). Requirement groups (`all`, `any`, `k_of_n`, `capacity`) over a power and cooling graph. Support is computed as a least fixpoint, so dependency cycles are safe. Overloaded suppliers shed the lowest-criticality load first, and every failed node gets a causal trace. Minimal cut sets come from MOCUS expansion up to order 3, cross-checked against brute-force enumeration in the tests.

### Tiger Data
Meter readings live in a TimescaleDB hypertable with an hourly continuous aggregate. The load profile Preflight plans against is the worst hourly average at each hour of the week over four weeks. Reconciliation correlates each meter's unexplained load with candidate consumers to catch equipment wired to a different supplier than documented.

### Vultr
DAMO runs on a Vultr server with Docker Compose: an API container and a web container behind the server's Caddy, which terminates HTTPS. The API image downloads promtool 3.2.1, amtool 0.28.1 and jq 1.7.1 from their release pages and verifies each against its published SHA-256 before installing it. That matters for the demo: on a laptop without those tools the Verify harness falls back to scripted results and says so, while the Vultr image has everything it needs to run the real checks. Secrets live in an env file on the server, never in the repository, and SQLite state, the meter snapshot and recorded model replies sit on named volumes so they survive redeploys.

### Stack
FastAPI backend, React + Vite + Tailwind frontend, NVIDIA Nemotron through build.nvidia.com's OpenAI-compatible API, with every live response cached so the demo replays offline and labels itself when it does. 168 backend tests, a 24-question agent eval, and a Playwright rehearsal that clicks through the demo and checks every number.

## Challenges we ran into

- **Keeping the model out of the alert path.** Rules, paging and work orders had to work with Nemotron switched off. The console has an online/offline toggle, and the alarm still fires and pages with it off.
- **Making the tests able to fail.** A harness that passes everything proves nothing, so the suite must reject a wrong-recipient mutant and an alert-everything decoy before its passes count.
- **Model IDs move.** A Nemotron model we built against was retired during the weekend and started returning HTTP 410. Model IDs are now configuration, and the UI shows which model and mode (live, cached, scripted) produced each answer.
- **Venue Wi-Fi blocked Tiger's port.** Every meter sync now writes a local snapshot, and the app starts from it when Tiger is unreachable.

## Accomplishments we're proud of

- The ATS-1 finding falls out of the records automatically: discovery reads the work order, an engineer confirms it, and every critical service drops from 2N to N on screen.
- Discovery holds 1.0 precision with 0.867–0.983 recall across 10 seeded sets of noisy records. Most misses are digit-swap typos that spell another real tag, which is the right way to fail.
- Every agent claim on screen carries its evidence: the tool call, the source line, or the test that checked it.

## What we learned

The useful job for an LLM in a data center isn't deciding anything. It's reading fifteen documents that disagree and producing proposals specific enough to check. Once every proposal carries a quote or a tool result, a few hundred lines of deterministic validation turn the model from a risk into the fastest reader on the team.

## What's next

- Run against a real site's exported point list and drawings instead of the synthetic hall.
- Call the retrofit backend live from the UI (today the setup screens replay a recorded run of it).
- Extend the harness from Nagios to BMS vendor alarm logic, so a firmware update is tested the same way a rule change is.

## Honest scope

The facility, records and load profiles are synthetic. Power and cooling are kW budgets on a graph: no CFD, hydraulics or electrical load flow. Passing the harness is evidence on the stated scenarios, not proof of equivalence, and nothing here replaces physical commissioning.

## Built with

`python` `fastapi` `typescript` `react` `vite` `tailwindcss` `nvidia-nemotron` `build.nvidia.com` `timescaledb` `tiger-data` `postgresql` `prometheus` `alertmanager` `nagios` `redfish` `playwright` `docker` `caddy` `vultr`

**Links:** GitHub: https://github.com/Manideep728/DAMO-HackUTD2026 · Screenshots: `docs/screenshots/`
