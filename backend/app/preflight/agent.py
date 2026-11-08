"""Preflight agent: Nemotron chooses what to test, the simulator answers, the agent explains.

Every claim in the final answer cites tool-call ids, and a validator rejects any node id or number in a claim
that does not appear in the cited results. Without an API key (or in cached/mock mode with no recording) a
scripted planner runs the same tools in the same propose → test → refine pattern, and says so.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Callable, Iterator
from typing import Any

from .. import llm
from ..models import SUPER, has_key
from . import tools
from .discovery import Resolver
from .workspace import Workspace

MAX_STEPS = 12
MODEL = os.getenv("NEMOTRON_MODEL") or SUPER

SYSTEM = """You plan data center maintenance with a simulator. You never compute or assert a consequence
yourself: you call tools and explain their results. Iterate: propose an option, test it, discard or refine.
Finish by calling final_answer. Every claim, rejected alternative and risk must cite the ids of the tool calls
(t1, t2, ...) whose results support it, and may only use node ids and numbers that appear in those results.
The simulator is a simplified capacity and topology model, not CFD or electrical load flow; if a question needs
more than that, or is not about this facility, refuse in final_answer with refused=true."""

OUT_OF_SCOPE = re.compile(
    r"\b(cfd|airflow pattern|air ?flow distribution|hot ?spot temperature|harmonic|arc ?flash|short[- ]circuit|"
    r"load ?flow|weather|stock|price|poem|joke|recipe)\b",
    re.I,
)

Tool = tuple[str, dict[str, Any], Callable[..., dict]]


def _schema(props: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": required}


STATES = {
    "type": "object",
    "additionalProperties": {"type": "string", "enum": ["failed", "maintenance"]},
    "description": "node id -> failed | maintenance",
}
TOOLS: dict[str, Tool] = {
    "simulate": (
        "Simulate the facility with nodes failed or in maintenance; optional hourly time window.",
        _schema(
            {
                "state_changes": STATES,
                "time_window": {
                    "type": "object",
                    "properties": {"start": {"type": "integer"}, "end": {"type": "integer"}},
                },
            },
            ["state_changes"],
        ),
        tools.simulate,
    ),
    "find_cut_sets": (
        "Minimal sets of equipment whose joint failure loses a critical service.",
        _schema(
            {
                "baseline": STATES,
                "max_order": {"type": "integer"},
                "critical_services": {"type": "array", "items": {"type": "string"}},
                "maintenance": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "nodes in a maintenance window, to see what shrinks",
                },
            },
            [],
        ),
        tools.find_cut_sets,
    ),
    "evaluate_plan": (
        "Evaluate one maintenance plan hour by hour.",
        _schema(
            {
                "plan": {
                    "type": "object",
                    "properties": {
                        "nodes": {"type": "array", "items": {"type": "string"}},
                        "start": {"type": "integer"},
                        "duration_h": {"type": "integer"},
                        "mitigations": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["nodes", "start", "duration_h"],
                }
            },
            ["plan"],
        ),
        tools.evaluate_plan,
    ),
    "search_plans": (
        "Search candidate windows for a maintenance task and rank them.",
        _schema(
            {
                "task": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "nodes": {"type": "array", "items": {"type": "string"}},
                        "duration_h": {"type": "integer"},
                        "earliest": {"type": "integer"},
                        "latest": {"type": "integer"},
                    },
                    "required": ["nodes", "duration_h"],
                },
                "constraints": {"type": "object"},
            },
            ["task"],
        ),
        tools.search_plans,
    ),
    "search_docs": (
        "Search maintenance records, work orders and change tickets.",
        _schema({"query": {"type": "string"}}, ["query"]),
        tools.search_docs,
    ),
    "get_node": (
        "One node's attributes and requirement groups.",
        _schema({"id": {"type": "string"}}, ["id"]),
        tools.get_node,
    ),
    "get_neighbors": (
        "Suppliers (upstream) or consumers (downstream) of a node.",
        _schema(
            {"id": {"type": "string"}, "direction": {"type": "string", "enum": ["upstream", "downstream"]}}, ["id"]
        ),
        tools.get_neighbors,
    ),
    "propose_dependency": (
        "Record a suspected dependency found in records, with exact quotes. Never confirms.",
        _schema(
            {
                "edge": {
                    "type": "object",
                    "properties": {"consumer": {"type": "string"}, "supplier": {"type": "string"}},
                },
                "citations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {"doc_id": {"type": "string"}, "quote": {"type": "string"}},
                    },
                },
            },
            ["edge", "citations"],
        ),
        tools.propose_dependency,
    ),
}
EVIDENCE = {"type": "array", "items": {"type": "string"}, "description": "tool call ids, e.g. t1"}
FINAL = _schema(
    {
        "refused": {"type": "boolean"},
        "recommendation": {"type": "string"},
        "recommendation_evidence": EVIDENCE,
        "claims": {
            "type": "array",
            "items": {"type": "object", "properties": {"text": {"type": "string"}, "evidence": EVIDENCE}},
        },
        "rejected_alternatives": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"option": {"type": "string"}, "reason": {"type": "string"}, "evidence": EVIDENCE},
            },
        },
        "risks": {
            "type": "array",
            "items": {"type": "object", "properties": {"text": {"type": "string"}, "evidence": EVIDENCE}},
        },
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    ["recommendation"],
)


def openai_tools() -> list[dict]:
    specs = [
        {"type": "function", "function": {"name": n, "description": d, "parameters": p}}
        for n, (d, p, _) in TOOLS.items()
    ]
    return specs + [
        {"type": "function", "function": {"name": "final_answer", "description": "Finish.", "parameters": FINAL}}
    ]


# ------------------------------------------------------------------ claim tracing


def _numbers(text: str) -> list[str]:
    return re.findall(r"(?<![A-Za-z0-9-])\d+(?:\.\d+)?%?", text)


def _number_supported(num: str, blob: str) -> bool:
    if num.endswith("%"):
        frac = float(num[:-1]) / 100
        return any(abs(float(x) - frac) < 0.006 for x in re.findall(r"-?\d+\.\d+|-?\d+", blob))
    return re.search(rf"(?<![\d.]){re.escape(num)}(?![\d])", blob) is not None or (
        "." not in num and re.search(rf"(?<![\d.]){re.escape(num)}\.\d", blob) is not None
    )


def check_answer(answer: dict, results: dict[str, Any], node_ids: set[str]) -> list[str]:
    """Problems with an answer: missing evidence, or node ids and numbers not found in the cited results."""
    if answer.get("refused"):
        return []
    problems = []
    items = [("recommendation", answer.get("recommendation", ""), answer.get("recommendation_evidence", []))]
    items += [("claim", c.get("text", ""), c.get("evidence", [])) for c in answer.get("claims", [])]
    items += [
        ("rejected", f"{a.get('option', '')} {a.get('reason', '')}", a.get("evidence", []))
        for a in answer.get("rejected_alternatives", [])
    ]
    items += [("risk", r.get("text", ""), r.get("evidence", [])) for r in answer.get("risks", [])]
    id_pat = (
        re.compile(
            r"(?<![A-Za-z0-9-])("
            + "|".join(sorted(map(re.escape, node_ids), key=len, reverse=True))
            + r")(?![A-Za-z0-9-])"
        )
        if node_ids
        else None
    )
    for kind, text, ev in items:
        if not text:
            continue
        missing = [e for e in ev if e not in results]
        if not ev or missing:
            problems.append(f"{kind} '{text[:60]}' cites no valid tool call")
            continue
        blob = json.dumps([results[e] for e in ev])
        for nid in set(id_pat.findall(text)) if id_pat else set():
            if nid not in blob:
                problems.append(f"{kind} names {nid}, which is not in the cited results")
        for num in _numbers(text):
            if not _number_supported(num, blob):
                problems.append(f"{kind} states {num}, which is not in the cited results")
    return problems


# ------------------------------------------------------------------ runs


class Run:
    def __init__(self, ws: Workspace):
        self.ws, self.results, self.calls = ws, {}, []

    def call(self, name: str, args: dict[str, Any]) -> tuple[str, dict]:
        cid = f"t{len(self.calls) + 1}"
        try:
            result = TOOLS[name][2](self.ws, **args)
        except (KeyError, ValueError, TypeError) as e:
            result = {"error": str(e)}
        self.results[cid] = result
        self.calls.append({"id": cid, "tool": name, "args": args})
        return cid, result


def _summary(result: dict) -> dict:
    """Trim large results before sending them back to the model."""
    out = dict(result)
    if "nodes" in out and isinstance(out["nodes"], dict):
        out["nodes"] = {k: v for k, v in out["nodes"].items() if v.get("state") != "operational"}
    return out


def run(question: str, ws: Workspace, mode: str | None = None) -> Iterator[dict]:
    mode = mode or ("live" if llm.MODE == "live" and has_key() else "scripted")
    yield {"type": "start", "mode": mode, "model": MODEL if mode == "live" else "scripted planner (no model)"}
    r = Run(ws)
    if mode == "live":
        try:
            yield from _live(question, r)
            return
        except Exception as e:  # API down, rate limited or no recording: say so, then run the scripted planner
            yield {"type": "fallback", "reason": f"Nemotron unavailable ({type(e).__name__}); scripted planner used"}
            r = Run(ws)
    yield from _scripted(question, r)


def _emit_call(r: Run, name: str, args: dict) -> Iterator[dict]:
    yield {"type": "tool_call", "id": f"t{len(r.calls) + 1}", "tool": name, "args": args}
    cid, res = r.call(name, args)
    yield {"type": "tool_result", "id": cid, "tool": name, "result": _summary(res)}


def _final(r: Run, answer: dict) -> Iterator[dict]:
    problems = check_answer(answer, r.results, set(r.ws.facility().by_id()))
    yield {"type": "final", "answer": answer, "problems": problems, "calls": r.calls}


def _live(question: str, r: Run) -> Iterator[dict]:
    messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": question}]
    for _ in range(MAX_STEPS):
        msg = llm.chat_tools(messages, openai_tools(), model=MODEL)
        calls = msg.get("tool_calls") or []
        messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls})
        if not calls:
            messages.append({"role": "user", "content": "Use the tools, then call final_answer."})
            continue
        for tc in calls:
            name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            if name == "final_answer":
                problems = check_answer(args, r.results, set(r.ws.facility().by_id()))
                if problems:
                    yield {"type": "rejected_answer", "problems": problems}
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": json.dumps({"error": "answer rejected", "problems": problems}),
                        }
                    )
                    break
                yield {"type": "final", "answer": args, "problems": [], "calls": r.calls}
                return
            if name not in TOOLS:
                yield {"type": "tool_error", "message": f"unknown tool {name}"}
                messages.append({"role": "tool", "tool_call_id": tc["id"], "content": '{"error": "unknown tool"}'})
                continue
            events = list(_emit_call(r, name, args))
            yield from events
            cid = events[-1]["id"]
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps({"call_id": cid, **_summary(r.results[cid])})[:12000],
                }
            )
    yield {"type": "error", "message": f"no verified answer within {MAX_STEPS} steps"}


# ------------------------------------------------------------------ scripted planner


def _nodes(question: str, r: Run) -> list[str]:
    seen: list[str] = []
    for m in Resolver(r.ws.documented).mentions(question):
        if m.node and m.node not in seen:
            seen.append(m.node)
    return seen


def _hours(question: str) -> int | None:
    m = re.search(r"(\d+)\s*(?:h\b|hr|hour)", question, re.I)
    return int(m.group(1)) if m else None


def _scripted(question: str, r: Run) -> Iterator[dict]:
    q = question.lower()
    nodes = _nodes(question, r)
    if OUT_OF_SCOPE.search(question) or not (
        nodes or re.search(r"single point|weak|cut set|redundan|independen|record|document|safest|maintenance|fail", q)
    ):
        yield from _final(
            r,
            {
                "refused": True,
                "recommendation": (
                    "Out of scope: this tool answers dependency, failure and maintenance-planning questions with a "
                    "simplified capacity and topology model. It cannot do CFD, electrical load flow or anything "
                    "outside this facility."
                ),
            },
        )
        return
    if nodes and re.search(r"safest|when should|schedule|window|plan", q):
        yield from _plan(question, nodes, r)
    elif re.search(r"independen|redundan|backup|share", q) and len(nodes) >= 2:
        yield from _independence(nodes, r)
    elif re.search(r"single point|weak|cut set", q):
        yield from _weak_points(nodes, r)
    elif re.search(r"record|document|work order|ticket|\blogs?\b", q):
        events = list(_emit_call(r, "search_docs", {"query": question}))
        yield from events
        hits = r.results[events[-1]["id"]]["results"]
        cid = events[-1]["id"]
        yield from _final(
            r,
            {
                "recommendation": f"{r.results[cid]['total']} matching record sentences; "
                f"most relevant: {hits[0]['doc_id']}"
                if hits
                else "No matching records.",
                "recommendation_evidence": [cid],
                "claims": [{"text": f"{h['doc_id']}: {h['text']}", "evidence": [cid]} for h in hits[:3]],
                "assumptions": ["record text is quoted, not interpreted"],
            },
        )
    elif nodes and re.search(r"fail|lose|lost|trip|down|offline|outage", q):
        yield from _what_if(nodes, r)
    else:
        yield from _weak_points(nodes, r)


def _what_if(nodes: list[str], r: Run) -> Iterator[dict]:
    ev = list(_emit_call(r, "simulate", {"state_changes": {n: "failed" for n in nodes}}))
    yield from ev
    cid, res = ev[-1]["id"], r.results[ev[-1]["id"]]
    lost = res.get("lost", [])
    claims = (
        [
            {
                "text": f"Losing {', '.join(nodes)} takes down {len(lost)} racks or workloads ({res['lost_kw']} kW)",
                "evidence": [cid],
            }
        ]
        if lost
        else [{"text": f"Losing {', '.join(nodes)} takes down nothing", "evidence": [cid]}]
    )
    if res.get("lost_services"):
        claims.append({"text": f"Critical services lost: {', '.join(res['lost_services'])}", "evidence": [cid]})
    yield from _final(
        r,
        {
            "recommendation": claims[0]["text"],
            "recommendation_evidence": [cid],
            "claims": claims,
            "risks": [{"text": f"Tightest remaining supplier: {res['tightest']}", "evidence": [cid]}]
            if res.get("tightest")
            else [],
            "assumptions": ["steady state after the failure"],
        },
    )


def _weak_points(nodes: list[str], r: Run) -> Iterator[dict]:
    args: dict[str, Any] = {"max_order": 2}
    if nodes:
        args["maintenance"] = nodes
    ev = list(_emit_call(r, "find_cut_sets", args))
    yield from ev
    cid, res = ev[-1]["id"], r.results[ev[-1]["id"]]
    singles = res["single_points"]
    rec = f"Single points of failure: {', '.join(singles)}" if singles else "No single point of failure up to order 2"
    if nodes:
        rec += f" while {', '.join(nodes)} is in maintenance"
    claims = [
        {
            "text": f"{', '.join(c['nodes'])} (order {c['order']}) loses {', '.join(c['lost_services'][:3])}",
            "evidence": [cid],
        }
        for c in res["cut_sets"][:4]
    ]
    yield from _final(
        r,
        {
            "recommendation": rec,
            "recommendation_evidence": [cid],
            "claims": claims,
            "assumptions": ["cut sets up to order 2 over infrastructure upstream of critical loads"],
        },
    )


def _independence(nodes: list[str], r: Run) -> Iterator[dict]:
    a, b = nodes[0], nodes[1]
    ups = []
    for n in (a, b):
        ev = list(_emit_call(r, "get_neighbors", {"id": n, "direction": "upstream"}))
        yield from ev
        ups.append(ev[-1]["id"])
    ev = list(_emit_call(r, "find_cut_sets", {"max_order": 2}))
    yield from ev
    cuts_id = ev[-1]["id"]
    singles = r.results[cuts_id]["single_points"]
    docs = list(_emit_call(r, "search_docs", {"query": f"{a} {b} fed from"}))
    yield from docs
    docs_id = docs[-1]["id"]
    claims = [
        {
            "text": f"In the current graph the single points of failure are {', '.join(singles) or 'none'}",
            "evidence": [cuts_id],
        }
    ]
    risks = []
    open_f = [
        f
        for f in r.ws.findings()
        if f.status == "open"
        and f.classification != "confirms"
        and f.consumer in {x["node"] for u in ups for x in r.results[u]["neighbors"]}
    ]
    for f in open_f:
        prop = list(
            _emit_call(
                r,
                "propose_dependency",
                {
                    "edge": {"consumer": f.consumer, "supplier": f.supplier},
                    "citations": [{"doc_id": s["doc_id"], "quote": s["quote"]} for s in f.supporting],
                },
            )
        )
        yield from prop
        pid = prop[-1]["id"]
        new_spof = r.results[pid].get("impact_if_true", {}).get("new_single_points", [])
        text = f"Records suggest {f.consumer} is fed from {f.supplier} (suspected, not yet in the graph)"
        if new_spof:
            text += f"; if confirmed, {', '.join(new_spof)} becomes a single point of failure for both"
        risks.append({"text": text, "evidence": [docs_id, pid]})
    rec = (
        f"{a} and {b} share a single point of failure: {', '.join(singles)}"
        if singles
        else f"{a} and {b} have no shared single point of failure in the confirmed graph"
    )
    if open_f:
        rec += "; an unconfirmed record finding may change this, so confirm it in the findings inbox"
    yield from _final(
        r,
        {
            "recommendation": rec,
            "recommendation_evidence": [cuts_id],
            "claims": claims,
            "risks": risks,
            "assumptions": ["only confirmed edges are simulated"],
        },
    )


def _plan(question: str, nodes: list[str], r: Run) -> Iterator[dict]:
    hours = _hours(question) or 4
    task = {
        "name": f"Maintenance on {', '.join(nodes)}",
        "nodes": nodes,
        "duration_h": hours,
        "earliest": 0,
        "latest": 48,
    }
    ev = list(_emit_call(r, "search_plans", {"task": task}))
    yield from ev
    sid, res = ev[-1]["id"], r.results[ev[-1]["id"]]
    if not res["top"]:
        yield from _final(
            r,
            {
                "recommendation": "No window in the next 48 hours avoids losing a critical service",
                "recommendation_evidence": [sid],
            },
        )
        return
    best = res["top"][0]
    check = list(
        _emit_call(
            r,
            "evaluate_plan",
            {"plan": {"nodes": nodes, "start": best["start"], "duration_h": hours, "mitigations": best["mitigations"]}},
        )
    )
    yield from check
    eid = check[-1]["id"]
    cuts = list(_emit_call(r, "find_cut_sets", {"max_order": 2, "maintenance": nodes}))
    yield from cuts
    cid = cuts[-1]["id"]
    mit = f" with {', '.join(best['mitigations'])}" if best["mitigations"] else ""
    rec = f"Do it from hour {best['start']} to hour {best['end']}{mit}"
    rejected = [
        {
            "option": f"hour {e['start']}" + (f" with {', '.join(e['mitigations'])}" if e["mitigations"] else ""),
            "reason": "; ".join(e["reasons"]) or "ranked lower",
            "evidence": [sid],
        }
        for e in res["rejected"]
        if e["reasons"]
    ][:3]
    order1 = [c for c in r.results[cid]["cut_sets"] if c["order"] == 1]
    risks = [
        {
            "text": f"During the window {', '.join(c['nodes'])} becomes a single point of failure "
            f"(order {c['was_order']} before)",
            "evidence": [cid],
        }
        for c in order1
        if (c.get("was_order") or 0) > 1
    ][:3]
    risks += [
        {"text": f"{', '.join(c['nodes'])} is already a single point of failure", "evidence": [cid]}
        for c in order1
        if c.get("was_order") == 1
    ][:2]
    if best["single_points"] and not risks:
        risks = [
            {
                "text": f"Single points of failure during the window: {', '.join(best['single_points'])}",
                "evidence": [sid],
            }
        ]
    yield from _final(
        r,
        {
            "recommendation": rec,
            "recommendation_evidence": [sid, eid],
            "claims": [
                {
                    "text": f"Lowest headroom in that window is {best['min_margin']:.0%} on {best['tightest']}",
                    "evidence": [eid],
                }
            ]
            if best["tightest"]
            else [],
            "rejected_alternatives": rejected,
            "risks": risks,
            "assumptions": ["hour 0 is midnight today", "load profiles and other scheduled work as loaded"],
        },
    )
