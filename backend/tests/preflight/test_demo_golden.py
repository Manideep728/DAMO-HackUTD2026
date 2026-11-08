"""Golden test for the demo story: the pumps look redundant on paper and are not."""

import pytest

from app.preflight.data.demo import demo_facility
from engine.cutsets import enumerate_cut_sets, maintenance_view, mocus_cut_sets
from engine.model import EdgeSource, State, Supply
from engine.propagate import simulate
from engine.redundancy import service_redundancy


@pytest.fixture(scope="module")
def documented():
    return demo_facility()


@pytest.fixture(scope="module")
def actual(documented):
    """The facility once the discovered MCC-B ← ATS-1 feed is confirmed."""
    return documented.with_edge(
        "MCC-B", "power", Supply(supplier="ATS-1", source=EdgeSource.engineer_confirmed), replace="ATS-2"
    )


def test_baseline_is_healthy(documented):
    r = simulate(documented)
    assert all(r.up(n.id) for n in documented.nodes)


def test_documented_graph_has_no_single_point_of_failure(documented):
    assert [c for c in mocus_cut_sets(documented).cut_sets if c.order == 1] == []
    assert simulate(documented, {"ATS-1": State.failed}).lost(documented) == []


def test_actual_graph_has_ats1_as_single_point_of_failure(actual):
    singles = [c.nodes for c in mocus_cut_sets(actual).cut_sets if c.order == 1]
    assert singles == [["ATS-1"]]
    r = simulate(actual, {"ATS-1": State.failed})
    assert "WL-INFER" in r.lost(actual) and len(r.lost(actual)) == 18
    assert [s["node"] for s in r.trace("R1-01")][:2] == ["R1-01", "CRAH-1"]


def test_capacity_is_redundant_but_supply_is_not_independent(actual):
    svc = {s.service: s for s in service_redundancy(actual)}["R1-01"]
    pumping = next(g for g in svc.groups if g.group == "pumping")
    assert pumping.level == "2N"
    assert pumping.independence == 1 and pumping.shared == ["ATS-1"]
    assert svc.capacity_level == "2N" and svc.effective == "N" and svc.single_points == ["ATS-1"]


def test_documented_pumps_look_independent(documented):
    svc = {s.service: s for s in service_redundancy(documented)}["R1-01"]
    pumping = next(g for g in svc.groups if g.group == "pumping")
    assert pumping.independence == 2 and pumping.shared == []


def test_maintenance_turns_order_two_into_single_point(actual):
    view = maintenance_view(actual, {}, ["UTIL-A"], max_order=2)
    shrunk = {tuple(c.nodes): c.was_order for c in view.cut_sets if c.order == 1}
    assert shrunk[("GEN-1",)] == 2


@pytest.mark.parametrize("which", ["documented", "actual"])
def test_exact_matches_enumeration_on_demo(which, request):
    f = request.getfixturevalue(which)
    a = {tuple(c.nodes) for c in mocus_cut_sets(f, max_order=3).cut_sets}
    b = {tuple(c.nodes) for c in enumerate_cut_sets(f, max_order=3).cut_sets}
    assert a == b
