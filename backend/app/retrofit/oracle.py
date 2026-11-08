"""Independent expectations for the behavior tests.

Reads only the injected physical event, the rack drawing (overridden by an engineer's confirmed decision), the
approved site requirements, the contract's own rules and the engine's redundancy result. It never imports the
mapping or the adapter and never opens a config file; `tests/retrofit/test_behavior.py` scans its imports to keep
it that way. Expected outcomes therefore cannot drift toward whatever config is being tested.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from engine.redundancy import service_redundancy

from .contract import FRESHNESS
from .inputs import DrawingNote, Site


def subject(cdu: str, zone: int) -> str:
    return f"leak_zone:{cdu}:{zone}"


def associations(site: Site, decisions: list[dict[str, Any]]) -> dict[int, str]:
    """Which location each leak cable zone is under: the drawing, unless an engineer confirmed otherwise."""
    zones = {n.zone: n.location for n in site.drawing}
    for d in decisions:
        if d["site"] == site.id and d["status"] == "active" and d["subject"].startswith("leak_zone:"):
            zones[int(d["subject"].rsplit(":", 1)[1])] = d["value"]
    return zones


def drawing_note(site: Site, zone: int) -> DrawingNote | None:
    return next((n for n in site.drawing if n.zone == zone), None)


@dataclass
class LeakExpectation:
    zone: int
    location: str
    close_valve: str | None
    notify: str


def leak(site: Site, location: str, zones: dict[int, str]) -> LeakExpectation:
    zone = next(z for z, loc in zones.items() if loc == location)
    resp = site.requirements["leak_response"]
    is_rack = location in site.liquid_racks()
    rule = resp["rack"] if is_rack else resp["cdu_cabinet"]
    valve = site.rack_valve(location) if is_rack and rule.get("close") == "rack_isolation_valve" else None
    return LeakExpectation(zone, location, valve, rule["notify"])


def backup_available(state: str) -> bool:
    """A unit counts as backup only while it stands ready to take over. Running means already in use."""
    return state == "standby"


def freshness() -> dict[str, int]:
    return dict(FRESHNESS)


def control(site: Site) -> dict[str, Any]:
    lo, hi = site.requirements["limits"]["setpoint_request_c"]
    fb = site.requirements["fallback"]
    return {"range": (lo, hi), "fallback_c": fb["setpoint_c"], "heartbeat_timeout_s": fb["heartbeat_timeout_s"]}


def redundancy(site: Site) -> dict[str, Any] | None:
    """The engine's verdict for the liquid racks, where a facility model exists (site h1 only)."""
    if site.id != "h1":
        return None
    from app.preflight.data.retrofit import retrofit_facility

    out = {s.service: s for s in service_redundancy(retrofit_facility()) if s.service in site.liquid_racks()}
    return {r: {"effective": s.effective, "single_points": s.single_points} for r, s in out.items()}
