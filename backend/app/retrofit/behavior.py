"""Behavior tests for the retrofit integration: inject physical events, run the adapter, judge with the oracle.

Same shape as the TTU harness (`app/ttu/harness.py`): every case is scored on fixed dimensions, held-out cases
leave the suite as pass/fail only, and mutated configs (loop swap, running-as-available, no freshness, wrong valve)
must each be rejected, which proves the suite has teeth. Expectations come from `oracle.py`, never the config.
"""

from __future__ import annotations

import hashlib
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import oracle
from .adapter import Adapter, Msg
from .contract import CduTelemetry, ControlStatus, LeakEvent, Quality, ResponseAction
from .device import Device
from .inputs import Site
from .mapping import Mapping, check

DIMS = ["rack", "response", "loop", "availability", "freshness", "control"]
POLL_S = 10
Result = dict[str, tuple[bool, str]]  # dimension -> (passed, note)


@dataclass
class Sim:
    site: Site
    mapping: Mapping
    device: Device
    adapter: Adapter
    msgs: list[Msg] = field(default_factory=list)
    t: int = 0

    def run(self, until: int, at: dict[int, Callable[[Sim], None]] | None = None) -> None:
        while self.t <= until:
            if at and self.t in at:
                at[self.t](self)
            write: dict[str, float] = {}
            self.msgs += self.adapter.poll(self.t, self.device.registers(), write)
            if "setpoint" in write:
                self.device.phys.setpoint = write["setpoint"]
            self.t += POLL_S

    def of(self, kind: type) -> list[Any]:
        return [m for m in self.msgs if isinstance(m, kind)]


@dataclass
class Case:
    id: str
    name: str
    description: str
    test: Callable[[Sim, dict[int, str]], Result]
    held_out: bool = False
    kind: str = "behavior"  # behavior | regression
    regression_id: int | None = None


def _leak_case(location: str) -> Callable[[Sim, dict[int, str]], Result]:
    def test(sim: Sim, zones: dict[int, str]) -> Result:
        exp = oracle.leak(sim.site, location, zones)
        sim.run(60, {20: lambda s: s.device.leak(location)})
        events = [e for e in sim.of(LeakEvent) if e.active]
        named = sorted({e.location for e in events})
        rack_ok = named == [exp.location] and all(e.zone == exp.zone for e in events)
        rack_note = f"leak under {location} (zone {exp.zone}) published as {', '.join(named) or 'nothing'}"
        acts: list[ResponseAction] = sim.of(ResponseAction)
        closed = sorted(a.target for a in acts if a.action == "close_valve")
        notified = sorted(a.target for a in acts if a.action == "notify")
        want_closed = [exp.close_valve] if exp.close_valve else []
        resp_ok = closed == want_closed and exp.notify in notified
        resp_note = f"closed {', '.join(closed) or 'no valve'}, expected {', '.join(want_closed) or 'no valve'}; "
        resp_note += f"notified {', '.join(notified) or 'nobody'}"
        return {"rack": (rack_ok, rack_note), "response": (resp_ok, resp_note)}

    return test


def _loops(sim: Sim, zones: dict[int, str]) -> Result:
    injected = {
        "primary.supply_temp_c": 18.0,
        "primary.return_temp_c": 24.0,
        "secondary.supply_temp_c": 32.0,
        "secondary.return_temp_c": 40.0,
        "secondary.flow_lpm": 240.0,
    }
    sim.run(20)
    last = [m for m in sim.of(CduTelemetry) if m.quality == Quality.good][-1]
    wrong = []
    for f, want in injected.items():
        loop, attr = f.split(".")
        got = getattr(getattr(last, loop), attr)
        if got is None or abs(got - want) > 0.05:
            wrong.append(f"{f} = {got}, injected {want}")
    return {"loop": (not wrong, "; ".join(wrong) or "each reading on its own loop")}


def _availability(sim: Sim, zones: dict[int, str]) -> Result:
    wrong = []
    labels = set(sim.device.point("Unit run state").enum.values())
    for state in [s for s in ("running", "standby", "running_degraded") if s in labels]:
        sim.device.phys.state = state
        sim.run(sim.t + 10)
        got = [m for m in sim.of(CduTelemetry) if m.quality == Quality.good][-1].available_backup
        if got != oracle.backup_available(state):
            wrong.append(f"{state} published available_backup={got}")
    red = oracle.redundancy(sim.site)
    note = "; ".join(wrong) or "running is in use, not backup"
    if red:
        r = next(iter(red.values()))
        note += f" · engine: liquid racks {r['effective']} (single points {', '.join(r['single_points'])})"
    return {"availability": (not wrong, note)}


