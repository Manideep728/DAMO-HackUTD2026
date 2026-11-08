# Copy the exact IDs from https://build.nvidia.com (Nemotron models). These change; don't trust memory.
import os
SUPER = os.getenv("NEMOTRON_SUPER", "nvidia/llama-3.3-nemotron-super-49b-v1")
NANO = os.getenv("NEMOTRON_NANO", "nvidia/llama-3.1-nemotron-nano-8b-v1")
