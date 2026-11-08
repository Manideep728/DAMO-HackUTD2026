"""Seeded noisy record generator for measuring discovery precision and recall.

For each sampled supply edge it writes a record in a random template with a random surface form of each name
(asset tag, tag without hyphen, lower-case label, type word plus suffix), sometimes with a typo. It also
writes red herrings: temporary connections that were removed and proposals that were never built.
"""

from __future__ import annotations

import random

from engine.model import Facility, Mode

from ..discovery import TYPE_WORDS, Doc

CURRENT = [
    "{c} is fed from {s}.",
    "Found {c} fed from {s} during PM.",
    "IR scan: {s} carrying {c}, no hot spots.",
    "Per panel schedule {c} is powered from {s}.",
]
HERRINGS = [
    "{c} was briefly powered from {s} on a temporary cable. Temporary cable removed the same day.",
    "Proposed: {c} would be fed from {s} after the next upgrade.",
]


def _typo(rnd: random.Random, word: str) -> str:
    if len(word) < 4:
        return word
    i = rnd.randrange(1, len(word) - 2)
    return word[:i] + word[i + 1] + word[i] + word[i + 2 :]


def _surface(rnd: random.Random, facility: Facility, nid: str, typo_rate: float) -> str:
    n = facility.by_id()[nid]
    suffix = nid.split("-")[-1]
    forms = [nid, nid.replace("-", ""), n.label.lower()] + [f"{w} {suffix}" for w in TYPE_WORDS.get(n.type, [])]
    form = rnd.choice(forms)
    if rnd.random() < typo_rate:
        words = form.split(" ")
        k = rnd.randrange(len(words))
        words[k] = _typo(rnd, words[k])
        form = " ".join(words)
    return form


def noisy_corpus(
    facility: Facility, seed: int = 0, n_edges: int = 60, n_herrings: int = 15, typo_rate: float = 0.15
) -> tuple[list[Doc], list[dict]]:
    rnd = random.Random(seed)
    edges = sorted(
        (n.id, s)
        for n in facility.nodes
        for g in n.requires
        if g.mode == Mode.capacity and g.resource.value == "power"
        for s in g.live_suppliers()
    )
    ids = [n.id for n in facility.nodes if n.requires or n.capacity > 0]
    chosen = rnd.sample(edges, min(n_edges, len(edges)))
    docs, labels = [], []
    for i, (c, s) in enumerate(chosen):
        text = rnd.choice(CURRENT).format(
            c=_surface(rnd, facility, c, typo_rate), s=_surface(rnd, facility, s, typo_rate)
        )
        docs.append(
            Doc(
                f"WO-{9000 + i}",
                rnd.choice(["work_order", "maintenance_log"]),
                f"2024-{rnd.randint(1, 12):02d}-15",
                "generated",
                text[0].upper() + text[1:],
            )
        )
        labels.append({"consumer": c, "supplier": s, "truth": True})
    existing = set(edges)
    for j in range(n_herrings):
        c, s = rnd.sample(ids, 2)
        if (c, s) in existing:
            continue
        text = rnd.choice(HERRINGS).format(c=_surface(rnd, facility, c, 0), s=_surface(rnd, facility, s, 0))
        docs.append(Doc(f"WO-{9500 + j}", "work_order", "2024-06-01", "generated", text))
        labels.append({"consumer": c, "supplier": s, "truth": False})
    return docs, labels
