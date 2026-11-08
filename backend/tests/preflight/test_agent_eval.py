"""Agent eval: 24 questions with engine-computed answers and expected tool-use patterns.

CI runs the scripted planner. With NVIDIA_API_KEY set, ``EVAL_MODE=live make eval`` runs the same questions
against Nemotron (cached afterwards) with the same checks.
"""

import json
import os
import pathlib

import pytest
import yaml

from app.preflight import agent, tools
from app.preflight.store import Store
from app.preflight.workspace import Workspace

QUESTIONS = yaml.safe_load((pathlib.Path(__file__).parent / "eval" / "questions.yaml").read_text())
MODE = os.getenv("EVAL_MODE", "scripted")


def _subsequence(expected: list[str], actual: list[str]) -> bool:
    it = iter(actual)
    return all(any(a == e for a in it) for e in expected)


def test_there_are_at_least_twenty_questions():
    assert len(QUESTIONS) >= 20


@pytest.mark.parametrize("case", QUESTIONS, ids=[c["q"][:50] for c in QUESTIONS])
def test_agent_answer(case):
    ws = Workspace(Store(":memory:"))
    events = list(agent.run(case["q"], ws, MODE))
    final = events[-1]
    assert final["type"] == "final", events[-1]
    answer, problems = final["answer"], final["problems"]
    used = [e["tool"] for e in events if e["type"] == "tool_call"]
    expect = case.get("expect") or {}
    text = json.dumps(answer)

    assert problems == [], problems  # every claim traces to a tool result
    assert bool(answer.get("refused")) == bool(expect.get("refused"))
    assert _subsequence(case["tools"], used), used
    if expect.get("refused"):
        assert used == []
        return

    fresh = Workspace(Store(":memory:"))
    if "plan" in expect:
        p = expect["plan"]
        best = tools.search_plans(
            fresh, {"nodes": p["nodes"], "duration_h": p["duration_h"], "earliest": 0, "latest": 48}
        )["top"][0]
        assert f"hour {best['start']} to hour {best['end']}" in answer["recommendation"]
    if "lost" in expect:
        res = tools.simulate(fresh, {n: "failed" for n in expect["lost"]})
        n_lost = res["lost_count"]
        assert (f"takes down {n_lost} " in answer["recommendation"]) if n_lost else "takes down nothing" in text
    if "single_points" in expect:
        res = tools.find_cut_sets(fresh, max_order=2, maintenance=expect["single_points"] or None)
        for n in res["single_points"]:
            assert n in answer["recommendation"]
        if not res["single_points"]:
            assert "No single point of failure" in answer["recommendation"]
    for m in expect.get("mentions", []):
        assert m in text
