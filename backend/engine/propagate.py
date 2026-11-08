"""Steady-state propagation.

Two monotone phases, so the result is deterministic and terminates on any graph, cycles included:

1. Support (least fixpoint). Start from nothing; repeatedly mark a node supported once every group is met by
   nodes already supported. A loop with no outside source never supports itself.
2. Capacity (shedding). Throughput flows from consumers up to suppliers through capacity groups. While any
   supplier carries more than its capacity, the consumer of that supplier with the lowest effective
   criticality is shed (ties: larger share first, then id), and support is recomputed without it.

Shedding policy: highest-criticality loads keep power and cooling; low-criticality branches are shed first,
like a load-shed scheme. A consumer's effective criticality is the highest criticality it serves downstream.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from .model import Facility, Mode, Node, NodeType, RequirementGroup, Resource, Split, State

EPS = 1e-9
DEGRADED_MARGIN = 0.10  # a supplier under 10% headroom is reported as degraded

DOWN_STATES = (State.failed, State.maintenance)


@dataclass
class Cause:
    kind: str  # "down" (set by the scenario), "unsupported" (a group is unmet), "shed" (capacity)
    group: str | None = None
    missing: list[str] = field(default_factory=list)
    at: str | None = None  # the overloaded supplier, for "shed"
    detail: str = ""


@dataclass
class NodeResult:
    id: str
    state: State
    load: dict[str, float]  # throughput per resource, kW
    capacity: float
    margin: float | None  # capacity minus load served, for suppliers
    cause: Cause | None = None


@dataclass
class SimResult:
    nodes: dict[str, NodeResult]
    shares: dict[tuple[str, str], float]  # (consumer, supplier) -> kW served

    def up(self, node_id: str) -> bool:
        return self.nodes[node_id].state in (State.operational, State.degraded)

    def lost(self, facility: Facility) -> list[str]:
        return [
            n.id
            for n in facility.nodes
            if n.type in (NodeType.rack, NodeType.workload) and self.nodes[n.id].state == State.failed
        ]

    def trace(self, node_id: str) -> list[dict]:
        """Causal chain for a failed node: each step names the node, why it is down and what it was waiting on."""
        out: list[dict] = []
        seen: set[str] = set()
        frontier = [node_id]
        while frontier:
            nid = frontier.pop(0)
            if nid in seen:
                continue
            seen.add(nid)
            r = self.nodes[nid]
            if r.cause is None:
                continue
            out.append({"node": nid, "state": r.state.value, **r.cause.__dict__})
            frontier.extend(r.cause.missing)
            if r.cause.at:
                frontier.append(r.cause.at)
        return out


class _Graph:
    """Live suppliers per group, computed once per simulation instead of on every visit."""

    def __init__(self, facility: Facility):
        self.by_id = facility.by_id()
        self.nodes = facility.nodes
        self.groups = {n.id: [(g, tuple(g.live_suppliers())) for g in n.requires] for n in facility.nodes}


def _group_met(g: RequirementGroup, sup: tuple[str, ...], alive: set[str]) -> tuple[bool, list[str]]:
    up = [s for s in sup if s in alive]
    missing = [s for s in sup if s not in alive]
    if g.mode == Mode.all:
        ok = not missing
    elif g.mode == Mode.k_of_n:
        ok = len(up) >= (g.k or 1)
    else:  # any, capacity: at least one live supplier (capacity is checked in phase 2)
        ok = bool(up)
    return ok, missing


def support(facility: Facility, down: Iterable[str], graph: _Graph | None = None) -> tuple[set[str], dict[str, Cause]]:
    graph = graph or _Graph(facility)
    nodes = facility.nodes
    down_set = set(down)
    alive: set[str] = set()
    changed = True
    while changed:
        changed = False
        for n in nodes:
            if n.id in alive or n.id in down_set:
                continue
            if all(_group_met(g, sup, alive)[0] for g, sup in graph.groups[n.id]):
                alive.add(n.id)
                changed = True
    causes: dict[str, Cause] = {}
    for n in nodes:
        if n.id in alive or n.id in down_set:
            continue
        for g, sup in graph.groups[n.id]:
            ok, missing = _group_met(g, sup, alive)
            if not ok:
                causes[n.id] = Cause("unsupported", g.name, missing, detail=f"{g.mode.value} group '{g.name}' unmet")
                break
    _mark_unsourced_cycles(causes, down_set)
    return alive, causes


def _mark_unsourced_cycles(causes: dict[str, Cause], down: set[str]) -> None:
    """Label nodes whose missing suppliers lead only back into unsupported nodes, never to a down node."""
    memo: dict[str, bool] = {}

    def reaches_down(nid: str, path: set[str]) -> bool:
        if nid in down:
            return True
        if nid in memo:
            return memo[nid]
        if nid in path or nid not in causes:
            return False
        path.add(nid)
        found = any(reaches_down(m, path) for m in causes[nid].missing)
        path.discard(nid)
        memo[nid] = found
        return found

    for nid, cause in causes.items():
        if not reaches_down(nid, set()):
            cause.detail += " (dependency cycle with no outside source)"


def _own(n: Node, r: Resource) -> float:
    return n.base_load if r == Resource.power else n.heat_load


def _split(
    g: RequirementGroup, sup: tuple[str, ...], demand: float, alive: set[str], by_id: Mapping[str, Node]
) -> dict[str, float]:
    up = [s for s in sup if s in alive]
    if not up or demand <= 0:
        return {}
    if g.split == Split.first_available:
        return {up[0]: demand}
    total = sum(by_id[s].capacity for s in up)
    if total <= 0:
        return {s: demand / len(up) for s in up}
    return {s: demand * by_id[s].capacity / total for s in up}


def loads(
    facility: Facility, alive: set[str], scale: Mapping[str, float] | None = None, graph: _Graph | None = None
) -> tuple[dict[str, dict[Resource, float]], dict[tuple[str, str], float]]:
    """Throughput per node and resource, and the kW each consumer draws from each supplier.

    Own load can be scaled per node (load profiles, shed GPU work). Iterates to a fixpoint so cyclic graphs
    are handled; acyclic graphs converge in depth-many rounds.
    """
    graph = graph or _Graph(facility)
    by_id = graph.by_id
    scale = scale or {}
    live = [n for n in facility.nodes if n.id in alive]
    own = {n.id: {r: _own(n, r) * scale.get(n.id, 1.0) for r in Resource} for n in live}
    through = {nid: dict(v) for nid, v in own.items()}
    shares: dict[tuple[str, str], float] = {}

    # Fast path: visit consumers before their suppliers, so one pass settles an acyclic graph.
    feeds: dict[str, set[str]] = {n.id: set() for n in live}  # node -> its live capacity suppliers
    waiting = {n.id: 0 for n in live}  # node -> consumers not yet visited
    for n in live:
        for g, sup in graph.groups[n.id]:
            if g.mode == Mode.capacity:
                feeds[n.id].update(s for s in sup if s in alive and s != n.id)
        for s in feeds[n.id]:
            waiting[s] += 1
    ready = [n.id for n in live if waiting[n.id] == 0]
    done = 0
    while ready:
        nid = ready.pop()
        done += 1
        for g, sup in graph.groups[nid]:
            if g.mode != Mode.capacity:
                continue
            demand = g.demand if g.demand is not None else through[nid][g.resource]
            for s, kw in _split(g, sup, demand, alive, by_id).items():
                shares[(nid, s)] = shares.get((nid, s), 0.0) + kw
                through[s][g.resource] += kw
        for s in feeds[nid]:
            waiting[s] -= 1
            if waiting[s] == 0:
                ready.append(s)
    if done == len(live):
        return through, shares

    # A capacity cycle: fall back to iterating the whole graph to a fixpoint.
    through = {nid: dict(v) for nid, v in own.items()}
    shares = {}
    for _ in range(len(live) + 2):
        new_shares: dict[tuple[str, str], float] = {}
        for n in live:
            for g, sup in graph.groups[n.id]:
                if g.mode != Mode.capacity:
                    continue
                demand = g.demand if g.demand is not None else through[n.id][g.resource]
                for s, kw in _split(g, sup, demand, alive, by_id).items():
                    new_shares[(n.id, s)] = new_shares.get((n.id, s), 0.0) + kw
        new_through = {nid: dict(v) for nid, v in own.items()}
        for (c, s), kw in new_shares.items():
            res = _resource_of(by_id[c], s)
            new_through[s][res] += kw
        stable = new_shares.keys() == shares.keys() and all(abs(new_shares[k] - shares[k]) < EPS for k in new_shares)
        shares, through = new_shares, new_through
        if stable:
            break
    return through, shares


def _resource_of(consumer: Node, supplier: str) -> Resource:
    for g in consumer.requires:
        if g.mode == Mode.capacity and supplier in g.live_suppliers():
            return g.resource
    return Resource.power


def effective_criticality(facility: Facility, graph: _Graph | None = None) -> dict[str, int]:
    """Highest criticality a node serves, itself included. Fixpoint, so cycles are fine."""
    graph = graph or _Graph(facility)
    eff = {n.id: n.criticality for n in facility.nodes}
    changed = True
    while changed:
        changed = False
        for n in facility.nodes:
            for _, sup in graph.groups[n.id]:
                for s in sup:
                    if eff[n.id] > eff[s]:
                        eff[s] = eff[n.id]
                        changed = True
    return eff


def _downstream(supplier: str, feeders: Mapping[str, list[str]]) -> set[str]:
    seen: set[str] = set()
    stack = list(feeders.get(supplier, []))
    while stack:
        c = stack.pop()
        if c not in seen:
            seen.add(c)
            stack.extend(feeders.get(c, []))
    return seen


def _shed_victims(
    supplier: str,
    excess: float,
    below: set[str],
    feeders: Mapping[str, list[str]],
    shares: Mapping[tuple[str, str], float],
    through: Mapping[str, Mapping[Resource, float]],
    own: Mapping[str, float],
    eff: Mapping[str, int],
) -> list[str]:
    """Loads to shed for an overloaded supplier: lowest-criticality end loads first, until it fits.

    Splits are linear, so the load an end node frees at ``supplier`` is its own load times the fraction of
    its demand that flows through ``supplier`` (exact when its power and heat follow the same split), which
    lets one round shed what one-at-a-time shedding would. Shedding end loads (a rack, a chiller) rather
    than the distribution in between keeps the rest of the branch running. Ties go to the larger load, then
    to id order.
    """
    frac: dict[str, float] = {supplier: 1.0}

    def fraction(n: str) -> float:
        if n not in frac:
            total = sum(kw for (c, _), kw in shares.items() if c == n) or 1.0
            frac[n] = sum(
                kw / total * fraction(p) for (c, p), kw in shares.items() if c == n and (p in below or p == supplier)
            )
        return frac[n]

    ends = sorted((c for c in below if c not in feeders), key=lambda c: (eff[c], -sum(through[c].values()), c))
    victims, freed = [], 0.0
    for c in ends:
        gain = own.get(c, 0.0) * fraction(c)
        if gain <= EPS:
            continue
        victims.append(c)
        freed += gain
        if freed + EPS >= excess:
            break
    return victims or [min(sorted(below), key=lambda c: (eff[c], -sum(through[c].values()), c))]


def simulate(
    facility: Facility,
    states: Mapping[str, State] | None = None,
    scale: Mapping[str, float] | None = None,
) -> SimResult:
    states = dict(states or {})
    graph = _Graph(facility)
    by_id = graph.by_id
    eff = effective_criticality(facility, graph)
    down = {nid for nid, st in states.items() if st in DOWN_STATES}
    shed: dict[str, Cause] = {}
    while True:
        alive, causes = support(facility, down | set(shed), graph)
        through, shares = loads(facility, alive, scale, graph)
        served: dict[str, float] = {}
        for (_, s), kw in shares.items():
            served[s] = served.get(s, 0.0) + kw
        over = sorted(
            (s for s, kw in served.items() if kw > by_id[s].capacity + EPS),
            key=lambda s: (-(served[s] / max(by_id[s].capacity, EPS)), s),
        )
        if not over:
            break
        # Shed one load per overloaded supplier in the same round when their downstream sets are disjoint:
        # shedding under one cannot change the load on the other, so this matches shedding one at a time.
        feeders: dict[str, list[str]] = {}
        for c, sup in shares:
            feeders.setdefault(sup, []).append(c)
        claimed: set[str] = set()
        for s in over:
            below = _downstream(s, feeders)
            if below & claimed:
                continue
            claimed |= below
            own = {c: sum(_own(by_id[c], r) * (scale or {}).get(c, 1.0) for r in Resource) for c in below}
            for victim in _shed_victims(s, served[s] - by_id[s].capacity, below, feeders, shares, through, own, eff):
                shed[victim] = Cause(
                    "shed",
                    at=s,
                    detail=f"{s} overloaded ({served[s]:.1f} of {by_id[s].capacity:.1f} kW); "
                    "shed lowest-criticality load",
                )

    result: dict[str, NodeResult] = {}
    for n in facility.nodes:
        cause: Cause | None
        load = {r.value: through.get(n.id, {}).get(r, 0.0) for r in Resource}
        margin = n.capacity - served.get(n.id, 0.0) if n.capacity > 0 else None
        if n.id in down:
            st, cause = states[n.id], Cause("down", detail=f"set to {states[n.id].value} by scenario")
        elif n.id in shed:
            st, cause = State.failed, shed[n.id]
        elif n.id not in alive:
            st, cause = State.failed, causes.get(n.id)
        else:
            st, cause = State.operational, None
            lost_redundancy = any(
                g.mode != Mode.all and any(s not in alive for s in sup) for g, sup in graph.groups[n.id]
            )
            thin = margin is not None and n.capacity > 0 and margin < DEGRADED_MARGIN * n.capacity
            if lost_redundancy or thin:
                st = State.degraded
        result[n.id] = NodeResult(n.id, st, load, n.capacity, margin, cause)
    return SimResult(result, shares)
