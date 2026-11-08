"""Liquid-cooling domain: loops, valves, CDU and the retrofit fixture, without moving any demo number."""

import pytest
from fastapi.testclient import TestClient

from app.preflight.data.build import cooling
from app.preflight.data.demo import demo_facility
from app.preflight.data.retrofit import LIQUID_RACKS, retrofit_facility
from engine.model import Loop, Mode, NodeType, RequirementGroup, Resource, State, Supply
from engine.propagate import simulate
from engine.redundancy import service_redundancy


def test_only_cooling_groups_belong_to_a_loop():
    with pytest.raises(ValueError, match="only cooling groups"):
        RequirementGroup(
            name="p", mode=Mode.any, resource=Resource.power, loop=Loop.primary, suppliers=[Supply(supplier="X")]
        )
    assert cooling("X", loop=Loop.secondary, demand=5).loop == Loop.secondary


def test_retrofit_adds_the_liquid_row_and_keeps_the_demo_hall():
    demo, retro = demo_facility(), retrofit_facility()
    ids = {n.id for n in retro.nodes}
    assert {n.id for n in demo.nodes} <= ids
    types = {n.type for n in retro.nodes}
    assert {NodeType.cdu, NodeType.valve, NodeType.leak_sensor} <= types
    loops = {n.id: n.loop for n in retro.nodes if n.loop}
    assert loops["CHW-LOOP"] == Loop.primary and loops["TCS-1"] == Loop.secondary
    assert simulate(retro, {}).lost(retro) == []


def test_closing_a_rack_valve_takes_out_only_that_rack():
    f = retrofit_facility()
    lost = simulate(f, {"V-R3-01": State.maintenance}).lost(f)
    assert "R3-01" in lost and "R3-02" not in lost


def test_cdu_pumps_are_2n_by_capacity_but_the_liquid_racks_are_n():
    red = {s.service: s for s in service_redundancy(retrofit_facility())}
    for rack in LIQUID_RACKS:
        s = red[rack]
        assert s.effective == "N"
        assert {"CDU-1", "PNL-CDU", "V-FW-1", f"V-{rack}"} <= set(s.single_points)
        pumping = next(g for g in s.groups if g.node == "TCS-1" and g.group == "pumping")
        assert pumping.level == "2N" and "PNL-CDU" in pumping.shared


def test_existing_racks_keep_their_redundancy_after_the_retrofit():
    before = {s.service: s.effective for s in service_redundancy(demo_facility())}
    after = {s.service: s.effective for s in service_redundancy(retrofit_facility())}
    assert {k: after[k] for k in before} == before


def test_preflight_api_serves_the_retrofit_site_and_restores_the_demo():
    from app.main import app

    c = TestClient(app)
    assert c.post("/api/preflight/facility/retrofit").status_code == 200
    f = c.get("/api/preflight/facility").json()
    assert f["site"] == "retrofit"
    types = {n["type"] for n in f["nodes"]}
    assert {"cdu", "valve", "leak_sensor"} <= types
    assert any(e["loop"] == "secondary" and e["consumer"] == "R3-01" for e in f["edges"])
    c.post("/api/preflight/facility/demo")
    f = c.get("/api/preflight/facility").json()
    assert f["site"] == "demo" and len(f["nodes"]) == 43
