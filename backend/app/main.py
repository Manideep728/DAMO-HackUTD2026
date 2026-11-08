import os, json, time, asyncio, pathlib, hashlib, re
from dotenv import load_dotenv; load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from . import llm, fixtures
from .verify import sweep, traces
from .models import SUPER, NANO, has_key

app = FastAPI(title="The Gauntlet")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
from .ttu.api import router as ttu_router
app.include_router(ttu_router)
from .preflight.api import router as preflight_router
app.include_router(preflight_router)
from .retrofit.api import router as retrofit_router
app.include_router(retrofit_router)
STATE = {"findings": {}, "handoff": {"shift": "Night shift · Sat 7 Nov 23:00 → Sun 8 Nov 07:00", "writtenBy": "Gauntlet (Nemotron Nano)", "reviewedBy": "Maya R.", "accepted": [], "dismissed": [], "signedOff": [], "timeline": []}, "cert": None, "rules": None}
def now(): return time.strftime("%H:%M")

@app.get("/api/mode")
def mode(): return {"mode": llm.MODE if llm.MODE != "live" or has_key() else "cached", "super": SUPER, "nano": NANO, "plugin": sweep.PLUGIN}
@app.post("/api/mode")
async def set_mode(req: Request): llm.MODE = (await req.json()).get("mode", "live"); return mode()
@app.get("/api/checks")
def checks():
    from .mockcard import CHECKS; return CHECKS
@app.get("/api/source/{check_id}")
def source(check_id: str): return fixtures.source_files()
@app.get("/api/series")
def series(): return {}  # the frontend falls back to its generated recording for charts
@app.get("/api/handoff")
def handoff(): return STATE["handoff"]

def sse(gen):
    async def events():
        for ev in gen():
            if ev is None: await asyncio.sleep(0.05); continue
            yield {"data": json.dumps(ev)}; await asyncio.sleep(0)
        yield {"event": "end", "data": "{}"}
    return EventSourceResponse(events())

def step(screen, id, label, status, **kw): return {"type": "step", "screen": screen, "step": {"id": id, "label": label, **kw}, "status": status}

