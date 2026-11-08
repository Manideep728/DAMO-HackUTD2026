"""Regression: the Store is shared by FastAPI worker threads. Concurrent reads and writes must not corrupt rows
(previously: IndexError from interleaved queries on one sqlite connection, seen as intermittent 500s)."""
from concurrent.futures import ThreadPoolExecutor

from app.preflight.store import Store


def test_concurrent_reads_and_writes(tmp_path):
    store = Store(tmp_path / "t.sqlite")
    store.decide("F-1", "confirmed", "maya", "")

    def work(i: int) -> int:
        if i % 5 == 0:
            store.decide(f"F-{i}", "rejected", "dev", "")
        assert "F-1" in store.decisions()
        store.audit_log(50)
        return i

    with ThreadPoolExecutor(max_workers=16) as pool:
        assert len(list(pool.map(work, range(400)))) == 400
    assert store.decisions()["F-1"]["decision"] == "confirmed"
