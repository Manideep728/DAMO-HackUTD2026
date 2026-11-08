"""Meter data in Tiger (Postgres + TimescaleDB): measured load profiles for the planner and meter evidence for
discovery.

- ``preflight.readings`` is a hypertable of power readings; ``preflight.readings_hourly`` is a continuous aggregate
  of hourly averages that Timescale keeps current as readings arrive.
- The planner's load profile is the worst hourly average seen at each hour of the week over the last few weeks,
  per leaf load, as a multiplier on its nameplate load.
- Reconciliation buckets readings to 15 minutes, subtracts each checkable supplier's documented loads from its own
  meter and correlates what is left with candidate consumers (``meters.judge`` decides what counts).

Tiger is often unreachable from venue Wi-Fi, so every successful sync is written to a local snapshot and the app
falls back to it, then to the hand-written profile. The connection URL is never logged.

    python -m app.preflight.telemetry check        # connect, version, rows, latest reading
    python -m app.preflight.telemetry seed --days 28
    python -m app.preflight.telemetry sync         # pull profiles and evidence into the snapshot
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import sys
from dataclasses import asdict, dataclass, field
from typing import Any

from engine.model import Facility

from . import meters
from .meters import MeterEvidence

URL_ENV = "METERS_DATABASE_URL"
SNAPSHOT = pathlib.Path(__file__).resolve().parents[2] / ".work" / "telemetry.json"
CONNECT_TIMEOUT_S = 3
PROFILE_WEEKS = 4
RECONCILE_DAYS = 14
HOURS_PER_WEEK = 168

SCHEMA = [
    "create extension if not exists timescaledb",
    "create schema if not exists preflight",
    """create table if not exists preflight.readings (
         time timestamptz not null, node_id text not null, kw double precision not null)""",
    "select create_hypertable('preflight.readings', 'time', if_not_exists => true)",
    "create index if not exists readings_node_time on preflight.readings (node_id, time desc)",
    """create materialized view if not exists preflight.readings_hourly with (timescaledb.continuous) as
         select time_bucket('1 hour', time) as bucket, node_id, avg(kw) as avg_kw, max(kw) as max_kw
         from preflight.readings group by 1, 2 with no data""",
    """select add_continuous_aggregate_policy('preflight.readings_hourly', start_offset => interval '35 days',
         end_offset => interval '1 hour', schedule_interval => interval '1 hour', if_not_exists => true)""",
]

_BUCKETS = """
with b as (
  select time_bucket('15 minutes', time) as t, node_id, avg(kw) as kw
  from preflight.readings where time > %(since)s and time <= %(until)s
  group by 1, 2
),
plan as (
  select * from jsonb_to_recordset(%(plan)s::jsonb) as p(supplier text, children text[], own double precision)
),
kids as (
  select p.supplier, b.t, sum(b.kw) as kw
  from plan p cross join lateral unnest(p.children) as ch(node_id) join b using (node_id)
  group by 1, 2
),
resid as (
  select p.supplier, s.t, s.kw - p.own - coalesce(k.kw, 0) as r
  from plan p join b s on s.node_id = p.supplier
  left join kids k on k.supplier = p.supplier and k.t = s.t
)
"""

CORRELATE = (
    _BUCKETS
    + """,
cand as (
  select * from jsonb_to_recordset(%(cand)s::jsonb) as x(supplier text, consumer text, documented text)
)
select x.supplier, x.consumer, x.documented, corr(rs.r, c.kw), corr(rt.r, c.kw), avg(rs.r), avg(c.kw)
from cand x
join b c on c.node_id = x.consumer
join resid rs on rs.supplier = x.supplier and rs.t = c.t
join resid rt on rt.supplier = x.documented and rt.t = c.t
group by 1, 2, 3
"""
)

MEANS = (
    _BUCKETS
    + """