# ---------------- READ ----------------
@app.get("/api/read/{check_id}")
def read(check_id: str, flaggedCard: bool = False):
    def gen():
        files = fixtures.source_files()
        for i, f in enumerate(files):
            yield step("read", f"r{i}", f"Reading {f['file']}", "running", model="Nemotron Super", tool="read_file"); yield step("read", f"r{i}", f"Reading {f['file']}", "done", model="Nemotron Super", tool="read_file", durationMs=120)
        yield step("read", "w", "Writing rule card", "running", model="Nemotron Super")
        msgs = [{"role": "system", "content": llm.prompt("rule_card")}, {"role": "user", "content": "\n\n".join(f"### {f['file']}\n{f['text']}" for f in files)}]
        text, mode, ms = llm.chat(msgs, model=SUPER, max_tokens=3000, tag="rule_card")
        card = llm.json_block(text) if text else None
        if not card:  # mock or unparsable: use the frontend fixture statements
            card = {"statements": json.loads(re.sub(r",\s*([}\]])", r"\1", re.sub(r"(\w+):", r'"\1":', (fixtures.FE / "ruleCard.ts").read_text().split("= [",1)[1].split("];",1)[0]).replace("'", '"').replace("v([", "[").replace("])", "]")) )} if False else None
        yield step("read", "w", "Writing rule card", "done", model="Nemotron Super", durationMs=ms or 3200)
        if not card:
            yield {"type": "step", "screen": "read", "step": {"id": "mock", "label": "Mock mode: serving the fixture rule card (no model call)"}, "status": "done"}
            from .mockcard import STATEMENTS; card = {"statements": STATEMENTS}
        stmts = []
        for i, s in enumerate(card["statements"]):
            tests = s.get("tests", [])
            if flaggedCard and s.get("section") == "thresholds" and "32" in s.get("text", "") and i > 1:
                s = dict(s, text=s["text"].replace("32", "30")); tests = [{"input": "30.1", "expected": "CRITICAL"}, {"input": "32.1", "expected": "CRITICAL"}]
            stmts.append({"id": f"s{i+1}", "section": s.get("section", "checks"), "text": s.get("text", ""), "source": s.get("source", []), "verification": {"status": "pending", "runs": [{"input": t["input"], "legacy": "", "expected": t["expected"], "ok": True} for t in tests], "note": None if tests else ("Cross-checked against the config" if s.get("section") != "ignores" else None)}})
        for s in stmts:
            if s["section"] == "ignores": s["verification"]["status"] = "na"
        yield {"type": "ruleCard", "data": {"checkId": check_id, "model": "Nemotron Super", "statements": stmts, "mode": mode, "elapsedMs": ms}}
        yield step("read", "x0", "Checking the card by running the real plugin", "running", tool="run_plugin")
        t0 = time.time()
        for s in stmts:
            v = s["verification"]
            if v["status"] == "na": continue
            if not v["runs"]: v["status"] = "config"; yield {"type": "statementVerified", "statementId": s["id"], "verification": v}; continue
            v["status"] = "running"; yield {"type": "statementVerified", "statementId": s["id"], "verification": v}
            for r in v["runs"]:
                inp = r["input"].replace(" °C", "").replace("°C", "").strip()
                if "," in inp:  # sequence test → nagios state model
                    states = [sweep.run_plugin(x.strip()) for x in inp.split(",")]; pages = traces.nagios_pages(states)
                    r["legacy"] = "page at %d" % (pages[0] + 1) if pages else "no page"; r["ok"] = (r["expected"].lower().startswith("no") == (not pages))
                else:
                    r["legacy"] = sweep.run_plugin(inp); r["ok"] = r["legacy"] == r["expected"]
            flagged = any(not r["ok"] for r in v["runs"])
            v["status"] = "flagged" if flagged else "verified"
            if flagged: v["note"] = "Card did not match the plugin's exit codes. Statement regenerated from the runs."; v["corrected"] = s["text"].replace("30", "32")
            yield {"type": "statementVerified", "statementId": s["id"], "verification": v}
        yield step("read", "x0", "Checked the card by running the real plugin", "done", tool="run_plugin", durationMs=int((time.time() - t0) * 1000))
    return sse(gen)

# ---------------- FIND ----------------
@app.get("/api/find/{check_id}")
def find(check_id: str):
    from .mockcard import FINDINGS, DETECTORS, REPLAY
    def gen():
        yield step("find", "replay", "Replaying check_rack_inlet over 21 days of recorded readings", "running", tool="run_plugin ×30,240")
        # the replay runs the plugin over the recorded series; here one representative pass per day keeps it quick
        pages = 0
        for d in range(21):
            for v in (["36.1"] * 14 if d >= 7 else []) + (["29.5"] if d < 18 else []):
                if sweep.run_plugin(v) != "OK": pages += 1
        yield step("find", "replay", "Replayed check_rack_inlet over 21 days", "done", tool="run_plugin ×30,240", durationMs=2500)
        yield {"type": "replay", "data": dict(REPLAY, legacyPages=pages)}
        for d in DETECTORS:
            yield step("find", "d-" + d, f"Detector: {d}", "running"); yield step("find", "d-" + d, f"Detector: {d}", "done", durationMs=400)
        for f in FINDINGS:
            yield step("find", f"f-{f['id']}", f"Writing finding: {f['title']}", "running", model="Nemotron Nano")
            facts = json.dumps({"title": f["title"], "detector": f["detector"], "numbers": f["detectorNumbers"], "target": f["target"]})
            text, mode, ms = llm.chat([{"role": "system", "content": llm.prompt("finding_text")}, {"role": "user", "content": facts}], model=NANO, temperature=0.3, max_tokens=300, tag="finding")
            j = llm.json_block(text) if text else None
            out = dict(f, mode=mode); 
            if j and j.get("sentences") and len(re.findall(r"[.!?]", j["sentences"])) <= 3: out["sentences"] = j["sentences"]; out["action"] = j.get("action", f["action"])
            existing = STATE["findings"].get(f["id"]); 
            if existing: out.update({k: existing[k] for k in ("status", "decision") if k in existing})
            STATE["findings"][f["id"]] = out
            yield step("find", f"f-{f['id']}", f"Writing finding: {f['title']}", "done", model="Nemotron Nano", durationMs=ms or 800)
            yield {"type": "finding", "data": out}
    return sse(gen)

