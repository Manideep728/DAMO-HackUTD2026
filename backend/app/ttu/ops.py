"""R1–R5 operations engine. Nothing here calls the model: alerting and delivery must work with Nemotron offline.

R1  evaluate: the released rules run through promtool over the night's telemetry (stable asset IDs, freshness).
R2  deliver:  route with amtool, deliver to local receivers (primary can be set to fail), fall back, record
              delivery / failure / acknowledgement separately, escalate if unacknowledged.
R3  evidence: append-only technician notes with occurrence and entry times and corrections; work-order state.
R5  verify:   recovery needs a fresh plugin execution and 3 consecutive OK evaluations; a closed work order alone
              does not close the incident. Handoff is accepted explicitly by the incoming shift.
Optional: GAUNTLET_GITHUB_REPO + GITHUB_TOKEN opens the work order as a real GitHub issue (deduplicated).
"""
import os, time, json, hashlib, httpx
from . import harness, candidate, legacy
from .scenarios import Scenario, OWNERS

ASSETS = {
    "hpc-c1": {"host": "Compute1", "bmc": "10.9.1.1", "rack": "R12-U14", "owner": "HPC Ops", "workload_owner": "Research Computing"},
    "hpc-c2": {"host": "Compute2", "bmc": "10.9.1.2", "rack": "R12-U16", "owner": "HPC Ops", "workload_owner": "Research Computing"},
    "hpc-c3": {"host": "Compute3", "bmc": "10.9.1.3", "rack": "R13-U02", "owner": "Platform", "workload_owner": "Platform"},
}
START = "02:00"  # minute 0 of the night
NIGHT = Scenario("night", "Night of Nov 8", "Fan 4 on Compute2 stops at 02:06; CPU Health Critical at 02:10",
                 timeline=["OK"] * 10 + ["Critical"] * 30, fan_rpm=[9400] * 6 + [0] * 34)
RUNBOOK = [
    {"id": "rb-1", "title": "§1 Triage", "text": "Confirm the alert against a fresh Redfish reading before dispatch."},
    {"id": "rb-3", "title": "§3 Single fan failure", "text": "A single failed fan can raise CPU temperature within minutes under load while inlet stays normal. Replace or reseat the fan; do not assume a sensor fault."},
    {"id": "rb-5", "title": "§5 Draining jobs", "text": "Draining a node requires the workload owner's authorization. Facilities may request, not execute."},
    {"id": "rb-7", "title": "§7 Recovery", "text": "Recovery is verified by a fresh reading and 3 consecutive OK evaluations, not by closing the ticket."},
]


def clock(minute):
    h, m = divmod(int(START[:2]) * 60 + int(START[3:]) + minute, 60)
    return f"{h:02d}:{m:02d}"


