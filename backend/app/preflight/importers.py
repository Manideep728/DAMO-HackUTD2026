"""Asset list importers: JSON (the facility model) and CSV (one row per node).

CSV ``requires`` column: groups separated by ``;``, each ``name:mode[:k]:resource[:split]=SUP1|SUP2``.
Example: ``power:capacity:power=PDU-A1|PDU-B1;cooling:capacity:cooling=CRAH-1|CRAH-2``.
Edge provenance, citations and node metadata are not carried by CSV; imported edges are ``documented``.
"""

from __future__ import annotations

import csv
import io

from engine.model import Facility, Mode, Node, RequirementGroup, Resource, Split, Supply

COLUMNS = [
    "id",
    "type",
    "label",
    "zone",
    "capacity",
    "base_load",
    "heat_load",
    "criticality",
    "failure_rate",
    "flexible_kw",
    "requires",
]


def from_json(text: str) -> Facility:
    return Facility.model_validate_json(text)


def to_json(facility: Facility) -> str:
    return facility.model_dump_json(indent=2)


def _group_to_str(g: RequirementGroup) -> str:
    head = [g.name, g.mode.value] + ([str(g.k)] if g.mode == Mode.k_of_n else []) + [g.resource.value]
    if g.split != Split.proportional:
        head.append(g.split.value)
    # CSV has no status column, so only live suppliers are written; a rejected one would come back as live.
    return ":".join(head) + "=" + "|".join(g.live_suppliers())


def _group_from_str(text: str) -> RequirementGroup:
    head, _, sups = text.partition("=")
    parts = head.split(":")
    name, mode = parts[0], Mode(parts[1])
    rest = parts[2:]
    k = int(rest.pop(0)) if mode == Mode.k_of_n else None
    resource = Resource(rest.pop(0)) if rest else Resource.power
    split = Split(rest.pop(0)) if rest else Split.proportional
    return RequirementGroup(
        name=name,
        mode=mode,
        k=k,
        resource=resource,
        split=split,
        suppliers=[Supply(supplier=s) for s in sups.split("|") if s],
    )


def to_csv(facility: Facility) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLUMNS)
    w.writeheader()
    for n in facility.nodes:
        w.writerow(
            {
                "id": n.id,
                "type": n.type.value,
                "label": n.label,
                "zone": n.zone,
                "capacity": n.capacity,
                "base_load": n.base_load,
                "heat_load": n.heat_load,
                "criticality": n.criticality,
                "failure_rate": "" if n.failure_rate is None else n.failure_rate,
                "flexible_kw": n.flexible_kw,
                "requires": ";".join(_group_to_str(g) for g in n.requires),
            }
        )
    return buf.getvalue()


def from_csv(text: str, name: str = "Imported facility") -> Facility:
    nodes = []
    for i, row in enumerate(csv.DictReader(io.StringIO(text)), start=2):
        try:
            nodes.append(
                Node(
                    id=row["id"].strip(),
                    type=row["type"].strip(),
                    label=(row.get("label") or row["id"]).strip(),
                    zone=(row.get("zone") or "").strip(),
                    capacity=float(row.get("capacity") or 0),
                    base_load=float(row.get("base_load") or 0),
                    heat_load=float(row.get("heat_load") or 0),
                    criticality=int(float(row.get("criticality") or 0)),
                    failure_rate=float(row["failure_rate"]) if row.get("failure_rate") else None,
                    flexible_kw=float(row.get("flexible_kw") or 0),
                    provenance="imported",
                    requires=[_group_from_str(g) for g in (row.get("requires") or "").split(";") if g.strip()],
                )
            )
        except (KeyError, ValueError) as e:
            raise ValueError(f"row {i}: {e}") from e
    return Facility(name=name, nodes=nodes)
