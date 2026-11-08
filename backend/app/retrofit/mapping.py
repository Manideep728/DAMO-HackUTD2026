"""The adapter's mapping config (YAML) and its schema/type check.

The check answers "is this config well formed against the vendor points, the contract and the inventory?". It
cannot tell whether a correctly typed point is wired to the right rack or loop; that is what the behavior tests in
`behavior.py` are for. The demo's wrong-rack leak mapping passes this check on purpose.
"""

from __future__ import annotations

from dataclasses import dataclass

import yaml
from pydantic import BaseModel, ValidationError

from .contract import CONTRACT_ID, TELEMETRY_FIELDS, CduState
from .inputs import Site


class Device(BaseModel):
    id: str
    firmware: str
    vendor_points: str


class Availability(BaseModel):
    backup_when: list[str]


class LeakZone(BaseModel):
    point: str
    location: str


class LeakResponse(BaseModel):
    notify: str
    close_rack_valve: bool


class Freshness(BaseModel):
    max_age_s: int
    recovery_samples: int


class Control(BaseModel):
    setpoint_point: str
    approved_range_c: tuple[float, float]
    heartbeat_timeout_s: int
    fallback_setpoint_c: float


class Mapping(BaseModel):
    contract: str
    site: str
    device: Device
    telemetry: dict[str, str]
    state_map: dict[str, str]
    availability: Availability
    leak_zones: list[LeakZone]
    valves: dict[str, str]
    leak_response: LeakResponse
    freshness: Freshness
    control: Control


@dataclass
class Issue:
    where: str
    problem: str


def parse(text: str) -> Mapping:
    return Mapping.model_validate(yaml.safe_load(text))


def check(text: str, site: Site) -> tuple[Mapping | None, list[Issue]]:
    """Schema and type check. Returns the parsed mapping (None if it doesn't parse) and every issue found."""
    try:
        m = parse(text)
    except yaml.YAMLError as e:
        return None, [Issue("mapping.yaml", f"not valid YAML: {str(e).splitlines()[0]}")]
    except ValidationError as e:
        return None, [Issue(".".join(map(str, err["loc"])) or "mapping.yaml", err["msg"]) for err in e.errors()]
    issues: list[Issue] = []
    if m.contract != CONTRACT_ID:
        issues.append(Issue("contract", f"{m.contract} is not {CONTRACT_ID}"))
    if m.site != site.id:
        issues.append(Issue("site", f"{m.site} is not {site.id}"))
    points = site.vendor_points.get(m.device.firmware)
    if points is None or m.device.vendor_points != f"cdu_vendor_points@{m.device.firmware}.csv":
        issues.append(Issue("device", f"no vendor point list for firmware {m.device.firmware}"))
        return m, issues
    if m.device.id != site.cdu():
        issues.append(Issue("device.id", f"{m.device.id} is not in the cooling topology"))
    for f, unit in TELEMETRY_FIELDS.items():
        p = m.telemetry.get(f)
        if p is None:
            issues.append(Issue(f"telemetry.{f}", "not mapped"))
        elif p not in points:
            issues.append(Issue(f"telemetry.{f}", f"point {p} not in vendor points {m.device.firmware}"))
        elif unit == "enum" and not points[p].enum:
            issues.append(Issue(f"telemetry.{f}", f"{p} is not an enumerated point"))
        elif unit != "enum" and points[p].units != unit:
            issues.append(Issue(f"telemetry.{f}", f"{p} is in {points[p].units or 'no unit'}, expected {unit}"))
    for f in set(m.telemetry) - set(TELEMETRY_FIELDS):
        issues.append(Issue(f"telemetry.{f}", "not a contract field"))
    state_point = points.get(m.telemetry.get("state", ""))
    labels = set(state_point.enum.values()) if state_point else set()
    for vendor, ours in m.state_map.items():
        if vendor not in labels:
            issues.append(Issue(f"state_map.{vendor}", "not a value of the state point"))
        if ours not in CduState.__members__:
            issues.append(Issue(f"state_map.{vendor}", f"{ours} is not a contract state"))
    for s in m.availability.backup_when:
        if s not in CduState.__members__:
            issues.append(Issue("availability.backup_when", f"{s} is not a contract state"))
    racks = {r["rack"] for r in site.inventory}
    for i, z in enumerate(m.leak_zones):
        zp = points.get(z.point)
        if zp is None:
            issues.append(Issue(f"leak_zones[{i}]", f"point {z.point} not in vendor points {m.device.firmware}"))
        elif zp.type != "bool":
            issues.append(Issue(f"leak_zones[{i}]", f"{z.point} is not a boolean point"))
        if z.location not in racks and z.location != m.device.id:
            issues.append(Issue(f"leak_zones[{i}]", f"location {z.location} is not a rack or the CDU"))
    for rack, valve in m.valves.items():
        if rack not in racks:
            issues.append(Issue(f"valves.{rack}", "not a rack in the inventory"))
        if valve not in site.valves():
            issues.append(Issue(f"valves.{rack}", f"{valve} is not a valve in the topology"))
    if m.control.setpoint_point not in points:
        issues.append(Issue("control.setpoint_point", f"{m.control.setpoint_point} not in vendor points"))
    if m.freshness.max_age_s <= 0 or m.freshness.recovery_samples <= 0:
        issues.append(Issue("freshness", "must be positive"))
    return m, issues
