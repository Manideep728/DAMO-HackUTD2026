import pytest
from fastapi.testclient import TestClient

from app.preflight import api
from app.preflight.data.demo import demo_facility
from app.preflight.importers import from_csv, to_csv
from app.preflight.store import Store
from app.preflight.workspace import Workspace


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(api, "WS", Workspace(Store(":memory:")))
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(api.router)
    return TestClient(app)


def test_facility_lists_nodes_edges_and_the_open_suspected_edge(client):
    d = client.get("/api/preflight/facility").json()
    assert len(d["nodes"]) == 43 and "Not CFD" in d["fidelity"]
    assert [(s["consumer"], s["supplier"]) for s in d["suspected"]] == [("MCC-B", "ATS-1")]


def test_confirming_a_finding_changes_simulation_and_is_audited(client):
    before = client.post("/api/preflight/simulate", json={"state_changes": {"ATS-1": "failed"}}).json()
    assert before["lost_count"] == 0
    r = client.post("/api/preflight/findings/F-MCC-B-ATS-1/decision", json={"decision": "confirmed", "actor": "maya"})
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    after = client.post("/api/preflight/simulate", json={"state_changes": {"ATS-1": "failed"}}).json()
    assert after["lost_count"] == 18
    log = client.get("/api/preflight/audit").json()
    assert log[0]["action"] == "finding.confirmed" and log[0]["actor"] == "maya"
    edges = client.get("/api/preflight/facility").json()["edges"]
    mccb = [e for e in edges if e["consumer"] == "MCC-B"]
    assert [(e["supplier"], e["source"]) for e in mccb] == [("ATS-1", "engineer_confirmed")] and mccb[0]["citations"]


def test_rejecting_keeps_the_documented_graph(client):
    client.post("/api/preflight/findings/F-MCC-B-ATS-1/decision", json={"decision": "rejected", "actor": "maya"})
    assert client.post("/api/preflight/cutsets", json={"max_order": 1}).json()["single_points"] == []


def test_bad_input_is_rejected_with_a_reason(client):
    assert client.post("/api/preflight/simulate", json={"state_changes": {"NOPE": "failed"}}).status_code == 404
    assert client.post("/api/preflight/simulate", json={"state_changes": {"ATS-1": "melted"}}).status_code == 422
    r = client.post("/api/preflight/findings/F-MCC-B-ATS-1/decision", json={"decision": "confirmed", "actor": " "})
    assert r.status_code == 422
    assert (
        client.post("/api/preflight/findings/F-NOPE/decision", json={"decision": "confirmed", "actor": "x"}).status_code
        == 404
    )


def test_plans_compare_reports_differences(client):
    a = {"nodes": ["CRAH-3"], "start": 0, "duration_h": 4}
    b = {"nodes": ["CRAH-3"], "start": 8, "duration_h": 4}
    d = client.post("/api/preflight/plans/compare", json={"a": a, "b": b}).json()
    assert "lost_load" in d["differences"] and d["differences"]["start"] == [0, 8]


def test_scenarios_round_trip(client):
    sid = client.post(
        "/api/preflight/scenarios", json={"name": "pump A out", "states": {"PUMP-A": "maintenance"}}
    ).json()
    assert client.get("/api/preflight/scenarios").json()[0]["states"] == {"PUMP-A": "maintenance"} and sid["id"] == 1


def test_csv_round_trip_and_import(client):
    f = demo_facility()
    back = from_csv(to_csv(f), name=f.name)
    assert [n.model_dump(exclude={"provenance", "metadata"}) for n in back.nodes] == [
        n.model_dump(exclude={"provenance", "metadata"}) for n in f.nodes
    ]
    r = client.post("/api/preflight/import", content=to_csv(f), headers={"content-type": "text/csv"})
    assert r.json() == {"name": "Imported facility", "nodes": 43}
    bad = client.post("/api/preflight/import", content="id,type\nX,toaster\n", headers={"content-type": "text/csv"})
    assert bad.status_code == 422 and "row 2" in bad.json()["detail"]


def test_an_imported_facility_does_not_inherit_the_demo_records_and_the_demo_can_be_restored(client):
    from app.preflight.data.generator import generate_facility

    r = client.post("/api/preflight/import", content=to_csv(generate_facility(1)), headers={"content-type": "text/csv"})
    assert r.status_code == 200
    assert client.get("/api/preflight/findings").json()["findings"] == []
    node = client.get("/api/preflight/facility").json()["nodes"][0]["id"]
    task = {"name": "t", "nodes": [node], "duration_h": 4, "earliest": 0, "latest": 24}
    assert client.post("/api/preflight/plans/search", json={"task": task}).json()["top"]

    assert client.post("/api/preflight/facility/demo").json()["nodes"] == 43
    ids = [f["id"] for f in client.get("/api/preflight/findings").json()["findings"]]
    assert "F-MCC-B-ATS-1" in ids
    events = [a["action"] for a in client.get("/api/preflight/audit").json()]
    assert "facility.imported" in events and "facility.restored_demo" in events


def test_agent_streams_tool_calls_and_a_traced_answer(client):
    with client.stream("POST", "/api/preflight/agent", json={"question": "What happens if ATS-1 fails?"}) as r:
        body = "".join(r.iter_text())
    assert '"type": "tool_call"' in body and '"tool": "simulate"' in body and '"type": "final"' in body


def test_cached_mode_replays_a_recorded_turn_and_falls_back_without_one(tmp_path, monkeypatch):
    import json as _json

    from app import llm
    from app.preflight import agent
    from app.preflight.store import Store
    from app.preflight.workspace import Workspace

    monkeypatch.setattr(llm, "MODE", "cached")
    monkeypatch.setenv("AGENT_RECORDINGS", str(tmp_path))
    q = "Write me a poem about chillers"
    answer = {"refused": True, "recommendation": "Out of scope for this simulator."}
    first_turn = [{"role": "system", "content": agent.SYSTEM}, {"role": "user", "content": q}]
    key = llm._key(agent.MODEL, [first_turn, agent.openai_tools()])
    call = {"id": "c1", "type": "function", "function": {"name": "final_answer", "arguments": _json.dumps(answer)}}
    (tmp_path / f"{key}.json").write_text(_json.dumps({"message": {"content": "", "tool_calls": [call]}}))

    replayed = list(agent.run(q, Workspace(Store(":memory:"))))
    assert replayed[0]["mode"] == "live" and not any(e["type"] == "fallback" for e in replayed)
    assert replayed[-1]["answer"] == answer

    missing = list(agent.run("What happens if ATS-1 fails?", Workspace(Store(":memory:"))))
    assert any(e["type"] == "fallback" for e in missing) and missing[-1]["type"] == "final"


def test_the_store_survives_concurrent_requests(tmp_path):
    # The API serves requests from a thread pool over one SQLite connection; the page fires several at once.
    from concurrent.futures import ThreadPoolExecutor

    store = Store(tmp_path / "s.sqlite")

    def work(i: int) -> None:
        for j in range(60):
            store.decide(f"F-{i}-{j % 3}", "confirmed", "t", "")
            store.decisions()
            store.audit_log(limit=20)
            store.scenarios()

    with ThreadPoolExecutor(8) as pool:
        list(pool.map(work, range(8)))  # re-raises any worker exception
    assert len(store.decisions()) == 24
