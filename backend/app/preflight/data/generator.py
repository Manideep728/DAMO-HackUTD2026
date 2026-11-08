"""Seeded generator for realistic facilities (150–300 nodes).

Dual utility feeds with generators behind transfer switches, A/B power paths down to every rack, a chilled-water
plant with N+1 chillers and pumps, and four halls of CRAH-cooled rows. Capacities are sized from the generated
loads with seeded headroom, so some facilities are comfortable and some are tight.
"""

from __future__ import annotations

import random

from engine.model import Facility, Mode, Split
from engine.model import NodeType as T

from .build import cooling, group, node, power


def generate_facility(seed: int = 0, halls: int = 4) -> Facility:
    rnd = random.Random(seed)
    nodes = []

    def headroom(lo: float = 1.15, hi: float = 1.6) -> float:
        return rnd.uniform(lo, hi)

    rows = {h: rnd.randint(2, 3) for h in range(1, halls + 1)}
    per_row = {(h, r): rnd.randint(8, 12) for h in rows for r in range(1, rows[h] + 1)}
    rack_kw = {(h, r): rnd.choice([10.0, 15.0, 20.0, 30.0]) for (h, r) in per_row}
    hall_kw = {h: sum(per_row[h, r] * rack_kw[h, r] for r in range(1, rows[h] + 1)) for h in rows}
    it_kw = sum(hall_kw.values())

    # Electrical plant
    plant_kw = it_kw * 0.45  # chillers, pumps, CRAH fans
    site_kw = (it_kw + plant_kw) * 1.1
    for side in "AB":
        nodes += [
            node(f"UTIL-{side}", T.utility_feed, "ELEC", capacity=site_kw * headroom(), failure_rate=1e-4),
            node(f"GEN-{side}", T.generator, "ELEC", capacity=site_kw * headroom(1.05, 1.3), failure_rate=5e-4),
            node(
                f"ATS-{side}",
                T.ats,
                "ELEC",
                capacity=site_kw * headroom(),
                failure_rate=2e-5,
                requires=[power(f"UTIL-{side}", f"GEN-{side}", split=Split.first_available)],
            ),
            node(
                f"SWGR-{side}",
                T.switchgear,
                "ELEC",
                capacity=site_kw * headroom(),
                failure_rate=1e-5,
                requires=[power(f"ATS-{side}")],
            ),
            node(
                f"MCC-{side}",
                T.rpp,
                "PLANT",
                capacity=plant_kw * headroom(),
                failure_rate=1e-5,
                requires=[power(f"SWGR-{side}")],
            ),
        ]

    # Cooling plant: N+1 chillers and pumps on alternating MCCs
    n_ch = rnd.randint(2, 3)
    ch_cap = it_kw / (n_ch - 1) * headroom(1.05, 1.3)
    for i in range(1, n_ch + 1):
        nodes.append(
            node(
                f"CH-{i}",
                T.chiller,
                "PLANT",
                capacity=ch_cap,
                base_load=ch_cap * 0.18,
                failure_rate=2e-4,
                requires=[power("MCC-A" if i % 2 else "MCC-B")],
            )
        )
    n_p = rnd.randint(2, 3)
    p_cap = it_kw / (n_p - 1) * headroom(1.05, 1.3)
    for i in range(1, n_p + 1):
        nodes.append(
            node(
                f"PMP-{i}",
                T.pump,
                "PLANT",
                capacity=p_cap,
                base_load=p_cap * 0.03,
                failure_rate=1e-4,
                requires=[power("MCC-A" if i % 2 else "MCC-B")],
            )
        )
    nodes.append(
        node(
            "LOOP-1",
            T.cooling_loop,
            "PLANT",
            capacity=it_kw * 2,
            failure_rate=0,
            requires=[
                cooling(*[f"PMP-{i}" for i in range(1, n_p + 1)], name="pumping"),
                cooling(*[f"CH-{i}" for i in range(1, n_ch + 1)], name="chilling"),
            ],
        )
    )

    for h in rows:
        zone = f"H{h}"
        for side in "AB":
            nodes.append(
                node(
                    f"UPS-{h}{side}",
                    T.ups,
                    zone,
                    capacity=hall_kw[h] * headroom(1.05, 1.4),
                    base_load=hall_kw[h] * 0.03,
                    failure_rate=3e-5,
                    metadata={"battery_minutes": rnd.choice([5, 8, 10])},
                    requires=[power(f"SWGR-{side}")],
                )
            )
        n_crah = rnd.randint(3, 5)
        crah_cap = hall_kw[h] / (n_crah - 1) * headroom(1.0, 1.3)
        crahs = [f"CRAH-{h}{i}" for i in range(1, n_crah + 1)]
        for i, c in enumerate(crahs):
            nodes.append(
                node(
                    c,
                    T.crah,
                    zone,
                    capacity=crah_cap,
                    base_load=crah_cap * 0.04,
                    failure_rate=1e-4,
                    requires=[
                        power(
                            *(("SWGR-A", "SWGR-B") if i % 2 == 0 else ("SWGR-B", "SWGR-A")), split=Split.first_available
                        ),
                        cooling("LOOP-1", name="chilled_water"),
                    ],
                )
            )
        for r in range(1, rows[h] + 1):
            row_kw = per_row[h, r] * rack_kw[h, r]
            for side in "AB":
                nodes.append(
                    node(
                        f"PDU-{h}{r}{side}",
                        T.pdu,
                        zone,
                        capacity=row_kw * headroom(1.0, 1.25),
                        failure_rate=2e-5,
                        requires=[power(f"UPS-{h}{side}")],
                    )
                )
            crit = rnd.choice([1, 2, 3, 4, 5])
            racks = []
            for k in range(1, per_row[h, r] + 1):
                rid = f"RK-{h}{r}-{k:02d}"
                racks.append(rid)
                nodes.append(
                    node(
                        rid,
                        T.rack,
                        zone,
                        base_load=rack_kw[h, r],
                        heat_load=rack_kw[h, r],
                        criticality=crit,
                        flexible_kw=rack_kw[h, r] if crit <= 2 else 0.0,
                        requires=[power(f"PDU-{h}{r}A", f"PDU-{h}{r}B"), cooling(*crahs)],
                    )
                )
            nodes.append(
                node(
                    f"WL-{h}{r}",
                    T.workload,
                    zone,
                    criticality=crit,
                    requires=[group("racks", Mode.k_of_n, racks, k=max(1, len(racks) - 2))],
                )
            )
    return Facility(name=f"Generated facility (seed {seed})", nodes=nodes)
