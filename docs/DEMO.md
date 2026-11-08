# Preflight demo: Pump A and ATS-1

Two to three minutes. Everything below runs on the synthetic demo hall (43 nodes) shipped in `backend/app/preflight/data/demo.py`. The Modernize demo is in [modernize-demo.md](modernize-demo.md).

## Setup

```bash
make setup
cp backend/.env.example backend/.env    # NVIDIA_API_KEY, NEMOTRON_MODEL (a tool-calling model id from build.nvidia.com)
make dev                                # http://localhost:5173/#/preflight
```

Before each rehearsal, run `make rehearse`. It clicks through the script below in a browser against its own backend and checks every number the script quotes. If it fails, the app and this script disagree; fix whichever is wrong.

The agent badge says which mode is running:

| Badge | Meaning |
|---|---|
| model id (e.g. `nvidia/…`) | Live Nemotron tool calling |
| `scripted planner (no model)` | No key: a fixed planner calls the same tools and goes through the same answer checker |
| fallback notice in the tool log | The API failed mid-run and the scripted planner took over; the log says so |

Rehearse the *Ask* questions once with the key set. Every live turn is saved under `backend/cache/agent/`. If the venue Wi-Fi drops, set `GAUNTLET_MODE=cached` in `backend/.env` and restart: the same questions replay through the same tools and checker, and anything never recorded falls back to the scripted planner with a notice.

Meters (optional): with `METERS_DATABASE_URL` set and `make meters-seed` run once, the app pulls measured load and meter evidence from Tiger at startup. Check the line under **Find the safest window** before going on stage: "Load: measured … (synced …)". Venue Wi-Fi often blocks Tiger's port; sync once on a hotspot (`make meters-sync`) and the app runs from the local snapshot after that. `make rehearse` always runs with meters off, so it checks the hand-written-profile numbers below.

Between rehearsals, **Reset scenario** clears the toggles. Finding decisions live in SQLite (`backend/.work/preflight.sqlite`). Delete that file to reopen the ATS-1 finding.

## Script

1. **The claim (15 s).** Map open on *Whole site*. "Pump A and Pump B can each carry the whole chilled-water load. The one-line puts Pump A on MCC-A from ATS-1 and Pump B on MCC-B from ATS-2. On paper that's 2N."

2. **Rehearse the change (25 s).** Click **PUMP-A** on the map, then **Maintenance** in its card. (Hovering any equipment traces its supply chain.) *Impact*: nothing goes down. *Weak points*: during the window ATS-2, MCC-B and PUMP-B are single points of failure. "That's the expected cost of running on one pump. Fine for a few hours."

3. **The records disagree (40 s).** *Findings* tab, top item: **MCC-B is fed from ATS-1, not ATS-2 as documented**, confidence 0.97.
   - Supporting: CHG-2291, WO-4471 and MLOG-0212. Each quote is checked verbatim against its record.
   - Contradicting: OLD-001, the one-line.
   - Not counted, and why. WO-3920 describes a temporary cable that was later removed. WO-5108 proposes feeding PUMP-C, which was never installed.
   - *If true*: ATS-1 becomes a new single point of failure. All 8 racks in R1 and WL-INFER drop to N.
   - *With meters:* confidence is 0.99, and a fourth supporting line comes from the meters, not a document: "ATS-1 carries 16.7 kW more than its documented loads and ATS-2 is short by about as much; both gaps track MCC-B's meter (r = 0.96 and -0.97 over 14 days)." "Three records and the meters agree. The meter data is synthetic; the reconciliation is what runs on a real site's meters."

   *Optional (20 s), needs the key:* **Read with Nemotron**. Nemotron reads all 12 records and proposes feeds. The line under the button says how many it proposed, how many were kept, and how many were rejected because the quote isn't in the record or doesn't say that feed. Quotes it read are tagged on the finding. "The model reads; the checks decide what counts." Live numbers: ⟦⟧.

4. **Confirm it (20 s).** **Confirm**, with a name and a note. The edge goes into the graph and the decision into the audit log. *Weak points* with nothing in maintenance: **ATS-1**. "Enough capacity, no independence. Both pump panels hang off one transfer switch."

5. **What that costs (15 s).** Click **ATS-1**, then **Fail**: 18 racks and workloads, 400 kW, each with a "why it failed" trace back to ATS-1.

   *Optional (20 s), if time allows:* **Reset scenario**, then fail **UTIL-A** and **UTIL-B**. The steady-state numbers say nothing is lost, because the generators carry it. *First minutes after the failure* says otherwise. Chillers need 6 minutes to restart and racks ride through 4 without cooling, so 18 racks and workloads trip in between.

6. **Pick the window (40 s).** *Plan* tab: PUMP-A, 6 hours, hours 0–48 → **Find the safest window**. Recommended: **hour 6 to hour 12**, out of 61 options simulated. Every window lists a single point of failure, because with one pump out, the other pump's whole feed chain carries the plant. Switching MCC-B back doesn't help here, so the planner doesn't suggest it.

   Now the utility breaker test: UTIL-A, 6 hours → **Find the safest window**. Recommended: **hour 0–6 with MCC-B switched back to its documented feed** (ATS-2). The same hour without that switch is rejected, "cut-set order 1 vs 2", because ATS-1 and GEN-1 would be single points. "The finding turns into the first step of the work order."

   *With meters:* on a weekend the UTIL-A test moves to **hour 6–12** (still with MCC-B switched back). The meters show weekend batch training running at about 1.84× nameplate overnight, against 1.6× in the hand-written profile, and CRAH-3's headroom at hour 0–6 falls to 17%, under the planner's 20% bar. Hour 6–12 has 48%. Monday to Friday the measured load gives the same answer as the hand-written profile (hour 0–6). The Pump A answer (hour 6–12) is the same every day.

7. **Ask (30 s).** *Ask* tab: "Are Pump A and Pump B independent?" The tool log streams `get_neighbors` for each pump, then `find_cut_sets` and `search_docs`. The answer is "PUMP-A and PUMP-B share a single point of failure: ATS-1", and each claim cites the tool calls it came from. A claim that names a node or number not in those results gets the answer sent back to the model. (Asked before step 4, the agent finds the record evidence and calls `propose_dependency` instead.)

8. **Close (10 s).** "Before you take equipment offline, rehearse it. The model plans and explains. The simulator decides."

## Questions to expect

- **Where is Nemotron in this?** It chooses which simulations to run and writes the answer. It also reads the records (*Read with Nemotron*) and resolves equipment names the alias and typo rules can't place. Nothing it says reaches the screen unchecked. A claim it reads must quote the record word for word, and the rules' grammar must find that feed, in that direction, in the quote. Answers must cite tool results. A name it resolves counts only if the node exists and the phrase carries that node's suffix ("b" for MCC-B), and the quote must be verbatim.
- **Isn't capacity math enough?** Step 4 is the counterexample. Capacity says 2N. Cut sets say one switch takes out both pumps.
- **Where does the graph come from?** **Import** on the preflight page takes the same CSV or JSON that **Export** writes. In production that would be a DCIM export.
- **How accurate is the model?** It's a kW budget on a dependency graph. No CFD, no load flow, no protection coordination. The banner on every screen says that.
- **How do you know the cut sets are right?** On graphs up to 40 nodes, tests check the MOCUS expansion against brute-force enumeration. The simulator also re-checks every candidate.
