"""HTTP API for the preflight simulator, mounted at /api/preflight."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from engine.model import NodeType

from . import agent, tools
from .discovery import score, to_dict
from .extract_model import ModelUnavailable
from .importers import from_csv, from_json, to_csv
from .store import DEFAULT_DB, Store
from .telemetry import MetersUnavailable
from .telemetry import load as load_meters
from .workspace import Workspace

router = APIRouter(prefix="/api/preflight")
WS = Workspace(Store(os.getenv("PREFLIGHT_DB") or DEFAULT_DB))
WS.use_meters(load_meters(WS.documented))  # Tiger if it answers, else the last snapshot, else assumed load

LAYER = {
    NodeType.utility_feed: 0,
    NodeType.generator: 0,
    NodeType.ats: 1,
    NodeType.switchgear: 2,
    NodeType.ups: 3,
    NodeType.rpp: 3,
    NodeType.pdu: 4,
    NodeType.chiller: 4,
    NodeType.pump: 4,
    NodeType.cooling_loop: 5,
    NodeType.crah: 6,
    NodeType.rack: 7,
    NodeType.workload: 8,
}
FIDELITY = (
    "Simplified capacity and topology model: power and cooling are treated as kW budgets on a dependency "
    "graph. Not CFD, not electrical load flow, not a protection study."
)


def workspace() -> Workspace:
    return WS


def _guard(fn, *args, **kw) -> Any:
    try:
        return fn(*args, **kw)
    except KeyError as e:
        raise HTTPException(404, str(e).strip("'")) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


class SimulateIn(BaseModel):
    state_changes: dict[str, str] = {}
    time_window: dict[str, int] | None = None


class CutSetsIn(BaseModel):
    baseline: dict[str, str] = {}
    max_order: int = 3
    critical_services: list[str] | None = None
    maintenance: list[str] | None = None


class TaskIn(BaseModel):
    task: dict[str, Any]
    constraints: dict[str, Any] | None = None


class PlanIn(BaseModel):
    plan: dict[str, Any]


class CompareIn(BaseModel):
    a: dict[str, Any]
    b: dict[str, Any]


class DecisionIn(BaseModel):
    decision: str
    actor: str
    note: str = ""


class ScenarioIn(BaseModel):
    name: str
    states: dict[str, str]
    notes: str = ""
    actor: str = "engineer"


class AskIn(BaseModel):
    question: str
    mode: str | None = None


@router.get("/facility")
def facility() -> dict:
    ws = workspace()
    fac = ws.facility()
    nodes = [{**n.model_dump(mode="json", exclude={"requires"}), "layer": LAYER[n.type]} for n in fac.nodes]
    edges = [
        {
            "consumer": n.id,
            "supplier": s.supplier,
            "group": g.name,
            "mode": g.mode.value,
            "k": g.k,
            "resource": g.resource.value,
            "source": s.source.value,
            "status": s.status.value,
            "confidence": s.confidence,
            "citations": [c.model_dump() for c in s.citations],
        }
        for n in fac.nodes
        for g in n.requires
        for s in g.suppliers
    ]
    suspected = [
        {
            "consumer": f.consumer,
            "supplier": f.supplier,
            "group": "power",
            "status": "suspected",
            "source": "inferred_from_docs",
            "confidence": f.confidence,
            "finding": f.id,
        }
        for f in ws.findings()
        if f.status == "open" and f.classification != "confirms"
    ]
    return {
        "name": fac.name,
        "fidelity": FIDELITY,
        "critical_services": fac.critical_services(),
        "nodes": nodes,
        "edges": edges,
        "suspected": suspected,
        "profiles": ws.profiles,
        "load_source": ws.load_source(),
        "windows": [w.__dict__ | {"state": w.state.value} for w in ws.windows],
    }


@router.post("/simulate")
def simulate(body: SimulateIn) -> dict:
    return _guard(tools.simulate, workspace(), body.state_changes, body.time_window)


@router.post("/cutsets")
def cutsets(body: CutSetsIn) -> dict:
    return _guard(
        tools.find_cut_sets, workspace(), body.baseline, body.max_order, body.critical_services, body.maintenance
    )


@router.post("/redundancy")
def redundancy(body: SimulateIn) -> dict:
    return _guard(tools.redundancy, workspace(), body.state_changes)


@router.post("/transient")
def transient(body: dict[str, list[str]]) -> dict:
    return _guard(tools.transient_check, workspace(), body.get("failed", []))


@router.post("/plans/search")
def plans_search(body: TaskIn) -> dict:
    return _guard(tools.search_plans, workspace(), body.task, body.constraints)


@router.post("/plans/evaluate")
def plans_evaluate(body: PlanIn) -> dict:
    return _guard(tools.evaluate_plan, workspace(), body.plan)


@router.post("/plans/compare")
def plans_compare(body: CompareIn) -> dict:
    a = _guard(tools.evaluate_plan, workspace(), body.a)
    b = _guard(tools.evaluate_plan, workspace(), body.b)
    keys = [
        "start",
        "end",
        "mitigations",
        "lost_services",
        "lost_load",
        "lost_kw",
        "min_cut_order",
        "single_points",
        "min_margin",
        "tightest",
        "tightest_hour",
        "reasons",
    ]
    return {"a": a, "b": b, "differences": {k: [a[k], b[k]] for k in keys if a[k] != b[k]}}


@router.get("/findings")
def findings() -> dict:
    ws = workspace()
    res = ws.discovery()
    return {
        "findings": [to_dict(f) for f in ws.findings()],
        "rejected": [r.__dict__ for r in res.rejected],
        "metrics": score(res, ws.labels) if ws.labels else None,  # only labelled corpora can be scored
        "records": len(ws.docs),
        "model_read": ws.model_read,
    }


@router.post("/findings/model-read")
def model_read(request: Request) -> dict:
    try:
        return workspace().read_with_model(request.headers.get("x-actor", "engineer"))
    except ModelUnavailable as e:
        raise HTTPException(503, str(e)) from e


@router.post("/meters/sync")
def meters_sync(request: Request) -> dict:
    try:
        return workspace().sync_meters(request.headers.get("x-actor", "engineer"))
    except MetersUnavailable as e:
        raise HTTPException(503, str(e)) from e


@router.post("/findings/{finding_id}/decision")
def decide(finding_id: str, body: DecisionIn) -> dict:
    if not body.actor.strip():
        raise HTTPException(422, "actor is required")
    f = _guard(workspace().decide, finding_id, body.decision, body.actor.strip(), body.note)
    return to_dict(f)


@router.get("/audit")
def audit() -> list[dict]:
    return workspace().store.audit_log()


@router.get("/scenarios")
def scenarios() -> list[dict]:
    return workspace().store.scenarios()


@router.post("/scenarios")
def save_scenario(body: ScenarioIn) -> dict:
    ws = workspace()
    from .workspace import parse_states

    states = _guard(parse_states, body.states, ws.facility())
    sid = ws.store.save_scenario(body.name, {k: v.value for k, v in states.items()}, body.notes, body.actor)
    return {"id": sid}


@router.get("/export.csv", response_class=PlainTextResponse)
def export_csv() -> str:
    return to_csv(workspace().facility())


@router.post("/import")
async def import_facility(request: Request) -> dict:
    raw = (await request.body()).decode()
    kind = request.headers.get("content-type", "")
    try:
        fac = from_json(raw) if "json" in kind else from_csv(raw)
    except ValueError as e:
        raise HTTPException(422, f"import failed: {e}") from e
    workspace().replace_facility(fac, request.headers.get("x-actor", "engineer"))
    return {"name": fac.name, "nodes": len(fac.nodes)}


@router.post("/facility/demo")
def restore_demo(request: Request) -> dict:
    workspace().restore_demo(request.headers.get("x-actor", "engineer"))
    return {"name": workspace().documented.name, "nodes": len(workspace().documented.nodes)}


@router.post("/agent")
async def ask(body: AskIn) -> EventSourceResponse:
    if not body.question.strip():
        raise HTTPException(422, "question is required")

    async def events():
        loop = asyncio.get_running_loop()
        it = agent.run(body.question.strip(), workspace(), body.mode)
        while True:
            ev = await loop.run_in_executor(None, next, it, None)
            if ev is None:
                break
            yield {"data": json.dumps(ev, default=str)}
        yield {"event": "end", "data": "{}"}

    return EventSourceResponse(events())
