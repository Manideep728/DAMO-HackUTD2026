"""The behavior suite: the demo fault passes the schema check and fails the behavior test; mutants are caught."""

import ast
import inspect

import pytest

from app.retrofit import behavior, oracle
from app.retrofit.inputs import load_site
from app.retrofit.mapping import check


@pytest.fixture(scope="module")
def site():
    return load_site("h1")


@pytest.fixture(scope="module")
def original(site):
    return site.file_text("config/original/mapping.yaml")


def fixed(text):
    return text.replace("leak_zone_2\n    location: R3-02", "leak_zone_2\n    location: R3-01")


def test_wrong_rack_passes_the_schema_check(site, original):
    m, issues = check(original, site)
    assert m is not None and issues == []


def test_wrong_rack_fails_the_behavior_test_on_rack_and_response(site, original):
    r = behavior.run_suite(site, original, "original")
    failing = {c["id"]: c for c in r["cases"] if not c["pass"]}
    assert list(failing) == ["leak-R3-01"]
    case = failing["leak-R3-01"]
    assert case["result"]["rack"] == "fail" and case["result"]["response"] == "fail"
    assert "published as R3-02" in case["notes"][0] and "closed V-R3-02, expected V-R3-01" in case["notes"][1]


def test_corrected_config_passes_and_every_mutant_is_rejected_by_its_case(site, original):
    r = behavior.run_suite(site, fixed(original), "candidate")
    assert r["pass"] and r["passed"] == r["total"] == 8
    caught = {s["name"]: s["failed_cases"] for s in r["sanity"]}
    assert all(s["rejected"] for s in r["sanity"])
    assert caught["Loop swap (primary ↔ secondary supply)"] == ["Primary vs secondary loop"]
    assert caught["Running counted as backup"] == ["Running is not available backup"]
    assert caught["No freshness (hold last value)"] == ["Communication loss and reconnection"]
    assert set(caught["Right alarm, wrong valve"]) == {"Leak under R3-01", "Leak under R3-02"}


def test_schema_errors_stop_the_run(site, original):
    r = behavior.run_suite(site, original.replace("sec_flow", "sec_flo"), "broken")
    assert not r["schema"]["ok"] and r["cases"] == [] and not r["pass"]
    assert any("sec_flo" in i["problem"] for i in r["schema"]["issues"])


def test_held_out_cases_leave_as_pass_fail_only(site, original):
    r = behavior.run_suite(site, fixed(original), "candidate")
    assert r["held_out"] and all(set(h) == {"id", "name", "pass"} for h in r["held_out"])
    seen = behavior.visible_failures(behavior.run_suite(site, original, "original"))
    assert seen["held_out_failing"] == 0 and [c["id"] for c in seen["failing_cases"]] == ["leak-R3-01"]


def test_an_engineer_decision_overrides_the_drawing_in_the_oracle(site):
    d = {"site": "h1", "status": "active", "subject": "leak_zone:CDU-1:2", "value": "R3-02"}
    assert oracle.associations(site, [])[2] == "R3-01"
    assert oracle.associations(site, [d])[2] == "R3-02"
    assert oracle.associations(site, [{**d, "status": "superseded"}])[2] == "R3-01"


def test_oracle_never_reads_the_config_or_the_adapter():
    tree = ast.parse(inspect.getsource(oracle))
    imported = {a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
    imported |= {n.module or "" for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)}
    assert not {m for m in imported if m.split(".")[-1] in ("mapping", "adapter", "behavior", "workflow")}
    assert "config/" not in inspect.getsource(oracle)
