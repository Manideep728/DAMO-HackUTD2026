"""HTTP API for the modernization harness, the Nemotron agents and the operations engine."""
import os, json
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
from starlette.concurrency import iterate_in_threadpool, run_in_threadpool
from . import inputs, harness, candidate, legacy, agent, ops
from ..models import SUPER, NANO, has_key

router = APIRouter(prefix="/api/ttu")


def _err(e, code=503):
    return JSONResponse({"error": str(e)}, status_code=code)


@router.get("/status")
def status():
    return {"tools": candidate.available(), "plugin_executable": legacy.plugin_available(), "nemotron_key": has_key(),
            "models": {"super": SUPER, "nano": NANO}, "pin": inputs.PIN, "github_work_orders": bool(os.getenv("GAUNTLET_GITHUB_REPO") and os.getenv("GITHUB_TOKEN"))}


@router.get("/inputs")
def get_inputs():
    return inputs.analyse()


@router.get("/candidate/{version}")
def get_candidate(version: str):
    if version not in ("v1", "v2"):
        return _err("unknown candidate", 404)
    r, a = harness.load(version)
    return {"version": version, "rules": r, "alertmanager": a}


@router.post("/test/{version}")
async def test(version: str, req: Request):
    body = await req.json() if (await req.body()) else {}
    try:
        if body.get("rules"):
            return await run_in_threadpool(harness.run, version, body["rules"], body["alertmanager"])
        return await run_in_threadpool(harness.run, version)
    except Exception as e:
        return _err(e)


@router.get("/agent/{job}")
async def run_agent(job: str, seed: str = "v1"):
    if job not in ("recover", "repair", "investigate"):
        return _err("unknown job", 404)
    if job == "investigate" and ops.OPS.offline_model:
        return _err("Nemotron is offline. Alerting, delivery and work orders keep running; investigation waits.")

    async def events():
        async for ev in iterate_in_threadpool(agent.run(job, seed)):
            yield {"data": json.dumps(ev)}
        yield {"event": "end", "data": "{}"}
    return EventSourceResponse(events())


# ---------------- operations
@router.get("/ops/state")
def ops_state():
    return ops.OPS.state()


@router.post("/ops/play")
async def ops_play():
    try:
        return await run_in_threadpool(ops.OPS.play)
    except Exception as e:
        return _err(e)


@router.post("/ops/model")
async def ops_model(req: Request):
    ops.OPS.offline_model = bool((await req.json()).get("offline"))
    return ops.OPS.state()


@router.post("/ops/receiver")
async def ops_receiver(req: Request):
    b = await req.json()
    (ops.OPS.receivers_failing.add if b.get("failing") else ops.OPS.receivers_failing.discard)(b["name"])
    return ops.OPS.state()


@router.post("/ops/ack")
async def ops_ack(req: Request):
    b = await req.json(); return ops.OPS.ack(b.get("asset_id", "hpc-c2"), b.get("by", "duty operator"))


@router.post("/ops/note")
async def ops_note(req: Request):
    b = await req.json(); return ops.OPS.add_note(b["work_order"], b["author"], b["occurred"], b["text"], b.get("corrects"))


@router.post("/ops/close")
async def ops_close(req: Request):
    b = await req.json(); return ops.OPS.close_work_order(b.get("asset_id", "hpc-c2"))


@router.post("/ops/verify")
async def ops_verify(req: Request):
    b = await req.json(); return await run_in_threadpool(ops.OPS.verify_recovery, b.get("asset_id", "hpc-c2"))


@router.post("/ops/handoff")
async def ops_handoff(req: Request):
    b = await req.json(); return ops.OPS.accept_handoff(b.get("by", "incoming shift"))


@router.post("/ops/reset")
def ops_reset():
    ops.OPS.reset(); return ops.OPS.state()
