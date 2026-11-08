"""Evaluation on SYNTHETIC scenarios with known truth: threshold-only baseline vs Damo, plus seeded defects on the
unseen second site. Run `python -m app.retrofit.evaluate` to print the markdown table in docs/retrofit-eval.md.

Monitoring arms:
- threshold: what a typical BMS ships with. CDU fault state, supply temperature above the limit, GPU temperature
  above 90 °C. No job signal, no freshness rule (a stale value holds), alarms clear when the reading clears, and
  no evidence packet: a handoff is assembled by hand.
- damo: `monitor.evaluate` (functional low-flow rule on fresh data, scope from the accepted package, two owners,
  closure on both recoveries).
- A third arm (a general model with the same sources and tools) was scoped out and is listed as not run.
"""

from __future__ import annotations

import json
from typing import Any

from . import SITES, monitor
from .decisions import Store
from .workflow import Retrofit

SCENARIOS = [
    {"id": "lowflow", "label": "Low flow, CDU running", "truth": "incident on R3-01, R3-02; resolves at window end"},
    {"id": "partial", "label": "Cooling recovers, job stays slow", "truth": "incident; workload side unresolved"},
    {"id": "colo", "label": "Low flow, no workload data", "truth": "incident on R3-01, R3-02; facility side only"},
    {"id": "stale", "label": "CDU feed lost, readings normal", "truth": "no failure; missing visibility only"},
    {"id": "healthy", "label": "Checkpoint dip, cooling normal", "truth": "no incident"},
]
TRUTH_INCIDENT = {"lowflow": True, "partial": True, "colo": True, "stale": False, "healthy": False}
ARMS: list[dict[str, Any]] = [
    {"id": "threshold", "label": "Threshold-only baseline", "run": True},
    {"id": "damo", "label": "Damo (rules + verified map)", "run": True},
    {"id": "llm", "label": "General model + same tools", "run": False, "why": "scoped out for this build"},
]
GPU_LIMIT = 90.0


def _threshold(run: dict[str, Any]) -> dict[str, Any]:
    mins = run["minutes"]
    ctx = run["context"]
    hi = ctx["limits"]["secondary_supply_c"][1]
    last: dict[str, Any] = {}
    alarm_at, cleared_at, racks = None, None, set()
    for m in mins:
        cdu = m["cdu"]
        vals = cdu if cdu["quality"] == "good" else last  # no freshness rule: the last value holds
        last = vals or last
        hot_racks = {r for r in ctx["racks"] if m["racks"][r]["gpu_c"] > GPU_LIMIT}
        firing = bool(vals) and (vals.get("state") == "fault" or (vals.get("supply_c") or 0) > hi) or bool(hot_racks)
        if firing and alarm_at is None:
            alarm_at = m["t"]
            racks = hot_racks or {ctx["cdu"]}
        if alarm_at is not None and cleared_at is None and not firing:
            cleared_at = m["t"]
    return {"alarm_at": alarm_at, "cleared_at": cleared_at, "racks": racks}


def score(run: dict[str, Any], arm: str) -> dict[str, Any]:
    v = run["variant"]
    truth = TRUTH_INCIDENT[v]
    racks = set(run["context"]["racks"])
    if arm == "threshold":
        t = _threshold(run)
        raised = t["alarm_at"] is not None
        job_back = run["incident"] and run["incident"]["owners"][-1]["recovered_at"]
        false_rec = int(
            raised
            and truth
            and t["cleared_at"] is not None
            and (v == "partial" or (job_back is not None and t["cleared_at"] < job_back))
        )
        return {
            "scenario": v,
            "arm": arm,
            "affected_racks_correct": (t["racks"] == racks) if raised and truth else None,
            "missed": int(truth and not raised),
            "unnecessary": int(raised and not truth),
            "handoff_min": None,
            "false_recovery": false_rec,
            "note": f"alarm {monitor.clock(t['alarm_at'])}"
            + (f", cleared {monitor.clock(t['cleared_at'])}" if t["cleared_at"] is not None else "")
            if raised
            else "no alarm",
        }
    inc = run["incident"] if run["kind"] == "incident" else None
    first_low = inc["first_below_min"] if inc else None
    return {
        "scenario": v,
        "arm": arm,
        "affected_racks_correct": set(inc["scope_racks"]) == racks if inc else None,
        "missed": int(truth and inc is None),
        "unnecessary": int(inc is not None and not truth),
        "handoff_min": (inc["opened_at"] - first_low) if inc and first_low is not None else None,
        "false_recovery": 0,
        "note": (
            f"opened {monitor.clock(inc['opened_at'])}, {inc['status_at_end']}"
            if inc
            else run.get("note") or (run["incident"] or {}).get("title", "no incident")
        ),
    }


