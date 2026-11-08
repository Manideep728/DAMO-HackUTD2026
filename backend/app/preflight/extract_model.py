"""Nemotron reads the records and proposes "X is fed from Y" claims; discovery decides what counts.

Every proposed claim must pass, in order:
1. both ids are in the inventory,
2. the quote is in the record word for word,
3. the quote, read with the rules' grammar, states that feed in that direction. Names the rules cannot place
   may resolve to the claimed pair when the phrase carries the node's suffix and a word for its type, so the
   model widens what is read but cannot pin a real sentence on a pair it does not describe,
4. the same temporary / proposed / removed check the rules apply. The model's own "current" is not trusted;
   its "temporary" or "proposed" also sets a claim aside.
Claims that pass join the rule-based claims; the rest are reported with the reason they failed.
"""

from __future__ import annotations

import json
import os
import re
import time
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field

from engine.model import Facility

from .. import llm
from ..models import SUPER
from .discovery import TYPE_WORDS, Claim, Doc, Rejection, Resolver, extract, modality, quote_context

MODEL = os.getenv("NEMOTRON_MODEL") or SUPER

PROMPT = """You read data center maintenance records and list the power feeds they state.
Inventory (id: label):
{inventory}

Record {doc_id} ({kind}, {date}):
\"\"\"{text}\"\"\"

List every statement that one inventory item is fed or powered from another. Answer with JSON only:
{{"feeds": [{{"consumer": "<id>", "supplier": "<id>", "quote": "<the record's exact words>",
             "status": "current|temporary|proposed|removed"}}]}}
Copy each quote character for character from the record. Answer {{"feeds": []}} if there are none."""

ReadModel = Callable[[str], str | None]  # prompt -> answer text, or None when the model is unavailable


class ModelUnavailable(RuntimeError):
    pass


def nemotron(prompt: str) -> str | None:
    try:
        text, _, _ = llm.chat(
            [{"role": "user", "content": prompt}], model=MODEL, temperature=0, max_tokens=1024, tag="extract"
        )
    except RuntimeError:  # API down and nothing recorded
        return None
    return text


@dataclass
class ModelRead:
    claims: list[Claim]
    rejected: list[Rejection]
    stats: dict = field(default_factory=dict)


def _feeds(text: str | None) -> list[dict] | None:
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        return None
    try:
        feeds = json.loads(m.group(0)).get("feeds")
    except (json.JSONDecodeError, AttributeError):
        return None
    return [f for f in feeds if isinstance(f, dict)] if isinstance(feeds, list) else None


def _states_feed(facility: Facility, quote: str, consumer: str, supplier: str) -> bool:
    """True if the quote, read with the rules' grammar, says consumer is fed from supplier. Names the rules cannot
    place may resolve to the claimed pair, but only through the guarded fallback (the node's own suffix in the
    phrase), so a sentence that merely mentions both, or states a different feed, does not count."""

    def pair_only(phrase: str, _sentence: str) -> str | None:
        words = {w.lower() for w in re.findall(r"[A-Za-z0-9]+", phrase)}
        hits = [n for n in (consumer, supplier) if _type_words(facility, n) & words]
        return hits[0] if len(hits) == 1 else None

    resolver = Resolver(facility, pair_only)
    claims, _ = extract(Doc("quote", "", "", "", quote), resolver)
    return any((c.consumer, c.supplier) == (consumer, supplier) for c in claims)


def _type_words(facility: Facility, nid: str) -> set[str]:
    return {w for phrase in TYPE_WORDS.get(facility.by_id()[nid].type, []) for w in phrase.split()}


def _judge(f: dict, doc: Doc, facility: Facility) -> Claim | tuple[str, str]:
    """The claim if it passes the checks, else (rejection kind, reason)."""
    ids = facility.by_id()
    consumer, supplier = str(f.get("consumer", "")), str(f.get("supplier", ""))
    quote, status = str(f.get("quote", "")), str(f.get("status", "current")).lower()
    squash = lambda t: " ".join(t.split())
    if consumer not in ids or supplier not in ids or consumer == supplier:
        return "unknown_node", f"{consumer} ← {supplier} is not a pair of inventory items"
    if not quote.strip() or squash(quote) not in squash(doc.text):
        return "not_verbatim", "quote not found word for word in the record"
    if not _states_feed(facility, quote, consumer, supplier):
        return "wrong_pair", f"the quote does not say {consumer} is fed from {supplier}"
    ctx = quote_context(doc, quote)
    current, planned, reason = modality(*ctx) if ctx else (True, False, "")
    if current and status in ("temporary", "proposed", "removed"):
        current, reason = False, f"Nemotron read it as {status}"
    return Claim(
        consumer, supplier, doc.id, doc.date, doc.kind, quote, current, planned, reason, extractor="nemotron-read"
    )


def read_records(facility: Facility, docs: list[Doc], model: ReadModel = nemotron) -> ModelRead:
    inventory = "\n".join(f"{n.id}: {n.label}" for n in facility.nodes)
    claims: list[Claim] = []
    rejected: list[Rejection] = []
    counts: Counter[str] = Counter()
    answered = 0
    t0 = time.time()
    for doc in docs:
        prompt = PROMPT.format(inventory=inventory, doc_id=doc.id, kind=doc.kind, date=doc.date, text=doc.text)
        feeds = _feeds(model(prompt))
        if feeds is None:
            continue
        answered += 1
        for f in feeds:
            counts["proposed"] += 1
            verdict = _judge(f, doc, facility)
            if isinstance(verdict, Claim):
                counts["kept" if verdict.current else "set_aside"] += 1
                claims.append(verdict)
            else:
                kind, why = verdict
                counts[kind] += 1
                rejected.append(Rejection(doc.id, str(f.get("quote", "")), f"Nemotron: {why}"))
    if docs and answered == 0:
        raise ModelUnavailable("Nemotron unavailable and nothing recorded for these records")
    stats = {
        "model": MODEL,
        "records": len(docs),
        "answered": answered,
        "proposed": counts["proposed"],
        "kept": counts["kept"],
        "set_aside": counts["set_aside"],
        "rejected": {k: counts[k] for k in ("unknown_node", "not_verbatim", "wrong_pair")},
        "seconds": round(time.time() - t0, 1),
    }
    return ModelRead(claims, rejected, stats)
