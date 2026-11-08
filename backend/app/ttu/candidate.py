"""New side of the comparison: Prometheus rules evaluated by `promtool test rules`, routing by `amtool`.

To learn what the candidate *actually* does (not just whether it matches), every rule is asserted to have
no alerts at every minute; promtool's failure report then lists the alerts it really fired ("got:"),
which we parse back into a firing timeline. Routing is resolved with `amtool config routes test`.
"""
import os, re, shutil, subprocess, pathlib, yaml
from . import BIN, WORK
from .scenarios import Scenario, ASSET

HEALTH = {"OK": 0, "Warning": 1, "Critical": 2}


def tool(name):
    for cand in (BIN / f"{name}.exe", BIN / name):
        if cand.exists():
            return str(cand)
    return shutil.which(name)


def available():
    return {"promtool": bool(tool("promtool")), "amtool": bool(tool("amtool"))}


def _series(sc: Scenario):
    lab = f'asset_id="{ASSET["asset_id"]}", owner="{sc.owner}", rack="{ASSET["rack"]}"'
    health = " ".join("_" if h is None else str(HEALTH[h]) for h in sc.timeline)
    scrape = " ".join("0" if h is None else "1" for h in sc.timeline)
    fans = sc.fan_rpm or [9400] * len(sc.timeline)
    series = [
        {"series": f"redfish_thermal_health{{{lab}, sensor=\"CPU1 Temp\"}}", "values": health},
        {"series": f"redfish_thermal_scrape_success{{{lab}}}", "values": scrape},
        {"series": f"redfish_fan_rpm{{{lab}, fan=\"Fan4\"}}", "values": " ".join(str(v) for v in fans)},
    ]
    return series


def alert_names(rules_yaml):
    doc = yaml.safe_load(rules_yaml) or {}
    return [r["alert"] for g in doc.get("groups", []) for r in g.get("rules", []) if "alert" in r]


def _minutes(s):
    total = 0.0
    for num, unit in re.findall(r"([\d.]+)(h|m|s)", s):
        total += float(num) * {"h": 60, "m": 1, "s": 1 / 60}[unit]
    return int(round(total))


def parse_got(output):
    """Parse promtool's FAILED blocks into [(alertname, minute, labels_dict)]."""
    fired = []
    for m in re.finditer(r"alertname:\s*([\w:]+),\s*time:\s*([\dhms.]+),.*?got:\s*(\[\]|\[.*?\n\s*\])", output, re.S):
        name, minute, block = m.group(1), _minutes(m.group(2)), m.group(3)
        for lab in re.findall(r"Labels:\{([^}]*)\}", block):
            labels = dict(re.findall(r'(\w+)="([^"]*)"', lab))
            fired.append((name, minute, labels))
    return fired


def check_rules(rules_yaml):
    WORK.mkdir(exist_ok=True)
    p = WORK / "check.rules.yml"; p.write_text(rules_yaml)
    r = subprocess.run([tool("promtool"), "check", "rules", str(p)], capture_output=True, text=True, timeout=60)
    return r.returncode == 0, (r.stdout + r.stderr).strip()


def evaluate(sc: Scenario, rules_yaml, tag="cand"):
    """Return the candidate's firing timeline for one scenario: {alertname: [minutes firing]} plus labels."""
    d = WORK / tag; d.mkdir(parents=True, exist_ok=True)
    (d / "rules.yml").write_text(rules_yaml)
    names = alert_names(rules_yaml)
    tests = [{"interval": "1m", "input_series": _series(sc),
              "alert_rule_test": [{"eval_time": f"{t}m", "alertname": n, "exp_alerts": []} for t in range(len(sc.timeline)) for n in names]}]
    (d / f"{sc.id}.test.yml").write_text(yaml.safe_dump({"rule_files": ["rules.yml"], "evaluation_interval": "1m", "tests": tests}, sort_keys=False))
    r = subprocess.run([tool("promtool"), "test", "rules", f"{sc.id}.test.yml"], cwd=d, capture_output=True, text=True, timeout=120)
    out = r.stdout + r.stderr
    if r.returncode != 0 and "FAILED" not in out:
        raise RuntimeError(f"promtool could not evaluate the candidate: {out.strip()[:600]}")
    timeline = {}
    for name, minute, labels in parse_got(out):
        timeline.setdefault(name, {"minutes": [], "labels": labels})["minutes"].append(minute)
    for v in timeline.values():
        v["minutes"] = sorted(set(v["minutes"]))
    return timeline


def route(routes_yaml, labels, tag="cand"):
    d = WORK / tag; d.mkdir(parents=True, exist_ok=True)
    (d / "alertmanager.yml").write_text(routes_yaml)
    args = [f'{k}="{v}"' for k, v in labels.items()]
    r = subprocess.run([tool("amtool"), "config", "routes", "test", f"--config.file={d / 'alertmanager.yml'}", *args], capture_output=True, text=True, timeout=60)
    if r.returncode not in (0, 1):
        raise RuntimeError(f"amtool could not resolve the route: {(r.stdout + r.stderr).strip()[:400]}")
    return (r.stdout.strip().splitlines() or ["(none)"])[-1].strip()
