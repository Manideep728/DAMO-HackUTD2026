"""The retrofit workflow: test → flag → engineer decision → change → retest → regression → accept → revalidate.

Every step is deterministic. The "agent" steps here (flagging a mismatch, proposing a change) are rule-based and
cite their source; `agent.py` can have Nemotron narrate or propose, but a proposal only counts after this module's
checks and the behavior suite pass it. The config diff is always computed by difflib, never written by a model.
"""

from __future__ import annotations

import difflib
import hashlib
import re
from dataclasses import asdict, dataclass
from typing import Any

from . import oracle
from .behavior import run_suite
from .contract import FRESHNESS
from .decisions import Store
from .inputs import Site, VendorPoint, load_site
from .mapping import parse

CONFIGS = ("original", "candidate", "accepted")
INSTALLED_FIRMWARE = "2.3.0"  # what the physical CDUs run until the firmware-change demo


@dataclass
class Flag:
    zone: int
    subject: str
    point: str
    mapped_location: str
    drawing_location: str
    quote: str
    doc: str
    line_no: int
    line: str
    failing_cases: list[str]


@dataclass
class Change:
    before: str
    after: str
    why: str
    source: str


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:12]


def unified(a: str, b: str, a_name: str, b_name: str) -> str:
    return "".join(difflib.unified_diff(a.splitlines(True), b.splitlines(True), a_name, b_name, n=2))


def _loop_of(p: VendorPoint) -> str | None:
    if p.description.startswith("Facility (primary)"):
        return "primary"
    if p.description.startswith("Secondary"):
        return "secondary"
    return None


def _measure_of(p: VendorPoint) -> str | None:
    d = p.description.lower()
    for word, field in (
        ("supply temperature", "supply_temp_c"),
        ("return temperature", "return_temp_c"),
        ("flow", "flow_lpm"),
    ):
        if word in d and "setpoint" not in d:
            return field
    return None


