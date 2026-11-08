"""SQLite store for the retrofit: versioned engineer decisions, the regression suite, candidate configs, accepted
packages, approval requests, witnessed field results and an append-only audit log.

Same pattern as `app/preflight/store.py`. Default file `backend/.work/retrofit.sqlite` (override with RETROFIT_DB);
tests use `:memory:`.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from . import WORK

SCHEMA = """
create table if not exists decisions (
  id integer primary key, site text not null, subject text not null, value text not null, decision text not null,
  source_doc text not null, source_quote text not null, author text not null, at real not null,
  scope text not null, equipment_version text not null, depends_on text not null, version integer not null,
  status text not null, note text not null default '');
create table if not exists regressions (
  id integer primary key, site text not null, decision_id integer, spec text not null, origin text not null,
  status text not null, created real not null, approved_by text, approved_at real);
create table if not exists candidates (id integer primary key, site text not null, text text not null,
  firmware text not null, created real not null, why text not null);
create table if not exists packages (id integer primary key, site text not null, version integer not null,
  mapping text not null, mapping_sha text not null, report text not null, accepted_by text not null,
  accepted_at real not null, note text not null default '');
create table if not exists approvals (id integer primary key, site text not null, kind text not null,
  detail text not null, status text not null, requested real not null, decided_by text, decided_at real);
create table if not exists field_results (id integer primary key, site text not null, check_id text not null,
  result text not null, witnessed_by text not null, at real not null, note text not null default '');
create table if not exists audit (id integer primary key, at real not null, actor text not null,
  action text not null, detail text not null);
