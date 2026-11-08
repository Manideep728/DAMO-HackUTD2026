"""Facility model: nodes, requirement groups and the edges inside them.

A node is operational iff every one of its requirement groups is satisfied. Each group lists its suppliers as
edges; only confirmed edges take part in simulation. Suspected edges come from discovery and stay out of the
graph until an engineer confirms them.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class NodeType(StrEnum):
    utility_feed = "utility_feed"
    generator = "generator"
    switchgear = "switchgear"
    ups = "ups"
    ats = "ats"
    pdu = "pdu"
    rpp = "rpp"
    chiller = "chiller"
    pump = "pump"
    cooling_loop = "cooling_loop"
    crah = "crah"
    rack = "rack"
    workload = "workload"
    cdu = "cdu"  # coolant distribution unit: heat exchange between facility water and the rack-facing loop
    leak_sensor = "leak_sensor"
    valve = "valve"  # isolation or energy valve; passes the cooling it is fed, closed = maintenance/failed


class State(StrEnum):
    operational = "operational"
    degraded = "degraded"
    maintenance = "maintenance"
    failed = "failed"


class Mode(StrEnum):
    all = "all"
    any = "any"
    k_of_n = "k_of_n"
    capacity = "capacity"


class Resource(StrEnum):
    power = "power"
    cooling = "cooling"


class Loop(StrEnum):
    """Which water loop a cooling node or edge belongs to. Liquid cooling has two that must never be confused."""

    primary = "primary"  # facility water (chilled-water plant side of the CDU)
    secondary = "secondary"  # rack-facing coolant (technology cooling system side of the CDU)


class Split(StrEnum):
    proportional = "proportional"  # demand shared across live suppliers in proportion to their capacity
    first_available = "first_available"  # whole demand goes to the first live supplier, in listed order (ATS-style)


class EdgeSource(StrEnum):
    documented = "documented"
    inferred_from_docs = "inferred_from_docs"
    engineer_confirmed = "engineer_confirmed"


class EdgeStatus(StrEnum):
    confirmed = "confirmed"
    suspected = "suspected"
    rejected = "rejected"


class Citation(BaseModel):
    doc_id: str
    quote: str


class Supply(BaseModel):
    """One supplier edge inside a requirement group."""

    supplier: str
    source: EdgeSource = EdgeSource.documented
    status: EdgeStatus = EdgeStatus.confirmed
    confidence: float = Field(1.0, ge=0, le=1)
    citations: list[Citation] = []


def _is(s: Supply, source: EdgeSource, status: EdgeStatus) -> bool:
    return s.source == source and s.status == status


class RequirementGroup(BaseModel):
    name: str
    resource: Resource = Resource.power
    mode: Mode
    suppliers: list[Supply]
    k: int | None = None
    demand: float | None = None  # capacity mode only; default is the node's own throughput for this resource
    split: Split = Split.proportional
    loop: Loop | None = None  # cooling groups only: which water loop the supply arrives over

    @model_validator(mode="after")
    def _check(self) -> RequirementGroup:
        if self.mode == Mode.k_of_n and (self.k is None or not 1 <= self.k <= len(self.suppliers)):
            raise ValueError(f"group {self.name}: k_of_n needs 1 <= k <= {len(self.suppliers)}")
        if self.loop is not None and self.resource != Resource.cooling:
            raise ValueError(f"group {self.name}: only cooling groups belong to a water loop")
        return self

    def live_suppliers(self) -> list[str]:
        return [s.supplier for s in self.suppliers if s.status == EdgeStatus.confirmed]


class Node(BaseModel):
    id: str
    type: NodeType
    label: str = ""
    zone: str = ""
    capacity: float = 0.0  # kW of power or kW of heat removal, for the resource it supplies
    base_load: float = 0.0  # kW of electrical draw
    heat_load: float = 0.0  # kW of heat it needs removed (racks: usually equal to base_load)
    criticality: int = 0  # 0 = none … 5 = highest
    failure_rate: float | None = None  # per-hour probability, optional
    flexible_kw: float = 0.0  # load that can be shed or shifted during maintenance (GPU batch work)
    metadata: dict[str, Any] = {}
    provenance: str = "documented"
    loop: Loop | None = None  # cooling loops, valves and CDUs: the water loop this node sits on
    requires: list[RequirementGroup] = []


class Facility(BaseModel):
    name: str
    nodes: list[Node]
    critical_threshold: int = 3  # racks/workloads at or above this criticality are critical services

    @model_validator(mode="after")
    def _check_refs(self) -> Facility:
        ids = [n.id for n in self.nodes]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate node ids")
        known = set(ids)
        for n in self.nodes:
            for g in n.requires:
                for s in g.suppliers:
                    if s.supplier not in known:
                        raise ValueError(f"{n.id}.{g.name}: unknown supplier {s.supplier}")
        return self

    def by_id(self) -> dict[str, Node]:
        return {n.id: n for n in self.nodes}

    def critical_services(self) -> list[str]:
        return [
            n.id
            for n in self.nodes
            if n.type in (NodeType.rack, NodeType.workload) and n.criticality >= self.critical_threshold
        ]

    def with_edge(self, consumer: str, group: str, supply: Supply, replace: str | None = None) -> Facility:
        """Copy of the facility with one edge added to a group. A replaced supplier stays in the group as rejected,
        so the model remembers where the consumer used to be fed from and a plan can offer to move it back."""
        f = self.model_copy(deep=True)
        node = f.by_id()[consumer]
        for g in node.requires:
            if g.name == group:
                for s in g.suppliers:
                    if s.supplier == replace:
                        s.status = EdgeStatus.rejected
                g.suppliers = [s for s in g.suppliers if s.supplier != supply.supplier] + [supply]
                return Facility.model_validate(f.model_dump())
        raise KeyError(f"{consumer} has no group {group}")

    def restorable(self) -> list[tuple[str, str, str, str]]:
        """(consumer, group, current supplier, documented supplier) for every group whose documented feed was
        replaced by one found in the records: the feed the drawings say it should be on."""
        out = []
        for n in self.nodes:
            for g in n.requires:
                old = [s.supplier for s in g.suppliers if _is(s, EdgeSource.documented, EdgeStatus.rejected)]
                new = [s.supplier for s in g.suppliers if _is(s, EdgeSource.engineer_confirmed, EdgeStatus.confirmed)]
                if len(old) == 1 and len(new) == 1:
                    out.append((n.id, g.name, new[0], old[0]))
        return out

    def with_restored(self, consumer: str) -> Facility:
        """Copy with the consumer switched back to its documented feed, the record-found feed set aside."""
        match = [r for r in self.restorable() if r[0] == consumer]
        if not match:
            raise KeyError(f"{consumer} has no documented feed to restore")
        _, group, current, documented = match[0]
        f = self.model_copy(deep=True)
        for g in f.by_id()[consumer].requires:
            if g.name == group:
                for s in g.suppliers:
                    if s.supplier == documented:
                        s.status = EdgeStatus.confirmed
                    elif s.supplier == current:
                        s.status = EdgeStatus.rejected
        return f
