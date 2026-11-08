"""Nemotron as the last step of name resolution in discovery.

Only phrases that aliases and the typo-tolerant match could not place reach the model. The answer is a node id
or null; discovery keeps it only if the node exists and the phrase carries that node's suffix, and the claim's
quote is still checked verbatim. Responses are cached like every other model call, so offline runs replay them
and with no key and no recording the fallback simply resolves nothing.
"""

from __future__ import annotations

import json
import os
import re

from engine.model import Facility

from .. import llm
from ..models import SUPER

MODEL = os.getenv("NEMOTRON_MODEL") or SUPER

PROMPT = """You map equipment names in data center maintenance records to inventory ids.
Inventory (id: label):
{inventory}

Record sentence: "{sentence}"
Phrase: "{phrase}"

Which single inventory id does the phrase name? Answer with JSON only: {{"node": "<id>"}} or {{"node": null}} if
it names none of them or more than one could fit."""


def nemotron_resolver(facility: Facility):
    inventory = "\n".join(f"{n.id}: {n.label}" for n in facility.nodes)

    def resolve(phrase: str, sentence: str) -> str | None:
        content = PROMPT.format(inventory=inventory, sentence=sentence, phrase=phrase)
        try:
            text, _, _ = llm.chat(
                [{"role": "user", "content": content}], model=MODEL, temperature=0, max_tokens=64, tag="resolve"
            )
        except RuntimeError:  # model unavailable and nothing recorded
            return None
        m = re.search(r"\{.*?\}", text or "", re.S)
        try:
            node = json.loads(m.group(0)).get("node") if m else None
        except json.JSONDecodeError:
            return None
        return node if isinstance(node, str) else None

    return resolve
