# Damo — Devpost submission draft

> Fill every ⟦…⟧ from the live run before submitting. Delete anything you could not demo. Every other number below is checked against the repo.

**Tagline:** Retire the monitoring you inherited, without missing a page.

## Inspiration

Data center paging still runs on static checks that nobody on today's team wrote. We pulled a real one: the public Texas Tech HPCC Nagios–Redfish temperature check. Every alert it raises goes to `nagios@localhost`. Its config calls eight scripts that do not exist. It never compares a temperature to a limit; it trusts whatever the BMC says.

Teams can't retire checks like this, because nobody can prove what they actually do. Meanwhile, facilities are retrofitting liquid-cooled AI racks onto exactly this kind of monitoring. A missed page can be a leak.

So Damo does what an engineer would do with an inherited check, and proves every step. It reads the old check, recovers its intent, writes the replacement, and tests the whole alert path. Then it runs operations on the result: alerts, investigation and shift handoff.

## What it does

**Modernize (five steps, a human approves each gate).**
1. **Import** pins the real TTU repo (commit `d55eadf`, BSD-3, byte-for-byte). Gap analysis is computed from the files, not typed in: 8 referenced scripts missing, an undefined `check-host-alive` command, undefined email macros, no request timeout, and `root:redfish` hardcoded in every plugin.
2. **Recover** sends a Nemotron agent to read the plugin and templates. It then runs the unmodified plugin against a simulated BMC for OK, Warning, Critical, missing and unreachable, to confirm each behavior by execution. Every behavior carries its source. Policy choices go to the operator; "who should actually be paged?" blocks acceptance until it is answered.
3. **Generate** produces Prometheus rules, Alertmanager routing and a collector config, listing what is preserved and what is intentionally changed.
4. **Test** runs old and new on identical scenarios: normal, sustained Critical, brief spike, missing feed, recovery, and a fan failure. It compares missed or extra alerts, severity, timing, recipient and recovery. Three held-out cases stay sealed from the agent. A wrong-recipient mutant and an alert-everything decoy must fail, so passing actually means something.
5. **Repair and release:** Nemotron reads only the visible failures, rewrites the candidate and reruns the suite. Then an engineer reviews the diff, the change runs in shadow beside the old check, rollback is tested, and the operations lead releases a versioned update.

**Operate.** Alerting and delivery never call the model. Released rules evaluate telemetry with stable asset IDs and freshness; missing data is never shown as healthy. Pages route by the owner map, a failed receiver falls back, and duplicate events reuse the same work order. Technician notes are append-only, so a correction never overwrites the original. Recovery needs a fresh, executed plugin reading; closing the ticket alone does not close the incident. The incoming shift explicitly accepts the handoff. When an incident needs investigating, a Nemotron agent queries telemetry, the asset map, the logbook and the runbook, and returns cited hypotheses. It says "verify" when evidence conflicts. It cannot assign owners, approve itself or touch infrastructure.

**One step ahead.** The old check pages only after the BMC flips to thermal Critical. Damo adds an operator-approved fan-stall early warning. In our fan-failure scenario, it fires **8 minutes before the old check pages**.

## How we built it

**Old side, real.** The vendored `check_temperature.sh` runs unmodified under bash against an HTTPS Redfish mock that serves the DMTF Chassis/Thermal and Manager shapes the plugin reads. A Nagios soft/hard scheduler reproduces the service's behavior using values parsed from the real `templates.cfg`: 4 attempts, 1-minute retry, 5-minute check interval and 60-minute re-notify. The recipient is parsed from `contacts.cfg`.

**New side, real.** `promtool test rules` evaluates the candidate minute by minute. promtool only reports pass or fail, so we assert "no alerts" at every minute and parse its `got:` report back into the candidate's actual firing timeline. `amtool config routes test` resolves who would actually be paged.

**Expectations the agent can't touch.** Expected behavior comes from the old check's real notifications plus the operator's recorded decisions, never from the candidate. Held-out results leave the harness as pass/fail only.

