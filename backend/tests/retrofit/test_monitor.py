"""Low-flow incident: running is not adequate flow, scope from the package, closure needs both recoveries."""

import pytest

from app.retrofit import monitor


@pytest.fixture
def ctx(flow):
    return monitor.context(flow)


def test_low_flow_fires_while_the_cdu_reports_running_and_before_the_job_slows(ctx):
    e = monitor.evaluate("lowflow", ctx)
    alarms = {a["rule"]: a["t"] for a in e["alarms"]}
    inc = e["incident"]
    assert all(m["cdu"]["state"] == "running" for m in e["minutes"])
    assert alarms["LowFlowWhileRunning"] == inc["first_below_min"] + monitor.HOLD_MIN - 1
    assert alarms["LowFlowWhileRunning"] < alarms["WorkloadSlow"]
    assert inc["wording"].startswith("Cooling degradation suspected; cause unconfirmed")
    assert all(m["job"]["heartbeat_ok"] for m in e["minutes"])


def test_scope_comes_from_the_equipment_map_and_shows_an_unaffected_rack(ctx):
    inc = monitor.evaluate("lowflow", ctx)["incident"]
    assert inc["scope_racks"] == ctx["racks"] == ["R3-01", "R3-02"]
    assert inc["comparison_rack"] not in inc["scope_racks"]
    assert inc["lead"]["label"] == "lead, not root cause" and "strainer" in inc["lead"]["note"]
    assert inc["procedure"]["id"] == "RB-LC-2" and len(inc["procedure"]["steps"]) == 5
    teams = [o["team"] for o in inc["owners"]]
    assert teams == ["Facilities", "IT (GPU platform)"]


def test_close_only_when_cooling_and_job_hold_for_the_window(ctx):
    e = monitor.evaluate("lowflow", ctx)
    inc = e["incident"]
    fac, it = (o["recovered_at"] for o in inc["owners"])
    assert inc["closable_at"] == max(fac, it)
    window = ctx["window_min"]
    for m in e["minutes"][inc["closable_at"] - window + 1 : inc["closable_at"] + 1]:
        assert m["cdu"]["flow_lpm"] >= 200 and m["job"]["steps_per_s"] >= 950


def test_partial_recovery_stays_unresolved(ctx):
    inc = monitor.evaluate("partial", ctx)["incident"]
    fac, it = (o["recovered_at"] for o in inc["owners"])
    assert fac is not None and it is None and inc["closable_at"] is None
    assert inc["status_at_end"] == "partially unresolved"


def test_stale_telemetry_is_missing_visibility_not_a_failure(ctx):
    e = monitor.evaluate("stale", ctx)
    assert e["kind"] == "visibility"
    assert [a["rule"] for a in e["alarms"]] == ["TelemetryStale"]
    assert "No failure is inferred and no shutdown is advised" in e["incident"]["wording"]
    assert not monitor.low_flow_while_running("running", 100.0, "stale", 200)


def test_colocation_view_says_workload_is_not_visible(ctx):
    e = monitor.evaluate("colo", ctx)
    assert e["facility_only"] and "WorkloadSlow" not in {a["rule"] for a in e["alarms"]}
    tenant = e["incident"]["owners"][1]
    assert tenant["visible"] is False and tenant["recovered_at"] is None
    assert "not visible to the operator" in e["incident"]["closing_evidence"]


def test_declared_checkpoint_dip_is_not_an_incident(ctx):
    e = monitor.evaluate("healthy", ctx)
    assert e["kind"] == "none" and e["alarms"] == []


def test_context_names_the_accepted_package_once_there_is_one(flow):
    assert monitor.context(flow)["from"].startswith("site inputs")
    d = flow.decide("h1", 2, "confirmed", "J. Chen")
    flow.propose("h1")
    flow.save_regression("h1", d["id"], "J. Chen")
    flow.accept("h1", "Maya R.")
    assert monitor.context(flow)["from"].startswith("accepted package v1")
