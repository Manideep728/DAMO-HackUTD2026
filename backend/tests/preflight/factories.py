"""Facility builders for tests: tiny hand-made graphs and a hypothesis strategy for random layered ones."""

from __future__ import annotations

from hypothesis import strategies as st

from app.preflight.data.build import group, node, power
from engine.model import Facility, Mode, Resource, Split
from engine.model import NodeType as T

BIG = 1e6


def source(id: str, capacity: float = BIG, **kw) -> object:
    return node(id, T.utility_feed, "Z", capacity=capacity, failure_rate=1e-4, **kw)


def rack(id: str, *groups, load: float = 10.0, crit: int = 3) -> object:
    return node(id, T.rack, "Z", base_load=load, heat_load=0.0, criticality=crit, requires=list(groups))


@st.composite
def layered_facility(draw, max_layers: int = 3, uncoupled: bool = False) -> Facility:
    """Random acyclic facility: sources, intermediate layers with random group modes, then racks.

    ``uncoupled`` gives every supplier effectively unlimited capacity, so failures only propagate
    structurally. That is the regime where the exact method and enumeration must agree exactly.
    """
    nodes = []
    n_src = draw(st.integers(1, 3))
    prev = [f"S{i}" for i in range(n_src)]
    for sid in prev:
        nodes.append(source(sid, capacity=BIG if uncoupled else draw(st.sampled_from([50.0, 100.0, 400.0]))))
    pool = list(prev)
    for layer in range(draw(st.integers(1, max_layers))):
        this = []
        for i in range(draw(st.integers(1, 4))):
            nid = f"L{layer}N{i}"
            groups = []
            for gi in range(draw(st.integers(1, 2))):
                sup = draw(st.lists(st.sampled_from(pool), min_size=1, max_size=3, unique=True))
                mode = draw(st.sampled_from(list(Mode)))
                k = draw(st.integers(1, len(sup))) if mode == Mode.k_of_n else None
                split = draw(st.sampled_from(list(Split)))
                groups.append(group(f"g{gi}", mode, sup, Resource.power, k=k, split=split))
            cap = BIG if uncoupled else draw(st.sampled_from([30.0, 60.0, 200.0]))
            nodes.append(node(nid, T.pdu, "Z", capacity=cap, failure_rate=1e-4, requires=groups))
            this.append(nid)
        pool += this
    for i in range(draw(st.integers(1, 4))):
        sup = draw(st.lists(st.sampled_from(pool), min_size=1, max_size=2, unique=True))
        nodes.append(
            rack(f"R{i}", power(*sup), load=draw(st.sampled_from([5.0, 10.0, 25.0])), crit=draw(st.integers(1, 5)))
        )
    return Facility(name="random", nodes=nodes)
