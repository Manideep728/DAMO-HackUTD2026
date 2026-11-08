"""Synthetic power meters for the demo hall, and the plan for reconciling them against the documented graph.

There are no real meters behind this demo. The readings come from our own load-flow on the as-built graph (the
documented graph with the corpus's labelled truth applied), so they carry the real wiring the way a site's meters
would. Reconciliation then checks each metered supplier against the sum of its documented loads: a supplier
carrying load it shouldn't, whose gap moves with one consumer's meter while that consumer's documented supplier
is short by the same amount, is evidence the consumer is wired somewhere else.

Readings are on the facility clock: hour-of-day in the timestamps is the hall's local hour.
"""

from __future__ import annotations

import datetime as dt
import math
import random
from collections.abc import Iterator
from dataclasses import dataclass

from engine.model import EdgeSource, Facility, Mode, NodeType, Resource, Supply
from engine.propagate import loads

from .data.demo import demo_profiles

STEP_MIN = 15
METER_ACCURACY = 0.002  # revenue-grade switchboard meters (ANSI C12.20 class 0.2)
PLANT = (NodeType.pump, NodeType.chiller, NodeType.crah)


@dataclass
class MeterEvidence:
    consumer: str
    supplier: str  # where the meters put the consumer
    documented: str  # where the drawings put it
    verdict: str  # moved | supports_documented
    r_supplier: float  # corr(supplier's unexplained load, consumer's meter)
    r_documented: float  # corr(documented supplier's unexplained load, consumer's meter)
    gap_kw: float  # mean unexplained load on the supplier
    consumer_kw: float  # mean metered load of the consumer
    days: int
    synced_at: str

    def statement(self) -> str:
        if self.verdict == "moved":
            return (
                f"{self.supplier} carries {self.gap_kw:.1f} kW more than its documented loads and {self.documented} "
                f"is short by about as much; both gaps track {self.consumer}'s meter "
                f"(r = {self.r_supplier:.2f} and {self.r_documented:.2f} over {self.days} days)."
            )
        return (
            f"{self.documented}'s meter equals the sum of its documented loads, {self.consumer} included, "
            f"within {abs(self.gap_kw):.1f} kW over {self.days} days."
        )


def _power_group(node):
    return next((g for g in node.requires if g.resource == Resource.power and g.mode == Mode.capacity), None)


def as_built(facility: Facility, labels: list[dict]) -> Facility:
    """The documented graph with every labelled true edge that isn't live applied, replacing the consumer's
    supplier that the labels mark false."""
    fac = facility
    false = {(lab["consumer"], lab["supplier"]) for lab in labels if not lab["truth"]}
    for lab in labels:
        if not lab["truth"]:
            continue
        node = fac.by_id()[lab["consumer"]]
        g = _power_group(node)
        if g is None or lab["supplier"] in g.live_suppliers():
            continue
        wrong = [s for s in g.live_suppliers() if (node.id, s) in false]
        supply = Supply(supplier=lab["supplier"], source=EdgeSource.engineer_confirmed)
        fac = fac.with_edge(node.id, g.name, supply, replace=wrong[0] if wrong else None)
    return fac


def leaf_loads(facility: Facility) -> list[str]:
    """Nodes whose meter is only their own load (nothing draws power through them): racks and plant."""
    feeding = {
        s
        for n in facility.nodes
        for g in n.requires
        if g.resource == Resource.power and g.mode == Mode.capacity  # k_of_n "racks" groups carry no load
        for s in g.live_suppliers()
    }
    return [n.id for n in facility.nodes if n.base_load > 0 and n.id not in feeding]


class _Walk:
    """Bounded random walk, for slow variation such as a pump's speed."""

    def __init__(self, rng: random.Random, spread: float, step: float):
        self.rng, self.spread, self.step, self.x = rng, spread, step, 0.0

    def next(self) -> float:
        self.x = max(-self.spread, min(self.spread, self.x + self.rng.gauss(0, self.step)))
        return 1 + self.x


