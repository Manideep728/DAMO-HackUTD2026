"""Modernization harness and operations engine for the TTU Nagios–Redfish temperature check."""
import pathlib

BACKEND = pathlib.Path(__file__).resolve().parents[2]
ROOT = BACKEND.parent
LEGACY = ROOT / "legacy" / "ttu"
BIN = BACKEND / "bin"
CANDIDATES = pathlib.Path(__file__).resolve().parent / "candidates"
WORK = BACKEND / ".work"
