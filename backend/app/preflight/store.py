"""SQLite store: saved scenarios, verification decisions and the audit log."""

from __future__ import annotations

import json
import pathlib
import sqlite3
import time
from typing import Any

DEFAULT_DB = pathlib.Path(__file__).resolve().parents[2] / ".work" / "preflight.sqlite"

SCHEMA = """
create table if not exists scenarios (id integer primary key, name text not null, states text not null,
                                      notes text not null default '', created real not null);
create table if not exists decisions (id integer primary key, finding_id text not null, decision text not null,
                                      actor text not null, note text not null default '', at real not null);
create table if not exists audit (id integer primary key, at real not null, actor text not null,
                                  action text not null, detail text not null);
"""


class Store:
    def __init__(self, path: pathlib.Path | str = DEFAULT_DB):
        path = pathlib.Path(path)
        if str(path) != ":memory:":
            path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    def audit(self, actor: str, action: str, detail: dict[str, Any]) -> None:
        self.db.execute(
            "insert into audit (at, actor, action, detail) values (?, ?, ?, ?)",
            (time.time(), actor, action, json.dumps(detail, sort_keys=True)),
        )
        self.db.commit()

    def audit_log(self, limit: int = 200) -> list[dict]:
        rows = self.db.execute("select * from audit order by id desc limit ?", (limit,)).fetchall()
        return [{**dict(r), "detail": json.loads(r["detail"])} for r in rows]

    def save_scenario(self, name: str, states: dict[str, str], notes: str, actor: str) -> int:
        cur = self.db.execute(
            "insert into scenarios (name, states, notes, created) values (?, ?, ?, ?)",
            (name, json.dumps(states, sort_keys=True), notes, time.time()),
        )
        self.db.commit()
        sid = int(cur.lastrowid or 0)
        self.audit(actor, "scenario.saved", {"id": sid, "name": name, "states": states})
        return sid

    def scenarios(self) -> list[dict]:
        rows = self.db.execute("select * from scenarios order by id").fetchall()
        return [{**dict(r), "states": json.loads(r["states"])} for r in rows]

    def decide(self, finding_id: str, decision: str, actor: str, note: str) -> None:
        if decision not in ("confirmed", "rejected", "open"):
            raise ValueError("decision must be confirmed, rejected or open")
        self.db.execute(
            "insert into decisions (finding_id, decision, actor, note, at) values (?, ?, ?, ?, ?)",
            (finding_id, decision, actor, note, time.time()),
        )
        self.db.commit()
        self.audit(actor, f"finding.{decision}", {"finding": finding_id, "note": note})

    def decisions(self) -> dict[str, dict]:
        """Latest decision per finding."""
        rows = self.db.execute("select * from decisions order by id").fetchall()
        return {r["finding_id"]: dict(r) for r in rows}