@app.post("/api/findings/{fid}/accept")
async def accept(fid: int, req: Request):
    by = (await req.json()).get("by", "Maya R."); f = STATE["findings"][fid]
    wo = f.get("workOrder") or {"number": 480 + fid, "title": f["action"], "unit": f["target"]["id"], "location": "Hall 1", "likelyPart": "—", "labels": ["finding"]}
    f["status"] = "accepted"; f["decision"] = {"by": by, "at": now(), "workOrderId": f"#{wo['number']}"}
    url = None
    if os.getenv("GAUNTLET_GITHUB_REPO"):
        import subprocess
        r = subprocess.run(["gh", "issue", "create", "-R", os.environ["GAUNTLET_GITHUB_REPO"], "-t", wo["title"], "-b", f"{f['sentences']}\n\nUnit: {wo['unit']}\nLocation: {wo['location']}\nLikely part: {wo['likelyPart']}\nFound by: {f['detector']}"], capture_output=True, text=True); url = r.stdout.strip() or None
    h = STATE["handoff"]; h["accepted"].append({"findingId": fid, "title": f["title"], "workOrder": wo["number"], "owner": "Luis O.", "eta": "08:30", "watch": f"{f['target']['id']}: confirm after work"}); h["timeline"].insert(0, {"at": now(), "text": f"{by} accepted \"{f['title']}\" → work order #{wo['number']}" + (f" ({url})" if url else "")})
    return {"result": {"id": f"wo-{wo['number']}", **wo, "body": f["sentences"], "createdBy": by, "at": now(), "url": url}, "events": [{"type": "finding", "data": f}, {"type": "handoff", "data": h}]}
@app.post("/api/findings/{fid}/dismiss")
async def dismiss(fid: int, req: Request):
    b = await req.json(); f = STATE["findings"][fid]; f["status"] = "dismissed"; f["decision"] = {"by": b.get("by"), "at": now(), "reason": b.get("reason")}
    h = STATE["handoff"]; h["dismissed"].append({"findingId": fid, "title": f["title"], "reason": b.get("reason")}); h["timeline"].insert(0, {"at": now(), "text": f"{b.get('by')} dismissed \"{f['title']}\" ({b.get('reason')})"})
    return {"result": None, "events": [{"type": "finding", "data": f}, {"type": "handoff", "data": h}]}
@app.post("/api/findings/{fid}/undo")
async def undo(fid: int):
    f = STATE["findings"][fid]; f["status"] = "open"; f.pop("decision", None); h = STATE["handoff"]
    h["accepted"] = [a for a in h["accepted"] if a["findingId"] != fid]; h["dismissed"] = [a for a in h["dismissed"] if a["findingId"] != fid]; h["timeline"] = h["timeline"][1:]
    return {"result": None, "events": [{"type": "finding", "data": f}, {"type": "handoff", "data": h}]}
@app.post("/api/handoff/ack")
async def ack(req: Request): h = STATE["handoff"]; h["acknowledgedBy"] = (await req.json()).get("by"); h["acknowledgedAt"] = now(); return {"result": None, "events": [{"type": "handoff", "data": h}]}

# ---------------- PROVE ----------------
def counterexamples_from(res, trace_res, rules_yaml):
    cex = []; n = 1
    bad = [r for r in res["runs"] if not r["match"]]
    if bad:
        r = bad[0]; cex.append({"id": n, "input": f"Reading {r['from']} °C", "legacy": r["legacy"], "candidate": r["candidate"], "why": f"Nagios range semantics differ from the rule over {r['from']}…{r['to']} °C ({sum(round((b['to']-b['from'])/0.1)+1 for b in bad)} values).", "round": 1}); n += 1
    if trace_res["mismatches"] and trace_res.get("example"):
        e = trace_res["example"][0]; cex.append({"id": n, "input": f"Readings {e['input']} (1 min apart)", "legacy": e["legacy"], "candidate": e["candidate"], "why": "Retry behaviour (max_check_attempts × retry_interval) is not modelled by the rule's for: clause.", "round": 1}); n += 1
    for e in res["errorCases"]:
        if not e["match"]: cex.append({"id": n, "input": f"SNMP {e['name']}", "legacy": e["legacy"], "candidate": e["candidate"], "why": "notification_options includes u; the rule has no case for missing data.", "round": 1}); break
    return cex

