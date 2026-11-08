"""Simplified transient behaviour after a failure (labelled simplified everywhere it is shown).

Not an electrical or thermal simulation. It sequences a few well-known effects with steady-state snapshots:

- Generators take ``start_delay_s`` to come online (default 15 s); transfer switches add ``transfer_s``.
- UPS units carry their loads on battery for ``battery_minutes`` (default 5) when their input is lost.
- Loads with no UPS behind them (pumps, chillers, CRAH fans) drop until power returns; chillers then need
  ``restart_min`` (default 6) before cooling resumes.
- A rack without cooling trips after ``ride_through_min`` (default 4).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from .model import Facility, NodeType, Resource, State
from .propagate import simulate

DEFAULTS = {
    "start_delay_s": 15.0,
    "transfer_s": 0.5,
    "battery_minutes": 5.0,
    "restart_min": 6.0,
    "ride_through_min": 4.0,
}


@dataclass
class TransientEvent:
    t_s: float
    what: str
    nodes: list[str]


@dataclass
class TransientReport:
    events: list[TransientEvent]
    lost_transient: list[str]  # racks/workloads lost during the transition
    lost_steady: list[str]  # racks/workloads lost once everything has settled
    assumptions: list[str] = field(
        default_factory=lambda: [
            "simplified sequence of steady-state snapshots, not a dynamic simulation",
            *(f"default {k} = {v}" for k, v in DEFAULTS.items()),
        ]
    )


def _param(meta: Mapping[str, object], key: str) -> float:
    v = meta.get(key, DEFAULTS[key])
    return float(v) if isinstance(v, int | float) else DEFAULTS[key]


def _on_battery(facility: Facility) -> Facility:
    """Copy where every UPS is its own source (riding on battery), so its loads stay up."""
    f = facility.model_copy(deep=True)
    for n in f.nodes:
        if n.type == NodeType.ups:
            n.requires = []
    return f


def _without_rack_cooling(facility: Facility) -> Facility:
    f = facility.model_copy(deep=True)
    for n in f.nodes:
        if n.type == NodeType.rack:
            n.requires = [g for g in n.requires if g.resource != Resource.cooling]
    return f


def transient(
    facility: Facility, failed: Iterable[str], base_states: Mapping[str, State] | None = None
) -> TransientReport:
    by_id = facility.by_id()
    base = {**dict(base_states or {}), **{n: State.failed for n in failed}}
    gens = [n for n in facility.nodes if n.type == NodeType.generator and base.get(n.id) is None]
    racks = [n.id for n in facility.nodes if n.type in (NodeType.rack, NodeType.workload)]
    steady = simulate(facility, base)
    before = simulate(facility, base_states)
    events: list[TransientEvent] = []

    # Phase 1: generators still starting, UPS on battery.
    starting = {**base, **{g.id: State.failed for g in gens}}
    battery = _on_battery(facility)
    p1 = simulate(battery, starting)
    ats = [n for n in facility.nodes if n.type == NodeType.ats]
    transfer = max((_param(n.metadata, "transfer_s") for n in ats), default=0.0)
    gen_ready = max((_param(g.metadata, "start_delay_s") for g in gens), default=float("inf")) + transfer
    needs_gen = any(steady.up(g.id) and any(c == g.id for (_, c) in steady.shares) for g in gens)
    gen_ids = {g.id for g in gens}
    if needs_gen:
        dropped = [
            n.id
            for n in facility.nodes
            if before.up(n.id) and not p1.up(n.id) and n.id not in racks and n.id not in gen_ids and n.id not in base
        ]
        if dropped:
            events.append(
                TransientEvent(0.0, "equipment without UPS drops until generators are online", sorted(dropped))
            )
        events.append(TransientEvent(gen_ready, "generators online and transferred", sorted(gen_ids)))
    else:
        p1 = simulate(battery, base)  # no generator start involved: only the failure itself

    # UPS battery against generator start.
    during = starting if needs_gen else base
    lost_power: set[str] = set()
    for u in (n for n in facility.nodes if n.type == NodeType.ups and before.up(n.id)):
        if simulate(facility, during).up(u.id):
            continue
        minutes = _param(u.metadata, "battery_minutes")
        if not needs_gen or gen_ready > minutes * 60:
            events.append(TransientEvent(minutes * 60, "UPS battery exhausted before power returned", [u.id]))
        if needs_gen and gen_ready > minutes * 60:
            no_battery = simulate(facility, starting)
            lost_power |= {r for r in racks if before.up(r) and not no_battery.up(r)}

    # Cooling gap and rack thermal ride-through.
    powered_only = simulate(_without_rack_cooling(battery), during)
    chillers_down = [n.id for n in facility.nodes if n.type == NodeType.chiller and before.up(n.id) and not p1.up(n.id)]
    restart = max((_param(by_id[c].metadata, "restart_min") for c in chillers_down), default=0.0) * 60
    cooling_back = (gen_ready if needs_gen else 0.0) + restart
    lost_thermal: list[str] = []
    for r in racks:
        if by_id[r].type != NodeType.rack or not before.up(r) or not powered_only.up(r) or p1.up(r):
            continue
        ride = _param(by_id[r].metadata, "ride_through_min") * 60
        restored = steady.up(r) and cooling_back < ride
        if not restored:
            lost_thermal.append(r)
    if chillers_down and steady.up(chillers_down[0]):
        events.append(TransientEvent(cooling_back, "chillers restarted, cooling restored", sorted(chillers_down)))
    if lost_thermal:
        ride = min(_param(by_id[r].metadata, "ride_through_min") for r in lost_thermal) * 60
        events.append(TransientEvent(ride, "racks exceed thermal ride-through without cooling", sorted(lost_thermal)))

    lost_steady = sorted(r for r in racks if before.up(r) and not steady.up(r))
    transient_racks = set(lost_thermal) | lost_power | set(lost_steady)
    # Workloads follow the racks they need.
    if transient_racks:
        extra = {**base, **{r: State.failed for r in transient_racks}}
        after = simulate(facility, extra)
        transient_racks |= {r for r in racks if before.up(r) and not after.up(r)}
    events.sort(key=lambda e: (e.t_s, e.what))
    return TransientReport(events, sorted(transient_racks), lost_steady)