class Retrofit:
    def __init__(self, store: Store):
        self.store = store
        self._sites: dict[str, Site] = {}

    def site(self, sid: str) -> Site:
        if sid not in self._sites:
            self._sites[sid] = load_site(sid)
        return self._sites[sid]

    # configs -------------------------------------------------------------------------------------------------
    def original(self, sid: str) -> str:
        return self.site(sid).file_text("config/original/mapping.yaml")

    def config(self, sid: str, which: str) -> str:
        if which == "original":
            return self.original(sid)
        row = self.store.candidate(sid) if which == "candidate" else self.store.package(sid)
        if row is None:
            raise KeyError(f"site {sid} has no {which} config yet")
        return str(row["text"] if which == "candidate" else row["mapping"])

    def test(
        self,
        sid: str,
        which: str = "original",
        firmware: str | None = None,
        only: set[str] | None = None,
        text: str | None = None,
    ) -> dict[str, Any]:
        if which not in CONFIGS:
            raise ValueError(f"config must be one of {', '.join(CONFIGS)}")
        text = text if text is not None else self.config(sid, which)
        site = self.site(sid)
        report = run_suite(
            site,
            text,
            which,
            self.store.decisions(sid),
            self.store.regressions(),
            firmware=firmware or INSTALLED_FIRMWARE,
            only=only,
        )
        report["mapping_sha"] = sha(text)
        self.store.audit(
            "harness",
            "suite.run",
            {
                "site": sid,
                "config": which,
                "passed": report["passed"],
                "total": report["total"],
                "firmware": report["firmware"],
            },
        )
        return report

    # flag ----------------------------------------------------------------------------------------------------
    def flag(self, sid: str, which: str = "original") -> dict[str, Any]:
        """Failing leak tests traced to the mapping line and the drawing sentence that disagree with it."""
        site, text = self.site(sid), self.config(sid, which)
        report = self.test(sid, which)
        m = parse(text)
        points = site.vendor_points[m.device.firmware]
        failing = [c for c in report["cases"] if not c["pass"] and c["result"]["rack"] == "fail"]
        flags = []
        for note in site.drawing:
            entry = next((z for z in m.leak_zones if points.get(z.point) and points[z.point].zone == note.zone), None)
            if entry is None or entry.location == note.location:
                continue
            if note.quote not in site.drawing_text:  # verbatim or nothing
                continue
            line_no, line = next(
                (i, ln) for i, ln in enumerate(text.splitlines(), 1) if ln.strip() == f"- point: {entry.point}"
            )
            loc_line = text.splitlines()[line_no]
            flags.append(
                Flag(
                    note.zone,
                    oracle.subject(m.device.id, note.zone),
                    entry.point,
                    entry.location,
                    note.location,
                    note.quote,
                    note.doc,
                    line_no + 1,
                    loc_line.strip(),
                    [c["id"] for c in failing if note.location in c["id"] or entry.location in c["notes"][0]],
                )
            )
        return {"report": report, "flags": [asdict(f) for f in flags], "by": "rules (no model)"}

    # decide --------------------------------------------------------------------------------------------------
    def decide(
        self, sid: str, zone: int, decision: str, author: str, note: str = "", value: str | None = None
    ) -> dict[str, Any]:
        """The engineer confirms (or rejects) where a leak cable physically runs. Recorded with its source,
        author, time, scope and the equipment version it was made against."""
        site = self.site(sid)
        drawn = oracle.drawing_note(site, zone)
        if drawn is None:
            raise KeyError(f"the drawing has no note for zone {zone}")
        m = parse(self.original(sid))
        points = site.vendor_points[m.device.firmware]
        point = next(z.point for z in m.leak_zones if points.get(z.point) and points[z.point].zone == zone)
        return self.store.decide(
            site=sid,
            subject=oracle.subject(m.device.id, zone),
            value=value or drawn.location,
            decision=decision,
            source_doc=drawn.doc,
            source_quote=drawn.quote,
            author=author,
            scope={"site": sid, "equipment": m.device.id, "zone": zone, "hall": site.hall()},
            equipment_version=f"{m.device.id} fw {INSTALLED_FIRMWARE}",
            depends_on=[point],
            note=note,
        )

    # propose -------------------------------------------------------------------------------------------------
    def propose(self, sid: str, base: str = "original", firmware: str | None = None) -> dict[str, Any]:
        """A reviewable change: decisions applied, contract and topology facts restored, and (for a firmware
        change) points renamed by register and new state labels mapped. Each changed line says why."""
        site = self.site(sid)
        before = self.config(sid, base)
        text, changes = before, []

        def edit(pattern: str, repl: str, why: str, source: str) -> None:
            nonlocal text
            mt = re.search(pattern, text, re.M)
            if not mt:
                return
            new = mt.expand(repl)
            if new != mt.group(0):
                changes.append(Change(mt.group(0).strip(), new.strip(), why, source))
                text = text[: mt.start()] + new + text[mt.end() :]

        m = parse(text)
        old_fw = m.device.firmware
        if firmware and firmware != old_fw:
            old_pts, new_pts = site.vendor_points[old_fw], site.vendor_points[firmware]
            by_reg = {p.register: p for p in new_pts.values()}
            src = f"cdu_vendor_points@{firmware}.csv"
            edit(r"^(  firmware: )\S+$", rf"\g<1>{firmware}", "device runs new firmware", src)
            edit(r"^(  vendor_points: )\S+$", rf"\g<1>{src}", "point list for the new firmware", src)
            for p in old_pts.values():
                new = by_reg.get(p.register)
                if new and new.point != p.point:
                    for pat in (rf"^(\s+- point: ){re.escape(p.point)}$", rf"^(  \S+: ){re.escape(p.point)}$"):
                        edit(pat, rf"\g<1>{new.point}", f"register {p.register} renamed {p.point} → {new.point}", src)
            state = new_pts[m.telemetry["state"]] if m.telemetry.get("state") in new_pts else None
            for label in state.enum.values() if state else []:
                if label not in m.state_map and "degraded" in label:
                    edit(
                        r"^(state_map:.*\n(?:  .*\n)*)",
                        rf'\g<1>  "{label}": "degraded"\n',
                        f"new state {label}: running but impaired, never available backup",
                        src,
                    )
            m = parse(text)
        points = site.vendor_points[m.device.firmware]
        for d in self.store.decisions(sid):
            if d["status"] not in ("active", "needs_revalidation") or not d["subject"].startswith("leak_zone:"):
                continue
            zone = int(d["subject"].rsplit(":", 1)[1])
            for z in m.leak_zones:
                if points.get(z.point) and points[z.point].zone == zone:
                    edit(
                        rf"^(\s+- point: {re.escape(z.point)}\n\s+location: )\S+$",
                        rf"\g<1>{d['value']}",
                        f"engineer {d['author']} confirmed zone {zone} runs under {d['value']} (D-{d['id']} "
                        f"v{d['version']})",
                        f'{d["source_doc"]}: "{d["source_quote"]}"',
                    )
        for field, point in m.telemetry.items():
            if field == "state" or point not in points:
                continue
            loop, measure = field.split(".")
            if _loop_of(points[point]) == loop and _measure_of(points[point]) == measure:
                continue
            right = next((p.point for p in points.values() if _loop_of(p) == loop and _measure_of(p) == measure), None)
            if right:
                edit(
                    rf"^(  {re.escape(field)}: )\S+$",
                    rf"\g<1>{right}",
                    f"{point} is {points[point].description.lower()}, not the {loop} loop",
                    f"{m.device.vendor_points}: {points[right].description}",
                )
        if m.availability.backup_when != ["standby"]:
            edit(
                r"^(  backup_when: )\[.*\]$",
                r"\g<1>[standby]",
                "a running unit is in use, not available backup",
                "contract: CduTelemetry.available_backup",
            )
        for key, val in FRESHNESS.items():
            edit(rf"^(  {key}: )\d+$", rf"\g<1>{val}", f"contract freshness rule {key}", "synthetic target contract")
        for rack in site.liquid_racks():
            valve = site.rack_valve(rack)
            if valve:
                edit(
                    rf"^(  {re.escape(rack)}: )\S+$",
                    rf"\g<1>{valve}",
                    f"{valve} isolates {rack}",
                    "cooling_topology.csv",
                )
        lo, hi = site.requirements["limits"]["setpoint_request_c"]
        edit(
            r"^(  approved_range_c: )\[.*\]$", rf"\g<1>[{lo}, {hi}]", "approved setpoint range", "site_requirements.md"
        )
        edit(
            r"^(  fallback_setpoint_c: )\S+$",
            rf"\g<1>{site.requirements['fallback']['setpoint_c']}",
            "approved fallback setpoint",
            "site_requirements.md",
        )
        cid = self.store.save_candidate(sid, text, parse(text).device.firmware, "; ".join(c.why for c in changes))
        return {
            "id": cid,
            "base": base,
            "candidate": text,
            "sha": sha(text),
            "base_sha": sha(before),
            "diff": unified(before, text, f"mapping.yaml ({base})", "mapping.yaml (candidate)"),
            "changes": [asdict(c) for c in changes],
            "by": "rules (no model)",
        }

    # regression ----------------------------------------------------------------------------------------------
    def save_regression(self, sid: str, decision_id: int, actor: str) -> dict[str, Any]:
        d = self.store.decision(decision_id)
        if d["site"] != sid or d["status"] != "active":
            raise ValueError(f"decision D-{decision_id} is not active on site {sid}")
        existing = [r for r in self.store.regressions() if r["decision_id"] == decision_id]
        if existing:
            return existing[0]
        zone = int(d["subject"].rsplit(":", 1)[1])
        spec = {
            "kind": "leak_location",
            "subject": d["subject"],
            "zone": zone,
            "location": d["value"],
            "summary": f"zone {zone} leak cable is under {d['value']}; a leak there must name {d['value']} and "
            f"close its valve",
        }
        return self.store.add_regression(sid, spec, "decision", decision_id, actor=actor)

    # accept --------------------------------------------------------------------------------------------------
    def accept(self, sid: str, by: str, firmware: str | None = None, note: str = "") -> dict[str, Any]:
        """Accept the candidate as the new package, only if every case passes and every mutant is rejected."""
        if not by.strip():
            raise ValueError("accepted_by is required")
        text = self.config(sid, "candidate")
        report = self.test(sid, "candidate", firmware=firmware or parse(text).device.firmware)
        if not report["pass"] or not all(s["rejected"] for s in report["sanity"]):
            raise ValueError(f"candidate fails {report['total'] - report['passed']} case(s); not accepted")
        return self.store.accept_package(sid, text, sha(text), report, by, note)

    # firmware change -----------------------------------------------------------------------------------------
    def revalidate(self, sid: str, firmware: str) -> dict[str, Any]:
        """A CDU firmware change: diff the point lists, flag affected mapping lines and decisions, rerun only the
        affected tests, propose the update, and ask for approval. The accepted package does not change here."""
        site = self.site(sid)
        base = "accepted" if self.store.package(sid) else "candidate"
        text = self.config(sid, base)
        m = parse(text)
        old, new = site.vendor_points[m.device.firmware], site.vendor_points[firmware]
        new_by_reg = {p.register: p for p in new.values()}
        changes = []
        for p in old.values():
            q = new_by_reg.get(p.register)
            if q is None:
                changes.append({"point": p.point, "register": p.register, "change": "removed"})
            elif q.point != p.point:
                changes.append({"point": p.point, "register": p.register, "change": f"renamed to {q.point}"})
            elif q.enum != p.enum:
                changes.append(
                    {
                        "point": p.point,
                        "register": p.register,
                        "change": "enum changed",
                        "before": p.enum,
                        "after": q.enum,
                    }
                )
        changed = {str(c["point"]) for c in changes}
        lines = [ln.strip() for ln in text.splitlines() if any(re.search(rf"\b{re.escape(p)}\b", ln) for p in changed)]
        if any(c["change"] == "enum changed" and c["point"] == m.telemetry.get("state") for c in changes):
            lines += ["state_map", "availability.backup_when"]
        flagged = []
        for d in self.store.decisions(sid):
            if d["status"] == "active" and set(d["depends_on"]) & changed:
                self.store.flag_decision(
                    d["id"],
                    f"firmware {m.device.firmware} → {firmware} changed "
                    f"{', '.join(sorted(set(d['depends_on']) & changed))}",
                )
                flagged.append(d["id"])
        affected = {"running-vs-available", "loops"} if "state_map" in lines else set()
        if any(new_by_reg.get(old[p].register) and new_by_reg[old[p].register].type == "bool" for p in changed):
            affected |= {"leak-", "regression-"}
        before = self.test(sid, base, firmware=firmware, only=affected)
        proposal = self.propose(sid, base=base, firmware=firmware)
        after = self.test(sid, "candidate", firmware=firmware, only=affected)
        approval = self.store.request_approval(
            sid,
            "firmware",
            {
                "from": m.device.firmware,
                "to": firmware,
                "point_changes": changes,
                "affected_lines": lines,
                "flagged_decisions": flagged,
                "affected_tests": sorted(affected),
                "candidate_id": proposal["id"],
                "before": {"passed": before["passed"], "total": before["total"]},
                "after": {"passed": after["passed"], "total": after["total"]},
            },
        )
        return {
            "from": m.device.firmware,
            "to": firmware,
            "point_changes": changes,
            "affected_lines": lines,
            "flagged_decisions": flagged,
            "affected_tests": sorted(affected),
            "before": before,
            "proposal": proposal,
            "after": after,
            "approval": approval,
            "accepted_package": self.store.package(sid),
        }

    def approve(self, sid: str, approval_id: int, status: str, by: str) -> dict[str, Any]:
        appr = next((a for a in self.store.approvals(sid) if a["id"] == approval_id), None)
        if appr is None:
            raise KeyError(f"approval {approval_id}")
        if appr["status"] != "pending":
            raise ValueError(f"approval {approval_id} is already {appr['status']}")
        if status == "approved":
            fw = appr["detail"]["to"]
            pkg = self.accept(sid, by, firmware=fw, note=f"firmware {appr['detail']['from']} → {fw}")
            m = parse(pkg["mapping"])
            points = self.site(sid).vendor_points[fw]
            for did in appr["detail"]["flagged_decisions"]:
                zone = int(self.store.decision(did)["subject"].rsplit(":", 1)[1])
                point = next(z.point for z in m.leak_zones if points[z.point].zone == zone)
                self.store.revalidate_decision(did, f"{m.device.id} fw {fw}", [point], by)
        return {"approval": self.store.decide_approval(approval_id, status, by), "package": self.store.package(sid)}

    # readiness and handover ----------------------------------------------------------------------------------
    def readiness(self, sid: str) -> dict[str, Any]:
        site = self.site(sid)
        pkg = self.store.package(sid)
        report = pkg["report"] if pkg else None
        latest = {r["check_id"]: r for r in self.store.field_results(sid)}
        checks = [
            {
                "id": cid,
                "what": what,
                "status": latest[cid]["result"] if cid in latest else "required",
                "witnessed_by": latest[cid]["witnessed_by"] if cid in latest else None,
                "at": latest[cid]["at"] if cid in latest else None,
            }
            for cid, what in site.requirements["field_checks"].items()
        ]
        tests = (
            []
            if report is None
            else [{"id": c["id"], "name": c["name"], "pass": c["pass"]} for c in report["cases"]]
            + [{**h} for h in report["held_out"]]
        )
        stale = [d for d in self.store.decisions(sid) if d["status"] == "needs_revalidation"]
        return {
            "site": sid,
            "package": None
            if pkg is None
            else {k: pkg[k] for k in ("version", "mapping_sha", "accepted_by", "accepted_at", "note")},
            "software": {
                "passed": sum(t["pass"] for t in tests),
                "total": len(tests),
                "tests": tests,
                "note": "Simulated behavior tests. They do not certify plumbing, sensor placement or cooling capacity.",
            },
            "field": {
                "open": sum(c["status"] != "pass" for c in checks),
                "checks": checks,
                "note": "Witnessed on site only. A simulation never closes a field check.",
            },
            "ownership": {"unresolved": site.requirements["owners"]["unresolved"]},
            "decisions_needing_revalidation": [d["id"] for d in stale],
            "ready": bool(tests)
            and all(t["pass"] for t in tests)
            and all(c["status"] == "pass" for c in checks)
            and not site.requirements["owners"]["unresolved"]
            and not stale,
        }

    def witness(self, sid: str, check_id: str, result: str, witnessed_by: str, note: str = "") -> dict[str, Any]:
        if check_id not in self.site(sid).requirements["field_checks"]:
            raise KeyError(f"unknown field check {check_id}")
        return self.store.witness(sid, check_id, result, witnessed_by, note)

    def equipment_map(self, sid: str) -> dict[str, Any]:
        site = self.site(sid)
        pkg = self.store.package(sid)
        zones = oracle.associations(site, self.store.decisions(sid))
        leak = []
        for z, loc in sorted(zones.items()):
            d = next(
                (
                    d
                    for d in self.store.decisions(sid)
                    if d["subject"].endswith(f":{z}") and d["status"] in ("active", "needs_revalidation")
                ),
                None,
            )
            leak.append(
                {
                    "zone": z,
                    "location": loc,
                    "valve": site.rack_valve(loc) if loc in site.liquid_racks() else None,
                    "source": f"decision D-{d['id']} v{d['version']} by {d['author']}" if d else "drawing",
                    "status": d["status"] if d else "documented",
                }
            )
        return {
            "site": sid,
            "hall": site.hall(),
            "cdu": site.cdu(),
            "racks": site.liquid_racks(),
            "loops": [
                {"component": r["component"], "type": r["type"], "loop": r["loop"], "serves": r["serves"]}
                for r in site.topology
                if r["type"] != "leak_sensor"
            ],
            "leak_zones": leak,
            "owners": site.requirements["owners"],
            "limits": site.requirements["limits"],
            "redundancy": oracle.redundancy(site),
            "package_version": pkg["version"] if pkg else None,
        }

    def handover(self, sid: str) -> dict[str, Any]:
        pkg = self.store.package(sid)
        if pkg is None:
            raise KeyError(f"site {sid} has no accepted package yet")
        orig = self.original(sid)
        ready = self.readiness(sid)
        emap = self.equipment_map(sid)
        open_issues = [
            f"{c['id']} {c['what']}: field check still required"
            for c in ready["field"]["checks"]
            if c["status"] != "pass"
        ]
        open_issues += [f"Owner unresolved: {o}" for o in ready["ownership"]["unresolved"]]
        open_issues += [f"Decision D-{i} needs revalidation" for i in ready["decisions_needing_revalidation"]]
        procedures = [
            f"Leak under {z['location']} (zone {z['zone']}): close {z['valve']}, notify Facilities; do not "
            f"shut down {emap['cdu']}."
            for z in emap["leak_zones"]
            if z["valve"]
        ]
        procedures += [
            f"Leak in the {emap['cdu']} cabinet (zone {z['zone']}): notify Facilities only."
            for z in emap["leak_zones"]
            if not z["valve"]
        ]
        procedures.append(
            "Low secondary flow: runbook RB-LC-2 (site_requirements.md). Facilities owns loop checks; "
            "IT owns workload impact. Close only when flow, temperature and job progress recover."
        )
        prev = self.store.packages(sid)
        rollback_to = prev[-2] if len(prev) > 1 else None
        return {
            "site": sid,
            "package": {k: pkg[k] for k in ("version", "mapping_sha", "accepted_by", "accepted_at")},
            "synthetic": True,
            "diff": unified(
                orig, pkg["mapping"], "mapping.yaml (original)", f"mapping.yaml (package v{pkg['version']})"
            ),
            "equipment_map": emap,
            "tests": {
                "passed": pkg["report"]["passed"],
                "total": pkg["report"]["total"],
                "expectations_sha": pkg["report"]["expectations_sha"],
                "sanity": pkg["report"]["sanity"],
            },
            "decisions": self.store.decisions(sid),
            "open_issues": open_issues,
            "deploy": [
                f"Back up the running adapter mapping (sha {sha(orig)} if never changed).",
                f"Deploy mapping sha {pkg['mapping_sha']} to the integration host for {emap['cdu']}.",
                "Run the behavior suite against the live adapter in read-only mode; expect every case to pass.",
                "Witness the open field checks before handover to operations.",
            ],
            "rollback": [
                f"Restore mapping sha {rollback_to['mapping_sha'] if rollback_to else sha(orig)} "
                f"({'package v' + str(rollback_to['version']) if rollback_to else 'original'}).",
                "Re-run the behavior suite; the known wrong-rack case will fail again until re-fixed.",
                "Tell Facilities the leak response for the affected zone is unverified.",
            ],
            "procedures": procedures,
            "readiness": ready,
        }

    def handover_md(self, sid: str) -> str:
        h = self.handover(sid)
        e = h["equipment_map"]
        out = [
            f"# Handover package: site {sid}, package v{h['package']['version']} (SYNTHETIC)",
            "",
            f"Accepted by {h['package']['accepted_by']}; mapping sha `{h['package']['mapping_sha']}`. "
            f"Behavior tests {h['tests']['passed']}/{h['tests']['total']} "
            f"(expectations `{h['tests']['expectations_sha']}`).",
            "",
            "## Configuration diff",
            "",
            "```diff",
            h["diff"].rstrip(),
            "```",
            "",
            "## Equipment map",
            "",
            "| Zone | Location | Valve | Source |",
            "|---|---|---|---|",
        ]
        out += [f"| {z['zone']} | {z['location']} | {z['valve'] or '—'} | {z['source']} |" for z in e["leak_zones"]]
        if e["redundancy"]:
            out += [
                "",
                "Liquid racks by independence: "
                + "; ".join(
                    f"{r} {v['effective']} (single points {', '.join(v['single_points'])})"
                    for r, v in e["redundancy"].items()
                ),
            ]
        out += ["", "## Open issues", ""] + [f"- {i}" for i in h["open_issues"] or ["None"]]
        out += ["", "## Deploy", ""] + [f"{i}. {s}" for i, s in enumerate(h["deploy"], 1)]
        out += ["", "## Rollback", ""] + [f"{i}. {s}" for i, s in enumerate(h["rollback"], 1)]
        out += ["", "## Operator procedures", ""] + [f"- {p}" for p in h["procedures"]]
        return "\n".join(out) + "\n"

    # lessons -------------------------------------------------------------------------------------------------
    def lesson(self, sid: str, text: str, author: str, incident: str) -> dict[str, Any]:
        """A reviewed incident lesson becomes a proposed regression test, pending modernization review."""
        if not text.strip() or not author.strip():
            raise ValueError("lesson text and author are required")
        spec = {
            "kind": "low_flow",
            "incident": incident,
            "lesson": text.strip(),
            "summary": "gradual secondary flow decline with the CDU still running must raise "
            "LowFlowWhileRunning within 3 minutes of crossing the approved minimum",
        }
        return self.store.add_regression(sid, spec, "lesson", None, status="pending_review", actor=author)
