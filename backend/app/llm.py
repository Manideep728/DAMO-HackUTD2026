import os, json, hashlib, time, pathlib, re
from .models import SUPER, NANO, has_key
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
    if MODE != "mock" and (MODE == "cached" or not has_key()) and p.exists():
        d = json.loads(p.read_text()); return d["text"], "cached", d.get("ms", 0)
    if MODE == "live" and has_key():
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


BASE_URL = os.getenv("NVIDIA_BASE_URL") or "https://integrate.api.nvidia.com/v1"


def chat_tools(messages, tools, *, model=SUPER, temperature=0.1, max_tokens=2048, tag="agent"):
    """One tool-calling turn. Returns the assistant message as a dict (content, tool_calls).

    Cached like chat(); in cached mode a missing recording raises so the caller can fall back.
    AGENT_RECORDINGS points the recordings at another directory (the eval's committed replay set)."""
    k = _key(model, [messages, tools])
    p = pathlib.Path(os.getenv("AGENT_RECORDINGS") or CACHE / tag) / f"{k}.json"
    if MODE == "cached" or not has_key():
        if p.exists():
            return json.loads(p.read_text())["message"]
        raise RuntimeError("no recorded response for this agent turn")
    import openai
    c = openai.OpenAI(base_url=BASE_URL, api_key=os.environ["NVIDIA_API_KEY"])
    transient = (openai.RateLimitError, openai.APITimeoutError, openai.APIConnectionError, openai.InternalServerError)
    for attempt in range(3):
        try:
            r = c.chat.completions.create(model=model, messages=messages, tools=tools, tool_choice="auto",
                                          temperature=temperature, max_tokens=max_tokens, timeout=60)
            break
        except transient:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    m = r.choices[0].message
    msg = {"content": m.content or "", "tool_calls": [
        {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
        for tc in (m.tool_calls or [])]}
    p.parent.mkdir(parents=True, exist_ok=True); p.write_text(json.dumps({"model": model, "message": msg, "at": time.time()}))
    return msg
