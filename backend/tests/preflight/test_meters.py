"""Synthetic meters, reconciliation and meter evidence in discovery.

The pure tests run everywhere; a Python version of the reconciliation query is their oracle. The tsdb tests run
the real SQL against a scratch TimescaleDB (TEST_DATABASE_URL, e.g. ``make db-up``) and never against Tiger.
"""

import datetime as dt
import os
import statistics as st
from collections import defaultdict
from urllib.parse import urlparse

import pytest

from app.preflight import meters, telemetry
from app.preflight.data.demo import demo_facility, demo_profiles
from app.preflight.discovery import discover, load_corpus, score
from app.preflight.meters import MeterEvidence
from app.preflight.store import Store
from app.preflight.workspace import Workspace

END = dt.datetime(2026, 11, 8, tzinfo=dt.UTC)
DOCUMENTED = demo_facility()
DOCS, LABELS = load_corpus()
AS_BUILT = meters.as_built(DOCUMENTED, LABELS)


def power_suppliers(fac):
    return {n.id: tuple(g.live_suppliers()) for n in fac.nodes for g in n.requires if g.name == "power"}


def series(fac, days, seed=7):
    out: dict[str, dict] = defaultdict(dict)
    for t, nid, kw in meters.generate(fac, days, END, seed=seed):
        out[nid][t] = kw
    return out


def oracle(data, plan):
    """What the SQL computes, in Python: per-step residuals, candidate correlations and means."""
    ts = sorted(data["ATS-1"])
    resid = {
        s: [data[s][t] - own - sum(data[c][t] for c in kids) for t in ts] for s, (kids, own) in plan.suppliers.items()
    }
    rows = []
    for s, c, t in plan.candidates:
        kw = [data[c][x] for x in ts]
        r_s, r_t = st.correlation(resid[s], kw), st.correlation(resid[t], kw)
        rows.append((s, c, t, r_s, r_t, st.mean(resid[s]), st.mean(kw)))
    return rows, {s: st.mean(v) for s, v in resid.items()}, {n: st.mean(v.values()) for n, v in data.items()}


def evidence(fac, days=14, seed=7):
    plan = meters.reconcile_plan(DOCUMENTED)
    rows, resid, node = oracle(series(fac, days, seed), plan)
    return meters.judge(plan, rows, resid, node, days, "2026-11-08 00:00 UTC")


def moved(ev):
    return [(e.consumer, e.supplier, e.documented) for e in ev if e.verdict == "moved"]


AS_BUILT_EVIDENCE = evidence(AS_BUILT)


def test_as_built_applies_only_the_labelled_rewire():
    before, after = power_suppliers(DOCUMENTED), power_suppliers(AS_BUILT)
    assert {n for n in before if before[n] != after[n]} == {"MCC-B"}
    assert after["MCC-B"] == ("ATS-1",)


def test_reconcile_plan_skips_suppliers_meters_cannot_split():
    plan = meters.reconcile_plan(DOCUMENTED)
    assert "PDU-A1" not in plan.suppliers  # racks are fed 2N from PDU-A1 and PDU-B1
    assert "UTIL-A" not in plan.suppliers and "GEN-1" not in plan.suppliers  # ATS-1 picks one of them
    assert plan.suppliers["ATS-1"][0] == ["MCC-A", "SWGR-A"]


def test_meters_balance_on_the_wiring_that_produced_them():
    data = series(AS_BUILT, 1)
    for s, (kids, own) in meters.reconcile_plan(AS_BUILT).suppliers.items():
        for t, kw in data[s].items():
            assert abs(kw - own - sum(data[c][t] for c in kids)) <= 0.01 * kw + 0.05, (s, t)


def test_on_the_drawings_the_missing_load_shows_up_on_both_transfer_switches():
    data = series(AS_BUILT, 2)
    _, resid, node = oracle(data, meters.reconcile_plan(DOCUMENTED))
    assert resid["ATS-1"] == pytest.approx(node["MCC-B"], rel=0.05)
    assert resid["ATS-2"] == pytest.approx(-node["MCC-B"], rel=0.05)