**Agents.** Nemotron Super (recover, repair) and Nemotron Nano (investigate) run through NVIDIA's API with native tool calling, plus a JSON-action fallback when an endpoint lacks tool support. Their tools include `read_file`, `run_plugin`, `record_behavior`, `ask_operator`, `write_candidate`, `run_tests`, `query_telemetry`, `lookup_asset`, `read_logbook` and `search_runbook`. The backend executes every call, and the UI streams each one with model and tool timings. Clean live runs are saved and replayed, labelled "cached", if the venue Wi-Fi drops.

**Product.** React 19, Vite, Tailwind 4 and strict TypeScript on the front end; FastAPI with server-sent events on the back. Every screen shows a status strip saying exactly which parts are live and which are scripted.

## Challenges we ran into

- **Prometheus never forgets fast enough.** With a 5-minute staleness lookback, a lost temperature feed kept the last "healthy" value alive for five minutes. We model feed loss as an explicit `scrape_success == 0` signal instead, which matches the old plugin's UNKNOWN.
- **Fair timing is subtle.** The old check samples every 5 minutes, so a 2-minute spike is invisible to it. Requiring the new rules to page at the same instant would reward copying bugs. The rule we settled on: never before the old check's 3-minute debounce, and never after the old check paged.
- **Our own harness lied once.** Recovery reported "verified" from *modelled* plugin runs on a machine without `jq`. Now a modelled run can never verify recovery.
- **Config that looked like config.** The `.env.example` placeholder key counted as "configured", and blank model IDs overrode the defaults. The result was a 400 ("model field is required") that looked like a Nemotron outage. Keys are now validated by format, and blanks fall back to defaults.
- **A cached run that wasn't.** A failed agent attempt got saved as a "recorded live run". Now only completed, error-free runs can ever be replayed.
- **Line endings break legacy bash.** Git on Windows would have rewritten the vendored plugin to CRLF. `.gitattributes` keeps it byte-for-byte.
- **Gap analysis cried wolf.** The first pass flagged 15 stock Monitoring Plugins and four sibling TTU scripts as "missing". We now classify them separately, leaving 8 genuinely absent scripts.
- **No WSL, no Linux.** The plugin hardcodes HTTPS, so the mock BMC generates a self-signed certificate and the plugin runs through Git Bash.

## Accomplishments that we're proud of

- **The proof has teeth.** Candidate v1 fails ⟦5 of 6⟧ visible cases and ⟦0 of 3⟧ held-out. After Nemotron's repair, v2 passes ⟦6 of 6⟧ and ⟦3 of 3⟧, and the mutant and decoy are rejected, all on ⟦real promtool, amtool and plugin executions⟧ in ⟦N⟧ seconds.
- **Nemotron does real work.** In a live run it made ⟦N⟧ tool calls, executed the plugin ⟦N⟧ times, and repaired its own failing candidate in ⟦N⟧ rounds against expectations it could not see or change.
- **8 minutes ahead** of the old check in the fan-failure scenario, with the warning routed to the right owner.
- **Alerts survive a model outage.** Take Nemotron offline and pages still fire, fall back and open exactly one work order.
- **Honest by construction.** Gaps come from the files, and recovery needs executed evidence. Scripted fallbacks are labelled on screen, and we say "bounded evidence on these scenarios, not equivalence".

## What we learned

The model is most useful when it is never the judge. Nemotron is good at reading unfamiliar code, proposing changes and explaining failures. promtool, amtool and the real plugin decide whether it was right.

## What's next for Damo

- **Liquid-cooling retrofits.** The same engine, pointed at a coolant unit's point list. The first target is a leak alarm that works locally but never reaches central monitoring, plus change verification after firmware or ownership updates.
- **Real integrations.** BACnet and Modbus adapters, verified against pinned manufacturer documentation, with the BMS or DCIM as the system of record.
- **Measured pilots.** Engineering time and missed-alarm rates measured with a commissioning team before we claim any improvement.

## Built With

nvidia-nemotron · python · fastapi · react · typescript · vite · tailwindcss · prometheus · promtool · alertmanager · nagios · redfish · bash · jq · openssl

## Try it out

- GitHub: https://github.com/Manideep728/DAMO-HackUTD2026
- Demo video: ⟦link⟧
- Setup and the 3-minute demo script: `Meria/DEMO.md`
