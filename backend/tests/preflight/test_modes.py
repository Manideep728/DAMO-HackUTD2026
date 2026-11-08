from app.preflight.data.build import group, node, power
from engine.model import EdgeStatus, Facility, Mode, Split, State
from engine.model import NodeType as T
from engine.propagate import simulate

from .factories import rack, source

F = State.failed


def fac(*nodes) -> Facility:
    return Facility(name="t", nodes=list(nodes))


def pdu(id, *groups, cap=1000.0):
    return node(id, T.pdu, "Z", capacity=cap, requires=list(groups))


def test_all_mode_needs_every_supplier():
    f = fac(source("A"), source("B"), pdu("P", group("g", Mode.all, ["A", "B"])), rack("R", power("P")))
    assert simulate(f).up("R")
    r = simulate(f, {"B": F})
    assert not r.up("P") and not r.up("R")
    assert r.nodes["P"].cause.missing == ["B"]


def test_any_mode_needs_one_supplier():
    f = fac(source("A"), source("B"), pdu("P", group("g", Mode.any, ["A", "B"])), rack("R", power("P")))
    assert simulate(f, {"A": F}).up("R")
    assert not simulate(f, {"A": F, "B": F}).up("R")


def test_k_of_n_mode():
    f = fac(
        source("A"),
        source("B"),
        source("C"),
        pdu("P", group("g", Mode.k_of_n, ["A", "B", "C"], k=2)),
        rack("R", power("P")),
    )
    assert simulate(f, {"A": F}).up("P")
    assert not simulate(f, {"A": F, "B": F}).up("P")


def test_lost_redundancy_is_degraded_not_failed():
    f = fac(source("A"), source("B"), pdu("P", group("g", Mode.any, ["A", "B"])), rack("R", power("P")))
    assert simulate(f, {"A": F}).nodes["P"].state == State.degraded


def test_capacity_shared_across_consumers():
    # One 30 kW source feeding three 10 kW racks fits; a fourth does not, and one rack is shed.
    racks = [rack(f"R{i}", power("S"), load=10) for i in range(4)]
    f = fac(source("S", capacity=30), *racks)
    r = simulate(f)
    assert sum(r.up(f"R{i}") for i in range(4)) == 3
    assert r.nodes["S"].margin == 0


def test_capacity_sheds_lowest_criticality_first():
    f = fac(source("S", capacity=20), rack("HI", power("S"), load=10, crit=5), rack("LO", power("S"), load=15, crit=1))
    r = simulate(f)
    assert r.up("HI") and not r.up("LO")
    assert r.nodes["LO"].cause.kind == "shed" and r.nodes["LO"].cause.at == "S"


def test_capacity_load_flows_up_through_distribution():
    f = fac(
        source("S", capacity=25),
        pdu("P", power("S"), cap=100),
        rack("R1", power("P"), load=10),
        rack("R2", power("P"), load=10),
        rack("R3", power("P"), load=10),
    )
    r = simulate(f)
    assert r.nodes["P"].load["power"] <= 25
    assert [r.up(f"R{i}") for i in (1, 2, 3)].count(True) == 2


def test_proportional_split_and_failover():
    f = fac(source("A", capacity=100), source("B", capacity=100), rack("R", power("A", "B"), load=80))
    r = simulate(f)
    assert r.shares[("R", "A")] == 40 and r.shares[("R", "B")] == 40
    r = simulate(f, {"A": F})
    assert r.up("R") and r.shares[("R", "B")] == 80


def test_first_available_uses_listed_order():
    f = fac(
        source("UTIL", capacity=100),
        source("GEN", capacity=50),
        pdu("ATS", power("UTIL", "GEN", split=Split.first_available)),
        rack("R", power("ATS"), load=60),
    )
    r = simulate(f)
    assert r.shares[("ATS", "UTIL")] == 60 and ("ATS", "GEN") not in r.shares
    r = simulate(f, {"UTIL": F})  # the generator alone is too small for the load
    assert not r.up("R")


def test_cycle_without_outside_source_stays_down():
    a = pdu("A", group("g", Mode.any, ["B"]))
    b = pdu("B", group("g", Mode.any, ["A"]))
    r = simulate(fac(a, b))
    assert not r.up("A") and not r.up("B")
    assert "cycle" in r.nodes["A"].cause.detail


def test_cycle_with_outside_source_is_supported():
    f = fac(source("S"), pdu("A", group("g", Mode.any, ["S", "B"])), pdu("B", group("g", Mode.any, ["A"])))
    r = simulate(f)
    assert r.up("A") and r.up("B")
    assert not simulate(f, {"S": F}).up("B")


def test_maintenance_counts_as_down_and_is_reported():
    f = fac(source("S"), rack("R", power("S")))
    r = simulate(f, {"S": State.maintenance})
    assert r.nodes["S"].state == State.maintenance and not r.up("R")


def test_trace_reaches_root_cause():
    f = fac(source("S"), pdu("P", power("S")), rack("R", power("P")))
    chain = simulate(f, {"S": F}).trace("R")
    assert [step["node"] for step in chain] == ["R", "P", "S"]
    assert chain[-1]["kind"] == "down"


def test_suspected_edges_are_ignored():
    f = fac(source("A"), source("B"), pdu("P", group("g", Mode.any, ["A", "B"])), rack("R", power("P")))
    f.by_id()["P"].requires[0].suppliers[1].status = EdgeStatus.suspected
    assert not simulate(f, {"A": F}).up("P")
