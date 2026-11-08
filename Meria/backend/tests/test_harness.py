"""Unit test for the comparison logic, with a tiny stand-in for promtool/amtool covering only our four rule shapes.

The real harness always uses promtool and amtool; this stub exists so the expectations can be tested on machines
without them. Run: python -m tests.test_harness
"""
import re, yaml
from app.ttu import harness, candidate, legacy
from app.ttu.scenarios import SCENARIOS

LOOKBACK = 5  # Prometheus staleness lookback, minutes


def fake_evaluate(sc, rules_yaml, tag="x"):
    out = {}
    last_health, last_seen = 0, -99
    health = []
    for t, h in enumerate(sc.timeline):
        if h is not None:
            last_health, last_seen = {"OK": 0, "Warning": 1, "Critical": 2}[h], t
        health.append(last_health if t - last_seen < LOOKBACK else None)
    fans = sc.fan_rpm or [9400] * len(sc.timeline)
    for g in yaml.safe_load(rules_yaml)["groups"]:
        for r in g["rules"]:
            e, hold = r["expr"], int(re.match(r"(\d+)m", str(r.get("for", "0m"))).group(1))
            def cond(t):
                if "redfish_thermal_health" in e:
                    want = int(e.strip()[-1]); return health[t] == want
                if "scrape_success == 0" in e: return sc.timeline[t] is None
                if "scrape_success >= 0" in e: return True
                if "fan_rpm" in e: return fans[t] == 0
                raise ValueError(e)
            run, mins = 0, []
            for t in range(len(sc.timeline)):
                run = run + 1 if cond(t) else 0
                if run and run - 1 >= hold: mins.append(t)
            if mins:
                out[r["alert"]] = {"minutes": mins, "labels": {"alertname": r["alert"], "asset_id": "hpc-c2", "owner": sc.owner, "severity": r["labels"]["severity"]}}
    return out


def fake_route(routes_yaml, labels, tag="x"):
    doc = yaml.safe_load(routes_yaml)["route"]
    for sub in doc.get("routes", []):
        k, v = re.match(r'(\w+)="([^"]*)"', sub["matchers"][0]).groups()
        if labels.get(k) == v: return sub["receiver"]
    return doc["receiver"]


candidate.evaluate, candidate.route = fake_evaluate, fake_route
candidate.available = lambda: {"promtool": True, "amtool": True}
candidate.check_rules = lambda r: (True, "stub")

for v in ("v1", "v2"):
    rep = harness.run(v)
    print(f"\n== {v}: {sum(c['pass'] for c in rep['cases'])}/{len(rep['cases'])} visible, {sum(h['pass'] for h in rep['held_out'])}/{len(rep['held_out'])} held-out")
    for c in rep["cases"]:
        print(f"  {'PASS' if c['pass'] else 'FAIL'} {c['name']:24} {[d for d, x in c['result'].items() if x == 'fail']} {c['notes']}")
    for h in rep["held_out"]:
        print(f"  {'PASS' if h['pass'] else 'FAIL'} [held-out] {h['name']}")
    for s in rep["sanity"]:
        print(f"  sanity: {s['name']} rejected={s['rejected']} ({len(s['failed_cases'])} cases)")

v2 = harness.run("v2")
assert all(c["pass"] for c in v2["cases"]) and all(h["pass"] for h in v2["held_out"]), "v2 must pass"
assert all(s["rejected"] for s in v2["sanity"]), "mutant and decoy must be rejected"
v1 = harness.run("v1")
assert not all(c["pass"] for c in v1["cases"]), "v1 must fail"
print("\nOK: v1 fails, v2 passes, mutant and decoy rejected")