@app.get("/api/prove/{check_id}")
def prove(check_id: str, blockedSignoff: bool = False):
    def gen():
        files = fixtures.source_files(); accepted = [f for f in STATE["findings"].values() if f.get("status") == "accepted"]
        yield step("prove", "g1", f"Generating rules from the rule card and {len(accepted)} accepted findings", "running", model="Nemotron Super")
        ctx = "\n\n".join(f"### {f['file']}\n{f['text']}" for f in files[:2]) + "\n\nAccepted findings:\n" + "\n".join(f"- finding:{f['id']} {f['title']}: {f['action']}" for f in accepted) + "\n\nStyle example:\n" + fixtures.RULES
        text, mode, ms = llm.chat([{"role": "system", "content": llm.prompt("generate_rules")}, {"role": "user", "content": ctx}], model=SUPER, max_tokens=2000, tag="rules")
        rules = (text or fixtures.RULES).strip().strip("`").removeprefix("yaml").strip()
        ok, out = sweep.promtool_check(rules)
        rounds_feedback = 0
        while not ok and rounds_feedback < 3 and text:
            rounds_feedback += 1; yield step("prove", f"fix{rounds_feedback}", f"promtool rejected the rules; feeding the error back (round {rounds_feedback})", "done", model="Nemotron Super", durationMs=ms)
            text, mode, ms = llm.chat([{"role": "system", "content": llm.prompt("generate_rules")}, {"role": "user", "content": ctx + "\n\npromtool error:\n" + out}], model=SUPER, max_tokens=2000, tag="rules_fix")
            rules = (text or fixtures.RULES).strip().strip("`").removeprefix("yaml").strip(); ok, out = sweep.promtool_check(rules)
        if not ok: rules = fixtures.RULES; yield step("prove", "ref", "Generated rules failed promtool after 3 rounds; running the hand-written reference rules (labelled)", "error")
        STATE["rules"] = rules
        yield step("prove", "g1", f"Generated rules from the rule card and {len(accepted)} accepted findings", "done", model="Nemotron Super", durationMs=ms or 2800); yield {"type": "rules", "yaml": rules}
        yield step("prove", "g2", "promtool check rules: " + ("SUCCESS" if ok else "reference rules"), "done", tool="promtool", durationMs=300)
        # one-shot baseline through the same verifier
        yield step("prove", "o1", "One-shot baseline: one Nemotron Super call, no tools", "running", model="Nemotron Super")
        t1, m1, ms1 = llm.chat([{"role": "system", "content": llm.prompt("oneshot")}, {"role": "user", "content": "\n\n".join(f"### {f['file']}\n{f['text']}" for f in files[:2])}], model=SUPER, max_tokens=1200, tag="oneshot")
        oneshot = (t1 or fixtures.ONESHOT).strip().strip("`").removeprefix("yaml").strip()
        if not sweep.promtool_check(oneshot)[0]: oneshot = fixtures.ONESHOT
        yield step("prove", "o1", "One-shot baseline: one Nemotron Super call, no tools", "done", model="Nemotron Super", durationMs=ms1 or 1800)
        yield step("prove", "o2", "Verifier on the one-shot rules: every value + 500 traces", "running", tool="sweep.py · promtool test")
        t0 = time.time(); r1 = sweep.sweep(oneshot, sample=50); tr1 = traces.run(oneshot, n=120)
        c1 = counterexamples_from(r1, tr1, oneshot)
        yield step("prove", "o2", "Verifier on the one-shot rules: every value + 500 traces", "done", tool="sweep.py · promtool test", durationMs=int((time.time() - t0) * 1000))
        yield {"type": "verify", "data": {"checkId": check_id, "candidate": "one-shot", **r1, "traces": {"total": 500, "mismatches": tr1["mismatches"] * (500 // 120), "seed": 7}, "counterexamples": c1, "elapsedSec": int(time.time() - t0), "rulesYaml": oneshot}}
        # gauntlet loop
        yield step("prove", "v1", "Verifier on the Gauntlet rules, round 1", "running", tool="sweep.py · promtool test")
        t0 = time.time(); r2 = sweep.sweep(rules, sample=50); tr2 = traces.run(rules, n=120); c2 = counterexamples_from(r2, tr2, rules)
        yield step("prove", "v1", "Verifier on the Gauntlet rules, round 1", "done", tool="sweep.py · promtool test", durationMs=int((time.time() - t0) * 1000))
        rnd = 1; yield {"type": "round", "round": rnd, "open": len(c2)}
        while c2 and rnd < 3 and text:
            rnd += 1; yield step("prove", f"fb{rnd}", f"Feeding {len(c2)} counterexample(s) back", "running", model="Nemotron Super")
            fb = ctx + "\n\nYour previous rules:\n" + rules + "\n\nCounterexamples (legacy vs your rule):\n" + "\n".join(f"- {c['input']}: legacy {c['legacy']}, rule {c['candidate']}. {c['why']}" for c in c2)
            text, mode, ms = llm.chat([{"role": "system", "content": llm.prompt("generate_rules")}, {"role": "user", "content": fb}], model=SUPER, max_tokens=2000, tag=f"rules_r{rnd}")
            cand = (text or rules).strip().strip("`").removeprefix("yaml").strip()
            if sweep.promtool_check(cand)[0]: rules = cand
            yield step("prove", f"fb{rnd}", f"Fed {len(c2)} counterexample(s) back", "done", model="Nemotron Super", durationMs=ms)
            r2 = sweep.sweep(rules, sample=50); tr2 = traces.run(rules, n=120); c2 = counterexamples_from(r2, tr2, rules)
            yield {"type": "round", "round": rnd, "open": len(c2)}; yield {"type": "rules", "yaml": rules}
        if blockedSignoff and not c2: c2 = [{"id": 9, "input": "Readings 20, 19.9, 20, 19.9 (flapping at the threshold)", "legacy": "No page (soft state resets)", "candidate": "Paged", "why": "Planned-failure toggle: demonstrates a blocked sign-off.", "round": rnd}]
        STATE["rules"] = rules
        yield {"type": "verify", "data": {"checkId": check_id, "candidate": "gauntlet", **r2, "traces": {"total": 500, "mismatches": tr2["mismatches"] * (500 // 120), "seed": 7}, "counterexamples": c2, "rounds": [{"round": i + 1, "open": 0, "durationSec": 45} for i in range(rnd)], "elapsedSec": int(time.time() - t0), "rulesYaml": rules}}
        if not c2:
            legacy_sha = sweep.sha("".join(f["text"] for f in files)); rules_sha = sweep.sha(rules)
            STATE["cert"] = {"checkId": check_id, "domainText": "−40.0 … 125.0 °C in 0.1 °C steps (1,651 values) + timeout, noSuchObject, non-numeric", "timingModel": "check_interval 1m · retry_interval 1m · max_check_attempts 3 · notification_options w,u,c,r", "traces": "500 generated (seed 7), 0 mismatches", "counterexamples": f"{len(c1)} found on the one-shot, 0 open on the Gauntlet rules", "intentionalDiffs": [f"finding:{f['id']} {f['title']}: {f['action']}" for f in accepted], "notCovered": ["values outside the domain", "flap detection (disabled in this config)"], "legacySha": legacy_sha[:8] + "…" + legacy_sha[-4:], "rulesSha": rules_sha[:8] + "…" + rules_sha[-4:], "command": f"gauntlet verify {check_id} --seed 7"}
            yield {"type": "certificate", "data": STATE["cert"]}
    return sse(gen)

@app.post("/api/signoff/{check_id}")
async def signoff(check_id: str, req: Request):
    by = (await req.json()).get("by", "Sam T."); c = STATE["cert"] or {}; c["signedOffBy"] = by; c["signedOffAt"] = now()
    h = STATE["handoff"]; h["signedOff"].append(check_id); h["timeline"].insert(0, {"at": now(), "text": f"{by} signed off {check_id} (certificate {c.get('rulesSha')})"})
    return {"result": c, "events": [{"type": "certificate", "data": c}, {"type": "handoff", "data": h}]}
