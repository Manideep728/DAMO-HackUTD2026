"""Dependency discovery from maintenance records.

Pipeline: chunk → resolve equipment mentions to node ids → extract "X is fed from Y" claims with exact quoted
spans → reject any quote that is not verbatim in its source → set aside non-current claims (temporary,
proposed, removed) with a reason → compare with the documented graph (confirms / contradicts / new) → score
confidence → rerun the simulator with the edge to show the impact if it is true.

Extraction is rule-based by default so it runs offline and is measurable. A model-based extractor can be
plugged in through ``extra_claims``; its claims go through the same verbatim check.
"""

from __future__ import annotations

import json
import pathlib
import re
from collections.abc import Iterable
from dataclasses import asdict, dataclass, field

from engine.cutsets import find_cut_sets
from engine.model import Citation, EdgeSource, EdgeStatus, Facility, Mode, NodeType, Resource, Supply
from engine.redundancy import service_redundancy

CORPUS = pathlib.Path(__file__).resolve().parent / "data" / "corpus" / "demo_corpus.json"

TYPE_WORDS: dict[NodeType, list[str]] = {
    NodeType.utility_feed: ["utility", "util"],
    NodeType.generator: ["generator", "gen"],
    NodeType.ats: ["ats", "transfer switch", "xfer switch"],
    NodeType.switchgear: ["switchgear", "swgr"],
    NodeType.ups: ["ups"],
    NodeType.pdu: ["pdu"],
    NodeType.rpp: ["mcc", "pump mcc", "panel"],
    NodeType.chiller: ["chiller", "ch"],
    NodeType.pump: ["pump"],
    NodeType.crah: ["crah"],
    NodeType.cooling_loop: ["loop"],
}
ABBREVIATIONS = {"sw": "switch", "xfer": "transfer", "batt": "battery"}
CONSUMER_FIRST = ["back-fed from", "re-fed from", "fed from", "powered from", "supplied from", "panel:", "restore"]
SUPPLIER_FIRST = ["carrying", "feeds", "feed", "supplies", "powers"]
WEIGHTS = {"maintenance_log": 0.85, "work_order": 0.75, "inventory": 0.6, "change_ticket": 0.5, "one_line": 0.5}
PLANNED_WEIGHT = 0.2
NOT_CURRENT = [
    (re.compile(r"\bremoved\b"), "temporary connection that was later removed"),
    (re.compile(r"\b(proposed|would be|if it is ever)\b"), "a proposal, not as-built"),
    (re.compile(r"\bnot installed\b"), "equipment not installed"),
]
PLANNED = re.compile(r"\b(will be|temporar\w*|restore)\b")


@dataclass
class Doc:
    id: str
    kind: str
    date: str
    title: str
    text: str


@dataclass
class Mention:
    node: str | None  # None when it looks like equipment but is not in the inventory
    surface: str
    start: int
    end: int


@dataclass
class Claim:
    consumer: str
    supplier: str
    doc_id: str
    date: str
    kind: str
    quote: str
    current: bool = True
    planned: bool = False
    reason: str = ""
    extractor: str = "rules"


@dataclass
class Finding:
    id: str
    consumer: str
    supplier: str
    classification: str  # confirms | contradicts | new
    replaces: str | None
    confidence: float
    supporting: list[dict]
    contradicting: list[dict]
    set_aside: list[dict]
    impact: dict = field(default_factory=dict)
    status: str = "open"  # open | confirmed | rejected

    def claim_text(self) -> str:
        if self.classification == "contradicts":
            return f"{self.consumer} is fed from {self.supplier}, not {self.replaces} as documented"
        if self.classification == "new":
            return f"{self.consumer} is also fed from {self.supplier} (not in the documented graph)"
        return f"{self.consumer} is fed from {self.supplier}, as documented"


@dataclass
class Rejection:
    doc_id: str
    quote: str
    reason: str


@dataclass
class DiscoveryResult:
    findings: list[Finding]
    rejected: list[Rejection]
    claims: list[Claim]


