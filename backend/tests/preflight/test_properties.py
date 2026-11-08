"""Property tests on random layered facilities.

Monotonicity is asserted on supply, not on every margin: under load shedding, failing a load frees capacity,
so a neighbour's margin can legitimately rise. What must never happen is supply coming back.
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from engine.cutsets import enumerate_cut_sets, mocus_cut_sets
from engine.model import Mode, Resource, State
from engine.propagate import EPS, simulate, support

from .factories import layered_facility

FAST = settings(max_examples=150, deadline=None)


def _failures(f, data):
    ids = [n.id for n in f.nodes]
    return set(data.draw(st.lists(st.sampled_from(ids), unique=True, max_size=len(ids))))


@FAST
@given(layered_facility(), st.data())
def test_deterministic(f, data):
    down = {n: State.failed for n in _failures(f, data)}
    a, b = simulate(f, down), simulate(f, down)
    assert {k: (v.state, v.load) for k, v in a.nodes.items()} == {k: (v.state, v.load) for k, v in b.nodes.items()}


@FAST
@given(layered_facility(), st.data())
def test_failing_more_never_restores_support(f, data):
    small = _failures(f, data)
    extra = _failures(f, data)
    alive_small, _ = support(f, small)
    alive_big, _ = support(f, small | extra)
    assert alive_big <= alive_small


@FAST
@given(layered_facility(), st.data())
def test_failing_more_never_increases_available_capacity(f, data):
    small = _failures(f, data)
    big = small | _failures(f, data)
    by_id = f.by_id()

    def available(down):
        r = simulate(f, {n: State.failed for n in down})
        return sum(by_id[n].capacity for n in r.nodes if r.up(n))

    assert available(big) <= available(small) + EPS


@FAST
@given(layered_facility(uncoupled=True), st.data())
def test_failing_more_never_improves_margins_without_shedding(f, data):
    # With unlimited capacity nothing is ever shed, so remaining supply is the only thing that changes.
    small = _failures(f, data)
    big = small | _failures(f, data)
    a, b = simulate(f, {n: State.failed for n in small}), simulate(f, {n: State.failed for n in big})
    assert all(b.up(n) <= a.up(n) for n in a.nodes)


@FAST
@given(layered_facility(), st.data())
def test_result_is_internally_consistent(f, data):
    down = _failures(f, data)
    r = simulate(f, {n: State.failed for n in down})
    served: dict[str, float] = {}
    for (_, s), kw in r.shares.items():
        served[s] = served.get(s, 0.0) + kw
    for n in f.nodes:
        res = r.nodes[n.id]
        if not r.up(n.id):
            assert res.cause is not None, n.id
            continue
        for g in n.requires:
            up = [s for s in g.live_suppliers() if r.up(s)]
            if g.mode == Mode.all:
                assert len(up) == len(g.live_suppliers())
            elif g.mode == Mode.k_of_n:
                assert len(up) >= g.k
            else:
                assert up
        if n.capacity > 0:
            assert served.get(n.id, 0.0) <= n.capacity + 1e-6
    assert all(r.up(c) and r.up(s) for (c, s) in r.shares)


@settings(max_examples=120, deadline=None)
@given(layered_facility(uncoupled=True))
def test_exact_method_matches_enumeration(f):
    exact = {tuple(c.nodes) for c in mocus_cut_sets(f, max_order=3).cut_sets}
    brute = {tuple(c.nodes) for c in enumerate_cut_sets(f, max_order=3).cut_sets}
    assert exact == brute


@settings(max_examples=80, deadline=None)
@given(layered_facility())
def test_cut_sets_are_minimal_and_real(f):
    rep = mocus_cut_sets(f, max_order=3)
    sets = [frozenset(c.nodes) for c in rep.cut_sets]
    for a in sets:
        assert not any(b < a for b in sets), "a cut set contains a smaller one"
    for c in rep.cut_sets:
        r = simulate(f, {n: State.failed for n in c.nodes})
        assert any(not r.up(s) for s in rep.services)
        assert set(c.lost_services) <= set(rep.services)


def test_resource_enum_is_complete():
    assert {r.value for r in Resource} == {"power", "cooling"}