def generate(
    facility: Facility, days: int, end: dt.datetime, seed: int = 7, step_min: int = STEP_MIN
) -> Iterator[tuple[dt.datetime, str, float]]:
    """Power-input readings for every node, every step, for ``days`` days ending at ``end``."""
    rng = random.Random(seed)
    by_id = facility.by_id()
    alive = set(by_id)
    profiles = demo_profiles()
    racks = [n.id for n in facility.nodes if n.type == NodeType.rack]
    nominal_heat = sum(by_id[r].heat_load for r in racks) or 1.0
    plant = [n.id for n in facility.nodes if n.type in PLANT]
    walks = {p: _Walk(rng, 0.4 if by_id[p].type == NodeType.pump else 0.15, 0.04) for p in plant}
    steps = days * 24 * 60 // step_min
    start = end - dt.timedelta(minutes=step_min * steps)
    jitter: dict[tuple[str, dt.date], float] = {}
    for i in range(steps):
        t = start + dt.timedelta(minutes=step_min * i)
        weekend = t.weekday() >= 5
        scale: dict[str, float] = {}
        for r in racks:
            day = jitter.setdefault((r[:2], t.date()), rng.gauss(1.0, 0.03))  # one jitter per row per day
            shape = profiles.get(r, [1.0])[t.hour % len(profiles.get(r, [1.0]))]
            busy = 0.9 if weekend and by_id[r].flexible_kw == 0 else 1.1 if weekend else 1.0
            scale[r] = shape * day * busy * rng.gauss(1.0, 0.01)
        heat = sum(by_id[r].heat_load * scale[r] for r in racks) / nominal_heat
        for p in plant:
            scale[p] = (0.6 + 0.4 * heat) * walks[p].next()
        through, _ = loads(facility, alive, scale)
        for nid in sorted(by_id):
            kw = through[nid][Resource.power]
            yield t, nid, round(kw * rng.gauss(1.0, METER_ACCURACY), 3)


@dataclass
class ReconcilePlan:
    suppliers: dict[str, tuple[list[str], float]]  # supplier -> (documented single-fed children, own kW)
    candidates: list[tuple[str, str, str]]  # (supplier, consumer, documented supplier)


def reconcile_plan(facility: Facility) -> ReconcilePlan:
    """Which suppliers the meters can check, and which (supplier, consumer) moves to test.

    A supplier is checkable when every power consumer it feeds has it as its only live supplier: a 2N rack feed
    or a first-available source can't be split from meters alone. A consumer is a candidate to have moved from
    its documented supplier T to another checkable supplier S."""
    by_id = facility.by_id()
    single: dict[str, str] = {}  # consumer -> its only live power supplier
    children: dict[str, list[str]] = {}
    split_fed: set[str] = set()  # suppliers that share at least one consumer with another supplier
    for n in facility.nodes:
        g = _power_group(n)
        if g is None:
            continue
        live = g.live_suppliers()
        for s in live:
            children.setdefault(s, []).append(n.id)
        if len(live) == 1:
            single[n.id] = live[0]
        else:
            split_fed.update(live)
    suppliers = {
        s: (sorted(cs), by_id[s].base_load) for s, cs in children.items() if s not in split_fed and by_id[s].capacity
    }
    candidates = [
        (s, c, t) for c, t in sorted(single.items()) if t in suppliers for s in sorted(suppliers) if s != t and s != c
    ]
    return ReconcilePlan(suppliers, candidates)


def judge(
    plan: ReconcilePlan,
    corr_rows: list[tuple[str, str, str, float | None, float | None, float, float]],
    residual_mean: dict[str, float],
    node_mean: dict[str, float],
    days: int,
    synced_at: str,
    min_r: float = 0.9,
    gap_tolerance: float = 0.15,
) -> list[MeterEvidence]:
    """Turn the correlation query's rows into evidence. A move needs both sides: the supplier's unexplained load
    rises with the consumer and the documented supplier's falls with it, by about the consumer's load."""
    out: list[MeterEvidence] = []
    moved: set[str] = set()
    for s, c, t, r_s, r_t, gap, c_kw in corr_rows:
        if r_s is None or r_t is None or math.isnan(r_s) or math.isnan(r_t) or c_kw <= 0:
            continue
        if r_s >= min_r and r_t <= -min_r and abs(gap - c_kw) <= gap_tolerance * c_kw:
            out.append(MeterEvidence(c, s, t, "moved", round(r_s, 3), round(r_t, 3), round(gap, 2),
                                     round(c_kw, 2), days, synced_at))
            moved.add(c)
    for t, (kids, _) in sorted(plan.suppliers.items()):
        loads_kw = [node_mean.get(k, 0.0) for k in kids if node_mean.get(k, 0.0) > 0]
        if not loads_kw or abs(residual_mean.get(t, math.inf)) > gap_tolerance * min(loads_kw):
            continue
        for k in kids:
            if k not in moved:
                out.append(MeterEvidence(k, t, t, "supports_documented", 0.0, 0.0,
                                         round(residual_mean[t], 2), round(node_mean.get(k, 0.0), 2), days, synced_at))
    return out
