"""The demo facility: one hall, A/B power, a chilled-water plant with two pumps.

On paper Pump A and Pump B sit on independent power paths (MCC-A via ATS-1, MCC-B via ATS-2). The records in
the discovery corpus show MCC-B was re-fed from ATS-1 during an ATS-2 replacement and never moved back. That
edge is not in this graph; it has to be discovered and confirmed.
"""

from __future__ import annotations

from engine.model import Facility, Mode, Split
from engine.model import NodeType as T

from .build import cooling, group, node, power

FIRST = Split.first_available


def demo_facility() -> Facility:
    n = []
    # Power plant
    n += [
        node("UTIL-A", T.utility_feed, "ELEC", "Utility feed A", capacity=2000, failure_rate=1e-4),
        node("UTIL-B", T.utility_feed, "ELEC", "Utility feed B", capacity=2000, failure_rate=1e-4),
        node("GEN-1", T.generator, "ELEC", "Generator 1", capacity=1500, failure_rate=5e-4),
        node("GEN-2", T.generator, "ELEC", "Generator 2", capacity=1500, failure_rate=5e-4),
        node(
            "ATS-1",
            T.ats,
            "ELEC",
            "Transfer switch 1",
            capacity=1500,
            failure_rate=2e-5,
            requires=[power("UTIL-A", "GEN-1", split=FIRST)],
        ),
        node(
            "ATS-2",
            T.ats,
            "ELEC",
            "Transfer switch 2",
            capacity=1500,
            failure_rate=2e-5,
            requires=[power("UTIL-B", "GEN-2", split=FIRST)],
        ),
        node(
            "SWGR-A", T.switchgear, "ELEC", "Switchgear A", capacity=1500, failure_rate=1e-5, requires=[power("ATS-1")]
        ),
        node(
            "SWGR-B", T.switchgear, "ELEC", "Switchgear B", capacity=1500, failure_rate=1e-5, requires=[power("ATS-2")]
        ),
        node(
            "UPS-A",
            T.ups,
            "ELEC",
            "UPS A",
            capacity=600,
            base_load=12,
            failure_rate=3e-5,
            requires=[power("SWGR-A")],
            metadata={"battery_minutes": 8},
        ),
        node(
            "UPS-B",
            T.ups,
            "ELEC",
            "UPS B",
            capacity=600,
            base_load=12,
            failure_rate=3e-5,
            requires=[power("SWGR-B")],
            metadata={"battery_minutes": 8},
        ),
    ]
    for side, ups in (("A", "UPS-A"), ("B", "UPS-B")):
        for row in (1, 2):
            n.append(
                node(
                    f"PDU-{side}{row}",
                    T.pdu,
                    "H1",
                    f"PDU {side}{row}",
                    capacity=220,
                    failure_rate=2e-5,
                    requires=[power(ups)],
                )
            )
    # Mechanical plant. MCC panels are modelled as remote power panels.
    n += [
        node("MCC-A", T.rpp, "PLANT", "Pump MCC A", capacity=150, failure_rate=1e-5, requires=[power("ATS-1")]),
        node("MCC-B", T.rpp, "PLANT", "Pump MCC B", capacity=150, failure_rate=1e-5, requires=[power("ATS-2")]),
        node(
            "PUMP-A",
            T.pump,
            "PLANT",
            "Pump A",
            capacity=600,
            base_load=15,
            failure_rate=1e-4,
            requires=[power("MCC-A")],
        ),
        node(
            "PUMP-B",
            T.pump,
            "PLANT",
            "Pump B",
            capacity=600,
            base_load=15,
            failure_rate=1e-4,
            requires=[power("MCC-B")],
        ),
        node(
            "CH-1",
            T.chiller,
            "PLANT",
            "Chiller 1",
            capacity=500,
            base_load=90,
            failure_rate=2e-4,
            requires=[power("SWGR-A")],
        ),
        node(
            "CH-2",
            T.chiller,
            "PLANT",
            "Chiller 2",
            capacity=500,
            base_load=90,
            failure_rate=2e-4,
            requires=[power("SWGR-B")],
        ),
        node(
            "CHW-LOOP",
            T.cooling_loop,
            "PLANT",
            "Chilled-water loop",
            capacity=1000,
            failure_rate=0,
            requires=[cooling("PUMP-A", "PUMP-B", name="pumping"), cooling("CH-1", "CH-2", name="chilling")],
        ),
    ]
    for i, swgr in ((1, "SWGR-A"), (2, "SWGR-B"), (3, "SWGR-A"), (4, "SWGR-B")):
        n.append(
            node(
                f"CRAH-{i}",
                T.crah,
                "H1",
                f"CRAH {i}",
                capacity=220,
                base_load=8,
                failure_rate=1e-4,
                requires=[power(swgr), cooling("CHW-LOOP", name="chilled_water")],
            )
        )
    # Row 1: production inference (critical). Row 2: flexible GPU batch work.
    for row, crit, flex, crahs in ((1, 4, 0.0, ("CRAH-1", "CRAH-2")), (2, 2, 25.0, ("CRAH-3", "CRAH-4"))):
        for r in range(1, 9):
            n.append(
                node(
                    f"R{row}-{r:02d}",
                    T.rack,
                    "H1",
                    f"Rack {row}-{r:02d}",
                    base_load=25,
                    heat_load=25,
                    criticality=crit,
                    flexible_kw=flex,
                    requires=[power(f"PDU-A{row}", f"PDU-B{row}"), cooling(*crahs)],
                )
            )
    n += [
        node(
            "WL-INFER",
            T.workload,
            "H1",
            "Inference service",
            criticality=5,
            requires=[group("racks", Mode.k_of_n, [f"R1-{r:02d}" for r in range(1, 9)], k=6)],
        ),
        node(
            "WL-BATCH",
            T.workload,
            "H1",
            "Batch training",
            criticality=1,
            requires=[group("racks", Mode.any, [f"R2-{r:02d}" for r in range(1, 9)])],
        ),
    ]
    return Facility(name="Demo hall H1", nodes=n)
