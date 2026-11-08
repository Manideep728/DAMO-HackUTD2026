"""Small helpers for writing facilities as code (demo facility and generator)."""

from __future__ import annotations

from typing import Any

from engine.model import Loop, Mode, Node, NodeType, RequirementGroup, Resource, Split, Supply


def group(
    name: str,
    mode: Mode,
    suppliers: list[str],
    resource: Resource = Resource.power,
    k: int | None = None,
    split: Split = Split.proportional,
) -> RequirementGroup:
    return RequirementGroup(
        name=name, mode=mode, resource=resource, k=k, split=split, suppliers=[Supply(supplier=s) for s in suppliers]
    )


def power(*suppliers: str, split: Split = Split.proportional) -> RequirementGroup:
    return group("power", Mode.capacity, list(suppliers), Resource.power, split=split)


def cooling(
    *suppliers: str, name: str = "cooling", demand: float | None = None, loop: Loop | None = None
) -> RequirementGroup:
    return RequirementGroup(
        name=name,
        mode=Mode.capacity,
        resource=Resource.cooling,
        demand=demand,
        loop=loop,
        suppliers=[Supply(supplier=s) for s in suppliers],
    )


def node(id: str, type: NodeType, zone: str, label: str = "", **kw: Any) -> Node:
    return Node(id=id, type=type, zone=zone, label=label or id, **kw)
