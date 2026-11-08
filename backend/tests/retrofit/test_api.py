"""HTTP surface of the retrofit workflow."""

from fastapi.testclient import TestClient

from app.main import app
from app.retrofit import api


def test_status_and_unknown_site():
    c = TestClient(app)
    s = c.get("/api/retrofit/status").json()
    assert s["synthetic"] and "Not NVIDIA DSX" in s["contract"]["label"]
    assert c.get("/api/retrofit/sites/zz/readiness").status_code == 404


def test_flow_over_http_and_actor_required():
    c = TestClient(app)
    c.post("/api/retrofit/reset", json={"actor": "test"})
    assert c.post("/api/retrofit/sites/h1/decisions", json={"zone": 2, "author": " "}).status_code == 422
    flags = c.post("/api/retrofit/sites/h1/flag", json={}).json()["flags"]
    d = c.post("/api/retrofit/sites/h1/decisions", json={"zone": flags[0]["zone"], "author": "J. Chen"}).json()
    assert c.post("/api/retrofit/sites/h1/propose", json={}).json()["changes"]
    assert c.post("/api/retrofit/sites/h1/test", json={"config": "candidate"}).json()["pass"]
    c.post("/api/retrofit/sites/h1/regressions", json={"decision_id": d["id"], "actor": "J. Chen"})
    pkg = c.post("/api/retrofit/sites/h1/accept", json={"by": "Maya R."}).json()
    assert pkg["version"] == 1
    assert c.get("/api/retrofit/sites/h1/handover.md").text.startswith("# Handover package")
    assert len(api.FLOW.store.regressions()) == 1
    c.post("/api/retrofit/reset", json={"actor": "test"})
