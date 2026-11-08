"""Compare old and new on identical scenarios, on five dimensions per case.

Expectations come from the old check's real behavior plus the operator's confirmed changes, never from
the candidate: recipient = owner-map receiver (decision d1); timing = not before the condition has held
for the old check's debounce, and not after the old check's notification; fan early warning (decision d6).
Held-out results are reduced to pass/fail before anything is returned to the agent.
"""
import time
from . import legacy, candidate, CANDIDATES
from .scenarios import SCENARIOS, OWNERS, ASSET

SEV_RULE = {"critical": "ThermalHealthCritical", "warning": "ThermalHealthWarning", "unknown": "ThermalFeedMissing"}
DIMS = ["missedExtra", "severity", "timing", "recipient", "recovery"]


def load(version):
    d = CANDIDATES / version
    return (d / "rules.yml").read_text(), (d / "alertmanager.yml").read_text()


def _onsets(timeline, pred):
    """Minutes where pred(state) becomes true after being false."""
    out, prev = [], False
    for t, s in enumerate(timeline):
        cur = pred(s)
        if cur and not prev:
            out.append(t)
        prev = cur
    return out


def _alerts(cand_timeline):
    """Turn firing minutes into problem/recovery notifications (first minute of each firing run, first minute after)."""
    notes = []
    for name, info in cand_timeline.items():
        mins = info["minutes"]
        for i, m in enumerate(mins):
            if i == 0 or mins[i - 1] != m - 1:
                notes.append({"t": m, "kind": "problem", "alert": name, "labels": info["labels"]})
            if i == len(mins) - 1 or mins[i + 1] != m + 1:
                notes.append({"t": m + 1, "kind": "recovery", "alert": name, "labels": info["labels"]})
    return sorted(notes, key=lambda n: n["t"])


def compare(sc, old, cand_timeline, routes_yaml, tag):
    debounce = old["config"]["retry_interval"] * (old["config"]["max_check_attempts"] - 1)
    res = {d: "pass" for d in DIMS}; notes = []
    cand = _alerts(cand_timeline)
    old_problems = [n for n in old["notifications"] if n["kind"] == "problem"]
    cand_problems = [n for n in cand if n["kind"] == "problem"]
    expected_rules = {SEV_RULE[n["severity"]] for n in old_problems}
    if sc.early_warning:
        expected_rules.add("FanStalledEarlyWarning")
    got_rules = {n["alert"] for n in cand_problems}
    missed, extra = expected_rules - got_rules, got_rules - expected_rules
    if missed or extra:
        res["missedExtra"] = "fail"
        if missed: notes.append(f"missed {', '.join(sorted(missed))}")
        if extra: notes.append(f"extra {', '.join(sorted(extra))}")
    want_sev = {"ThermalHealthCritical": "critical", "ThermalHealthWarning": "warning", "ThermalFeedMissing": "unknown", "FanStalledEarlyWarning": "warning"}
    for n in cand_problems:
        exp = want_sev.get(n["alert"])
        if exp and n["labels"].get("severity") != exp:
            res["severity"] = "fail"; notes.append(f"{n['alert']} labelled severity={n['labels'].get('severity')}, expected {exp}")
        if not exp and n["labels"].get("severity") == "critical":
            res["severity"] = "fail"; notes.append(f"{n['alert']} raised critical with no matching old state")
    # timing: each expected thermal alert must fire after the debounce and no later than the old notification
    for o in old_problems:
        rule = SEV_RULE[o["severity"]]
        state_pred = {"critical": lambda s: s == "Critical", "warning": lambda s: s == "Warning", "unknown": lambda s: s is None}[o["severity"]]
        onset = max([x for x in _onsets(sc.timeline, state_pred) if x <= o["t"]], default=0)
        fired = [n["t"] for n in cand_problems if n["alert"] == rule]
        if fired:
            first = min(fired, key=lambda t: abs(t - o["t"]))
            if first < onset + debounce:
                res["timing"] = "fail"; notes.append(f"{rule} at +{first - onset} min, before the {debounce} min debounce")
            elif first > o["t"] + 1:
                res["timing"] = "fail"; notes.append(f"{rule} {first - o['t']} min later than the old check")
    if sc.early_warning:
        fan_stop = next((t for t, v in enumerate(sc.fan_rpm) if v == 0), None)
        ew = [n["t"] for n in cand_problems if n["alert"] == "FanStalledEarlyWarning"]
        thermal = [n["t"] for n in old_problems]
        if ew and fan_stop is not None and ew[0] - fan_stop > 2:
            res["timing"] = "fail"; notes.append("early warning more than 2 min after the fan stopped")
        if ew and thermal:
            notes.append(f"early warning {thermal[0] - ew[0]} min before the old check paged")
    # recipient: every problem alert must route to the owner's receiver
    want = OWNERS[sc.owner]["receiver"]
    routed = {}
    for n in cand_problems:
        labels = {k: v for k, v in n["labels"].items()}
        labels.setdefault("owner", sc.owner); labels["alertname"] = n["alert"]
        key = (n["alert"], labels.get("severity"))
        if key not in routed:
            routed[key] = candidate.route(routes_yaml, labels, tag)
        if routed[key] != want:
            res["recipient"] = "fail"; notes.append(f"{n['alert']} routed to {routed[key]}, expected {want}")
    # recovery: if the old check sent a recovery, the candidate must resolve, no later than the old check
    old_rec = [n["t"] for n in old["notifications"] if n["kind"] == "recovery"]
    cand_rec = [n["t"] for n in cand if n["kind"] == "recovery" and n["alert"] in SEV_RULE.values()]
    if old_rec and not cand_rec:
        res["recovery"] = "fail"; notes.append("no resolved notice")
    elif old_rec and cand_rec and max(cand_rec) > max(old_rec) + 1:
        res["recovery"] = "fail"; notes.append("resolved later than the old check")
    return res, sorted(set(notes)), sorted({v for v in routed.values()})


