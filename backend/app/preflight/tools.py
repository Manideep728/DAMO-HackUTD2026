"""Tool functions over the workspace. The API and the agent call the same code, and every result is plain
JSON so the agent's claims can be traced back to it."""

from __future__ import annotations

import re
from dataclasses import asdict
from typing import Any

from engine.cutsets import find_cut_sets as _find_cut_sets
from engine.cutsets import maintenance_view
from engine.model import EdgeStatus, State
from engine.planner import Plan, Task
from engine.planner import evaluate_plan as _evaluate_plan
from engine.planner import search_plans as _search_plans
from engine.propagate import simulate as _simulate
from engine.redundancy import service_redundancy
from engine.timestep import margins, run_timeline
from engine.transients import transient

from .discovery import Claim, Finding, Resolver, chunks, validate
from .discovery import impact as _impact
from .workspace import Workspace, parse_states


def _r(x: float) -> float:
    return round(x, 3)


def simulate(
    ws: Workspace, state_changes: dict[str, str] | None = None, time_window: dict[str, int] | None = None
) -> dict[str, Any]:
    fac = ws.facility()
    states = parse_states(state_changes, fac)
    if time_window:
        start, end = int(time_window.get("start", 0)), int(time_window.get("end", 24))
        if not 0 < end - start <= 24 * 14:
            raise ValueError("time_window must span 1 to 336 hours")
        from engine.timestep import Window

        windows = [*ws.windows, Window(list(states), start, end, "scenario")]
        tl = run_timeline(fac, end - start, ws.profiles, windows, start=start)
        worst = min(tl.snapshots, key=lambda s: s.min_margin)
        return {
            "window": {"start": start, "end": end},
            "lost_services_any_hour": sorted({s for snap in tl.snapshots for s in snap.lost_services}),
            "lost_any_hour": sorted({s for snap in tl.snapshots for s in snap.lost}),
            "min_margin": _r(worst.min_margin),
            "tightest": worst.tightest,
            "tightest_hour": worst.hour,
            "hours": [
                {"hour": s.hour, "lost": s.lost, "min_margin": _r(s.min_margin), "tightest": s.tightest}
                for s in tl.snapshots
            ],
        }
    r = _simulate(fac, states)
    m, tight, zones = margins(fac, r)
    lost = r.lost(fac)
    return {
        "changes": {k: v.value for k, v in states.items()},
        "lost": lost,
        "lost_count": len(lost),
        "lost_services": [s for s in fac.critical_services() if not r.up(s)],
        "lost_kw": _r(sum(fac.by_id()[n].base_load for n in lost)),
        "degraded": sorted(n for n, v in r.nodes.items() if v.state == State.degraded),
        "failed": sorted(n for n, v in r.nodes.items() if v.state == State.failed),
        "min_margin": _r(m),
        "tightest": tight,
        "zone_margin": {z: _r(v) for z, v in zones.items()},
        "traces": {n: r.trace(n) for n in lost[:6]},
        "nodes": {
            n: {
                "state": v.state.value,
                "load_kw": {k: _r(x) for k, x in v.load.items()},
                "margin_kw": None if v.margin is None else _r(v.margin),
            }
            for n, v in r.nodes.items()
        },
    }


def find_cut_sets(
    ws: Workspace,
    baseline: dict[str, str] | None = None,
    max_order: int = 3,
    critical_services: list[str] | None = None,
    maintenance: list[str] | None = None,
) -> dict:
    fac = ws.facility()
    states = parse_states(baseline, fac)
    max_order = max(1, min(int(max_order), 3))
    if maintenance:
        rep = maintenance_view(fac, states, maintenance, max_order, critical_services)
    else:
        rep = _find_cut_sets(fac, states, max_order, critical_services)
    return {
        "max_order": rep.max_order,
        "maintenance": sorted(maintenance or []),
        "baseline": dict(baseline or {}),
        "services": rep.services,
        "candidates": rep.candidates,
        "notes": rep.notes,
        "cut_sets": [{**asdict(c), "impact": _r(c.impact), "lost_kw": _r(c.lost_kw)} for c in rep.cut_sets[:60]],
        "total": len(rep.cut_sets),
        "single_points": sorted(c.nodes[0] for c in rep.cut_sets if c.order == 1),
    }


def redundancy(ws: Workspace, baseline: dict[str, str] | None = None) -> dict:
    fac = ws.facility()
    out = service_redundancy(fac, parse_states(baseline, fac))
    return {"services": [asdict(s) for s in out]}


def _task(d: dict[str, Any]) -> Task:
    return Task(
        name=str(d.get("name", "maintenance")),
        nodes=list(d["nodes"]),
        duration_h=int(d["duration_h"]),
        earliest=int(d.get("earliest", 0)),
        latest=int(d.get("latest", 48)),
    )


def evaluate_plan(ws: Workspace, plan: dict[str, Any]) -> dict:
    task = _task({**plan, "earliest": plan.get("start", 0), "latest": plan.get("start", 0) + plan["duration_h"]})
    ev = _evaluate_plan(
        ws.facility(), Plan(task, int(plan["start"]), list(plan.get("mitigations", []))), ws.profiles, ws.windows
    )
    return {**asdict(ev), "min_margin": _r(ev.min_margin)}