def test_reconciliation_finds_exactly_the_rewired_panel():
    assert moved(AS_BUILT_EVIDENCE) == [("MCC-B", "ATS-1", "ATS-2")]


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_meters_from_the_documented_wiring_find_nothing(seed):
    assert moved(evidence(DOCUMENTED, seed=seed)) == []


def test_a_one_sided_correlation_is_not_a_move():
    """PUMP-B's load is in ATS-1's gap too, but MCC-B (its documented supplier) balances: not a move."""
    plan = meters.reconcile_plan(DOCUMENTED)
    rows, resid, node = oracle(series(AS_BUILT, 14), plan)
    pump = next(r for r in rows if r[:2] == ("ATS-1", "PUMP-B"))
    assert pump[3] > 0.9 and abs(pump[4]) < 0.2
    assert "PUMP-B" not in {c for c, _, _ in moved(meters.judge(plan, rows, resid, node, 14, "x"))}


def test_meter_evidence_raises_confidence_without_hurting_precision():
    plain = discover(DOCUMENTED, DOCS)
    with_meters = discover(DOCUMENTED, DOCS, meters=AS_BUILT_EVIDENCE)
    f0 = next(f for f in plain.findings if f.id == "F-MCC-B-ATS-1")
    f1 = next(f for f in with_meters.findings if f.id == "F-MCC-B-ATS-1")
    assert f1.confidence > f0.confidence
    cite = next(s for s in f1.supporting if s["kind"] == "meters")
    assert cite["doc_id"] == "METERS" and "MCC-B" in cite["quote"]
    assert {r.doc_id for r in with_meters.rejected} >= {"WO-3920", "WO-5108"}
    metrics = score(with_meters, LABELS)
    assert metrics["precision"] == 1.0 and metrics["recall"] == 1.0


def test_meters_alone_raise_the_finding():
    f = next(f for f in discover(DOCUMENTED, [], meters=AS_BUILT_EVIDENCE).findings if f.id == "F-MCC-B-ATS-1")
    assert f.classification == "contradicts" and f.replaces == "ATS-2"
    assert f.confidence == pytest.approx(0.8)


def test_meters_that_balance_the_drawings_overrule_the_records():
    balanced = MeterEvidence("MCC-B", "ATS-2", "ATS-2", "supports_documented", 0, 0, 0.1, 15, 14, "2026-11-08")
    plain = next(f for f in discover(DOCUMENTED, DOCS).findings if f.id == "F-MCC-B-ATS-1")
    against = next(f for f in discover(DOCUMENTED, DOCS, meters=[balanced]).findings if f.id == "F-MCC-B-ATS-1")
    assert against.confidence == pytest.approx(plain.confidence / 2, abs=0.01)
    assert any(c["kind"] == "meters" for c in against.contradicting)


def test_week_profile_rotates_so_hour_zero_is_midnight_today():
    t = telemetry.Telemetry({"X": list(range(168))}, [], "s", 1, 4, 14)
    wednesday = dt.date(2026, 11, 11)
    assert t.profiles(wednesday)["X"][:2] == [48, 49]
    assert t.profiles(wednesday)["X"][-1] == 47


def test_load_falls_back_to_the_snapshot_then_to_nothing(monkeypatch, tmp_path):
    monkeypatch.setenv("PREFLIGHT_METERS", "on")
    monkeypatch.setenv("PREFLIGHT_METERS_SNAPSHOT", str(tmp_path / "t.json"))
    unreachable = "postgresql://u:p@127.0.0.1:1/x"
    assert telemetry.load(DOCUMENTED, unreachable) is None
    telemetry.write_snapshot(telemetry.Telemetry({"R1-01": [1.0] * 168}, AS_BUILT_EVIDENCE, "then", 9, 4, 14))
    snap = telemetry.load(DOCUMENTED, unreachable)
    assert snap is not None and snap.offline and snap.synced_at == "then"
    assert "can't reach" in snap.notes[0] and "p@" not in snap.notes[0]
    assert moved(snap.evidence) == [("MCC-B", "ATS-1", "ATS-2")]


