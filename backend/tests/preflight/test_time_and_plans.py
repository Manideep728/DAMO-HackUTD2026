import pytest

from app.preflight.data.demo import demo_facility, demo_profiles, demo_windows
from engine.model import EdgeSource, State, Supply
from engine.planner import SHED, Plan, Task, compare, evaluate_plan, search_plans
from engine.timestep import Window, run_timeline, scale_at, states_at
from engine.transients import transient


@pytest.fixture(scope="module")
def f():
    return demo_facility()


@pytest.fixture(scope="module")
def actual(f):
    return f.with_edge(
        "MCC-B", "power", Supply(supplier="ATS-1", source=EdgeSource.engineer_confirmed), replace="ATS-2"
    )


def test_profile_selectors_most_specific_wins(f):
    s = scale_at(f, {"*": [2.0], "type:rack": [3.0], "R1-01": [0.5, 0.7]}, hour=1)
    assert s["R1-01"] == 0.7 and s["R1-02"] == 3.0 and s["UPS-A"] == 2.0


def test_windows_apply_only_while_active():
    w = Window(["X"], 2, 4)
    assert states_at({}, [w], 1) == {} and states_at({}, [w], 2) == {"X": State.maintenance}
    assert states_at({"X": State.failed}, [w], 3) == {"X": State.failed}


def test_timeline_reports_overnight_batch_peak(f):
    tl = run_timeline(f, 24, demo_profiles(), [Window(["CRAH-3"], 0, 24)])
    night, noon = tl.snapshots[2], tl.snapshots[12]
    assert night.lost and not noon.lost  # one CRAH cannot carry the 1.6x batch heat
    assert noon.min_margin < 1.0 and noon.tightest is not None


def test_planner_avoids_the_batch_peak_and_explains_rejections(f):
    task = Task("CRAH-3 service", ["CRAH-3"], 4, 0, 24)
    res = search_plans(f, task, demo_profiles(), demo_windows())
    assert res.top and all(not e.lost_load for e in res.top)
    assert all(6 <= e.start for e in res.top if not e.mitigations)
    night = [e for e in res.rejected if e.start < 3 and not e.mitigations]
    assert night and all(any("sheds" in r for r in e.reasons) for e in night)


def test_shedding_flexible_load_rescues_a_night_window(f):
    task = Task("CRAH-3 service", ["CRAH-3"], 4, 0, 24)
    plain = evaluate_plan(f, Plan(task, 0), demo_profiles())
    shed = evaluate_plan(f, Plan(task, 0, [SHED]), demo_profiles())
    assert plain.lost_load and not shed.lost_load
    assert compare(plain, shed)["mitigations"] == ([], [SHED])


def test_planner_flags_the_hidden_single_point_of_failure(actual):
    task = Task("Utility A breaker test", ["UTIL-A"], 6, 24, 48)
    best = search_plans(actual, task, demo_profiles(), demo_windows()).top[0]
    assert best.min_cut_order == 1 and "GEN-1" in best.single_points and "ATS-1" in best.single_points


def test_transient_generator_start_and_thermal_ride_through(f):
    one = transient(f, ["UTIL-A"])
    assert one.lost_transient == [] and any("generators online" in e.what for e in one.events)
    both = transient(f, ["UTIL-A", "UTIL-B"])
    assert both.lost_steady == [] and "R1-01" in both.lost_transient
    assert any("ride-through" in e.what for e in both.events)


def test_transient_battery_runs_out_without_a_second_path(f):
    rep = transient(f, ["SWGR-A"])
    assert any("battery" in e.what and e.nodes == ["UPS-A"] for e in rep.events)
    assert rep.lost_transient == []  # the B side carries the racks


def test_every_rejected_plan_says_where_it_loses_to_the_recommended_one():
    from app.preflight.data.demo import demo_facility, demo_profiles, demo_windows
    from engine.planner import Task, search_plans

    res = search_plans(demo_facility(), Task("t", ["PUMP-A"], 6, 0, 48), demo_profiles(), demo_windows())
    best = res.top[0]
    for r in res.rejected:
        assert any("recommended plan" in why or why.startswith("loses ") for why in r.reasons), r
    # A window that overlaps GEN-2's service adds UTIL-B as a single point; that must rank it lower and say so.
    overlap = next(r for r in res.rejected if r.start == 33 and not r.mitigations)
    assert "UTIL-B" in overlap.single_points and "UTIL-B" not in best.single_points
    assert any(why == "more single points of failure than the recommended plan (UTIL-B)" for why in overlap.reasons)