class Ops:
    def __init__(self):
        self.reset()

    def reset(self):
        self.events, self.incidents, self.work_orders, self.notes, self.receivers_failing = [], {}, {}, [], {"hpc-ops-primary"}
        self.acks, self.handoff_accepted, self.recovery, self.github = {}, None, None, None
        self.offline_model = False

    def log(self, minute, kind, text, **kw):
        self.events.append({"t": clock(minute), "minute": minute, "kind": kind, "text": text, **kw})

    # -------- R1 + R2
    def play(self, version="v2"):
        self.reset_events()
        rules, routes = harness.load(version)
        tl = candidate.evaluate(NIGHT, rules, tag="ops")  # deterministic; no model involved
        firing = sorted(((m, name, info["labels"]) for name, info in tl.items() for m in info["minutes"]), key=lambda x: x[0])
        seen = set()
        for minute, name, labels in firing:
            fp = hashlib.sha1(f"{labels.get('asset_id')}|{name}".encode()).hexdigest()[:10]
            if fp in seen:
                continue
            seen.add(fp)
            asset_id = labels.get("asset_id", "hpc-c2")
            self.log(minute, "alert", f"{name} fired for {asset_id} ({labels.get('severity')})", severity=labels.get("severity"), fingerprint=fp,
                     evaluated_by=f"promtool {version} rules", model_used=False)
            receiver = candidate.route(routes, {**labels, "alertname": name}, tag="ops")
            self.deliver(minute, asset_id, name, receiver)
            self.open_work_order(minute, asset_id, name, fp)
        self.log(14, "telemetry", "hpc-c3: no Thermal sample since 02:04, marked stale (not healthy)", severity="unknown")
        self.events.sort(key=lambda e: e["minute"])
        return self.state()

    def reset_events(self):
        failing = self.receivers_failing; offline = self.offline_model
        self.reset(); self.receivers_failing = failing; self.offline_model = offline

    def deliver(self, minute, asset_id, alert, receiver):
        owner = ASSETS[asset_id]["owner"]
        primary, fallback = OWNERS[owner]["primary"], OWNERS[owner]["fallback"]
        ok = receiver not in self.receivers_failing
        self.log(minute, "delivery", f"Page → {primary} via {receiver}: {'DELIVERED' if ok else 'FAILED (503)'}", status="delivered" if ok else "failed", to=primary)
        inc = self.incidents.setdefault(asset_id, {"asset_id": asset_id, "alerts": [], "opened": clock(minute), "deliveries": [], "acked": None, "escalate_at": clock(minute + 10)})
        inc["alerts"].append(alert); inc["deliveries"].append({"to": primary, "via": receiver, "ok": ok, "at": clock(minute)})
        if not ok:
            self.log(minute, "delivery", f"Fallback → {fallback} via oncall-fallback: DELIVERED", status="delivered", to=fallback)
            inc["deliveries"].append({"to": fallback, "via": "oncall-fallback", "ok": True, "at": clock(minute)})

    def open_work_order(self, minute, asset_id, alert, fp):
        wo = self.work_orders.get(asset_id)
        if wo:
            wo["events"] += 1
            self.log(minute, "dedupe", f"{alert} on {asset_id} grouped into {wo['id']}; no new work order ({wo['events']} events, 1 work order)")
            return
        wo = {"id": f"WO-{1040 + len(self.work_orders) + 2}", "asset_id": asset_id, "state": "open", "events": 1, "opened": clock(minute), "github": None}
        self.work_orders[asset_id] = wo
        self.log(minute, "workorder", f"Work order {wo['id']} opened for {asset_id} · {ASSETS[asset_id]['rack']}")
        wo["github"] = self.github_issue(wo, alert)

    def github_issue(self, wo, alert):
        repo, token = os.getenv("GAUNTLET_GITHUB_REPO"), os.getenv("GITHUB_TOKEN")
        if not (repo and token):
            return None
        title = f"[{wo['id']}] {alert} on {wo['asset_id']} ({ASSETS[wo['asset_id']]['rack']})"
        h = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
        try:
            existing = httpx.get(f"https://api.github.com/search/issues", params={"q": f'repo:{repo} is:issue is:open in:title "{wo["id"]}"'}, headers=h, timeout=10).json()
            if existing.get("total_count"):
                return existing["items"][0]["html_url"]
            r = httpx.post(f"https://api.github.com/repos/{repo}/issues", headers=h, timeout=10,
                           json={"title": title, "body": f"Opened by The Gauntlet ops engine.\n\nAsset: {wo['asset_id']}\nRack: {ASSETS[wo['asset_id']]['rack']}\nOwner: {ASSETS[wo['asset_id']]['owner']}"})
            return r.json().get("html_url")
        except Exception as e:
            return f"error: {e}"

    def ack(self, asset_id, by):
        inc = self.incidents.get(asset_id)
        if not inc:
            return {"error": "no incident"}
        inc["acked"] = {"by": by, "at": time.strftime("%H:%M")}
        return self.state()

    # -------- R3
    def add_note(self, work_order, author, occurred, text, corrects=None):
        n = {"id": f"n{len(self.notes) + 1}", "work_order": work_order, "author": author, "occurred": occurred, "entered": time.strftime("%H:%M"), "text": text, "corrects": corrects}
        self.notes.append(n)  # append-only: corrections are new entries pointing at the original
        return n

    def close_work_order(self, asset_id):
        wo = self.work_orders.get(asset_id)
        if wo: wo["state"] = "closed"
        inc = self.incidents.get(asset_id, {})
        inc["status"] = "recovered" if self.recovery and self.recovery.get("verified") else "open: awaiting recovery evidence"
        return self.state()

    # -------- R5
    def verify_recovery(self, asset_id):
        """Run the real plugin against the (now repaired) BMC three times; all must be OK."""
        runs = []
        for i in range(3):
            st, out, ms, how = legacy.run_plugin(asset_id, "OK")
            runs.append({"evaluation": i + 1, "state": st, "ms": ms, "how": how, "output": out[:120]})
        executed = all(r["how"] == "executed" for r in runs)
        verified = executed and all(r["state"] == "OK" for r in runs)  # a modelled run never verifies recovery
        self.recovery = {"asset_id": asset_id, "runs": runs, "verified": verified, "executed": executed, "at": time.strftime("%H:%M:%S"),
                         "reason": None if executed else "plugin not executable here (jq missing); recovery cannot be verified"}
        inc = self.incidents.get(asset_id)
        if inc and verified and self.work_orders.get(asset_id, {}).get("state") == "closed":
            inc["status"] = "recovered"
        return self.state()

    def accept_handoff(self, by):
        self.handoff_accepted = {"by": by, "at": time.strftime("%H:%M")}
        return self.state()

    def state(self):
        return {"events": self.events, "incidents": self.incidents, "work_orders": self.work_orders, "notes": self.notes,
                "recovery": self.recovery, "handoff_accepted": self.handoff_accepted, "receivers_failing": sorted(self.receivers_failing),
                "model_offline": self.offline_model}


OPS = Ops()


# -------- read-only tools for the R4 agent (cited evidence)
def telemetry(asset_id):
    if asset_id != "hpc-c2":
        return {"asset_id": asset_id, "thermal_health": "OK" if asset_id == "hpc-c1" else "stale since 02:04", "evidence_id": f"tel-{asset_id}"}
    return {"asset_id": asset_id, "evidence": [
        {"id": "e1", "fact": "redfish_thermal_health{CPU1 Temp} = Critical (2) since 02:10, reading 91 °C"},
        {"id": "e2", "fact": "redfish_fan_rpm{Fan4} = 0 since 02:06; Fan1-3, 5-6 at ~9400 RPM"},
        {"id": "e3", "fact": "System Board Inlet Temp 22 °C, Health OK; rack R12 neighbours normal"}]}


def asset(asset_id):
    a = ASSETS.get(asset_id)
    return {**a, "asset_id": asset_id, "on_call": OWNERS[a["owner"]]} if a else {"error": "unknown asset"}


def logbook(work_order):
    return {"work_order": work_order, "notes": OPS.notes or [
        {"id": "e4", "author": "Ana P. (technician)", "occurred": "02:31", "entered": "02:40", "text": "Front panel: fan 3 not spinning. Cold-aisle inlet feels normal."},
        {"id": "e4c", "author": "Ana P. (technician)", "occurred": "02:44", "entered": "02:44", "corrects": "e4", "text": "Correction: fan 4, not fan 3 (bay labels swapped on this chassis)."}]}


def runbook(query):
    q = query.lower()
    hits = [r for r in RUNBOOK if any(w in (r["title"] + r["text"]).lower() for w in q.split())]
    return {"query": query, "results": hits or RUNBOOK[:1]}
