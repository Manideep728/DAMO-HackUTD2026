"""Agent eval: 24 questions with engine-computed answers and expected tool-use patterns.

EVAL_MODE=scripted (default) runs the scripted planner. EVAL_MODE=replay runs the agent's live path against the
recorded Nemotron responses in eval/replay/; a missing recording fails the case instead of falling back.
Live runs against the API go through eval/run_live.py, which records those responses.
"""

import os
import pathlib

import pytest
import yaml

from app.preflight import agent
from app.preflight.store import Store
from app.preflight.workspace import Workspace

from .eval.grade import grade

QUESTIONS = yaml.safe_load((pathlib.Path(__file__).parent / "eval" / "questions.yaml").read_text())
MODE = os.getenv("EVAL_MODE", "scripted")


def test_there_are_at_least_twenty_questions():
    assert len(QUESTIONS) >= 20


@pytest.mark.parametrize("case", QUESTIONS, ids=[c["q"][:50] for c in QUESTIONS])
def test_agent_answer(case):
    ws = Workspace(Store(":memory:"))
    events = list(agent.run(case["q"], ws, "live" if MODE == "replay" else MODE))
    g = grade(case, events, allow_fallback=MODE == "scripted")
    assert g.passed, g.issues
