"""Nemotron agents that plan and call tools. Not a chatbot: the model chooses tools, we execute them for real.

Jobs
  recover      M2: read the pinned files, run the plugin against the Redfish mock, record behaviors with sources.
  repair       M5: read visible test failures, write a revised candidate, re-run the tests, up to 3 rounds.
  investigate  R4: query the ops engine (telemetry, asset map, logbook, runbook) and return cited hypotheses.

Native tool calling is used when the endpoint supports it; otherwise the model answers with one JSON action per
turn. Every live run is saved so it can be replayed, clearly labelled "cached", when the API is unavailable.
"""
import json, os, re, time, pathlib, yaml
from .. import llm
from ..models import SUPER, NANO, has_key
from . import LEGACY, WORK, legacy, harness, candidate, inputs

RUNS = WORK / "agent_runs"
MAX_STEPS = 14


# ------------------------------------------------------------------ tools
def _read_file(path: str):
    p = (LEGACY / path).resolve()
    if LEGACY.resolve() not in p.parents or not p.is_file():
        return {"error": f"not a pinned legacy file: {path}"}
    return {"path": path, "text": p.read_text(errors="ignore")[:6000]}


def _run_plugin(bmc_health: str):
    health = None if bmc_health in ("missing", "none", "empty") else bmc_health
    if bmc_health == "unreachable":
        st, out, ms, how = legacy.run_plugin("agent-probe", "OK", down=True)
    else:
        st, out, ms, how = legacy.run_plugin("agent-probe", health)
    return {"bmc_health": bmc_health, "exit_state": st, "output": out[:300], "ms": ms, "executed": how == "executed"}


class Session:
    def __init__(self, job):
        self.job, self.behaviors, self.questions, self.candidate, self.report, self.hypotheses, self.done = job, [], [], None, None, [], None

    def tools(self):
        common = {
            "list_inputs": ("List pinned legacy files and the gaps found in them.", {}, lambda a: inputs.analyse()),
            "read_file": ("Read one pinned legacy file, e.g. redfishplugins/check_temperature.sh or objects/templates.cfg.", {"path": "string"}, lambda a: _read_file(a["path"])),
            "run_plugin": ("Run the real check_temperature.sh against a mock BMC returning this Thermal health: OK, Warning, Critical, missing, unreachable.", {"bmc_health": "string"}, lambda a: _run_plugin(a["bmc_health"])),
        }
        if self.job == "recover":
            return {**common,
                    "record_behavior": ("Record one confirmed behavior of the old check with its source.", {"area": "string", "text": "string", "source": "string"}, self._record),
                    "ask_operator": ("Raise a decision the operator must confirm: preserve vs deliberately change.", {"question": "string", "options": "array", "critical": "boolean"}, self._ask),
                    "finish": ("Finish with a one-paragraph summary.", {"summary": "string"}, self._finish)}
        if self.job == "repair":
            return {**common,
                    "show_candidate": ("Show the current candidate rules and Alertmanager config.", {}, lambda a: {"rules": self.candidate[0], "alertmanager": self.candidate[1]}),
                    "write_candidate": ("Replace the candidate. Both files must be complete YAML.", {"rules_yaml": "string", "alertmanager_yaml": "string"}, self._write),
                    "run_tests": ("Run the acceptance suite on the current candidate. Returns visible failures and a held-out failure count.", {}, self._test),
                    "finish": ("Finish with a summary of what changed and why.", {"summary": "string"}, self._finish)}
        from . import ops
        return {"query_telemetry": ("Telemetry for an asset over the incident window.", {"asset_id": "string"}, lambda a: ops.telemetry(a["asset_id"])),
                "lookup_asset": ("Asset map entry: rack, owner, on-call, workload owner.", {"asset_id": "string"}, lambda a: ops.asset(a["asset_id"])),
                "read_logbook": ("Work order and technician notes, with corrections.", {"work_order": "string"}, lambda a: ops.logbook(a["work_order"])),
                "search_runbook": ("Search the site runbook.", {"query": "string"}, lambda a: ops.runbook(a["query"])),
                "propose_hypotheses": ("Return hypotheses. Each: title, confidence (Likely/Possible/Unresolved), cites (evidence ids), reasoning. Plus next_task for a role.", {"hypotheses": "array", "next_task": "object"}, self._hyp),
                "finish": ("Finish.", {"summary": "string"}, self._finish)}

    def _record(self, a):
        self.behaviors.append({k: a.get(k, "") for k in ("area", "text", "source")}); return {"recorded": len(self.behaviors)}

    def _ask(self, a):
        self.questions.append({"question": a.get("question"), "options": a.get("options", []), "critical": bool(a.get("critical"))}); return {"queued_for_operator": True}

    def _write(self, a):
        for k in ("rules_yaml", "alertmanager_yaml"):
            try: yaml.safe_load(a[k])
            except Exception as e: return {"error": f"{k} is not valid YAML: {e}"}
        ok, msg = candidate.check_rules(a["rules_yaml"])
        if not ok:
            return {"error": "promtool check rules failed", "detail": msg[:800]}
        self.candidate = (a["rules_yaml"], a["alertmanager_yaml"]); return {"promtool_check": msg[:300], "saved": True}

    def _test(self, a):
        self.report = harness.run("agent", self.candidate[0], self.candidate[1], include_mutants=False)
        if not self.report.get("valid"):
            return {"error": self.report.get("promtool_check")}
        return harness.visible_failures(self.report)

    def _hyp(self, a):
        self.hypotheses = a; return {"recorded": True}

    def _finish(self, a):
        self.done = a.get("summary", ""); return {"ok": True}


