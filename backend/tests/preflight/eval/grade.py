"""Grade one agent run against an eval case. Expected values come from the engine at grading time.

The checks look for the engine's numbers and node ids, not the scripted planner's wording, so a live model that
phrases the answer differently is graded on the same facts.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from app.preflight import tools
from app.preflight.store import Store
from app.preflight.workspace import Workspace

# Categories that fail a case. Everything else is reported but does not fail it.
FATAL = {"fallback", "loop", "no_final", "unbacked", "refusal", "missing_tool", "wrong_answer"}


@dataclass
class Grade:
    issues: list[tuple[str, str]] = field(default_factory=list)
    tools_used: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not any(cat in FATAL for cat, _ in self.issues)

    def add(self, category: str, detail: str) -> None:
        self.issues.append((category, detail))


def _subsequence(expected: list[str], actual: list[str]) -> bool:
    it = iter(actual)
    return all(any(a == e for a in it) for e in expected)


def _has_number(n: int, text: str) -> bool:
    return re.search(rf"(?<![\d.]){n}(?![\d.])", text) is not None


def grade(case: dict, events: list[dict], *, allow_fallback: bool) -> Grade:
    g = Grade(tools_used=[e["tool"] for e in events if e["type"] == "tool_call"])
    for e in events:
        if e["type"] == "fallback" and not allow_fallback:
            g.add("fallback", e["reason"])
        elif e["type"] == "rejected_answer":
            g.add("rejected_claims", "; ".join(e["problems"])[:200])
        elif e["type"] == "tool_result" and "error" in e["result"]:
            g.add("bad_args", f"{e['tool']}: {e['result']['error']}"[:200])
        elif e["type"] == "tool_error":
            g.add("bad_args", e["message"][:200])
        elif e["type"] == "error":
            g.add("loop", e["message"])
    final = events[-1] if events else {}
    if final.get("type") != "final":
        if not any(cat == "loop" for cat, _ in g.issues):
            g.add("no_final", str(final)[:200])
        return g

    answer, expect = final["answer"], case.get("expect") or {}
    if final["problems"]:
        g.add("unbacked", "; ".join(final["problems"])[:200])
    if bool(answer.get("refused")) != bool(expect.get("refused")):
        g.add("refusal", f"refused={bool(answer.get('refused'))}, expected {bool(expect.get('refused'))}")
        return g
    if expect.get("refused"):
        if g.tools_used:
            g.add("tool_order", f"called {g.tools_used} before refusing")
        return g

    missing = [t for t in dict.fromkeys(case["tools"]) if t not in g.tools_used]
    if missing:
        g.add("missing_tool", f"never called {missing}; used {g.tools_used}")
    elif not _subsequence(case["tools"], g.tools_used):
        g.add("tool_order", f"expected order {case['tools']}, used {g.tools_used}")

    rec = str(answer.get("recommendation", ""))
    text = json.dumps(answer)
    fresh = Workspace(Store(":memory:"))
    if "plan" in expect:
        p = expect["plan"]
        best = tools.search_plans(
            fresh, {"nodes": p["nodes"], "duration_h": p["duration_h"], "earliest": 0, "latest": 48}
        )["top"][0]
        if not (_has_number(best["start"], rec) and _has_number(best["end"], rec)):
            g.add("wrong_answer", f"best window is hour {best['start']} to {best['end']}; said: {rec[:160]}")
    if "lost" in expect:
        n_lost = tools.simulate(fresh, {n: "failed" for n in expect["lost"]})["lost_count"]
        ok = _has_number(n_lost, rec) if n_lost else re.search(r"\bnothing\b|\bno (?:rack|workload|load)", text, re.I)
        if not ok:
            g.add("wrong_answer", f"engine loses {n_lost}; said: {rec[:160]}")
    if "single_points" in expect:
        res = tools.find_cut_sets(fresh, max_order=2, maintenance=expect["single_points"] or None)
        absent = [n for n in res["single_points"] if n not in rec]
        if absent:
            g.add("wrong_answer", f"single points {res['single_points']} not all named; said: {rec[:160]}")
        if not res["single_points"] and not re.search(r"no single point", rec, re.I):
            g.add("wrong_answer", f"engine finds no single point; said: {rec[:160]}")
    for m in expect.get("mentions", []):
        if m not in text:
            g.add("wrong_answer", f"does not mention {m}")
    return g