def _freshness(sim: Sim, zones: dict[int, str]) -> Result:
    rules = oracle.freshness()
    rack = sim.site.liquid_racks()[-1]
    lost, back, leak_at = 30, 120, 60
    sim.run(
        200,
        {
            lost: lambda s: setattr(s.device, "comm_ok", False),
            leak_at: lambda s: s.device.leak(rack),
            back: lambda s: setattr(s.device, "comm_ok", True),
        },
    )
    tel = sim.of(CduTelemetry)
    last_before = lost - POLL_S
    stale = [m.t for m in tel if m.quality == Quality.stale]
    good_after = [m.t for m in tel if m.t >= back and m.quality == Quality.good]
    first_good = min(good_after, default=None)
    events = [e for e in sim.of(LeakEvent) if e.active]
    problems = []
    if not stale or stale[0] > last_before + rules["max_age_s"] + POLL_S:
        problems.append(f"not marked stale within {rules['max_age_s']} s of the last sample")
    if any(m.quality == Quality.good and m.state is not None for m in tel if lost <= m.t < back):
        problems.append("readings shown as good while the feed was down")
    if first_good is not None and first_good < back + (rules["recovery_samples"] - 1) * POLL_S:
        problems.append(f"good again after fewer than {rules['recovery_samples']} fresh samples")
    if any(e.t < (first_good or 10**9) for e in events):
        problems.append("leak event published from stale or recovering data")
    if not events:
        problems.append("leak during the outage never published after recovery")
    note = "; ".join(problems) or f"stale at +{stale[0] - last_before} s, good again at +{(first_good or 0) - back} s"
    return {"freshness": (not problems, note)}


def _request(sim: Sim, zones: dict[int, str]) -> Result:
    lo, hi = oracle.control(sim.site)["range"]
    w: dict[str, float] = {}
    bad, good = sim.adapter.request(0, "req-1", hi + 10, w), sim.adapter.request(0, "req-2", (lo + hi) / 2, w)
    problems = []
    if bad.accepted:
        problems.append(f"accepted {bad.setpoint_c:g} °C, outside the approved {lo:g}-{hi:g} °C")
    if not good.accepted:
        problems.append(f"rejected {good.setpoint_c:g} °C, inside the approved range")
    return {"control": (not problems, "; ".join(problems) or f"rejected {bad.setpoint_c:g} °C: {bad.reason}")}


def _fallback(sim: Sim, zones: dict[int, str]) -> Result:
    c = oracle.control(sim.site)
    silent = 50

    def beat(s: Sim) -> None:
        s.adapter.heartbeat(s.t)

    sim.run(silent + c["heartbeat_timeout_s"] + 3 * POLL_S, {t: beat for t in range(0, silent + 1, POLL_S)})
    status = sim.of(ControlStatus)
    deadline = silent + c["heartbeat_timeout_s"] + POLL_S
    ok = bool(status) and status[0].t <= deadline and status[0].setpoint_c == c["fallback_c"]
    note = (
        f"local fallback at {status[0].setpoint_c:g} °C, +{status[0].t - silent} s after the source went quiet"
        if status
        else "never fell back to local control"
    )
    if status and status[0].setpoint_c != c["fallback_c"]:
        note += f" (approved fallback is {c['fallback_c']:g} °C)"
    return {"control": (ok, note)}


def base_cases(site: Site, zones: dict[int, str]) -> list[Case]:
    cases = [
        Case(
            f"leak-{loc}",
            f"Leak under {loc}",
            f"Wet drip tray under {loc}: right rack, right valve, Facilities told",
            _leak_case(loc),
        )
        for loc in site.liquid_racks()
    ]
    cabinet = zones.get(1)
    cases += [
        Case(
            "loops", "Primary vs secondary loop", "Distinct facility-water and rack-coolant readings stay apart", _loops
        ),
        Case(
            "running-vs-available",
            "Running is not available backup",
            "A running CDU is in use; only a standby unit counts as backup",
            _availability,
        ),
        Case(
            "comm-loss",
            "Communication loss and reconnection",
            "Stale within the contract's max age, no events from stale data, good after recovery samples",
            _freshness,
        ),
        Case(
            "setpoint-request",
            "Setpoint request outside the approved range",
            "An invalid request is rejected with its reason",
            _request,
        ),
    ]
    if cabinet:
        cases.append(
            Case(
                "leak-cabinet",
                "Leak inside the CDU cabinet",
                "Notify only; no rack valve closes",
                _leak_case(cabinet),
                held_out=True,
            )
        )
    cases.append(
        Case(
            "fallback",
            "Remote setpoint source disappears",
            "Back to local control at the approved fallback setpoint",
            _fallback,
            held_out=True,
        )
    )
    return cases


