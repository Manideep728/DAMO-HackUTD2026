"""HTTP API for the retrofit workflow, mounted at /api/retrofit. Every outcome comes from deterministic code."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from app.models import has_key

from . import evaluate, monitor
from .contract import CONTRACT_ID, LABEL
from .decisions import Store
from .inputs import PinMismatch, hashes, pinned_files, site_dir
from .workflow import INSTALLED_FIRMWARE, Retrofit

router = APIRouter(prefix="/api/retrofit")
FLOW = Retrofit(Store())
SITES = ("h1", "h2")


def _guard(fn: Callable[..., Any], *args: Any, **kw: Any) -> Any:
    try:
        return fn(*args, **kw)
    except KeyError as e:
        raise HTTPException(404, str(e).strip("'")) from e
    except PinMismatch as e:
        raise HTTPException(409, str(e)) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


def _site(sid: str) -> str:
    if sid not in SITES:
        raise HTTPException(404, f"unknown site {sid}")
    return sid


class TestIn(BaseModel):
    config: str = "original"
    firmware: str | None = None


class DecisionIn(BaseModel):
    zone: int
    decision: str = "confirmed"
    author: str
    note: str = ""


class ActorIn(BaseModel):
    actor: str


class RegressionIn(BaseModel):
    decision_id: int
    actor: str


class AcceptIn(BaseModel):
    by: str


class FirmwareIn(BaseModel):
    firmware: str


class ApprovalIn(BaseModel):
    status: str
    by: str


class FieldIn(BaseModel):
    check_id: str
    result: str
    witnessed_by: str
    note: str = ""


class ProposeIn(BaseModel):
    base: str = "original"


@router.get("/status")
def status() -> dict[str, Any]:
    return {
        "contract": {"id": CONTRACT_ID, "label": LABEL},
        "sites": list(SITES),
        "nemotron_key": has_key(),
        "installed_firmware": INSTALLED_FIRMWARE,
        "synthetic": True,
        "label": "Constructed demo fault, not an incident at any operator. Synthetic sites and contract.",
    }


@router.get("/sites/{sid}/inputs")
def inputs(sid: str) -> dict[str, Any]:
    d = site_dir(_site(sid))
    pins = hashes(sid)
    files = [{"name": n, "sha256": pins[n], "text": (d / n).read_text()} for n in pinned_files(d)]
    return {"site": sid, "files": files, "pins_ok": _guard(FLOW.site, sid) is not None}


@router.get("/sites/{sid}/config/{which}", response_class=PlainTextResponse)
def config(sid: str, which: str) -> str:
    return str(_guard(FLOW.config, _site(sid), which))


@router.post("/sites/{sid}/test")
def test(sid: str, body: TestIn) -> dict[str, Any]:
    return dict(_guard(FLOW.test, _site(sid), body.config, body.firmware))


@router.post("/sites/{sid}/flag")
def flag(sid: str, body: TestIn) -> dict[str, Any]:
    return dict(_guard(FLOW.flag, _site(sid), body.config))


@router.post("/sites/{sid}/decisions")
def decide(sid: str, body: DecisionIn) -> dict[str, Any]:
    if not body.author.strip():
        raise HTTPException(422, "author is required: every decision records who made it")
    return dict(_guard(FLOW.decide, _site(sid), body.zone, body.decision, body.author, body.note))


@router.post("/sites/{sid}/propose")
def propose(sid: str, body: ProposeIn) -> dict[str, Any]:
    return dict(_guard(FLOW.propose, _site(sid), body.base))


@router.post("/sites/{sid}/regressions")
def save_regression(sid: str, body: RegressionIn) -> dict[str, Any]:
    return dict(_guard(FLOW.save_regression, _site(sid), body.decision_id, body.actor))


@router.post("/regressions/{rid}/approve")
def approve_regression(rid: int, body: ActorIn) -> dict[str, Any]:
    if not body.actor.strip():
        raise HTTPException(422, "actor is required")
    return dict(_guard(FLOW.store.approve_regression, rid, body.actor))


@router.post("/sites/{sid}/accept")
def accept(sid: str, body: AcceptIn) -> dict[str, Any]:
    return dict(_guard(FLOW.accept, _site(sid), body.by))


@router.post("/sites/{sid}/firmware")
def firmware(sid: str, body: FirmwareIn) -> dict[str, Any]:
    return dict(_guard(FLOW.revalidate, _site(sid), body.firmware))


@router.post("/sites/{sid}/approvals/{aid}")
def approval(sid: str, aid: int, body: ApprovalIn) -> dict[str, Any]:
    return dict(_guard(FLOW.approve, _site(sid), aid, body.status, body.by))


@router.get("/sites/{sid}/readiness")
def readiness(sid: str) -> dict[str, Any]:
    return dict(_guard(FLOW.readiness, _site(sid)))


@router.post("/sites/{sid}/field-results")
def witness(sid: str, body: FieldIn) -> dict[str, Any]:
    return dict(_guard(FLOW.witness, _site(sid), body.check_id, body.result, body.witnessed_by, body.note))


@router.get("/sites/{sid}/equipment-map")
def equipment_map(sid: str) -> dict[str, Any]:
    return dict(_guard(FLOW.equipment_map, _site(sid)))


@router.get("/sites/{sid}/handover")
def handover(sid: str) -> dict[str, Any]:
    return dict(_guard(FLOW.handover, _site(sid)))


@router.get("/sites/{sid}/handover.md", response_class=PlainTextResponse)
def handover_md(sid: str) -> str:
    return str(_guard(FLOW.handover_md, _site(sid)))


@router.get("/state")
def state() -> dict[str, Any]:
    s = FLOW.store
    return {
        "decisions": s.decisions(),
        "regressions": s.regressions(),
        "packages": {sid: s.packages(sid) for sid in SITES},
        "approvals": {sid: s.approvals(sid) for sid in SITES},
        "candidates": {sid: s.candidate(sid) for sid in SITES},
    }


@router.get("/audit")
def audit() -> list[dict[str, Any]]:
    return FLOW.store.audit_log()


@router.post("/reset")
def reset(body: ActorIn) -> dict[str, str]:
    FLOW.store.reset(body.actor or "engineer")
    return {"status": "reset"}


class LessonIn(BaseModel):
    site: str = "h1"
    text: str
    author: str
    incident: str


@router.get("/monitor/{variant}")
def monitor_run(variant: str) -> dict[str, Any]:
    """The low-flow incident (or a variant), with its context taken from the accepted package."""
    return dict(_guard(lambda: monitor.evaluate(variant, monitor.context(FLOW))))


@router.post("/lessons")
def lesson(body: LessonIn) -> dict[str, Any]:
    return dict(_guard(FLOW.lesson, _site(body.site), body.text, body.author, body.incident))


@router.get("/evaluation")
def evaluation() -> dict[str, Any]:
    return evaluate.run()