"""
JSON_COLS = {"scope", "depends_on", "spec", "report", "detail"}
TABLES = ("decisions", "regressions", "candidates", "packages", "approvals", "field_results")


def _row(r: sqlite3.Row) -> dict[str, Any]:
    return {k: json.loads(r[k]) if k in JSON_COLS else r[k] for k in r.keys()}


class Store:
    def __init__(self, path: str | Path | None = None):
        path = str(path or os.getenv("RETROFIT_DB") or WORK / "retrofit.sqlite")
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    def _insert(self, table: str, **cols: Any) -> int:
        vals = [json.dumps(v, sort_keys=True) if k in JSON_COLS else v for k, v in cols.items()]
        with self.lock:
            cur = self.db.execute(
                f"insert into {table} ({', '.join(cols)}) values ({', '.join('?' * len(cols))})", vals
            )
            self.db.commit()
            return int(cur.lastrowid or 0)

    def _select(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        with self.lock:
            return [_row(r) for r in self.db.execute(sql, args).fetchall()]

    def _exec(self, sql: str, *args: Any) -> None:
        with self.lock:
            self.db.execute(sql, args)
            self.db.commit()

    def audit(self, actor: str, action: str, detail: dict[str, Any]) -> None:
        self._insert("audit", at=time.time(), actor=actor, action=action, detail=detail)

    def audit_log(self, limit: int = 200) -> list[dict[str, Any]]:
        return self._select("select * from audit order by id desc limit ?", limit)

    # decisions -------------------------------------------------------------------------------------------------
    def decide(
        self,
        *,
        site: str,
        subject: str,
        value: str,
        decision: str,
        source_doc: str,
        source_quote: str,
        author: str,
        scope: dict[str, Any],
        equipment_version: str,
        depends_on: list[str],
        note: str = "",
    ) -> dict[str, Any]:
        """Record a decision as a new version of its subject; the previous active version is superseded."""
        if decision not in ("confirmed", "rejected"):
            raise ValueError("decision must be confirmed or rejected")
        if not author.strip():
            raise ValueError("author is required")
        prior = self._select("select * from decisions where site=? and subject=? order by version desc", site, subject)
        version = (prior[0]["version"] + 1) if prior else 1
        self._exec(
            "update decisions set status='superseded' where site=? and subject=? and status in "
            "('active','needs_revalidation')",
            site,
            subject,
        )
        did = self._insert(
            "decisions",
            site=site,
            subject=subject,
            value=value,
            decision=decision,
            source_doc=source_doc,
            source_quote=source_quote,
            author=author.strip(),
            at=time.time(),
            scope=scope,
            equipment_version=equipment_version,
            depends_on=depends_on,
            version=version,
            status="active" if decision == "confirmed" else "rejected",
            note=note,
        )
        self.audit(
            author,
            f"decision.{decision}",
            {"id": did, "site": site, "subject": subject, "value": value, "version": version},
        )
        return self.decision(did)

    def decision(self, did: int) -> dict[str, Any]:
        rows = self._select("select * from decisions where id=?", did)
        if not rows:
            raise KeyError(f"decision {did}")
        return rows[0]

    def decisions(self, site: str | None = None) -> list[dict[str, Any]]:
        if site:
            return self._select("select * from decisions where site=? order by id", site)
        return self._select("select * from decisions order by id")

    def flag_decision(self, did: int, reason: str, actor: str = "revalidation") -> None:
        self._exec("update decisions set status='needs_revalidation' where id=? and status='active'", did)
        self.audit(actor, "decision.needs_revalidation", {"id": did, "reason": reason})

    def revalidate_decision(self, did: int, equipment_version: str, depends_on: list[str], author: str) -> None:
        self._exec(
            "update decisions set status='active', equipment_version=?, depends_on=? where id=?",
            equipment_version,
            json.dumps(depends_on, sort_keys=True),
            did,
        )
        self.audit(author, "decision.revalidated", {"id": did, "equipment_version": equipment_version})

    # regressions -----------------------------------------------------------------------------------------------
    def add_regression(
        self,
        site: str,
        spec: dict[str, Any],
        origin: str,
        decision_id: int | None,
        status: str = "active",
        actor: str = "engineer",
    ) -> dict[str, Any]:
        rid = self._insert(
            "regressions",
            site=site,
            decision_id=decision_id,
            spec=spec,
            origin=origin,
            status=status,
            created=time.time(),
            approved_by=actor if status == "active" else None,
            approved_at=time.time() if status == "active" else None,
        )
        self.audit(
            actor,
            "regression.added" if status == "active" else "regression.proposed",
            {"id": rid, "site": site, "spec": spec},
        )
        return self._select("select * from regressions where id=?", rid)[0]

    def approve_regression(self, rid: int, actor: str) -> dict[str, Any]:
        self._exec(
            "update regressions set status='active', approved_by=?, approved_at=? where id=?", actor, time.time(), rid
        )
        self.audit(actor, "regression.approved", {"id": rid})
        return self._select("select * from regressions where id=?", rid)[0]

    def regressions(self) -> list[dict[str, Any]]:
        return self._select("select * from regressions order by id")

    # candidates, packages, approvals, field results ------------------------------------------------------------
    def save_candidate(self, site: str, text: str, firmware: str, why: str) -> int:
        return self._insert("candidates", site=site, text=text, firmware=firmware, created=time.time(), why=why)

    def candidate(self, site: str) -> dict[str, Any] | None:
        rows = self._select("select * from candidates where site=? order by id desc limit 1", site)
        return rows[0] if rows else None

    def accept_package(
        self, site: str, mapping: str, mapping_sha: str, report: dict[str, Any], by: str, note: str = ""
    ) -> dict[str, Any]:
        prior = self.package(site)
        pid = self._insert(
            "packages",
            site=site,
            version=(prior["version"] + 1) if prior else 1,
            mapping=mapping,
            mapping_sha=mapping_sha,
            report=report,
            accepted_by=by,
            accepted_at=time.time(),
            note=note,
        )
        self.audit(by, "package.accepted", {"id": pid, "site": site, "mapping_sha": mapping_sha})
        return self._select("select * from packages where id=?", pid)[0]

    def package(self, site: str) -> dict[str, Any] | None:
        rows = self._select("select * from packages where site=? order by version desc limit 1", site)
        return rows[0] if rows else None

    def packages(self, site: str) -> list[dict[str, Any]]:
        return self._select("select * from packages where site=? order by version", site)

    def request_approval(self, site: str, kind: str, detail: dict[str, Any]) -> dict[str, Any]:
        aid = self._insert("approvals", site=site, kind=kind, detail=detail, status="pending", requested=time.time())
        self.audit("revalidation", "approval.requested", {"id": aid, "site": site, "kind": kind})
        return self._select("select * from approvals where id=?", aid)[0]

    def decide_approval(self, aid: int, status: str, by: str) -> dict[str, Any]:
        if status not in ("approved", "rejected"):
            raise ValueError("status must be approved or rejected")
        self._exec(
            "update approvals set status=?, decided_by=?, decided_at=? where id=? and status='pending'",
            status,
            by,
            time.time(),
            aid,
        )
        self.audit(by, f"approval.{status}", {"id": aid})
        return self._select("select * from approvals where id=?", aid)[0]

    def approvals(self, site: str) -> list[dict[str, Any]]:
        return self._select("select * from approvals where site=? order by id", site)

    def witness(self, site: str, check_id: str, result: str, witnessed_by: str, note: str) -> dict[str, Any]:
        if result not in ("pass", "fail"):
            raise ValueError("result must be pass or fail")
        if not witnessed_by.strip():
            raise ValueError("a field result needs the name of the person who witnessed it")
        fid = self._insert(
            "field_results",
            site=site,
            check_id=check_id,
            result=result,
            witnessed_by=witnessed_by.strip(),
            at=time.time(),
            note=note,
        )
        self.audit(witnessed_by, "field.witnessed", {"id": fid, "site": site, "check": check_id, "result": result})
        return self._select("select * from field_results where id=?", fid)[0]

    def field_results(self, site: str) -> list[dict[str, Any]]:
        return self._select("select * from field_results where site=? order by id", site)

    def reset(self, actor: str) -> None:
        """Demo reset: clears working state. The audit log keeps every row, including this one."""
        with self.lock:
            for t in TABLES:
                self.db.execute(f"delete from {t}")
            self.db.commit()
        self.audit(actor, "demo.reset", {})
