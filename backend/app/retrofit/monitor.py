"""Low-flow monitoring incident on the liquid row (SYNTHETIC telemetry, deterministic rules, no model).

The point it proves: a CDU that reports "running" is not proof of adequate flow. The secondary strainer clogs,
flow falls, coolant warms, GPUs throttle and the training job slows while every heartbeat stays healthy. Rules run
on fresh data only; the affected racks come from the accepted retrofit package's equipment map, not from code.

Variants: `lowflow` (the incident), `stale` (CDU feed lost, independent readings normal: missing visibility, no
invented failure), `partial` (cooling recovers, the job stays slow), `colo` (no workload data: facility-only view),
`healthy` (a declared checkpoint dip with normal cooling: no incident).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .workflow import Retrofit

VARIANTS = ("lowflow", "stale", "partial", "colo", "healthy")
MINUTES = 90
HOLD_MIN = 3  # a rule fires after its condition holds for 3 consecutive fresh minutes
BASELINE_STEPS = 1000.0
SLOW_FRACTION = 0.85
COMPARISON_RACK = "R1-05"
TITLES = {
    "lowflow": "Low flow while the CDU reports running",
    "stale": "CDU telemetry lost, independent readings normal",
    "partial": "Cooling recovers, the job stays slow",
    "colo": "Low flow, colocation view (no workload data)",
    "healthy": "Checkpoint dip with normal cooling",
}


def clock(t: int) -> str:
    return f"{2 + t // 60:02d}:{t % 60:02d}"


def _wobble(seed: int, t: int) -> float:
    return math.sin(seed * 12.9898 + t * 0.7) * 0.5 + math.sin(seed * 3.1 + t * 0.23) * 0.3


def _flow(variant: str, t: int) -> float:
    if variant in ("stale", "healthy"):
        return 240.0
    if t < 10:
        flow = 240.0
    elif t < 40:
        flow = 240.0 - 3.0 * (t - 10)
    else:
        flow = 150.0
    if t >= 52:  # Facilities clears the strainer at 02:52; flow is back by 02:56
        flow = min(240.0, 150.0 + 22.5 * (t - 52))
    return flow


@dataclass
class Minute:
    t: int
    clock: str
    cdu: dict[str, Any]
    racks: dict[str, dict[str, float]]
    job: dict[str, Any] | None


def series(variant: str, racks: list[str]) -> list[Minute]:
    if variant not in VARIANTS:
        raise KeyError(f"unknown variant {variant}")
    out = []
    for t in range(MINUTES):
        flow = _flow(variant, t) + _wobble(1, t) * 0.8
        supply = 32.0 + 6.0 * max(0.0, (230.0 - flow) / 80.0) + _wobble(2, t) * 0.1
        if t >= 53 and variant in ("lowflow", "partial", "colo"):  # coolant cools down a few minutes behind flow
            supply = max(32.0 + _wobble(2, t) * 0.1, 38.0 - 1.5 * (t - 53))
        ret = supply + 8.0 * 240.0 / max(flow, 1.0)
        stale = variant == "stale" and t >= 20
        cdu = {
            "state": None if stale else "running",
            "flow_lpm": None if stale else round(flow, 1),
            "supply_c": None if stale else round(supply, 1),
            "return_c": None if stale else round(ret, 1),
            "quality": "stale" if stale else "good",
            "source_ts": clock(19 if stale else t) + ":00",
            "received_ts": clock(t) + ":02",
        }
        gpu = 62.0 + (supply - 32.0) * 3.5
        throttle = min(40.0, max(0.0, (gpu - 78.0) * 8.0))
        rack_rows = {
            r: {
                "gpu_c": round(gpu + _wobble(5 + i, t) * 0.6, 1),
                "throttle_pct": round(throttle, 0),
                "inlet_c": round(23.0 + _wobble(9 + i, t) * 0.3, 1),
            }
            for i, r in enumerate(racks)
        }
        rack_rows[COMPARISON_RACK] = {
            "gpu_c": round(60.0 + _wobble(20, t) * 0.6, 1),
            "throttle_pct": 0.0,
            "inlet_c": round(22.6 + _wobble(21, t) * 0.3, 1),
        }
        phase = "checkpoint" if variant == "healthy" and 30 <= t < 34 else "train"
        steps = BASELINE_STEPS * (1 - throttle / 100 * 0.8)
        if variant == "partial" and t >= 40:
            steps = min(steps, 760.0)  # GPU clocks stay pinned low after the throttling episode
        if phase == "checkpoint":
            steps = 300.0
        steps += _wobble(3, t) * 8
        job = (
            None
            if variant == "colo"
            else {"steps_per_s": round(steps, 0), "baseline": BASELINE_STEPS, "phase": phase, "heartbeat_ok": True}
        )
        out.append(Minute(t, clock(t), cdu, rack_rows, job))
    return out


def held(minutes: list[Minute], pred: Any, hold: int = HOLD_MIN) -> int | None:
    """First minute at which pred has held for `hold` consecutive minutes."""
    run = 0
    for m in minutes:
        run = run + 1 if pred(m) else 0
        if run >= hold:
            return m.t
    return None


def low_flow_while_running(state: str | None, flow: float | None, quality: str, min_flow: float) -> bool:
    """The functional rule: running is not adequate flow. Fresh data only; stale data never fires it."""
    return quality == "good" and state == "running" and flow is not None and flow < min_flow


def recovered_at(minutes: list[Minute], pred: Any, after: int, window: int) -> int | None:
    return held([m for m in minutes if m.t > after], pred, window)


def context(flow: Retrofit, site: str = "h1") -> dict[str, Any]:
    """Incident context from the accepted retrofit package: equipment map, owners, limits, runbook."""
    pkg = flow.store.package(site)
    emap = flow.equipment_map(site)
    s = flow.site(site)
    runbook = s.requirements_text.split("## Runbook RB-LC-2: low secondary flow", 1)[1].split("```", 1)[0]
    steps = [ln.split(". ", 1)[1].strip() for ln in runbook.splitlines() if ln[:2].rstrip(".").isdigit()]
    lead = next((r for r in reversed(s.logbook) if "strainer" in r["note"].lower()), None)
    return {
        "from": f"accepted package v{pkg['version']} (mapping {pkg['mapping_sha']})"
        if pkg
        else "site inputs: no accepted package yet",
        "package_version": pkg["version"] if pkg else None,
        "cdu": emap["cdu"],
        "racks": emap["racks"],
        "hall": emap["hall"],
        "owners": emap["owners"],
        "limits": emap["limits"],
        "redundancy": emap["redundancy"],
        "runbook": {"id": "RB-LC-2", "steps": steps},
        "lead": lead and {**lead, "label": "lead, not root cause"},
        "window_min": s.requirements["recovery_window_min"],
        "job_fraction": s.requirements["job_recovered_fraction"],
    }


def evaluate(variant: str, ctx: dict[str, Any]) -> dict[str, Any]:
    racks = ctx["racks"]
    mins = series(variant, racks)
    min_flow = ctx["limits"]["min_secondary_flow_lpm"]
    hi = ctx["limits"]["secondary_supply_c"][1]
    window, frac = ctx["window_min"], ctx["job_fraction"]
    owners = ctx["owners"]

    def low(m: Minute) -> bool:
        return low_flow_while_running(m.cdu["state"], m.cdu["flow_lpm"], m.cdu["quality"], min_flow)

    def hot(m: Minute) -> bool:
        return m.cdu["quality"] == "good" and (m.cdu["supply_c"] or 0) > hi

    def slow(m: Minute) -> bool:
        return (
            m.job is not None and m.job["phase"] == "train" and m.job["steps_per_s"] < SLOW_FRACTION * m.job["baseline"]
        )

    def stale(m: Minute) -> bool:
        return m.cdu["quality"] == "stale"

    alarms = []
    for rule, pred, owner, text in (
        (
            "LowFlowWhileRunning",
            low,
            owners["facilities"],
            f"{ctx['cdu']} running, secondary flow below {min_flow} L/min",
        ),
        ("CoolantSupplyHigh", hot, owners["facilities"], f"secondary supply above {hi} °C"),
        (
            "WorkloadSlow",
            slow,
            owners["it"],
            f"training job below {SLOW_FRACTION:.0%} of baseline on {', '.join(racks)}",
        ),
        ("TelemetryStale", stale, owners["facilities"], f"no fresh {ctx['cdu']} sample; readings withheld"),
    ):
        t = held(mins, pred, 1 if rule == "TelemetryStale" else HOLD_MIN)
        if t is not None:
            alarms.append({"rule": rule, "t": t, "clock": clock(t), "owner": owner, "detail": text})
    cooling = [a for a in alarms if a["rule"] in ("LowFlowWhileRunning", "CoolantSupplyHigh")]
    out: dict[str, Any] = {
        "variant": variant,
        "title": TITLES[variant],
        "synthetic": True,
        "context": ctx,
        "minutes": [m.__dict__ for m in mins],
        "alarms": alarms,
        "facility_only": all(m.job is None for m in mins),
    }
    if not cooling:
        if any(a["rule"] == "TelemetryStale" for a in alarms):
            t0 = next(a["t"] for a in alarms if a["rule"] == "TelemetryStale")
            out["kind"] = "visibility"
            out["incident"] = {
                "opened_at": t0,
                "title": f"Missing visibility: {ctx['cdu']} telemetry",
                "wording": f"No fresh {ctx['cdu']} sample since {clock(t0 - 1)}. Rack inlet, GPU temperatures and "
                "job progress stay normal. No failure is inferred and no shutdown is advised.",
                "scope_racks": racks,
                "owners": [{"team": owners["facilities"], "role": "restore the telemetry feed", "recovered_at": None}],
                "closing_evidence": "fresh CDU samples on two consecutive polls",
                "closable_at": None,
                "status_at_end": "open: visibility only",
            }
        else:
            out["kind"] = "none"
            out["incident"] = None
            out["note"] = "Job progress dipped during a declared checkpoint while cooling stayed normal: no incident."
        return out
    t0 = min(a["t"] for a in cooling)
    first_low = next(m.t for m in mins if low(m))

    def fac_ok(m: Minute) -> bool:
        return m.cdu["quality"] == "good" and (m.cdu["flow_lpm"] or 0) >= min_flow and (m.cdu["supply_c"] or 99) <= hi

    def job_ok(m: Minute) -> bool:
        return m.job is not None and m.job["steps_per_s"] >= frac * m.job["baseline"]

    fac_rec = recovered_at(mins, fac_ok, t0, window)
    job_rec = None if out["facility_only"] else recovered_at(mins, job_ok, t0, window)
    if out["facility_only"]:
        closable, status = fac_rec, "resolved (facility side only; workload not visible)" if fac_rec else "open"
    else:
        closable = max(fac_rec, job_rec) if fac_rec is not None and job_rec is not None else None
        status = "resolved" if closable else "partially unresolved" if fac_rec else "open"
    at = mins[t0]
    evidence = [
        {
            "id": "e1",
            "text": f"{ctx['cdu']} state running, secondary flow {at.cdu['flow_lpm']} L/min (minimum {min_flow})",
            "source": f"{ctx['cdu']} telemetry",
            "ts": at.cdu["source_ts"],
        },
        {
            "id": "e2",
            "text": f"secondary supply {at.cdu['supply_c']} °C, return {at.cdu['return_c']} °C",
            "source": f"{ctx['cdu']} telemetry",
            "ts": at.cdu["source_ts"],
        },
        {
            "id": "e3",
            "text": "; ".join(
                f"{r} GPU {at.racks[r]['gpu_c']} °C, throttle {at.racks[r]['throttle_pct']:.0f}%" for r in racks
            ),
            "source": "GPU telemetry",
            "ts": at.cdu["received_ts"],
        },
        {
            "id": "e4",
            "text": f"comparison {COMPARISON_RACK} (air, other plant): GPU {at.racks[COMPARISON_RACK]['gpu_c']} °C,"
            " no throttle",
            "source": "GPU telemetry",
            "ts": at.cdu["received_ts"],
        },
    ]
    if at.job:
        evidence.append(
            {
                "id": "e5",
                "text": f"job {at.job['steps_per_s']:.0f} steps/s vs {at.job['baseline']:.0f} "
                "baseline; heartbeats healthy",
                "source": "job progress",
                "ts": at.cdu["received_ts"],
            }
        )
    team_it = owners["it"] if not out["facility_only"] else "Tenant (via colocation portal)"
    out["kind"] = "incident"
    out["incident"] = {
        "opened_at": t0,
        "first_below_min": first_low,
        "title": f"Cooling degradation suspected on {', '.join(racks)}",
        "wording": "Cooling degradation suspected; cause unconfirmed. "
        f"{ctx['cdu']} reports running while secondary flow is below the approved minimum.",
        "scope_racks": racks,
        "scope_from": ctx["from"],
        "comparison_rack": COMPARISON_RACK,
        "evidence": evidence,
        "procedure": ctx["runbook"],
        "lead": ctx["lead"],
        "owners": [
            {"team": owners["facilities"], "role": "loop checks (flow, strainer, pumps)", "recovered_at": fac_rec},
            {
                "team": team_it,
                "role": "workload impact assessment",
                "recovered_at": job_rec,
                "visible": not out["facility_only"],
            },
        ],
        "closing_evidence": f"flow ≥ {min_flow} L/min and supply ≤ {hi} °C, and job ≥ {frac:.0%} of baseline, "
        f"all held for {window} min"
        if not out["facility_only"]
        else f"flow ≥ {min_flow} L/min and supply ≤ {hi} °C held for {window} min; workload recovery "
        "is not visible to the operator and is confirmed by the tenant",
        "closable_at": closable,
        "status_at_end": status,
    }
    return out


def snapshot(flow: Retrofit) -> dict[str, Any]:
    ctx = context(flow)
    return {v: evaluate(v, ctx) for v in VARIANTS}
