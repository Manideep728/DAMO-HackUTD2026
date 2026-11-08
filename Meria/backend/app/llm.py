import os, json, hashlib, time, pathlib, re
from .models import SUPER, NANO
CACHE = pathlib.Path(__file__).resolve().parent.parent / "cache"
MODE = os.getenv("GAUNTLET_MODE", "live")  # live | cached | mock
_client = None
def client():
    global _client
    if _client is None:
        from openai import OpenAI
        _client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=os.environ["NVIDIA_API_KEY"])
    return _client
def _key(model, messages): return hashlib.sha256(json.dumps([model, messages], sort_keys=True).encode()).hexdigest()[:24]
def chat(messages, *, model=NANO, temperature=0.2, max_tokens=2048, tag="call"):
    """Returns (text, mode, ms). Caches every live response; serves cache in cached mode or on any error."""
    k = _key(model, messages); p = CACHE / tag / f"{k}.json"
    if MODE != "mock" and (MODE == "cached" or not os.getenv("NVIDIA_API_KEY")) and p.exists():
        d = json.loads(p.read_text()); return d["text"], "cached", d.get("ms", 0)
    if MODE == "live" and os.getenv("NVIDIA_API_KEY"):
        for attempt in range(3):
            try:
                t0 = time.time()
                r = client().chat.completions.create(model=model, messages=messages, temperature=temperature, max_tokens=max_tokens, timeout=20)
                text = r.choices[0].message.content or ""; ms = int((time.time() - t0) * 1000)
                p.parent.mkdir(parents=True, exist_ok=True); p.write_text(json.dumps({"model": model, "text": text, "ms": ms, "at": time.time()}))
                return text, "live", ms
            except Exception as e:  # 429/5xx/timeout: back off, then fall through to cache
                time.sleep(1.5 * (attempt + 1)); err = e
        if p.exists(): d = json.loads(p.read_text()); return d["text"], "cached", d.get("ms", 0)
        raise RuntimeError(f"Nemotron unavailable and no cache: {err}")
    if p.exists(): d = json.loads(p.read_text()); return d["text"], "cached", d.get("ms", 0)
    return None, "mock", 0
def json_block(text):
    m = re.search(r"\{.*\}", text or "", re.S)
    return json.loads(m.group(0)) if m else None
def prompt(name): return (pathlib.Path(__file__).parent / "prompts" / f"{name}.md").read_text()
