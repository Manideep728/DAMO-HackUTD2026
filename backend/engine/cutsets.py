"""Minimal cut sets: the smallest groups of equipment whose joint failure loses a critical service.

Two methods that must agree (tests cross-check them):

- ``mocus_cut_sets``: exact top-down expansion of a fault tree built from the requirement groups
  (all → OR of supplier failures, any → AND, k_of_n → (n-k+1)-of-n, capacity → minimal supplier sets whose
  loss leaves less spare than the consumer's demand at the baseline load). Every candidate is then checked
  with the simulator, which drops sets that shared-capacity shedding makes harmless.
- ``enumerate_cut_sets``: brute force over subsets with superset elimination, used as the test oracle.

Basic events are infrastructure nodes upstream of a critical service. Racks and workloads are the services,
not causes, and nodes with ``failure_rate == 0`` are passive (pipework) and never fail.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from itertools import combinations

from .model import Facility, Mode, Node, NodeType, RequirementGroup, Split, State
from .propagate import EPS, SimResult, simulate

Cut = frozenset[str]
SERVICE_TYPES = (NodeType.rack, NodeType.workload)


@dataclass
class CutSet:
    nodes: list[str]
    order: int
    lost_services: list[str]
    lost_kw: float
    impact: float
    likelihood: float | None
    was_order: int | None = None  # maintenance view: order before the window, None if new


@dataclass
class CutSetReport:
    cut_sets: list[CutSet]
    max_order: int
    services: list[str]
    candidates: int
    simulations: int
    notes: list[str] = field(default_factory=list)


def _minimize(family: Iterable[Cut], max_order: int) -> set[Cut]:
    kept: list[Cut] = []
    for c in sorted(set(family), key=lambda s: (len(s), sorted(s))):
        if len(c) <= max_order and not any(k <= c for k in kept):
            kept.append(c)
    return set(kept)


def _or(families: Iterable[set[Cut]], k: int) -> set[Cut]:
    out: set[Cut] = set()
    for f in families:
        out |= f
    return _minimize(out, k)


def _and(families: list[set[Cut]], k: int) -> set[Cut]:
    acc: set[Cut] = {frozenset()}
    for f in families:
        acc = _minimize((a | b for a in acc for b in f), k)
        if not acc:
            return set()
    return acc


def upstream(facility: Facility, targets: Iterable[str]) -> set[str]:
    by_id = facility.by_id()
    seen: set[str] = set()
    stack = list(targets)
    while stack:
        nid = stack.pop()
        for g in by_id[nid].requires:
            for s in g.live_suppliers():
                if s not in seen:
                    seen.add(s)
                    stack.append(s)
    return seen


def candidates(facility: Facility, states: Mapping[str, State], services: Iterable[str]) -> set[str]:
    by_id = facility.by_id()
    return {
        nid
        for nid in upstream(facility, services)
        if by_id[nid].type not in SERVICE_TYPES
        and by_id[nid].failure_rate != 0
        and states.get(nid) not in (State.failed, State.maintenance)
    }


class FaultTree:
    """Fault tree over the facility at a baseline (scenario states and their loads)."""

    def __init__(self, facility: Facility, states: Mapping[str, State], basic: set[str], max_order: int):
        self.f, self.by_id, self.basic, self.k = facility, facility.by_id(), basic, max_order
        self.base: SimResult = simulate(facility, states)
        self.served: dict[str, float] = {}
        for (_, s), kw in self.base.shares.items():
            self.served[s] = self.served.get(s, 0.0) + kw
        self.memo: dict[str, set[Cut]] = {}
        self.stack: set[str] = set()

    def node(self, nid: str) -> set[Cut]:
        if not self.base.up(nid):
            return {frozenset()}  # already down at baseline
        if nid in self.memo:
            return self.memo[nid]
        if nid in self.stack:
            return set()  # back-edge of a cycle: no failure mode through this path
        self.stack.add(nid)
        fams = [{frozenset([nid])}] if nid in self.basic else []
        fams += [self.group(self.by_id[nid], g) for g in self.by_id[nid].requires]
        self.stack.discard(nid)
        self.memo[nid] = _or(fams, self.k)
        return self.memo[nid]

    def group(self, consumer: Node, g: RequirementGroup) -> set[Cut]:
        sup = g.live_suppliers()
        if g.mode == Mode.all:
            return _or((self.node(s) for s in sup), self.k)
        if g.mode == Mode.any:
            return _and([self.node(s) for s in sup], self.k)
        if g.mode == Mode.k_of_n:
            m = len(sup) - (g.k or 1) + 1
            return _or((_and([self.node(s) for s in combo], self.k) for combo in combinations(sup, m)), self.k)
        return _or((_and([self.node(s) for s in combo], self.k) for combo in self.failing_sets(consumer, g)), self.k)

    def spare(self, consumer: str, s: str) -> float:
        """Capacity supplier ``s`` could give this consumer: its capacity minus what everyone else draws."""
        others = self.served.get(s, 0.0) - self.base.shares.get((consumer, s), 0.0)
        return self.by_id[s].capacity - others

    def failing_sets(self, consumer: Node, g: RequirementGroup) -> list[tuple[str, ...]]:
        """Minimal sets of suppliers whose loss leaves the group unable to carry the consumer's demand."""
        sup = g.live_suppliers()
        need = sum(self.base.shares.get((consumer.id, s), 0.0) for s in sup)
        if need <= EPS:
            need = 0.0

        def survives(failed: set[str]) -> bool:
            up = [s for s in sup if s not in failed and self.base.up(s)]
            if not up:
                return False
            if g.split == Split.first_available:
                return self.spare(consumer.id, up[0]) + EPS >= need
            return sum(self.spare(consumer.id, s) for s in up) + EPS >= need

        found: list[tuple[str, ...]] = []
        for size in range(1, min(len(sup), self.k) + 1):
            for combo in combinations(sup, size):
                if any(set(f) <= set(combo) for f in found):
                    continue
                if not survives(set(combo)):
                    found.append(combo)
        return found


