"""Evaluation: baseline vs Damo on known-truth scenarios, and seeded defects on the unseen site."""

import ast
import inspect

from app.retrofit import evaluate


def rows():
    ev = evaluate.run()
    return ev, {(r["scenario"], r["arm"]): r for r in ev["monitoring"]["rows"]}


def test_damo_scopes_the_right_racks_and_never_declares_false_recovery():
    _, r = rows()
    for s in ("lowflow", "partial", "colo"):
        assert r[(s, "damo")]["affected_racks_correct"] and r[(s, "damo")]["missed"] == 0
        assert r[(s, "damo")]["false_recovery"] == 0 and r[(s, "damo")]["handoff_min"] is not None
    for s in ("stale", "healthy"):
        assert r[(s, "damo")]["unnecessary"] == 0


def test_threshold_baseline_declares_recovery_while_the_job_is_still_slow():
    _, r = rows()
    assert r[("partial", "threshold")]["false_recovery"] == 1
    assert r[("lowflow", "threshold")]["affected_racks_correct"] is False
    assert r[("lowflow", "threshold")]["handoff_min"] is None


def test_unrun_arm_is_labelled_not_faked():
    ev, r = rows()
    llm = next(a for a in ev["monitoring"]["arms"] if a["id"] == "llm")
    assert llm["run"] is False and not any(k[1] == "llm" for k in r)


def test_second_site_defects_are_all_found_and_time_is_labelled_an_estimate():
    ev, _ = rows()
    mo = ev["modernization"]
    assert all(d["found"] for d in mo["defects"]) and mo["false_positives"] == []
    assert "estimate, not measured" in mo["estimate"]["label"]


def test_only_the_scorer_reads_the_answer_key():
    from pathlib import Path

    import app.retrofit as pkg

    readers = [p.name for p in Path(pkg.__path__[0]).glob("*.py") if "_answer_key" in p.read_text()]
    assert readers == ["evaluate.py"]
    tree = ast.parse(inspect.getsource(evaluate))
    assert any(isinstance(n, ast.Constant) and n.value == "_answer_key.json" for n in ast.walk(tree))
