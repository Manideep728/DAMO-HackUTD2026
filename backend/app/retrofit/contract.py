"""SYNTHETIC target contract v0.1: what the integration must publish about a CDU and its racks.

Written for this demo. It is NOT the NVIDIA DSX Exchange specification and carries no BCM rules; no field here
claims to come from either. The freshness and recovery rules are part of the contract, so the test oracle reads
them from here, never from the adapter's configuration.
"""

from __future__ import annotations

import json
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, TypeAdapter

from . import CONTRACT_DIR

CONTRACT_ID = "synthetic-target-contract@0.1"
LABEL = "Synthetic target contract v0.1, written for this demo. Not NVIDIA DSX Exchange; no BCM rules."
FRESHNESS = {"max_age_s": 30, "recovery_samples": 2}
TELEMETRY_FIELDS = {
    "state": "enum",
    "secondary.supply_temp_c": "degC",
    "secondary.return_temp_c": "degC",
    "secondary.flow_lpm": "L/min",
    "primary.supply_temp_c": "degC",
    "primary.return_temp_c": "degC",
}


class Quality(StrEnum):
    good = "good"
    stale = "stale"  # no fresh sample within max_age_s: readings withheld, never shown as healthy
    recovering = "recovering"  # samples are back but fewer than recovery_samples in a row


class CduState(StrEnum):
    off = "off"
    running = "running"
    standby = "standby"
    degraded = "degraded"
    fault = "fault"


class LoopReading(BaseModel):
    supply_temp_c: float | None = None
    return_temp_c: float | None = None
    flow_lpm: float | None = None


class CduTelemetry(BaseModel):
    kind: Literal["cdu_telemetry"] = "cdu_telemetry"
    site: str
    cdu_id: str
    t: int
    quality: Quality
    state: CduState | None = None
    available_backup: bool | None = None  # true only for a unit that can take over; running is not available
    primary: LoopReading = LoopReading()  # facility water
    secondary: LoopReading = LoopReading()  # rack-facing coolant


class LeakEvent(BaseModel):
    kind: Literal["leak"] = "leak"
    site: str
    cdu_id: str
    t: int
    zone: int
    location: str  # rack id, or the CDU id for its own cabinet
    active: bool


class ResponseAction(BaseModel):
    kind: Literal["response"] = "response"
    t: int
    action: Literal["close_valve", "notify"]
    target: str
    reason: str


class ControlResult(BaseModel):
    kind: Literal["control"] = "control"
    t: int
    request_id: str
    accepted: bool
    setpoint_c: float
    reason: str


class ControlStatus(BaseModel):
    kind: Literal["control_status"] = "control_status"
    t: int
    control_source: Literal["remote", "local_fallback"]
    setpoint_c: float


Message = Annotated[
    CduTelemetry | LeakEvent | ResponseAction | ControlResult | ControlStatus, Field(discriminator="kind")
]
MESSAGE = TypeAdapter(Message)


def schema() -> dict[str, Any]:
    return {
        "$id": CONTRACT_ID,
        "title": LABEL,
        "synthetic": True,
        "rules": {
            "freshness": FRESHNESS,
            "events_require_quality": "good",
            "telemetry_fields": TELEMETRY_FIELDS,
        },
        "message": MESSAGE.json_schema(),
    }


def path() -> Any:
    return CONTRACT_DIR / "synthetic-target-contract-0.1.json"


def write() -> None:
    path().write_text(json.dumps(schema(), indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    write()
