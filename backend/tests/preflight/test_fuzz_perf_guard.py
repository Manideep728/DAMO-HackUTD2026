import pathlib
import random
import re
import time

import pytest

from app.preflight.data.demo import demo_facility
from app.preflight.data.generator import generate_facility
from engine.cutsets import mocus_cut_sets
from engine.model import State
from engine.propagate import simulate

ENGINE = pathlib.Path(__file__).resolve().parents[2] / "engine"


@pytest.mark.parametrize("seed", range(5))
def test_random_toggle_sequences_stay_consistent(seed):
    f = generate_facility(seed)
    rnd = random.Random(seed)
    ids = [n.id for n in f.nodes]
    states: dict[str, State] = {}
    for _ in range(60):
        nid = rnd.choice(ids)
        states[nid] = rnd.choice([State.failed, State.maintenance, State.operational])
        down = {k: v for k, v in states.items() if v != State.operational}
        r = simulate(f, down)
        assert r.nodes.keys() == set(ids)
        assert all(r.nodes[n].state == down[n] for n in down)
        assert simulate(f, down).nodes.keys() == r.nodes.keys()


def test_generated_facilities_are_realistic_size_and_healthy():
    for seed in range(5):
        f = generate_facility(seed)
        assert 150 <= len(f.nodes) <= 300
        r = simulate(f)
        assert all(r.up(n.id) for n in f.nodes), f"seed {seed} unhealthy at baseline"


def test_order3_search_on_300_nodes_is_fast():
    f = generate_facility(4, halls=8)
    assert 290 <= len(f.nodes) <= 320
    t0 = time.perf_counter()
    rep = mocus_cut_sets(f, max_order=3)
    elapsed = time.perf_counter() - t0
    assert rep.cut_sets
    assert elapsed < 8.0, f"order-3 search took {elapsed:.1f}s"


def test_engine_never_names_demo_nodes():
    ids = {n.id for n in demo_facility().nodes}
    pattern = re.compile("|".join(re.escape(i) for i in sorted(ids, key=len, reverse=True)))
    hits = [f"{p.name}: {m.group(0)}" for p in ENGINE.rglob("*.py") for m in pattern.finditer(p.read_text())]
    assert hits == []
