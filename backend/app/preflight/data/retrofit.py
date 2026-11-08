"""SYNTHETIC retrofit fixture: the demo hall H1 plus one liquid-cooled GPU row (R3) on a single CDU.

Everything here is constructed for the demo; no real site is described. The existing hall is `demo_facility()`
unchanged; the retrofit adds:

- facility (primary) water: `CHW-LOOP` → isolation valve `V-FW-1` → `CDU-1`
- rack-facing (secondary) coolant: `CDU-1` + its two internal pumps → `TCS-1` → rack valves `V-R3-01`/`V-R3-02`
- GPU racks `R3-01` (Rack A) and `R3-02` (Rack B): 45 kW each, 40 kW to liquid, 5 kW to room air (sized so the
  existing chillers and CRAHs keep their N+1: one chiller still carries the whole hall)
- leak sensing cables `LD-1` (CDU cabinet), `LD-2`, `LD-3`; which rack each cable runs under is in the rack
  drawing (`app/retrofit/sites/h1/rack_drawing.txt`), not here

The two CDU pumps make the secondary loop 2N by capacity, but both hang off one panel (`PNL-CDU`) behind one CDU
and one facility-water valve: by independence the liquid racks are N. That is the redundancy check doing its job.
"""

from __future__ import annotations

from engine.model import Facility, Loop, Mode
from engine.model import NodeType as T

from .build import cooling, group, node, power
from .demo import demo_facility, demo_profiles

LIQUID_RACKS = ("R3-01", "R3-02")


def retrofit_facility() -> Facility:
    base = demo_facility()
    nodes = [n.model_copy(update={"loop": Loop.primary}) if n.id == "CHW-LOOP" else n for n in base.nodes]
    nodes += [
        node("PDU-A3", T.pdu, "H1", "PDU A3 (liquid row)", capacity=220, failure_rate=2e-5, requires=[power("UPS-A")]),
        node("PDU-B3", T.pdu, "H1", "PDU B3 (liquid row)", capacity=220, failure_rate=2e-5, requires=[power("UPS-B")]),
        node("PNL-CDU", T.rpp, "H1", "CDU panel", capacity=60, failure_rate=1e-5, requires=[power("SWGR-A")]),
        node(
            "V-FW-1",
            T.valve,
            "H1",
            "Facility water isolation valve",
            capacity=120,
            failure_rate=1e-5,
            loop=Loop.primary,
            requires=[cooling("CHW-LOOP", name="facility_water", loop=Loop.primary)],
        ),
        node(
            "CDU-1",
            T.cdu,
            "H1",
            "Coolant distribution unit 1",
            capacity=100,
            base_load=4,
            failure_rate=1e-4,
            requires=[power("PNL-CDU"), cooling("V-FW-1", name="facility_water", loop=Loop.primary)],
            metadata={"firmware": "2.3.0", "synthetic": True},
        ),
    ]
    nodes += [
        node(
            f"CDU-1-P{i}",
            T.pump,
            "H1",
            f"CDU-1 pump {i}",
            capacity=100,
            base_load=3,
            failure_rate=1e-4,
            requires=[power("PNL-CDU")],
        )
        for i in (1, 2)
    ]
    nodes.append(
        node(
            "TCS-1",
            T.cooling_loop,
            "H1",
            "Rack coolant loop (secondary)",
            capacity=100,
            failure_rate=0,
            loop=Loop.secondary,
            requires=[
                cooling("CDU-1-P1", "CDU-1-P2", name="pumping", loop=Loop.secondary),
                cooling("CDU-1", name="exchange", loop=Loop.secondary),
            ],
        )
    )
    for i, rack in enumerate(LIQUID_RACKS, 1):
        valve = f"V-{rack}"
        nodes.append(
            node(
                valve,
                T.valve,
                "H1",
                f"Rack {rack} isolation valve",
                capacity=60,
                failure_rate=1e-5,
                loop=Loop.secondary,
                requires=[cooling("TCS-1", name="coolant", loop=Loop.secondary)],
            )
        )
        nodes.append(
            node(
                rack,
                T.rack,
                "H1",
                f"Rack {rack} (GPU, liquid, Rack {'AB'[i - 1]})",
                base_load=45,
                heat_load=45,
                criticality=4,
                # Room air first: the planner's temporary cooling attaches to the first cooling group.
                requires=[
                    power("PDU-A3", "PDU-B3"),
                    cooling("CRAH-1", "CRAH-2", name="air", demand=5),
                    cooling(valve, name="liquid", demand=40, loop=Loop.secondary),
                ],
                metadata={"ride_through_min": 1, "cooling": "liquid", "synthetic": True},
            )
        )
    nodes += [
        node(f"LD-{z}", T.leak_sensor, "H1", label, failure_rate=1e-5, requires=[power("PNL-CDU")])
        for z, label in ((1, "Leak cable zone 1 (CDU cabinet)"), (2, "Leak cable zone 2"), (3, "Leak cable zone 3"))
    ]
    nodes.append(
        node(
            "WL-TRAIN",
            T.workload,
            "H1",
            "GPU training job",
            criticality=3,
            requires=[group("racks", Mode.all, list(LIQUID_RACKS))],
        )
    )
    return Facility(name="Demo hall H1 + liquid retrofit (synthetic)", nodes=nodes)


def retrofit_profiles() -> dict[str, list[float]]:
    profiles = demo_profiles()
    profiles.update({r: [1.0] * 24 for r in LIQUID_RACKS})  # training runs flat out around the clock
    return profiles