def test_workspace_uses_meters_for_the_demo_hall_only():
    ws = Workspace(Store(":memory:"))
    t = telemetry.Telemetry({"R1-01": [2.0] * 168}, AS_BUILT_EVIDENCE, "now", 9, 4, 14)
    ws.use_meters(t)
    assert ws.profiles["R1-01"][0] == 2.0 and ws.load_source()["source"] == "meters"
    assert any(s["kind"] == "meters" for s in ws.finding("F-MCC-B-ATS-1").supporting)
    ws.replace_facility(demo_facility(), "test")
    assert ws.meter_evidence() == [] and ws.load_source()["source"] == "none"
    ws.restore_demo("test")
    assert ws.profiles["R1-01"][0] == 2.0 and ws.meter_evidence()
    ws.use_meters(None)
    assert ws.profiles == demo_profiles() and ws.load_source()["source"] == "assumed"


# --- against a scratch TimescaleDB -------------------------------------------------------------------------------

TEST_URL = os.getenv("TEST_DATABASE_URL")
tsdb = pytest.mark.skipif(not TEST_URL, reason="TEST_DATABASE_URL not set (make db-up)")


@pytest.fixture
def conn():
    host = urlparse(TEST_URL).hostname or ""
    if host.endswith("tsdb.cloud.timescale.com"):
        pytest.fail("TEST_DATABASE_URL points at Tiger; these tests drop the preflight schema")
    with telemetry.connect(TEST_URL) as c:
        c.execute("drop schema if exists preflight cascade")
        yield c


@tsdb
def test_sql_reconciliation_matches_the_oracle(conn):
    telemetry.seed(conn, AS_BUILT, 14, END)
    ev = telemetry.reconcile(conn, DOCUMENTED, END)
    assert moved(ev) == [("MCC-B", "ATS-1", "ATS-2")]
    sql, py = (next(e for e in x if e.verdict == "moved") for x in (ev, AS_BUILT_EVIDENCE))
    assert sql.r_supplier == pytest.approx(py.r_supplier, abs=0.01)
    assert sql.r_documented == pytest.approx(py.r_documented, abs=0.01)
    balanced = lambda x: {e.documented for e in x if e.verdict != "moved"}
    assert balanced(ev) == balanced(AS_BUILT_EVIDENCE)


@tsdb
def test_sql_finds_nothing_when_the_meters_match_the_drawings(conn):
    telemetry.seed(conn, DOCUMENTED, 14, END)
    assert moved(telemetry.reconcile(conn, DOCUMENTED, END)) == []


@tsdb
def test_measured_week_follows_the_load_shape(conn):
    telemetry.seed(conn, AS_BUILT, 28, END)
    week = telemetry.measured_week(conn, DOCUMENTED, END)
    assert set(week) == set(meters.leaf_loads(DOCUMENTED))
    assert all(len(v) == 168 for v in week.values())
    monday = week["R1-01"][:24]
    assert monday[20] > monday[12] > monday[3]  # inference follows the day
    assert week["R2-01"][2] > week["R2-01"][12]  # batch training runs overnight
    assert week["R1-01"][3] >= demo_profiles()["R1-01"][3]  # worst of four weeks, never below the typical day


@tsdb
def test_sync_writes_a_snapshot_the_app_can_start_from(conn, monkeypatch, tmp_path):
    monkeypatch.setenv("PREFLIGHT_METERS_SNAPSHOT", str(tmp_path / "t.json"))
    telemetry.seed(conn, AS_BUILT, 28, END)
    live = telemetry.sync(TEST_URL, DOCUMENTED)
    assert live.rows > 0 and not live.offline
    snap = telemetry.read_snapshot()
    assert snap and snap.offline and snap.week == live.week and moved(snap.evidence) == moved(live.evidence)