select 'residual', supplier, avg(r) from resid group by 2
union all
select 'node', node_id, avg(kw) from b group by 2
"""
)

WEEK_PROFILE = """
select node_id, ((extract(isodow from bucket)::int - 1) * 24 + extract(hour from bucket)::int) as how, max(avg_kw)
from preflight.readings_hourly
where bucket > %(since)s and bucket <= %(until)s and node_id = any(%(nodes)s)
group by 1, 2
"""


class MetersUnavailable(RuntimeError):
    pass


@dataclass
class Telemetry:
    """What one sync produced. ``week`` is a multiplier per leaf load for each hour of the week, Monday 00:00 first."""

    week: dict[str, list[float]]
    evidence: list[MeterEvidence]
    synced_at: str
    rows: int
    profile_weeks: int
    reconcile_days: int
    offline: bool = False  # True when this came from the local snapshot, not a live query
    notes: list[str] = field(default_factory=list)

    def profiles(self, today: dt.date) -> dict[str, list[float]]:
        """Hour 0 is midnight today, as the planner counts hours."""
        offset = today.weekday() * 24
        return {n: w[offset:] + w[:offset] for n, w in self.week.items()}

    def summary(self) -> dict[str, Any]:
        return {
            "source": "meters",
            "synced_at": self.synced_at,
            "rows": self.rows,
            "profile_weeks": self.profile_weeks,
            "reconcile_days": self.reconcile_days,
            "offline": self.offline,
            "synthetic": True,
        }


def connect(url: str):
    import psycopg  # imported here so the app runs without the driver when meters are off

    try:
        return psycopg.connect(url, autocommit=True, connect_timeout=CONNECT_TIMEOUT_S, options="-c timezone=UTC")
    except psycopg.OperationalError as e:
        # libpq's message names the host and port; clients only need the cause ("Connection refused", "timeout").
        text = str(e).strip()
        reason = text.splitlines()[-1].rsplit(": ", 1)[-1] if text else type(e).__name__
        raise MetersUnavailable(f"can't reach the meter database ({reason})") from None


def apply_schema(conn) -> None:
    for statement in SCHEMA:
        conn.execute(statement)


def seed(conn, facility: Facility, days: int, end: dt.datetime, seed: int = 7) -> int:
    """Replace the readings with ``days`` of synthetic meter data from ``facility`` (the as-built graph)."""
    apply_schema(conn)
    conn.execute("truncate preflight.readings")
    n = 0
    with conn.cursor() as cur, cur.copy("copy preflight.readings (time, node_id, kw) from stdin") as copy:
        for row in meters.generate(facility, days, end, seed=seed):
            copy.write_row(row)
            n += 1
    conn.execute("call refresh_continuous_aggregate('preflight.readings_hourly', null, null)")
    return n


def latest(conn) -> dt.datetime | None:
    row = conn.execute("select max(time) from preflight.readings").fetchone()
    return row[0] if row else None


def measured_week(conn, facility: Facility, until: dt.datetime, weeks: int = PROFILE_WEEKS) -> dict[str, list[float]]:
    """Worst hourly average at each hour of the week, as a multiplier on each leaf load's nameplate kW. Hours with
    no data take the node's median so a gap never reads as zero load."""
    by_id = facility.by_id()
    leaves = meters.leaf_loads(facility)
    rows = conn.execute(
        WEEK_PROFILE, {"since": until - dt.timedelta(weeks=weeks), "until": until, "nodes": leaves}
    ).fetchall()
    seen: dict[str, dict[int, float]] = {}
    for nid, how, kw in rows:
        seen.setdefault(nid, {})[int(how)] = float(kw) / by_id[nid].base_load
    out = {}
    for nid, hours in seen.items():
        fill = sorted(hours.values())[len(hours) // 2]
        out[nid] = [round(hours.get(h, fill), 4) for h in range(HOURS_PER_WEEK)]
    return out


def reconcile(conn, facility: Facility, until: dt.datetime, days: int = RECONCILE_DAYS) -> list[MeterEvidence]:
    plan = meters.reconcile_plan(facility)
    params = {
        "since": until - dt.timedelta(days=days),
        "until": until,
        "plan": json.dumps([{"supplier": s, "children": k, "own": own} for s, (k, own) in plan.suppliers.items()]),
        "cand": json.dumps([{"supplier": s, "consumer": c, "documented": t} for s, c, t in plan.candidates]),
    }
    corr_rows = conn.execute(CORRELATE, params).fetchall()
    residual: dict[str, float] = {}
    node: dict[str, float] = {}
    for kind, nid, mean in conn.execute(MEANS, params).fetchall():
        (residual if kind == "residual" else node)[nid] = float(mean)
    synced = until.astimezone(dt.UTC).strftime("%Y-%m-%d %H:%M UTC")
    return meters.judge(plan, corr_rows, residual, node, days, synced)


def sync(url: str, facility: Facility) -> Telemetry:
    """Pull profiles and evidence from the meter database and write the snapshot."""
    conn = connect(url)
    with conn:
        until = latest(conn)
        if until is None:
            raise MetersUnavailable("the meter database has no readings yet (make meters-seed)")
        rows = conn.execute(
            "select count(*) from preflight.readings where time > %s", (until - dt.timedelta(weeks=PROFILE_WEEKS),)
        ).fetchone()[0]
        t = Telemetry(
            week=measured_week(conn, facility, until),
            evidence=reconcile(conn, facility, until),
            synced_at=dt.datetime.now(dt.UTC).strftime("%Y-%m-%d %H:%M UTC"),
            rows=int(rows),
            profile_weeks=PROFILE_WEEKS,
            reconcile_days=RECONCILE_DAYS,
        )
    write_snapshot(t)
    return t


def snapshot_path() -> pathlib.Path:
    return pathlib.Path(os.getenv("PREFLIGHT_METERS_SNAPSHOT") or SNAPSHOT)


def write_snapshot(t: Telemetry) -> None:
    path = snapshot_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = asdict(t) | {"offline": False}
    path.write_text(json.dumps(data, indent=1))


def read_snapshot() -> Telemetry | None:
    path = snapshot_path()
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    data["evidence"] = [MeterEvidence(**e) for e in data["evidence"]]
    data["offline"] = True
    return Telemetry(**data)


def enabled() -> bool:
    return os.getenv("PREFLIGHT_METERS", "on") != "off"


def load(facility: Facility, url: str | None = None) -> Telemetry | None:
    """Live sync if the meter database answers, else the last snapshot, else None (hand-written profile)."""
    if not enabled():
        return None
    url = url if url is not None else os.getenv(URL_ENV)
    if url:
        try:
            return sync(url, facility)
        except MetersUnavailable as e:
            snap = read_snapshot()
            if snap:
                snap.notes.append(str(e))
            return snap
    return read_snapshot()


def _main(argv: list[str]) -> int:
    from dotenv import load_dotenv

    from .data.demo import demo_facility
    from .discovery import load_corpus

    load_dotenv(pathlib.Path(__file__).resolve().parents[2] / ".env")
    ap = argparse.ArgumentParser(description="Meter data in Tiger")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    s = sub.add_parser("seed")
    s.add_argument("--days", type=int, default=28)
    sub.add_parser("sync")
    args = ap.parse_args(argv)
    url = os.getenv(URL_ENV)
    if not url:
        print(f"{URL_ENV} is not set (backend/.env)")
        return 2
    documented = demo_facility()
    try:
        if args.cmd == "check":
            with connect(url) as conn:
                version = conn.execute("select extversion from pg_extension where extname = 'timescaledb'").fetchone()
                print("connected:", conn.info.server_version, "timescaledb", version[0] if version else "missing")
                apply_schema(conn)
                count = conn.execute("select count(*) from preflight.readings").fetchone()[0]
                print("readings:", count, "latest:", latest(conn))
        elif args.cmd == "seed":
            truth = meters.as_built(documented, load_corpus()[1])
            end = dt.datetime.now(dt.UTC).replace(minute=0, second=0, microsecond=0)
            with connect(url) as conn:
                n = seed(conn, truth, args.days, end)
            print(f"seeded {n} synthetic readings ({args.days} days, as-built wiring) ending {end:%Y-%m-%d %H:%M} UTC")
        else:
            t = sync(url, documented)
            moved = [e.statement() for e in t.evidence if e.verdict == "moved"]
            print(f"synced {t.rows} readings: profiles for {len(t.week)} loads; {len(moved)} wiring differences")
            for m in moved:
                print(" -", m)
    except MetersUnavailable as e:
        print(e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