def load_corpus(path: pathlib.Path = CORPUS) -> tuple[list[Doc], list[dict]]:
    data = json.loads(path.read_text())
    return [Doc(**d) for d in data["documents"]], data.get("labels", [])


# ------------------------------------------------------------------ chunking and entity resolution


def chunks(doc: Doc) -> list[tuple[int, str]]:
    """Sentences and inventory lines with their offsets in the document."""
    out = []
    for m in re.finditer(r"[^.\n]+[.\n]?", doc.text):
        s = m.group(0).strip()
        if s:
            out.append((m.start() + m.group(0).index(s), s))
    return out


def _norm(text: str) -> str:
    words = [ABBREVIATIONS.get(w, w) for w in re.findall(r"[a-z0-9]+", text.lower())]
    return "".join(words)


class Resolver:
    """Maps surface forms ("transfer sw 1", "ATS1", "pump mcc b") to node ids, generically from ids and labels."""

    def __init__(self, facility: Facility):
        self.alias: dict[str, str] = {}
        for n in facility.nodes:
            suffix = n.id.split("-")[-1]
            forms = [n.id, n.label] + [f"{w} {suffix}" for w in TYPE_WORDS.get(n.type, [])]
            for form in forms:
                self.alias.setdefault(_norm(form), n.id)

    def mentions(self, text: str) -> list[Mention]:
        tokens = list(re.finditer(r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*", text))
        out: list[Mention] = []
        i = 0
        while i < len(tokens):
            hit = None
            for size in (4, 3, 2, 1):
                if i + size > len(tokens):
                    continue
                span = text[tokens[i].start() : tokens[i + size - 1].end()]
                nid = self.alias.get(_norm(span))
                if nid:
                    hit = (size, Mention(nid, span, tokens[i].start(), tokens[i + size - 1].end()))
                    break
            if hit:
                out.append(hit[1])
                i += hit[0]
                continue
            tok = tokens[i].group(0)
            if re.fullmatch(r"[A-Z]{2,6}-[A-Z0-9]{1,3}", tok):  # looks like an asset tag but is unknown
                out.append(Mention(None, tok, tokens[i].start(), tokens[i].end()))
            i += 1
        return out


# ------------------------------------------------------------------ extraction


def _clauses(sentence: str) -> list[tuple[int, str]]:
    verbs = CONSUMER_FIRST + SUPPLIER_FIRST
    parts, start = [], 0
    for m in re.finditer(r",? and |; |, ", sentence):
        left, right = sentence[start : m.start()], sentence[m.end() :]
        if any(v in left.lower() for v in verbs) and any(v in right.lower() for v in verbs):
            parts.append((start, left))
            start = m.end()
    parts.append((start, sentence[start:]))
    return parts


def extract(doc: Doc, resolver: Resolver) -> tuple[list[Claim], list[Rejection]]:
    claims: list[Claim] = []
    rejected: list[Rejection] = []
    sentences = chunks(doc)
    for idx, (_, sentence) in enumerate(sentences):
        # Modality can sit in the next sentence ("Temporary cable removed the same day.").
        context = " ".join(s for _, s in sentences[idx : idx + 2]).lower()
        low = sentence.lower()
        for _, clause in _clauses(sentence):
            low = clause.lower()
            verb = min(((low.find(v), v) for v in CONSUMER_FIRST + SUPPLIER_FIRST if v in low), default=None)
            if verb is None:
                continue
            pos, v = verb
            ms = resolver.mentions(clause)
            left = [m for m in ms if m.end <= pos]
            right = [m for m in ms if m.start >= pos + len(v)]
            if not left or not right:
                continue
            consumers, suppliers = (left[-1:], right[:1]) if v in CONSUMER_FIRST else (left[-2:], right)
            if v in SUPPLIER_FIRST:
                consumers, suppliers = right, left[-2:]
            for c in consumers:
                for s in suppliers:
                    a, b = min(c.start, s.start), max(c.end, s.end)
                    quote = clause[a:b]
                    if c.node is None or s.node is None:
                        unknown = c.surface if c.node is None else s.surface
                        rejected.append(
                            Rejection(doc.id, quote, f"unknown equipment '{unknown}' (not in the inventory)")
                        )
                        continue
                    if c.node == s.node:
                        continue
                    claim = Claim(c.node, s.node, doc.id, doc.date, doc.kind, quote)
                    for pattern, why in NOT_CURRENT:
                        if pattern.search(context):
                            claim.current, claim.reason = False, why
                            break
                    if claim.current and PLANNED.search(low):
                        claim.planned, claim.reason = (
                            True,
                            "planned or temporary change; weak evidence of current state",
                        )
                    claims.append(claim)
    return claims, rejected


def validate(claims: Iterable[Claim], docs: dict[str, Doc]) -> tuple[list[Claim], list[Rejection]]:
    """Keep only claims whose quote appears verbatim (ignoring whitespace) in the cited document."""
    ok, bad = [], []
    for c in claims:
        doc = docs.get(c.doc_id)
        squash = lambda t: " ".join(t.split())
        if doc is None or not c.quote.strip() or squash(c.quote) not in squash(doc.text):
            bad.append(Rejection(c.doc_id, c.quote, "quote not found verbatim in the cited document"))
        else:
            ok.append(c)
    return ok, bad


# ------------------------------------------------------------------ classification and findings


def _power_group(facility: Facility, consumer: str):
    node = facility.by_id()[consumer]
    for g in node.requires:
        if g.resource == Resource.power and g.mode != Mode.all:
            return g
    return node.requires[0] if node.requires else None


def _cite(c: Claim) -> dict:
    return {"doc_id": c.doc_id, "date": c.date, "kind": c.kind, "quote": c.quote, "reason": c.reason}


def _confidence(support: list[Claim], against: list[Claim]) -> float:
    miss = 1.0
    for c in support:
        miss *= 1 - (PLANNED_WEIGHT if c.planned else WEIGHTS.get(c.kind, 0.5))
    conf = 1 - miss
    newest_support = max((c.date for c in support if not c.planned), default="")
    if any(c.date > newest_support and not c.planned for c in against):
        conf *= 0.5
    return round(conf, 2)


def _apply(facility: Facility, f: Finding) -> Facility:
    group = _power_group(facility, f.consumer)
    supply = Supply(
        supplier=f.supplier,
        source=EdgeSource.engineer_confirmed,
        status=EdgeStatus.confirmed,
        confidence=f.confidence,
        citations=[Citation(doc_id=s["doc_id"], quote=s["quote"]) for s in f.supporting],
    )
    if group is None:
        raise ValueError(f"{f.consumer} has no requirement group to attach a supplier to")
    return facility.with_edge(f.consumer, group.name, supply, replace=f.replaces)


def apply_finding(facility: Facility, f: Finding) -> Facility:
    return _apply(facility, f)


def impact(facility: Facility, f: Finding, max_order: int = 2) -> dict:
    """Rerun cut sets and redundancy with the edge applied."""
    after_fac = _apply(facility, f)
    before = find_cut_sets(facility, max_order=max_order)
    after = find_cut_sets(after_fac, max_order=max_order)
    singles = lambda rep: sorted(c.nodes[0] for c in rep.cut_sets if c.order == 1)
    red_before = {s.service: s.effective for s in service_redundancy(facility, max_order=max_order)}
    red_after = {s.service: s.effective for s in service_redundancy(after_fac, max_order=max_order)}
    return {
        "single_points_before": singles(before),
        "single_points_after": singles(after),
        "new_single_points": sorted(set(singles(after)) - set(singles(before))),
        "cut_sets_before": len(before.cut_sets),
        "cut_sets_after": len(after.cut_sets),
        "services_downgraded": sorted(s for s in red_after if red_after[s] != red_before.get(s)),
        "redundancy_after": {s: red_after[s] for s in sorted(red_after) if red_after[s] != red_before.get(s)},
    }


def discover(
    facility: Facility, docs: list[Doc], extra_claims: Iterable[Claim] = (), with_impact: bool = True
) -> DiscoveryResult:
    resolver = Resolver(facility)
    by_doc = {d.id: d for d in docs}
    claims: list[Claim] = []
    rejected: list[Rejection] = []
    for d in docs:
        c, r = extract(d, resolver)
        claims += c
        rejected += r
    extra_ok, extra_bad = validate(extra_claims, by_doc)
    rule_ok, rule_bad = validate(claims, by_doc)
    claims, rejected = rule_ok + extra_ok, rejected + rule_bad + extra_bad
    for c in claims:
        if not c.current:
            rejected.append(Rejection(c.doc_id, c.quote, c.reason))

    current = [c for c in claims if c.current]
    pairs: dict[tuple[str, str], list[Claim]] = {}
    for c in current:
        pairs.setdefault((c.consumer, c.supplier), []).append(c)

    findings: list[Finding] = []
    for (consumer, supplier), support in sorted(pairs.items()):
        group = _power_group(facility, consumer)
        documented = group.live_suppliers() if group else []
        if supplier in documented:
            # Superseded if newer, stronger evidence puts this consumer on another supplier.
            rivals = [c for (k, s), cs in pairs.items() if k == consumer and s != supplier for c in cs if not c.planned]
            classification, replaces = "confirms", None
            against = rivals if len(documented) == 1 else []
        elif len(documented) == 1:
            classification, replaces = "contradicts", documented[0]
            against = pairs.get((consumer, documented[0]), [])
        else:
            classification, replaces = "new", None
            against = []
        conf = _confidence(support, against)
        aside = [_cite(c) for c in claims if not c.current and (c.consumer, c.supplier) == (consumer, supplier)]
        f = Finding(
            id=f"F-{consumer}-{supplier}",
            consumer=consumer,
            supplier=supplier,
            classification=classification,
            replaces=replaces,
            confidence=conf,
            supporting=[_cite(c) for c in sorted(support, key=lambda c: c.date)],
            contradicting=[_cite(c) for c in sorted(against, key=lambda c: c.date)],
            set_aside=aside,
        )
        findings.append(f)

    # A documented edge that newer evidence contradicts is reported on the contradicting finding, not as a
    # confirmation of its own.
    contradicted = {
        (f.consumer, f.replaces) for f in findings if f.classification == "contradicts" and f.confidence >= 0.5
    }
    for f in findings:
        if f.classification == "confirms" and (f.consumer, f.supplier) in contradicted:
            f.status = "superseded"
    if with_impact:
        for f in findings:
            if f.classification != "confirms":
                f.impact = impact(facility, f)
    findings.sort(key=lambda f: ({"contradicts": 0, "new": 1, "confirms": 2}[f.classification], -f.confidence, f.id))
    return DiscoveryResult(findings, rejected, claims)


def believed_edges(result: DiscoveryResult, threshold: float = 0.5) -> set[tuple[str, str]]:
    """Edges the pipeline believes are current: confirmations not superseded, and strong new evidence."""
    out = set()
    for f in result.findings:
        if f.status == "superseded":
            continue
        if f.classification == "confirms" or f.confidence >= threshold:
            out.add((f.consumer, f.supplier))
    return out


def score(result: DiscoveryResult, labels: list[dict]) -> dict:
    predicted = believed_edges(result)
    truth = {(lab["consumer"], lab["supplier"]) for lab in labels if lab["truth"]}
    false_ = {(lab["consumer"], lab["supplier"]) for lab in labels if not lab["truth"]}
    tp = len(predicted & truth)
    fp = len(predicted & false_)
    fn = len(truth - predicted)
    return {
        "precision": round(tp / (tp + fp), 3) if tp + fp else 1.0,
        "recall": round(tp / (tp + fn), 3) if tp + fn else 1.0,
        "true_positives": tp,
        "false_positives": sorted(predicted & false_),
        "missed": sorted(truth - predicted),
        "unlabeled_predictions": sorted(predicted - truth - false_),
    }


def to_dict(f: Finding) -> dict:
    d = asdict(f)
    d["claim"] = f.claim_text()
    return d
