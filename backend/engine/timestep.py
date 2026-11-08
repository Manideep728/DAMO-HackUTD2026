"""Time-stepped mode: hourly snapshots driven by load profiles and maintenance windows.

A load profile is a list of hourly multipliers (repeating) attached to a selector: a node id, ``type:<type>``,
``zone:<zone>`` or ``*``. The most specific selector wins (id, then type, then zone, then ``*``).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from .model import Facility, Node, State
from .propagate import SimResult, simulate

Profiles = Mapping[str, list[float]]


@dataclass
class Window:
    nodes: list[str]
    start: int  # hour, inclusive
    end: int  # hour, exclusive
    label: str = ""
    state: State = State.maintenance

    def active(self, hour: int) -> bool:
        return self.start <= hour < self.end


@dataclass
class Snapshot:
    hour: int
    lost_services: list[str]
    lost: list[str]
    min_margin: float  # lowest headroom fraction across loaded suppliers (1.0 = idle, 0.0 = full)
    tightest: str | None  # the supplier with that headroom
    zone_margin: dict[str, float]


@dataclass
class Timeline:
    snapshots: list[Snapshot] = field(default_factory=list)

    def window(self, start: int, end: int) -> list[Snapshot]:
        return [s for s in self.snapshots if start <= s.hour < end]


def _multiplier(n: Node, profiles: Profiles, hour: int) -> float:
    for key in (n.id, f"type:{n.type.value}", f"zone:{n.zone}", "*"):
        prof = profiles.get(key)
        if prof:
            return prof[hour % len(prof)]
    return 1.0


def scale_at(facility: Facility, profiles: Profiles | None, hour: int) -> dict[str, float]:
    if not profiles:
        return {}
    return {n.id: _multiplier(n, profiles, hour) for n in facility.nodes}


def states_at(base: Mapping[str, State] | None, windows: Iterable[Window], hour: int) -> dict[str, State]:
    states = dict(base or {})
    for w in windows:
        if w.active(hour):
            for n in w.nodes:
                if states.get(n) != State.failed:
                    states[n] = w.state
    return states


def margins(facility: Facility, r: SimResult) -> tuple[float, str | None, dict[str, float]]:
    served: dict[str, float] = {}
    for (_, s), kw in r.shares.items():
        served[s] = served.get(s, 0.0) + kw
    best, tight = 1.0, None
    zone_cap: dict[str, float] = {}
    zone_used: dict[str, float] = {}
    for n in facility.nodes:
        if n.capacity <= 0 or not r.up(n.id) or n.id not in served:
            continue
        frac = (n.capacity - served[n.id]) / n.capacity
        if frac < best or (frac == best and tight is not None and n.id < tight):
            best, tight = frac, n.id
        zone_cap[n.zone] = zone_cap.get(n.zone, 0.0) + n.capacity
        zone_used[n.zone] = zone_used.get(n.zone, 0.0) + served[n.id]
    zones = {z: (zone_cap[z] - zone_used[z]) / zone_cap[z] for z in sorted(zone_cap)}
    return best, tight, zones


def snapshot(
    facility: Facility,
    hour: int,
    states: Mapping[str, State],
    scale: Mapping[str, float],
    services: list[str],
) -> Snapshot:
    r = simulate(facility, states, scale)
    m, tight, zones = margins(facility, r)
    return Snapshot(hour, [s for s in services if not r.up(s)], r.lost(facility), m, tight, zones)


def run_timeline(
    facility: Facility,
    hours: int,
    profiles: Profiles | None = None,
    windows: Iterable[Window] = (),
    base_states: Mapping[str, State] | None = None,
    start: int = 0,
) -> Timeline:
    windows = list(windows)
    services = facility.critical_services()
    tl = Timeline()
    for h in range(start, start + hours):
        tl.snapshots.append(
            snapshot(facility, h, states_at(base_states, windows, h), scale_at(facility, profiles, h), services)
        )
    return tl