def _low_flow(sim: Sim, zones: dict[int, str]) -> Result:
    """From an incident lesson: flow sinks while the CDU keeps reporting running; the published telemetry must let
    the monitoring rule fire within its hold time of crossing the approved minimum."""
    from .monitor import HOLD_MIN, low_flow_while_running

    min_flow = float(sim.site.requirements["limits"]["min_secondary_flow_lpm"])
    end = 600

    def sink(s: Sim) -> None:
        s.device.phys.sec_flow = 240.0 - 90.0 * s.t / end

    sim.run(end, {t: sink for t in range(0, end + 1, POLL_S)})
    below = next(t for t in range(0, end + 1, POLL_S) if 240.0 - 90.0 * t / end < min_flow)
    run, fired = 0, None
    for m in sim.of(CduTelemetry):
        state = m.state.value if m.state else None
        run = run + 1 if low_flow_while_running(state, m.secondary.flow_lpm, m.quality.value, min_flow) else 0
        if run * POLL_S >= HOLD_MIN * 60:
            fired = m.t
            break
    ok = fired is not None and fired <= below + HOLD_MIN * 60 + POLL_S
    note = (
        f"LowFlowWhileRunning at +{fired - below} s after flow fell below {min_flow:g} L/min"
        if fired is not None
        else "published telemetry never let LowFlowWhileRunning fire"
    )
    return {"loop": (ok, note)}


def regression_cases(site: Site, regressions: list[dict[str, Any]], zones: dict[int, str]) -> list[Case]:
    """Saved corrections. A regression from this site pins its exact subject; one from another site runs as a
    template over this site's own drawing (every rack zone), which is how a correction carries to a new site."""
    out = []
    for r in regressions:
        if r["status"] != "active":
            continue
        if r["spec"].get("kind") == "low_flow":
            out.append(
                Case(
                    f"regression-{r['id']}-low-flow",
                    f"R-{r['id']}: low flow while running",
                    f"From incident lesson ({r['spec']['incident']}): {r['spec']['summary']}",
                    _low_flow,
                    kind="regression",
                    regression_id=r["id"],
                )
            )
            continue
        if r["spec"].get("kind") != "leak_location":
            continue
        if r["site"] == site.id:
            zone = r["spec"]["zone"]
            locs = [zones[zone]] if zone in zones else []
        else:
            locs = [loc for loc in zones.values() if loc in site.liquid_racks()]
        for loc in locs:
            out.append(
                Case(
                    f"regression-{r['id']}-{loc}",
                    f"R-{r['id']}: leak cable location ({loc})",
                    f"Saved from {r['site']} decision D-{r['decision_id']}: {r['spec']['summary']}",
                    _leak_case(loc),
                    kind="regression",
                    regression_id=r["id"],
                )
            )
    return out


MUTANTS: dict[str, Callable[[str], str]] = {
    "Loop swap (primary ↔ secondary supply)": lambda t: _swap(t, "primary.supply_temp_c", "secondary.supply_temp_c"),
    "Running counted as backup": lambda t: re.sub(r"backup_when: \[.*\]", "backup_when: [running, standby]", t),
    "No freshness (hold last value)": lambda t: re.sub(r"max_age_s: \d+", "max_age_s: 100000", t),
    "Right alarm, wrong valve": lambda t: _swap_valves(t),
}


def _swap(text: str, a: str, b: str) -> str:
    va = re.search(rf"^(\s*){re.escape(a)}: (\S+)$", text, re.M)
    vb = re.search(rf"^(\s*){re.escape(b)}: (\S+)$", text, re.M)
    if not va or not vb:
        return text
    text = text.replace(va.group(0), f"{va.group(1)}{a}: {vb.group(2)}")
    return text.replace(vb.group(0), f"{vb.group(1)}{b}: {va.group(2)}")