_Described = tuple[list[str], float, float, SimResult]


def _describe(
    facility: Facility,
    states: Mapping[str, State],
    cut: Cut,
    services: list[str],
    cache: dict[Cut, _Described] | None = None,
) -> _Described:
    if cache is not None and cut in cache:
        return cache[cut]
    out = _describe_uncached(facility, states, cut, services)
    if cache is not None:
        cache[cut] = out
    return out


def _describe_uncached(facility: Facility, states: Mapping[str, State], cut: Cut, services: list[str]) -> _Described:
    by_id = facility.by_id()
    trial = dict(states)
    trial.update({n: State.failed for n in cut})
    r = simulate(facility, trial)
    lost = [s for s in services if not r.up(s)]
    lost_all = r.lost(facility)
    lost_kw = sum(by_id[n].base_load for n in lost_all)
    impact = sum(max(by_id[n].base_load, 1.0) * max(by_id[n].criticality, 1) for n in lost_all)
    return lost, lost_kw, impact, r


def _likelihood(facility: Facility, cut: Iterable[str]) -> float | None:
    by_id = facility.by_id()
    p = 1.0
    for n in cut:
        rate = by_id[n].failure_rate
        if rate is None:
            return None
        p *= rate
    return p


def _report(
    facility: Facility,
    states: Mapping[str, State],
    cuts: Iterable[Cut],
    services: list[str],
    k: int,
    ncand: int,
    sims: int,
    notes: list[str],
    cache: dict[Cut, _Described],
) -> CutSetReport:
    out: list[CutSet] = []
    for c in cuts:
        lost, kw, impact, _ = _describe(facility, states, c, services, cache)
        if lost:
            out.append(CutSet(sorted(c), len(c), lost, kw, impact, _likelihood(facility, c)))
    out.sort(key=lambda c: (c.order, -c.impact, c.nodes))
    return CutSetReport(out, k, services, ncand, sims, notes)


def _services(facility: Facility, states: Mapping[str, State], services: Iterable[str] | None) -> list[str]:
    base = simulate(facility, states)
    chosen = list(services) if services is not None else facility.critical_services()
    return [s for s in chosen if base.up(s)]


def mocus_cut_sets(
    facility: Facility,
    states: Mapping[str, State] | None = None,
    max_order: int = 3,
    services: Iterable[str] | None = None,
) -> CutSetReport:
    states = dict(states or {})
    svc = _services(facility, states, services)
    basic = candidates(facility, states, svc)
    tree = FaultTree(facility, states, basic, max_order)
    family = _or((tree.node(s) for s in svc), max_order)
    family = {c for c in family if c}  # the empty set means a service is already down
    # Order-1 sweep with the simulator catches single points of failure that only exist through
    # shared-capacity coupling (one failure overloading a supplier somewhere else).
    cache: dict[Cut, _Described] = {}
    singles: set[Cut] = set()
    for b in sorted(basic):
        if _describe(facility, states, frozenset([b]), svc, cache)[0]:
            singles.add(frozenset([b]))
    family = _minimize(family | singles, max_order)
    verified = [c for c in family if _describe(facility, states, c, svc, cache)[0]]
    notes = []
    if len(verified) < len(family):
        notes.append(
            f"{len(family) - len(verified)} structural cut sets were harmless once capacity sharing was simulated"
        )
    return _report(facility, states, verified, svc, max_order, len(basic), len(cache), notes, cache)


def enumerate_cut_sets(
    facility: Facility,
    states: Mapping[str, State] | None = None,
    max_order: int = 3,
    services: Iterable[str] | None = None,
) -> CutSetReport:
    states = dict(states or {})
    svc = _services(facility, states, services)
    basic = sorted(candidates(facility, states, svc))
    found: list[Cut] = []
    cache: dict[Cut, _Described] = {}
    for size in range(1, max_order + 1):
        for combo in combinations(basic, size):
            c = frozenset(combo)
            if any(f <= c for f in found):
                continue
            if _describe(facility, states, c, svc, cache)[0]:
                found.append(c)
    return _report(facility, states, found, svc, max_order, len(basic), len(cache), [], cache)


find_cut_sets = mocus_cut_sets


def maintenance_view(
    facility: Facility,
    states: Mapping[str, State] | None,
    maintenance: Iterable[str],
    max_order: int = 3,
    services: Iterable[str] | None = None,
) -> CutSetReport:
    """Cut sets during a maintenance window, each marked with the order it had before the window."""
    states = dict(states or {})
    maint = sorted(set(maintenance))
    before = {frozenset(c.nodes): c.order for c in find_cut_sets(facility, states, max_order, services).cut_sets}
    during_states = {**states, **{m: State.maintenance for m in maint}}
    during = find_cut_sets(facility, during_states, max_order, services)
    for c in during.cut_sets:
        cut = frozenset(c.nodes)
        if cut in before:
            c.was_order = before[cut]
            continue
        prior = [o for b, o in before.items() if cut < b and b - cut <= set(maint)]
        c.was_order = min(prior) if prior else None
    return during