# ------------------------------------------------------------------ prompts
SYSTEM = {
    "recover": """You are recovering the real behavior of an inherited Nagios check so it can be replaced safely.
Use tools; do not guess. Read redfishplugins/check_temperature.sh, objects/templates.cfg and objects/contacts.cfg.
Run the plugin for each BMC Thermal health (OK, Warning, Critical, missing, unreachable) to confirm the state mapping by execution.
Record each behavior (states, threshold, missing data, retries, recovery, recipients) with record_behavior, citing file and section.
Raise ask_operator for anything that is a policy choice; mark it critical if alerts would go nowhere without an answer.
Then call finish.""",
    "repair": """You are repairing a candidate Prometheus + Alertmanager replacement for an old Nagios check until the acceptance suite passes.
The suite's expectations are fixed and you cannot change them. Held-out cases are hidden; you only get a failure count.
Loop: run_tests, read the failures, show_candidate, write_candidate with a fix, run_tests again. At most 3 rewrites.
Old check facts: HARD state on the 4th consecutive failure at a 1 min retry; recipients come from the asset owner map
(owner="HPC Ops" -> receiver hpc-ops-primary, owner="Platform" -> platform-primary, else oncall-fallback).
The operator approved a new early warning: FanStalledEarlyWarning when min(redfish_fan_rpm) == 0 for 1m, severity warning.
Keep alert names ThermalHealthCritical, ThermalHealthWarning, ThermalFeedMissing. When all visible cases pass, call finish.""",
    "investigate": """You are investigating an active data center incident for the duty operator. Use tools; cite evidence ids for every claim.
Conflicting notes and sensors mean "verify", never "proven". You cannot assign owners, approve actions or change infrastructure:
suggest one next task for the responsible role from the asset map. Call propose_hypotheses, then finish.""",
}
JSON_PROTOCOL = """\n\nRespond with exactly one JSON object per turn and nothing else: {"tool": "<name>", "args": {...}}.
Available tools:\n"""


def _schema(tools):
    out = []
    for name, (desc, params, _) in tools.items():
        props = {k: ({"type": "array", "items": {"type": "object"}} if t == "array" else {"type": t}) for k, t in params.items()}
        out.append({"type": "function", "function": {"name": name, "description": desc, "parameters": {"type": "object", "properties": props, "required": list(params)}}})
    return out


def _brief(result):
    s = json.dumps(result)
    return s if len(s) < 240 else s[:240] + "…"