def _swap_valves(text: str) -> str:
    rows = re.findall(r"^  (\S+): (V-\S+)$", text, re.M)
    if len(rows) < 2:
        return text
    (r1, v1), (r2, v2) = rows[:2]
    text = text.replace(f"  {r1}: {v1}\n", f"  {r1}: @@\n").replace(f"  {r2}: {v2}\n", f"  {r2}: {v1}\n")
    return text.replace(f"  {r1}: @@\n", f"  {r1}: {v2}\n")


def expectations_sha(site: Site) -> str:
    h = hashlib.sha256()
    for p in (Path(oracle.__file__), Path(__file__), site.dir / "PIN.json"):
        h.update(p.read_bytes())
    return h.hexdigest()[:16]


def _run_case(site: Site, m: Mapping, zones: dict[int, str], case: Case, firmware: str) -> dict[str, Any]:
    sim = Sim(site, m, Device(site, firmware, zones), Adapter(m, site))
    res = case.test(sim, zones)
    result = {d: ("pass" if res[d][0] else "fail") if d in res else "na" for d in DIMS}
    return {
        "id": case.id,
        "name": case.name,
        "description": case.description,
        "kind": case.kind,
        "regression_id": case.regression_id,
        "result": result,
        "notes": [n for _, n in res.values()],
        "pass": all(ok for ok, _ in res.values()),
    }


def run_suite(
    site: Site,
    text: str,
    label: str,
    decisions: list[dict[str, Any]] | None = None,
    regressions: list[dict[str, Any]] | None = None,
    firmware: str = "2.3.0",
    include_mutants: bool = True,
    only: set[str] | None = None,
) -> dict[str, Any]:
    """Schema check, then every case on a fresh device + adapter. `firmware` is what the physical CDU runs;
    `only` limits the run to case ids starting with one of its prefixes (revalidation reruns affected cases)."""
    t0 = time.time()
    m, issues = check(text, site)
    head = {
        "site": site.id,
        "config": label,
        "firmware": {"device": firmware, "config": m.device.firmware if m else None},
        "expectations_sha": expectations_sha(site),
        "schema": {"ok": not issues, "issues": [i.__dict__ for i in issues]},
    }
    if m is None or issues:
        return {
            **head,
            "cases": [],
            "held_out": [],
            "sanity": [],
            "passed": 0,
            "total": 0,
            "pass": False,
            "elapsed_s": round(time.time() - t0, 2),
        }
    zones = oracle.associations(site, decisions or [])
    cases = base_cases(site, zones) + regression_cases(site, regressions or [], zones)
    if only is not None:
        cases = [c for c in cases if any(c.id.startswith(p) for p in only)]
    rows, held = [], []
    for c in cases:
        row = _run_case(site, m, zones, c, firmware)
        (held.append({"id": c.id, "name": c.name, "pass": row["pass"]}) if c.held_out else rows.append(row))
    sanity = []
    if include_mutants:
        visible = [c for c in cases if not c.held_out and c.kind == "behavior"]
        for name, mutate in MUTANTS.items():
            mm, mi = check(mutate(text), site)
            failed = [
                c.name for c in visible if mm is None or mi or not _run_case(site, mm, zones, c, firmware)["pass"]
            ]
            sanity.append({"name": name, "rejected": bool(failed), "failed_cases": failed})
    passed = sum(r["pass"] for r in rows) + sum(h["pass"] for h in held)
    return {
        **head,
        "cases": rows,
        "held_out": held,
        "sanity": sanity,
        "passed": passed,
        "total": len(cases),
        "pass": passed == len(cases),
        "elapsed_s": round(time.time() - t0, 2),
    }


def visible_failures(report: dict[str, Any]) -> dict[str, Any]:
    """What a repair agent may see: visible failures and notes, held-out cases as a count only."""
    return {
        "schema": report["schema"],
        "failing_cases": [
            {
                "id": c["id"],
                "name": c["name"],
                "failed": [d for d, v in c["result"].items() if v == "fail"],
                "notes": c["notes"],
            }
            for c in report["cases"]
            if not c["pass"]
        ],
        "held_out_failing": sum(1 for h in report["held_out"] if not h["pass"]),
    }
