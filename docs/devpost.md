# The Gauntlet: Devpost submission draft

> Fill every ⟦…⟧ from a live run before submitting, and delete any line you could not demo. Every other number here comes from the repo, and the command that reproduces it is next to it.

**Tagline:** Rehearse a data center change before you make it.

## Inspiration

Before taking a pump offline, a facilities engineer checks capacity. Can the remaining pump carry the load? Usually it can, and the work goes ahead.

That check misses a shared upstream dependency. In our demo hall, Pump A and Pump B can each carry the full chilled-water load, and the one-line diagram puts them on separate power paths. A 2023 work order, a maintenance log and a change ticket say otherwise: MCC-B was re-fed from ATS-1 during an ATS-2 replacement and never moved back. Both pump panels now sit behind one transfer switch. On paper the cooling plant is 2N. In practice it's N, and ATS-1 is the single point of failure.

That kind of drift lives in records nobody re-reads before a change. We built a preflight check that reads them.

## What it does

The Gauntlet answers three questions about a proposed change: what fails, what's affected, and what's the safest way to do it.

- **Simulate.** Click equipment on the dependency map to put it in maintenance or fail it. The simulator propagates power and cooling, sheds the least critical load first when a supplier is overloaded, and gives every failed rack a causal trace.
- **Weak points.** Minimal cut sets up to order 3: the smallest combinations of failures that take down a critical service. During a maintenance window it shows which sets shrink. For each service it reports redundancy two ways, by capacity (2N, N+1, N) and by independence (how many failures it takes to lose every supplier), and the effective level is the lower of the two.
- **Findings.** Discovery reads work orders, logs, change tickets and the one-line text. It resolves names like "transfer sw 1" or "pump mcc b" to inventory ids, extracts "X is fed from Y" claims with exact quotes, and compares them with the documented graph. Each finding says whether it confirms, contradicts or adds an edge, how confident it is, and what changes if it's true. An engineer confirms or rejects it, and the decision goes to an audit log.
- **Plan.** Give it equipment, a duration and a range of hours. It simulates every start hour, ranks the windows on critical loss, shed load, cut-set order, single points and headroom, and tries mitigations: shedding flexible GPU load, temporary cooling, postponing overlapping work, and switching equipment the records moved back to its documented feed. Every rejected window says where it loses to the recommended one. After the ATS-1 finding is confirmed, the 6-hour utility test is recommended at hour 0–6 with MCC-B switched back to ATS-2 first; without that switch the same hour has ATS-1 and GEN-1 as single points.
- **Ask.** A Nemotron agent answers questions like "When is the safest time to take CRAH-3 offline for 4 hours?" by calling the simulator's tools and explaining the results.

In the demo, confirming the ATS-1 finding drops all 8 racks in R1, plus the inference workload, from 2N or N+1 to N. Failing ATS-1 then takes down 18 racks and workloads, 400 kW. The planner recommends hour 6 to hour 12 for six hours of Pump A work, out of 52 options it simulated.

## How we built it

**The simulator decides; the model never does.** Every number on screen comes from `backend/engine/`, a pure Python package with no web framework and no LLM. A CI grep check fails the build if a demo node id appears in it.

**Propagation.** Each node has requirement groups: `all`, `any`, `k_of_n` and `capacity`. Support is computed as a least fixpoint from the sources, so a loop with no outside source never powers itself. Capacity runs after support: an overloaded supplier sheds its lowest-criticality end loads, and demand splits across live suppliers in proportion to capacity, or first-available for transfer switches.

**Cut sets.** Each critical service becomes a fault tree:

- `all` becomes an OR gate.
- `any` becomes an AND gate.
- `k_of_n` becomes an (n−k+1)-of-n vote.
- `capacity` becomes the minimal supplier sets that can no longer carry the baseline load.

MOCUS expands the tree, and the simulator re-checks every candidate. On graphs up to 40 nodes, tests check the result against brute-force enumeration. Order 3 on a 307-node generated facility takes 1.96–1.99 s across 3 runs on an M1, which is the perf test in `tests/preflight/test_fuzz_perf_guard.py`.

**Discovery.** Names resolve in three steps:

1. Aliases built from ids, labels and type words.
2. A typo-tolerant match: one edit away from a single node's alias, with the last character and every digit exact.
3. Nemotron, for phrases nothing else could place. Its answer counts only if the node exists and the phrase contains that node's suffix.

**Read with Nemotron** has the model read every record and propose feeds. A proposal counts only if three checks pass: the quote is in the record word for word; the rules' grammar finds that feed in the quote, in that direction; and the same temporary/proposed check passes. An adversarial test pins real sentences on random pairs across 10 seeds, and the demo findings don't change. Live numbers: ⟦proposed / kept / rejected⟧.