def search_plans(ws: Workspace, task: dict[str, Any], constraints: dict[str, Any] | None = None) -> dict:
    c = constraints or {}
    res = _search_plans(
        ws.facility(),
        _task(task),
        ws.profiles,
        ws.windows,
        top_n=int(c.get("top_n", 3)),
        mitigate=bool(c.get("mitigate", True)),
    )
    slim = lambda e: {
        "start": e.start,
        "end": e.end,
        "mitigations": e.mitigations,
        "lost_services": e.lost_services,
        "lost_load": e.lost_load,
        "min_cut_order": e.min_cut_order,
        "single_points": e.single_points,
        "min_margin": _r(e.min_margin),
        "tightest": e.tightest,
        "reasons": e.reasons,
    }
    return {
        "task": asdict(res.task),
        "evaluated": res.evaluated,
        "top": [slim(e) for e in res.top],
        "rejected": [slim(e) for e in res.rejected[:12]],
        "rejected_total": len(res.rejected),
        "other_windows": [asdict(w) for w in ws.windows],
    }


def transient_check(ws: Workspace, failed: list[str]) -> dict:
    return asdict(transient(ws.facility(), failed))


def search_docs(ws: Workspace, query: str, limit: int = 6) -> dict:
    """Keyword search over record sentences. Equipment names in the query are resolved like the records are."""
    resolver = Resolver(ws.documented)
    q_nodes = {m.node for m in resolver.mentions(query) if m.node}
    words = {w for w in re.findall(r"[a-z0-9]+", query.lower()) if len(w) > 2}
    hits = []
    for d in ws.docs:
        for _, s in chunks(d):
            nodes = {m.node for m in resolver.mentions(s) if m.node}
            score = 2 * len(q_nodes & nodes) + len(words & set(re.findall(r"[a-z0-9]+", s.lower())))
            if score:
                hits.append(
                    {
                        "doc_id": d.id,
                        "date": d.date,
                        "kind": d.kind,
                        "title": d.title,
                        "text": s,
                        "nodes": sorted(nodes),
                        "score": score,
                    }
                )
    hits.sort(key=lambda h: (-h["score"], h["doc_id"]))
    return {"query": query, "total": len(hits), "results": hits[:limit]}


def get_node(ws: Workspace, id: str) -> dict:
    fac = ws.facility()
    n = fac.by_id().get(id)
    if n is None:
        raise KeyError(f"unknown node {id}")
    return n.model_dump(mode="json")


def get_neighbors(ws: Workspace, id: str, direction: str = "upstream") -> dict:
    fac = ws.facility()
    by_id = fac.by_id()
    if id not in by_id:
        raise KeyError(f"unknown node {id}")
    if direction == "upstream":
        out = [
            {
                "node": s.supplier,
                "group": g.name,
                "mode": g.mode.value,
                "resource": g.resource.value,
                "source": s.source.value,
                "status": s.status.value,
            }
            for g in by_id[id].requires
            for s in g.suppliers
        ]
    elif direction == "downstream":
        out = [
            {
                "node": n.id,
                "group": g.name,
                "mode": g.mode.value,
                "resource": g.resource.value,
                "source": s.source.value,
                "status": s.status.value,
            }
            for n in fac.nodes
            for g in n.requires
            for s in g.suppliers
            if s.supplier == id
        ]
    else:
        raise ValueError("direction must be upstream or downstream")
    return {"id": id, "direction": direction, "neighbors": out}


def propose_dependency(
    ws: Workspace, edge: dict[str, str], citations: list[dict[str, str]], actor: str = "agent"
) -> dict:
    """Create a suspected edge from cited records. Never confirms anything."""
    fac = ws.documented
    consumer, supplier = edge.get("consumer", ""), edge.get("supplier", "")
    if consumer not in fac.by_id() or supplier not in fac.by_id():
        raise KeyError("consumer and supplier must be known node ids")
    docs = {d.id: d for d in ws.docs}
    claims = [
        Claim(
            consumer,
            supplier,
            c.get("doc_id", ""),
            getattr(docs.get(c.get("doc_id", "")), "date", ""),
            getattr(docs.get(c.get("doc_id", "")), "kind", ""),
            c.get("quote", ""),
            extractor="agent",
        )
        for c in citations
    ]
    ok, bad = validate(claims, docs)
    if not ok:
        return {
            "created": False,
            "status": EdgeStatus.rejected.value,
            "reason": "no citation was found verbatim in its document",
            "rejected": [asdict(b) for b in bad],
        }
    group = next((g for g in fac.by_id()[consumer].requires if g.resource.value == "power"), None)
    documented = group.live_suppliers() if group else []
    cls = "confirms" if supplier in documented else ("contradicts" if len(documented) == 1 else "new")
    f = Finding(
        id=f"F-{consumer}-{supplier}",
        consumer=consumer,
        supplier=supplier,
        classification=cls,
        replaces=documented[0] if cls == "contradicts" else None,
        confidence=0.5,
        supporting=[{"doc_id": c.doc_id, "date": c.date, "kind": c.kind, "quote": c.quote, "reason": ""} for c in ok],
        contradicting=[],
        set_aside=[],
    )
    f = ws.add_suspected(f, actor)
    if f.classification != "confirms" and not f.impact:
        f.impact = _impact(ws.documented, f)
    return {
        "created": True,
        "status": EdgeStatus.suspected.value,
        "finding": f.id,
        "claim": f.claim_text(),
        "impact_if_true": f.impact,
        "rejected_citations": [asdict(b) for b in bad],
    }
