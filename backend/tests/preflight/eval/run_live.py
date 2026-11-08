"""Run the agent eval live against Nemotron several times and report per-question pass rates.

    cd backend && .venv/bin/python -m tests.preflight.eval.run_live --runs 3

Needs NVIDIA_API_KEY in backend/.env. The last run's responses are saved to eval/replay/ (the set CI replays),
and the report to eval/live_report.json.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import statistics
import sys
import tempfile
import time
from collections import Counter

import yaml
from dotenv import load_dotenv

HERE = pathlib.Path(__file__).resolve().parent
load_dotenv(HERE.parents[2] / ".env")
os.environ["GAUNTLET_MODE"] = "live"

from app.models import has_key  # noqa: E402  (after the environment is set)
from app.preflight import agent  # noqa: E402
from app.preflight.store import Store  # noqa: E402
from app.preflight.workspace import Workspace  # noqa: E402

from .grade import FATAL, grade  # noqa: E402

REPLAY = HERE / "replay"


def run_once(cases: list[dict], recordings: pathlib.Path) -> list[dict]:
    os.environ["AGENT_RECORDINGS"] = str(recordings)
    out = []
    for i, case in enumerate(cases, 1):
        t0 = time.time()
        events = list(agent.run(case["q"], Workspace(Store(":memory:")), "live"))
        seconds = time.time() - t0
        g = grade(case, events, allow_fallback=False)
        out.append(
            {
                "q": case["q"],
                "passed": g.passed,
                "seconds": round(seconds, 1),
                "tools": g.tools_used,
                "issues": g.issues,
            }
        )
        print(f"  [{i:2}/{len(cases)}] {'PASS' if g.passed else 'FAIL'} {seconds:5.1f}s  {case['q'][:60]}", flush=True)
        for cat, detail in g.issues:
            print(f"         {cat}: {detail}", flush=True)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--only", help="substring filter on question text")
    args = ap.parse_args()
    if not has_key():
        print("NVIDIA_API_KEY is missing or still the placeholder in backend/.env", file=sys.stderr)
        return 2
    cases = yaml.safe_load((HERE / "questions.yaml").read_text())
    if args.only:
        cases = [c for c in cases if args.only.lower() in c["q"].lower()]
    runs, last_dir = [], None
    for n in range(args.runs):
        print(f"run {n + 1}/{args.runs} with {agent.MODEL}", flush=True)
        last_dir = pathlib.Path(tempfile.mkdtemp(prefix="agent-rec-"))
        runs.append(run_once(cases, last_dir))

    per_q = []
    for i, case in enumerate(cases):
        results = [r[i] for r in runs]
        per_q.append(
            {
                "q": case["q"],
                "passed": sum(r["passed"] for r in results),
                "runs": len(results),
                "median_s": statistics.median(r["seconds"] for r in results),
                "issues": sorted({cat for r in results for cat, _ in r["issues"]}),
            }
        )
    categories = Counter(cat for r in runs for q in r for cat, _ in q["issues"])
    total = sum(q["passed"] for q in per_q)
    report = {
        "model": agent.MODEL,
        "runs": args.runs,
        "questions": len(cases),
        "passed": total,
        "attempts": len(cases) * args.runs,
        "per_question": per_q,
        "categories": dict(categories),
        "fatal_categories": sorted(FATAL),
        "detail": runs,
    }

    print(f"\n{total}/{len(cases) * args.runs} passed across {args.runs} runs with {agent.MODEL}")
    for q in per_q:
        print(f"  {q['passed']}/{q['runs']}  {q['median_s']:5.1f}s  {q['q'][:60]}  {' '.join(q['issues'])}")
    print("issue categories:", dict(categories) or "none")

    if not args.only and last_dir is not None:
        shutil.rmtree(REPLAY, ignore_errors=True)
        shutil.copytree(last_dir, REPLAY)
        (REPLAY / "MODEL").write_text(agent.MODEL + "\n")
        (HERE / "live_report.json").write_text(json.dumps(report, indent=1))
        print(f"recordings of run {args.runs} saved to {REPLAY.relative_to(HERE.parents[2])}")
    return 0 if total == len(cases) * args.runs else 1


if __name__ == "__main__":
    sys.exit(main())
