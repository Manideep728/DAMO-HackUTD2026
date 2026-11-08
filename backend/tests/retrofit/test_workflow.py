"""The retrofit workflow end to end: decisions, diff, regression, second site, firmware, readiness, handover."""

import pytest

from app.retrofit.workflow import Retrofit


def fix_h1(flow: Retrofit, author: str = "J. Chen") -> dict:
    flags = flow.flag("h1")["flags"]
    d = flow.decide("h1", flags[0]["zone"], "confirmed", author)
    flow.propose("h1")
    return d


def test_flag_cites_the_mapping_line_and_the_verbatim_drawing_quote(flow):
    f = flow.flag("h1")
    assert f["report"]["passed"] == 7 and f["report"]["total"] == 8
    [flag] = f["flags"]
    assert (flag["zone"], flag["mapped_location"], flag["drawing_location"]) == (2, "R3-02", "R3-01")
    assert flag["quote"] in flow.site("h1").drawing_text and flag["line"] == "location: R3-02"
    assert flag["failing_cases"] == ["leak-R3-01"]


def test_decision_records_source_author_scope_and_equipment_version(flow):
    d = fix_h1(flow)
    assert d["value"] == "R3-01" and d["author"] == "J. Chen" and d["version"] == 1 and d["status"] == "active"
    assert d["source_doc"] == "rack_drawing.txt" and "R3-01 (Rack A)" in d["source_quote"]
    assert d["scope"] == {"site": "h1", "equipment": "CDU-1", "zone": 2, "hall": "H1"}
    assert d["equipment_version"] == "CDU-1 fw 2.3.0" and d["depends_on"] == ["leak_zone_2"]
    with pytest.raises(ValueError, match="author"):
        flow.decide("h1", 2, "confirmed", "  ")


def test_a_new_decision_on_the_same_subject_is_a_new_version(flow):
    first = fix_h1(flow)
    second = flow.decide("h1", 2, "confirmed", "Maya R.", note="re-walked after the cable move")
    assert second["version"] == 2 and flow.store.decision(first["id"])["status"] == "superseded"


def test_diff_changes_exactly_the_wrong_rack_line_and_the_rerun_passes(flow):
    fix_h1(flow)
    p = flow.propose("h1")
    assert [ln for ln in p["diff"].splitlines() if ln[:1] in "+-" and ln[:3] not in ("+++", "---")] == [
        "-    location: R3-02",
        "+    location: R3-01",
    ]
    assert p["changes"][0]["source"].startswith('rack_drawing.txt: "Leak detection zone 2')
    r = flow.test("h1", "candidate")
    assert r["pass"] and all(s["rejected"] for s in r["sanity"])


def test_regression_grows_the_suite_and_catches_the_same_fault_on_site_two(flow):
    d = fix_h1(flow)
    reg = flow.save_regression("h1", d["id"], "J. Chen")
    assert flow.save_regression("h1", d["id"], "J. Chen")["id"] == reg["id"]  # idempotent
    assert flow.test("h1", "candidate")["total"] == 9
    h2 = flow.test("h2", "original")
    failing = {c["id"] for c in h2["cases"] if not c["pass"]}
    assert f"regression-{reg['id']}-C-11" in failing and "leak-C-11" in failing
    assert {"loops", "running-vs-available"} <= failing
    flow.decide("h2", 3, "confirmed", "K. Osei")
    flow.propose("h2")
    assert flow.test("h2", "candidate")["pass"]


def test_accept_refuses_a_failing_candidate(flow):
    flow.store.save_candidate("h1", flow.original("h1"), "2.3.0", "unchanged")
    with pytest.raises(ValueError, match="not accepted"):
        flow.accept("h1", "Maya R.")
    assert flow.store.package("h1") is None


def test_firmware_change_flags_reruns_and_waits_for_approval(flow):
    d = fix_h1(flow)
    flow.save_regression("h1", d["id"], "J. Chen")
    v1 = flow.accept("h1", "Maya R.")
    rv = flow.revalidate("h1", "2.4.0")
    assert rv["flagged_decisions"] == [d["id"]] and flow.store.decision(d["id"])["status"] == "needs_revalidation"
    before = {c["id"]: c for c in rv["before"]["cases"]}
    assert not before["running-vs-available"]["pass"]
    assert "running_degraded published available_backup=True" in before["running-vs-available"]["notes"][0]
    assert rv["after"]["pass"] and "leak_detect_z2" in rv["proposal"]["candidate"]
    assert any(c["id"].startswith("regression-") and c["pass"] for c in rv["after"]["cases"])
    assert flow.store.package("h1")["version"] == v1["version"]  # nothing changes before approval
    out = flow.approve("h1", rv["approval"]["id"], "approved", "Maya R.")
    assert out["package"]["version"] == v1["version"] + 1
    dec = flow.store.decision(d["id"])
    assert dec["status"] == "active" and dec["equipment_version"] == "CDU-1 fw 2.4.0"
    assert dec["depends_on"] == ["leak_detect_z2"]
    with pytest.raises(ValueError, match="already approved"):
        flow.approve("h1", rv["approval"]["id"], "approved", "Maya R.")


def test_simulation_never_closes_a_field_check(flow):
    d = fix_h1(flow)
    flow.save_regression("h1", d["id"], "J. Chen")
    flow.accept("h1", "Maya R.")
    for _ in range(2):
        flow.test("h1", "candidate")
    ready = flow.readiness("h1")
    assert ready["software"]["passed"] == ready["software"]["total"] > 0
    assert ready["field"]["open"] == 7 and not ready["ready"]
    assert ready["ownership"]["unresolved"] == ["Secondary loop water chemistry", "CDU firmware updates"]
    with pytest.raises(ValueError, match="witnessed"):
        flow.witness("h1", "FC-2", "pass", " ")
    flow.witness("h1", "FC-2", "pass", "R. Alvarez", "wet test, alarm at BMS in 4 s")
    assert flow.readiness("h1")["field"]["open"] == 6


def test_handover_package_has_every_part(flow):
    d = fix_h1(flow)
    flow.save_regression("h1", d["id"], "J. Chen")
    flow.accept("h1", "Maya R.")
    h = flow.handover("h1")
    assert "+    location: R3-01" in h["diff"]
    zones = {z["zone"]: z for z in h["equipment_map"]["leak_zones"]}
    assert zones[2]["location"] == "R3-01" and zones[2]["valve"] == "V-R3-01" and zones[1]["valve"] is None
    assert h["deploy"] and h["rollback"] and any("close V-R3-01" in p for p in h["procedures"])
    assert any("FC-1" in i for i in h["open_issues"]) and h["tests"]["passed"] == h["tests"]["total"]
    md = flow.handover_md("h1")
    assert md.startswith("# Handover package: site h1") and "```diff" in md


def test_lesson_becomes_a_pending_regression(flow):
    r = flow.lesson("h1", "Flow switch said OK while the strainer clogged", "Maya R.", "INC-2207")
    assert r["status"] == "pending_review" and r["origin"] == "lesson"
    assert flow.store.approve_regression(r["id"], "J. Chen")["status"] == "active"
