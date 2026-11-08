"""python -m app.warm : run read/find/prove once in live mode so the cache covers the demo (then GAUNTLET_MODE=cached works offline)."""
from fastapi.testclient import TestClient; from .main import app
c = TestClient(app)
for r in ("read", "find", "prove"):
    with c.stream("GET", f"/api/{r}/check_rack_inlet") as s:
        n = sum(1 for _ in s.iter_lines()); print(r, n, "events")