def run(version="v1", rules=None, routes=None, include_mutants=True):
    """Run every scenario. Returns visible case details, held-out pass/fail only, and harness sanity checks."""
    t0 = time.time()
    if rules is None:
        rules, routes = load(version)
    tools = candidate.available()
    if not all(tools.values()):
        missing = [k for k, v in tools.items() if not v]
        raise RuntimeError(f"Missing tools: {', '.join(missing)}. Run scripts/get-tools.ps1.")
    ok, msg = candidate.check_rules(rules)
    if not ok:
        return {"version": version, "valid": False, "promtool_check": msg}
    cache, cases, held = {}, [], []
    for sc in SCENARIOS:
        old = legacy.simulate(sc, cache)
        tl = candidate.evaluate(sc, rules, tag=version)
        res, notes, receivers = compare(sc, old, tl, routes, version)
        row = {"id": sc.id, "name": sc.name, "scenario": sc.description, "result": res, "pass": all(v == "pass" for v in res.values())}
        if sc.held_out:
            held.append({"id": sc.id, "name": sc.name, "pass": row["pass"]})  # no details leave the harness
        else:
            row.update(notes=notes, receivers=receivers,
                       legacy=[f"{n['kind']} {n['severity']} at +{n['t']} min → {n['to']}" for n in old["notifications"]] or ["no notification"],
                       candidate=[f"{n['kind']} {n['alert']} at +{n['t']} min" for n in _alerts(tl)] or ["no alert"])
            cases.append(row)
    sanity = []
    if include_mutants:
        # The harness must reject a correct alert sent to the wrong team, and a candidate that alerts on everything.
        wrong_rules, wrong_routes = load("mutant-wrong-recipient")
        decoy_rules, decoy_routes = load("decoy-alert-everything")
        for label, (r, a) in {"Correct alert, wrong recipient": (wrong_rules, wrong_routes), "Alert on everything": (decoy_rules, decoy_routes)}.items():
            failed = []
            for sc in [s for s in SCENARIOS if not s.held_out]:
                tl = candidate.evaluate(sc, r, tag="mutant")
                res, _, _ = compare(sc, legacy.simulate(sc, cache), tl, a, "mutant")
                if not all(v == "pass" for v in res.values()):
                    failed.append(sc.name)
            sanity.append({"name": label, "rejected": bool(failed), "failed_cases": failed})
    plugin_runs = [{"bmc_health": k[0] or "no temperatures", "state": v[0], "output": v[1][:160], "ms": v[2], "how": v[3]} for k, v in cache.items()]
    return {"version": version, "valid": True, "promtool_check": msg, "cases": cases, "held_out": held, "sanity": sanity,
            "plugin": plugin_runs, "legacy_config": legacy.templates(), "legacy_recipient": legacy.recipient(),
            "asset": ASSET, "elapsed_s": round(time.time() - t0, 1)}


def visible_failures(report):
    """What the repair agent may see: visible case failures only, held-out as a count."""
    return {"failing_cases": [{"name": c["name"], "scenario": c["scenario"], "failed": [d for d, v in c["result"].items() if v == "fail"],
                               "notes": c["notes"], "old_check": c["legacy"], "candidate": c["candidate"]} for c in report["cases"] if not c["pass"]],
            "held_out_failing": sum(1 for h in report["held_out"] if not h["pass"])}