def modernization(flow: Retrofit) -> dict[str, Any]:
    """Run the pipeline on h2 cold (with h1's saved regression) and score its findings against the answer key."""
    report = flow.test("h2", "original")
    failing = {c["id"]: c for c in report["cases"] if not c["pass"]}
    flags = flow.flag("h2")["flags"]
    found = {
        "leak_location": [f"zone {f['zone']} → {f['mapped_location']}, drawing {f['drawing_location']}" for f in flags],
        "loop_swap": ["loops"] if "loops" in failing else [],
        "running_as_available": ["running-vs-available"] if "running-vs-available" in failing else [],
    }
    key = json.loads((SITES / "h2" / "_answer_key.json").read_text())["defects"]  # scorer only
    defects = [{**d, "found": bool(found.get(d["kind"])), "by": ", ".join(found.get(d["kind"], []))} for d in key]
    explained = {d["kind"] for d in key}
    false_pos = [k for k, v in found.items() if v and k not in explained]
    actions = len(flags) + 1  # one decision per mismatched cable, plus approving the change
    return {
        "site": "h2",
        "defects": defects,
        "false_positives": false_pos,
        "engineer_actions": actions,
        "failing_cases": sorted(failing),
        "estimate": {
            "manual_min": 45 * len(key),
            "assisted_min": 5 * actions,
            "label": "estimate, not measured: 45 min per defect by hand, 5 min per review action",
        },
    }


def run() -> dict[str, Any]:
    flow = Retrofit(Store(":memory:"))
    d = flow.decide("h1", 2, "confirmed", "J. Chen")
    flow.propose("h1")
    flow.save_regression("h1", d["id"], "J. Chen")
    flow.accept("h1", "Maya R.")
    ctx = monitor.context(flow)
    rows = [score(monitor.evaluate(s["id"], ctx), a["id"]) for s in SCENARIOS for a in ARMS if a["run"]]
    return {
        "monitoring": {"rows": rows, "arms": ARMS, "scenarios": SCENARIOS},
        "modernization": modernization(flow),
        "synthetic": True,
    }


def markdown(ev: dict[str, Any]) -> str:
    m = ev["monitoring"]
    label = {s["id"]: s["label"] for s in m["scenarios"]}
    arm = {a["id"]: a["label"] for a in m["arms"]}
    out = [
        "| Scenario | Arm | Right racks | Missed | Unneeded escalations | Evidence-backed handoff | False recovery |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in m["rows"]:
        rk = "—" if r["affected_racks_correct"] is None else "yes" if r["affected_racks_correct"] else "no"
        ho = "none" if r["handoff_min"] is None else f"{r['handoff_min']} min after flow < min"
        out.append(
            f"| {label[r['scenario']]} | {arm[r['arm']]} | {rk} | {r['missed']} | {r['unnecessary']} | {ho} | "
            f"{r['false_recovery']} |"
        )
    mo = ev["modernization"]
    out += [
        "",
        f"Second site ({mo['site']}): "
        + "; ".join(f"{d['id']} {d['kind']} {'found' if d['found'] else 'missed'}" for d in mo["defects"])
        + f"; false positives {len(mo['false_positives'])}; engineer actions {mo['engineer_actions']}; "
        f"{mo['estimate']['manual_min']} vs {mo['estimate']['assisted_min']} min ({mo['estimate']['label']}).",
    ]
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    print(markdown(run()))
