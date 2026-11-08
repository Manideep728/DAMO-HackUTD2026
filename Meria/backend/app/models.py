# Copy the exact IDs from https://build.nvidia.com (Nemotron models). These change; don't trust memory.
import os, re
SUPER = os.getenv("NEMOTRON_SUPER") or "nvidia/llama-3.3-nemotron-super-49b-v1"
NANO = os.getenv("NEMOTRON_NANO") or "nvidia/llama-3.1-nemotron-nano-8b-v1"


def has_key():
    """True only for a real-looking key, not the .env.example placeholder."""
    return bool(re.fullmatch(r"nvapi-[A-Za-z0-9_\-]{20,}", os.getenv("NVIDIA_API_KEY", "").strip()))