def run(job, seed=None):
    """Generator of UI events. seed: ("v1") starting candidate for repair."""
    if not has_key():
        yield from replay(job); return
    sess = Session(job)
    if job == "repair":
        sess.candidate = harness.load(seed or "v1")
    tools = sess.tools()
    model = NANO if job == "investigate" else SUPER
    msgs = [{"role": "system", "content": SYSTEM[job]}, {"role": "user", "content": "Begin."}]
    native, events, t_start = True, [], time.time()
    yield (ev := {"type": "start", "job": job, "model": model, "mode": "live"}); events.append(ev)
    for stepn in range(MAX_STEPS):
        t0 = time.time()
        try:
            if native:
                r = llm.client().chat.completions.create(model=model, messages=msgs, tools=_schema(tools), tool_choice="auto", temperature=0.1, max_tokens=4096, timeout=90)
            else:
                r = llm.client().chat.completions.create(model=model, messages=msgs, temperature=0.1, max_tokens=4096, timeout=90)
        except Exception as e:
            if native and ("tool" in str(e).lower() or "400" in str(e)):
                native = False
                msgs[0] = {"role": "system", "content": SYSTEM[job] + JSON_PROTOCOL + "\n".join(f"- {n}({', '.join(p)}): {d}" for n, (d, p, _) in tools.items())}
                yield (ev := {"type": "note", "text": "Endpoint has no native tool calling; switching to JSON actions."}); events.append(ev)
                continue
            yield (ev := {"type": "error", "text": f"Nemotron call failed: {e}"}); events.append(ev); break
        ms = int((time.time() - t0) * 1000)
        m = r.choices[0].message
        calls = []
        if native and getattr(m, "tool_calls", None):
            msgs.append({"role": "assistant", "content": m.content or "", "tool_calls": [tc.model_dump() for tc in m.tool_calls]})
            calls = [(tc.id, tc.function.name, json.loads(tc.function.arguments or "{}")) for tc in m.tool_calls]
        else:
            text = m.content or ""
            msgs.append({"role": "assistant", "content": text})
            act = llm.json_block(re.sub(r"<think>.*?</think>", "", text, flags=re.S))
            if act and act.get("tool") in tools:
                calls = [(None, act["tool"], act.get("args") or {})]
            elif text.strip():
                yield (ev := {"type": "thought", "text": text.strip()[:400], "ms": ms}); events.append(ev)
                msgs.append({"role": "user", "content": "Use a tool. Reply with one JSON action." if not native else "Continue with tools."})
                continue
        for call_id, name, args in calls:
            t1 = time.time()
            try:
                result = tools[name][2](args)
            except Exception as e:
                result = {"error": str(e)}
            ev = {"type": "tool", "name": name, "args": _brief(args), "result": _brief(result), "model_ms": ms, "tool_ms": int((time.time() - t1) * 1000)}
            yield ev; events.append(ev)
            payload = json.dumps(result)[:7000]
            msgs.append({"role": "tool", "tool_call_id": call_id, "content": payload} if call_id else {"role": "user", "content": f"Result of {name}: {payload}"})
        if sess.done is not None:
            break
    final = {"type": "done", "job": job, "summary": sess.done, "behaviors": sess.behaviors, "questions": sess.questions,
             "candidate": {"rules": sess.candidate[0], "alertmanager": sess.candidate[1]} if sess.candidate else None,
             "report": sess.report, "hypotheses": sess.hypotheses, "elapsed_s": round(time.time() - t_start, 1), "mode": "live"}
    yield final; events.append(final)
    if sess.done is None or any(e["type"] == "error" for e in events):
        return  # only completed, error-free live runs may be replayed later
    RUNS.mkdir(parents=True, exist_ok=True)
    (RUNS / f"{job}.json").write_text(json.dumps({"at": time.strftime("%Y-%m-%d %H:%M"), "events": events}))


def replay(job):
    """No API key: replay the last recorded live run, labelled cached. Never invents a run."""
    p = RUNS / f"{job}.json"
    if not p.exists():
        yield {"type": "error", "text": "NVIDIA_API_KEY is not set and no recorded live run exists yet. Add the key to backend/.env to run the agent."}
        return
    d = json.loads(p.read_text())
    yield {"type": "start", "job": job, "mode": "cached", "recorded_at": d["at"]}
    for ev in d["events"]:
        if ev["type"] == "start":
            continue
        time.sleep(0.4)
        yield {**ev, "mode": "cached"} if ev["type"] == "done" else ev
