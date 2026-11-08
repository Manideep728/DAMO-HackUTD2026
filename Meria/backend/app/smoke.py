"""python -m app.smoke : one Super call, one Nano call, prints latency. Run this before anything else."""
from . import llm; from .models import SUPER, NANO
for m in (SUPER, NANO):
    t, mode, ms = llm.chat([{"role": "user", "content": "Reply with the single word: ready"}], model=m, max_tokens=5, tag="smoke")
    print(f"{m}: {mode} {ms} ms -> {t!r}")