Every quote must appear verbatim in the cited record. Sentences describing temporary, proposed or uninstalled connections are set aside with a reason. On 10 seeded sets of messy generated records, precision is 1.0 on every set, and recall has a mean of 0.943 (lowest 0.867).

**Agent.** Nemotron runs over NVIDIA's OpenAI-compatible API with native tool calling: `simulate`, `find_cut_sets`, `evaluate_plan`, `search_plans`, `search_docs`, `get_node`, `get_neighbors` and `propose_dependency`. The final answer is structured, with a recommendation, rejected alternatives, risks and assumptions, and each claim cites tool-call ids. A checker rejects any answer that names a node or number missing from the results it cites, and sends the rejection back to the model. Questions about CFD, load flow or anything outside the facility get a refusal.

**Product.** FastAPI with server-sent events, SQLite for decisions and the audit log, and React with @xyflow/react for the map. A banner on every screen says what the model doesn't cover.

## Challenges we ran into

- **Shedding the wrong thing.** The first capacity pass shed a whole PDU when one rack would do. A property test caught it: failing more equipment must never raise supply or remaining capacity. Shedding now picks end loads only.
- **Modality leaks.** "Briefly powered from ATS-1 on a temporary cable. Temporary cable removed the same day." The "removed" is in the next sentence. Applying it to the whole document threw away real claims, so modality now covers the claim's sentence and the one after it.
- **An eval that couldn't fail.** If the Nemotron call errored, the agent fell back to the scripted planner, and the eval counted that as a pass. It also graded against the scripted planner's exact wording. Grading now checks the engine's numbers and node ids, and a fallback counts as a failure.
- **Rejections that didn't explain anything.** The planner listed hour 9 as rejected for the same single point of failure the recommended hour 6 had. Rejected plans now name the first criterion they lose on, and single points became a ranking criterion. On the documented graph, that's how the GEN-2 overlap at hours 32–38 ranks lower.
- **Typos that are other real tags.** "PDU21B" written for PDU-12B is one transposition away and also a valid tag. No matcher can tell, so those records stay missed. That's most of the remaining recall gap.
- **CI time.** Order-3 cut sets took 8.1 s on the CI runner. Compiling each node's supplier lists once and shedding in a single round brought it to about 2 s.

## Accomplishments that we're proud of

- **The headline is a computed result.** The ATS-1 single point comes from three verbatim quotes and a re-run of the cut sets. Nothing in the engine knows about it.
- **Live Nemotron eval:** ⟦N⟧/⟦72⟧ passes across 3 runs of 24 questions with ⟦model id⟧. Expected answers are computed by the engine at test time. Reproduce with `cd backend && .venv/bin/python -m tests.preflight.eval.run_live --runs 3`.
- **97 tests** covering:
  - each requirement mode
  - monotonicity and determinism properties
  - a golden demo
  - fuzzing on generated facilities
  - the perf bound
  - discovery precision and recall
  - the API
  - the agent eval in scripted mode
  - a check that random model answers can't change the demo findings
- **Fails closed.** No key, a rate limit or a dropped connection falls back to a labeled scripted planner using the same tools and the same checker. Nothing that ran scripted is presented as live.

## What we learned

The difference between capacity and redundancy is one shared node, and a capacity check by design doesn't look for it. You have to ask what has to fail together. The model does best when it picks which questions to ask the simulator, and does worse when it tries to answer them itself.

## What's next

- **Real inventories.** Import already reads CSV or JSON. Next is a DCIM export adapter, and checking discovery against a real work-order archive.
- **Better physics where it changes decisions.** Busbar and hydraulic splits instead of proportional sharing, and failure rates on cut sets so likely failures rank above unlikely ones.
- **Change tickets as input.** Run preflight automatically when a change ticket names equipment, and attach the result to the ticket.

## Also in the repo

**Modernize and Operate**, the team's earlier track work, is still in the app. It retires an inherited Nagios check by proof: the real Texas Tech HPCC plugin runs against a Redfish mock, Prometheus rules are tested with `promtool` and `amtool`, and a held-out suite rejects a wrong-recipient mutant and an alert-everything decoy. See `docs/modernize-demo.md`.

## Built With

nvidia-nemotron · python · fastapi · sqlite · react · typescript · vite · tailwindcss · xyflow · github-actions

## Try it out

- GitHub: https://github.com/Manideep728/DAMO-HackUTD2026
- Demo video: ⟦link⟧
- Setup and the demo script: `docs/DEMO.md`
