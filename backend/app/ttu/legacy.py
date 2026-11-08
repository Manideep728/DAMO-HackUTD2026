"""Old side of the comparison: the unmodified TTU plugin behind a Nagios soft/hard state model.

Plugin: legacy/ttu/redfishplugins/check_temperature.sh, run with bash against the Redfish mock. It needs
`curl` and `jq` on PATH (backend/bin is prepended). If it cannot run, results are marked plugin="model"
and use the plugin's documented mapping, so the UI never presents a modelled run as an executed one.

Scheduler: values parsed from legacy/ttu/objects/templates.cfg (local-service / generic-service).
"""
import os, pathlib, re, shutil, subprocess, time
from . import LEGACY, BIN, redfish_mock
from .scenarios import Scenario

PLUGIN = LEGACY / "redfishplugins" / "check_temperature.sh"
SHIMS = pathlib.Path(__file__).resolve().parent / "shims"
EXIT = {0: "OK", 1: "WARNING", 2: "CRITICAL", 3: "UNKNOWN"}


def templates():
    """Read the scheduling values the TTU services actually use (local-service inherits generic-service)."""
    text = (LEGACY / "objects" / "templates.cfg").read_text(errors="ignore")
    blocks = {}
    for body in re.findall(r"define\s+service\s*\{(.*?)\}", text, re.S):
        kv = dict(re.findall(r"^\s*(\w+)\s+([^;\n]+?)\s*(?:;.*)?$", body, re.M))
        if "name" in kv:
            blocks[kv["name"]] = kv
    base, local = blocks.get("generic-service", {}), blocks.get("local-service", {})
    merged = {**base, **local}
    return {
        "max_check_attempts": int(merged.get("max_check_attempts", 3)),
        "check_interval": int(merged.get("check_interval", 5)),
        "retry_interval": int(merged.get("retry_interval", 1)),
        "notification_interval": int(merged.get("notification_interval", 60)),
        "notification_options": merged.get("notification_options", "w,u,c,r"),
        "contact_groups": merged.get("contact_groups", "admins"),
    }


def recipient():
    text = (LEGACY / "objects" / "contacts.cfg").read_text(errors="ignore")
    m = re.search(r"email\s+(\S+)", text)
    return m.group(1) if m else "nagios@localhost"


def plugin_available():
    return bool(shutil.which("bash")) and (bool(shutil.which("jq")) or (BIN / "jq.exe").exists() or (BIN / "jq").exists())


def run_plugin(asset_id, health, fan_rpm=9400, down=False):
    """Execute the real plugin against the mock for one BMC response. Returns (state, output, ms, how)."""
    if not plugin_available():
        if down or health is None:
            return "UNKNOWN", "UNKNOWN-Plugin was unable to determine the status for the host CPU temperatures!", 0, "model"
        return {"OK": "OK", "Warning": "WARNING", "Critical": "CRITICAL"}[health], "(modelled: jq not installed)", 0, "model"
    host = redfish_mock.start()
    redfish_mock.set_state(asset_id, health, fan_rpm, down)
    # The jq shim goes first: without it the plugin's filter fails to parse and every poll is UNKNOWN (see shims/jq).
    env = dict(os.environ, PATH=os.pathsep.join([str(SHIMS), str(BIN), os.environ.get("PATH", "")]))
    t0 = time.time()
    p = subprocess.run(["bash", PLUGIN.as_posix(), f"{host}/bmc/{asset_id}"], capture_output=True, text=True, timeout=30, env=env)
    out = " ".join(p.stdout.split())
    return EXIT.get(p.returncode, "UNKNOWN"), out, int((time.time() - t0) * 1000), "executed"


def simulate(sc: Scenario, cache: dict):
    """Nagios Core service scheduling for one scenario. Returns notifications and per-check log.

    OK: checked every check_interval. Non-OK: SOFT, rechecked every retry_interval; HARD on attempt
    max_check_attempts -> notify. HARD non-OK: checked every check_interval, re-notify after
    notification_interval, notify again on a change of problem state. HARD -> OK: recovery notification.
    """
    cfg = templates()
    to = recipient()
    t, attempt, hard, hard_state, last_notify = 0, 0, False, "OK", None
    checks, notes = [], []
    n = len(sc.timeline)
    while t < n:
        key = (sc.timeline[t], "down" if sc.timeline[t] is None else "")
        if key not in cache:
            cache[key] = run_plugin(sc.__dict__.get("asset", "hpc-c2"), sc.timeline[t])
        state, out, ms, how = cache[key]
        checks.append({"t": t, "state": state})
        if state == "OK":
            if hard and hard_state != "OK":
                notes.append({"t": t, "kind": "recovery", "severity": "ok", "to": to})
            attempt, hard, hard_state = 0, False, "OK"
            t += cfg["check_interval"]
            continue
        if hard:
            if state != hard_state or (last_notify is not None and t - last_notify >= cfg["notification_interval"]):
                notes.append({"t": t, "kind": "problem", "severity": state.lower(), "to": to}); last_notify = t
            hard_state = state
            t += cfg["check_interval"]
            continue
        attempt += 1
        if attempt >= cfg["max_check_attempts"]:
            hard, hard_state, last_notify = True, state, t
            notes.append({"t": t, "kind": "problem", "severity": state.lower(), "to": to})
            t += cfg["check_interval"]
        else:
            t += cfg["retry_interval"]
    return {"notifications": notes, "checks": checks, "config": cfg}
