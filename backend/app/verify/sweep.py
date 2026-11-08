"""Run the real legacy plugin on every value the sensor can report, evaluate candidate rules on the same inputs
with promtool, and compare. Nemotron never grades itself; this does."""
import os, subprocess, tempfile, pathlib, yaml, hashlib, shlex
ROOT = pathlib.Path(__file__).resolve().parents[3]
PLUGIN = os.getenv("LEGACY_PLUGIN", str(ROOT / "legacy" / "check_snmp"))
PROMTOOL = os.getenv("PROMTOOL", str(ROOT / "backend" / "bin" / "promtool"))
STATES = {0: "OK", 1: "WARNING", 2: "CRITICAL", 3: "UNKNOWN"}
ERRORS = ["timeout", "noSuchObject", "non-numeric"]

def plugin_args():
    cmd = (ROOT / "legacy" / "commands.cfg").read_text()
    line = " ".join(l.strip().rstrip("\\") for l in cmd.splitlines() if "check_snmp" in l or l.strip().startswith("-"))
    svc = (ROOT / "legacy" / "services.cfg").read_text()
    args = [l for l in svc.splitlines() if "check_command" in l][0].split("!")[1:]
    w, c = args[0], args[1].strip()
    return ["-w", w, "-c", c]

def run_plugin(value: str) -> str:
    env = dict(os.environ, GAUNTLET_SNMP_VALUE=value)
    r = subprocess.run([PLUGIN, "-H", "sim", "-o", ".1.3.6.1.4.1.52100.1.2.1.1.4.7", *plugin_args()], env=env, capture_output=True, text=True, timeout=10)
    return STATES.get(r.returncode, "UNKNOWN")

def promtool_check(rules_yaml: str) -> tuple[bool, str]:
    with tempfile.NamedTemporaryFile("w", suffix=".yml", delete=False) as f: f.write(rules_yaml); p = f.name
    r = subprocess.run([PROMTOOL, "check", "rules", p], capture_output=True, text=True)
    return r.returncode == 0, (r.stdout + r.stderr).strip()

def rule_eval(rules_yaml: str, value: str) -> str:
    """Evaluate rule expressions for one input via promtool test rules (instant alerts; for: handled in traces)."""
    rules = yaml.safe_load(rules_yaml)
    sev = {"warning": "WARNING", "critical": "CRITICAL"}
    ok = 0 if value in ERRORS else 1
    series = [f"rack_inlet_read_ok{{rack=\"B7\"}}" , f"rack_inlet_celsius{{rack=\"B7\"}}"]
    inputs = [{"series": series[0], "values": f"{ok}x10"}]
    if ok: inputs.append({"series": series[1], "values": f"{value}x10"})
    inputs.append({"series": "rack_inlet_neighbour_estimate{rack=\"B7\"}", "values": f"{value if ok else 0}x10"})
    inputs.append({"series": "cooling_per_kw{unit=\"CU-B\"}", "values": "1x10"})
    # strip for: so a single sample decides (timing is tested separately); keep must-keep rules only
    groups = []
    for g in rules.get("groups", []):
        rs = []
        for r in g.get("rules", []):
            if r.get("labels", {}).get("kind", "must-keep") != "must-keep": continue
            r = dict(r); r.pop("for", None); rs.append(r)
        groups.append({"name": g["name"], "rules": rs})
    with tempfile.TemporaryDirectory() as d:
        pathlib.Path(d, "r.yml").write_text(yaml.safe_dump({"groups": groups}))
        test = {"rule_files": ["r.yml"], "evaluation_interval": "1m", "tests": [{"interval": "1m", "input_series": inputs, "alert_rule_test": [{"eval_time": "5m", "alertname": r["alert"], "exp_alerts": []} for g in groups for r in g["rules"]]}]}
        pathlib.Path(d, "t.yml").write_text(yaml.safe_dump(test))
        out = subprocess.run([PROMTOOL, "test", "rules", str(pathlib.Path(d, "t.yml"))], capture_output=True, text=True, cwd=d)
    txt = out.stdout + out.stderr
    names = {r["alert"]: r for g in groups for r in g["rules"]}
    # we expected no alerts; promtool reports a failure block for each rule that actually fired
    firing = [n for n in names if f"alertname: {n}," in txt]
    worst = "OK"
    for n in firing:
        s = sev.get(names[n].get("labels", {}).get("severity", ""), "UNKNOWN") if ok or "Unknown" not in n else "UNKNOWN"
        if "Unknown" in n and not ok: s = "UNKNOWN"
        worst = max([worst, s], key=lambda x: ["OK", "WARNING", "UNKNOWN", "CRITICAL"].index(x))
    return worst

def sweep(rules_yaml: str, lo=-40.0, hi=125.0, step=0.1, sample=None):
    """Full value sweep. `sample` limits promtool evaluations (plugin runs stay exhaustive); boundaries always included."""
    n = round((hi - lo) / step) + 1
    values = [round(lo + i * step, 1) for i in range(n)]
    legacy = {v: run_plugin(str(v)) for v in values}
    probe = set(values if sample is None else values[::sample]) | {-0.1, 0.0, 26.9, 27.0, 27.1, 31.9, 32.0, 32.1}
    cand_probe = {v: rule_eval(rules_yaml, str(v)) for v in sorted(probe)}
    # candidate state is piecewise constant between probed boundaries; fill by nearest probed value below
    runs, cur = [], None
    last = None
    for v in values:
        if v in cand_probe: last = cand_probe[v]
        c = last or "OK"; l = legacy[v]; m = l == c
        if cur and cur["legacy"] == l and cur["candidate"] == c: cur["to"] = v
        else: cur = {"from": v, "to": v, "legacy": l, "candidate": c, "match": m}; runs.append(cur)
    errs = [{"name": e, "legacy": run_plugin(e), "candidate": rule_eval(rules_yaml, e), "match": None} for e in ERRORS]
    for e in errs: e["match"] = e["legacy"] == e["candidate"]
    return {"domain": {"min": lo, "max": hi, "step": step, "count": n}, "runs": runs, "errorCases": errs, "pluginExecutions": n + 3}

def sha(text): return hashlib.sha256(text.encode()).hexdigest()
