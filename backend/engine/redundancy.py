"""Redundancy levels and the independence check.

Capacity redundancy asks "are there enough suppliers?" (2N / N+1 / N / below N). Independence asks "how many
failures does it take to lose them all?", which is the minimum cut order of the group. On a pure OR graph that
equals the number of node-disjoint supply paths (Menger); it stays correct when an intermediate node needs
several inputs at once, where counting paths would overstate independence. A redundant group whose
independence is 1 has a shared upstream dependency, and the order-1 cuts name it.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from .cutsets import SERVICE_TYPES, FaultTree, candidates, upstream
from .model import Facility, Mode, Node, RequirementGroup, Split, State
from .propagate import EPS


@dataclass
class GroupRedundancy:
    node: str
    group: str
    resource: str
    suppliers: list[str]
    needed: int
    available: int
    level: str  # 2N | N+1 | N | below N
    independence: int  # failures needed to defeat the group; 0 = already unmet, > max_order shown as max_order + 1
    shared: list[str]  # single nodes whose failure defeats the whole group


@dataclass
class ServiceRedundancy:
    service: str
    capacity_level: str
    independence: int
    effective: str
    single_points: list[str]
    groups: list[GroupRedundancy]


ORDER = {"below N": 0, "N": 1, "N+1": 2, "2N": 3}


def _level(needed: int, available: int) -> str:
    if available < needed:
        return "below N"
    if available == needed:
        return "N"
    if available >= 2 * needed:
        return "2N"
    return "N+1"


def _needed(tree: FaultTree, consumer: Node, g: RequirementGroup, up: list[str]) -> int:
    if g.mode == Mode.any:
        return 1
    if g.mode == Mode.k_of_n:
        return g.k or 1
    if g.mode == Mode.all:
        return len(g.live_suppliers())
    need = sum(tree.base.shares.get((consumer.id, s), 0.0) for s in g.live_suppliers())
    if g.split == Split.first_available:
        return 1 if any(tree.spare(consumer.id, s) + EPS >= need for s in up) else len(up) + 1
    spares = sorted((tree.spare(consumer.id, s) for s in up), reverse=True)
    total = 0.0
    for i, sp in enumerate(spares, 1):
        total += sp
        if total + EPS >= need:
            return i
    return len(up) + 1


def group_redundancy(tree: FaultTree, consumer: Node, g: RequirementGroup) -> GroupRedundancy:
    sup = g.live_suppliers()
    up = [s for s in sup if tree.base.up(s)]
    cuts = tree.group(consumer, g)
    independence = 0 if frozenset() in cuts else min((len(c) for c in cuts), default=tree.k + 1)
    shared = sorted(next(iter(c)) for c in cuts if len(c) == 1)
    needed = _needed(tree, consumer, g, up)
    return GroupRedundancy(
        consumer.id, g.name, g.resource.value, sup, needed, len(up), _level(needed, len(up)), independence, shared
    )


def service_redundancy(
    facility: Facility, states: Mapping[str, State] | None = None, max_order: int = 3
) -> list[ServiceRedundancy]:
    states = dict(states or {})
    by_id = facility.by_id()
    services = facility.critical_services()
    tree = FaultTree(facility, states, candidates(facility, states, services), max_order)
    out = []
    seen: dict[tuple[str, str], GroupRedundancy] = {}  # shared infrastructure groups appear under many services

    def cached(n: Node, g: RequirementGroup) -> GroupRedundancy:
        if (n.id, g.name) not in seen:
            seen[(n.id, g.name)] = group_redundancy(tree, n, g)
        return seen[(n.id, g.name)]

    for svc in services:
        closure = [by_id[n] for n in sorted(upstream(facility, [svc]) | {svc})]
        # Redundant groups on the service and on the infrastructure feeding it (other racks are not part of it).
        groups = [
            cached(n, g)
            for n in closure
            if n.type not in SERVICE_TYPES or n.id == svc
            for g in n.requires
            if len(g.live_suppliers()) > 1 and g.mode != Mode.all
        ]
        cuts = {c for c in tree.node(svc) if c}
        if not tree.base.up(svc):
            independence = 0
        else:
            independence = min((len(c) for c in cuts), default=max_order + 1)
        singles = sorted(next(iter(c)) for c in cuts if len(c) == 1)
        cap = min((gr.level for gr in groups), key=ORDER.__getitem__, default="N")
        if independence == 0:
            effective = "below N"
        elif independence == 1:
            effective = "N"
        else:
            effective = cap
        out.append(ServiceRedundancy(svc, cap, independence, effective, singles, groups))
    return out
