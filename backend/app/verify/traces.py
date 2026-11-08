"""Timing equivalence: Nagios soft/hard state model vs promtool `for:`. Hypothesis generates reading sequences and shrinks failures."""
from hypothesis import given, settings, strategies as st, HealthCheck
from .sweep import run_plugin
import yaml, re

def nagios_pages(states, attempts=3):
    """Nagios: a non-OK result enters a soft state; after `attempts` consecutive non-OK results it is hard and notifies once. Any OK resets."""
    soft = 0; pages = []
    for i, s in enumerate(states):
        if s == "OK": soft = 0; continue
        soft += 1
        if soft == attempts: pages.append(i)
    return pages

def rule_pages(states, for_minutes):
    """Prometheus `for:` semantics: alert fires once the condition has held for `for_minutes` consecutive evaluations."""
    held = 0; pages = []
    for i, s in enumerate(states):
        if s == "OK": held = 0; continue
        held += 1
        if held == for_minutes + 1: pages.append(i)
    return pages

def for_minutes(rules_yaml):
    r = yaml.safe_load(rules_yaml)
    for g in r.get("groups", []):
        for x in g.get("rules", []):
            if x.get("labels", {}).get("kind", "must-keep") == "must-keep" and "for" in x:
                m = re.match(r"(\d+)m", str(x["for"])); return int(m.group(1)) if m else 0
    return 0

def run(rules_yaml, n=500, seed=7, timeout_rate=0.03):
    fm = for_minutes(rules_yaml); fails = []
    @settings(max_examples=n, database=None, derandomize=True, deadline=None, suppress_health_check=list(HealthCheck))
    @given(st.lists(st.one_of(st.floats(min_value=15, max_value=40).map(lambda x: round(x, 1)), st.just("timeout")), min_size=3, max_size=12))
    def check(seq):
        states = [run_plugin(str(v)) for v in seq]
        a, b = nagios_pages(states), rule_pages(states, fm)
        if a != b: fails.append({"input": ", ".join(map(str, seq)), "legacy": f"pages at {a}" if a else "no page", "candidate": f"pages at {b}" if b else "no page"}); raise AssertionError
    try: check()
    except AssertionError: pass
    return {"total": n, "mismatches": len(fails), "seed": seed, "example": fails[:1]}
