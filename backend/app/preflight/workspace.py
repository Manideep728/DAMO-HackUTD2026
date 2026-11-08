"""The working copy the API and the agent share: documented facility, records, decisions and plans."""

from __future__ import annotations

import datetime as dt
import os
import threading
from dataclasses import dataclass, field

from engine.model import Facility, State
from engine.timestep import Window

from .data.demo import demo_facility, demo_profiles, demo_windows
from .discovery import Claim, DiscoveryResult, Doc, Finding, Rejection, apply_finding, discover, load_corpus
from .extract_model import ReadModel, read_records
from .meters import MeterEvidence
from .resolve_model import nemotron_resolver
from .store import Store
from .telemetry import URL_ENV, MetersUnavailable, Telemetry, sync


@dataclass
class Workspace:
    store: Store
    documented: Facility = field(default_factory=demo_facility)
    docs: list[Doc] = field(default_factory=lambda: load_corpus()[0])
    labels: list[dict] = field(default_factory=lambda: load_corpus()[1])
    profiles: dict[str, list[float]] = field(default_factory=demo_profiles)
    windows: list[Window] = field(default_factory=demo_windows)
    _discovery: DiscoveryResult | None = None
    model_claims: list[Claim] = field(default_factory=list)
    model_rejected: list[Rejection] = field(default_factory=list)
    model_read: dict | None = None
    telemetry: Telemetry | None = None  # meter data for the demo hall, from Tiger or its local snapshot
    on_demo: bool = True  # meters describe the demo hall; an imported site has none
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def meter_evidence(self) -> list[MeterEvidence]:
        return self.telemetry.evidence if self.telemetry and self.on_demo else []

    def use_meters(self, t: Telemetry | None) -> None:
        """Measured profiles replace the hand-written ones, and meter evidence joins discovery."""
        with self._lock:
            self.telemetry = t
            if self.on_demo:
                self.profiles = t.profiles(dt.date.today()) if t else demo_profiles()
            self._discovery = None

    def sync_meters(self, actor: str) -> dict:
        url = os.getenv(URL_ENV)
        if not url:
            raise MetersUnavailable(f"{URL_ENV} is not set")
        self.use_meters(sync(url, demo_facility()))
        summary = self.load_source()
        self.store.audit(actor, "meters.synced", summary)
        return summary

    def load_source(self) -> dict:
        if self.telemetry and self.on_demo:
            return self.telemetry.summary()
        return {"source": "assumed" if self.profiles else "none"}

    def discovery(self) -> DiscoveryResult:
        with self._lock:
            if self._discovery is None:
                self._discovery = discover(
                    self.documented,
                    self.docs,
                    extra_claims=self.model_claims,
                    extra_rejected=self.model_rejected,
                    model=nemotron_resolver(self.documented),
                    meters=self.meter_evidence(),
                )
            return self._discovery

    def findings(self) -> list[Finding]:
        decided = self.store.decisions()
        out = []
        for f in self.discovery().findings:
            d = decided.get(f.id)
            if d and f.status != "superseded":
                f.status = d["decision"]
            out.append(f)
        return out

    def finding(self, finding_id: str) -> Finding:
        for f in self.findings():
            if f.id == finding_id:
                return f
        raise KeyError(finding_id)

    def facility(self) -> Facility:
        """Documented graph plus every finding an engineer has confirmed."""
        fac = self.documented
        for f in self.findings():
            if f.status == "confirmed" and f.classification != "confirms":
                fac = apply_finding(fac, f)
        return fac

    def decide(self, finding_id: str, decision: str, actor: str, note: str = "") -> Finding:
        f = self.finding(finding_id)
        self.store.decide(f.id, decision, actor, note)
        f.status = decision
        return f

    def add_suspected(self, finding: Finding, actor: str) -> Finding:
        """Register a dependency proposed by the agent. It is suspected until an engineer confirms it."""
        result = self.discovery()
        if any(f.id == finding.id for f in result.findings):
            return next(f for f in result.findings if f.id == finding.id)
        finding.status = "open"
        result.findings.append(finding)
        self.store.audit(actor, "finding.proposed", {"finding": finding.id, "claim": finding.claim_text()})
        return finding

    def read_with_model(self, actor: str, model: ReadModel | None = None) -> dict:
        """Have Nemotron read every record; its claims join discovery after the same checks as the rules'."""
        before = {f.id for f in self.discovery().findings if f.classification != "confirms"}
        read = read_records(self.documented, self.docs, *([model] if model else []))
        with self._lock:
            self.model_claims, self.model_rejected = read.claims, read.rejected
            self._discovery = None
        after = [f for f in self.discovery().findings if f.classification != "confirms"]
        stats = {**read.stats, "new_findings": sorted(f.id for f in after if f.id not in before)}
        self.model_read = stats
        self.store.audit(actor, "discovery.model_read", stats)
        return stats

    def _clear_model_read(self) -> None:
        self.model_claims, self.model_rejected, self.model_read = [], [], None

    def replace_facility(self, facility: Facility, actor: str) -> None:
        """Swap in an imported facility. The demo's records, load profiles and maintenance windows describe the
        demo hall, so they go too; otherwise its work orders would produce findings about look-alike ids."""
        with self._lock:
            self.documented = facility
            self.docs, self.labels, self.profiles, self.windows = [], [], {}, []
            self.on_demo = False
            self._clear_model_read()
            self._discovery = None
        self.store.audit(actor, "facility.imported", {"name": facility.name, "nodes": len(facility.nodes)})

    def restore_demo(self, actor: str) -> None:
        fresh = Workspace(self.store)
        with self._lock:
            self.documented, self.docs, self.labels = fresh.documented, fresh.docs, fresh.labels
            self.windows = fresh.windows
            self.on_demo = True
            self.profiles = self.telemetry.profiles(dt.date.today()) if self.telemetry else fresh.profiles
            self._clear_model_read()
            self._discovery = None
        self.store.audit(actor, "facility.restored_demo", {"name": self.documented.name})


def parse_states(raw: dict[str, str] | None, facility: Facility) -> dict[str, State]:
    known = facility.by_id()
    out: dict[str, State] = {}
    for nid, st in (raw or {}).items():
        if nid not in known:
            raise KeyError(f"unknown node {nid}")
        state = State(st)
        if state in (State.failed, State.maintenance):
            out[nid] = state
    return out
