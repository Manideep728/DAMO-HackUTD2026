"""V4 liquid-cooling retrofit: integrate a CDU into existing monitoring with tested, reviewable changes.

Everything under `sites/` and `contract/` is SYNTHETIC. Deterministic code decides every outcome (schema check,
behavior tests, redundancy, incident rules); Nemotron is optional and only explains or proposes.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITES = ROOT / "sites"
CONTRACT_DIR = ROOT / "contract"
WORK = ROOT.parents[1] / ".work" / "retrofit"
