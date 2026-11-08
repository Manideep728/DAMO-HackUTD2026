"""Load a site's retrofit inputs and check them against their sha256 pins.

Every input is a SYNTHETIC file under `sites/<site>/`. `PIN.json` records the sha256 of each one; loading a site
whose files no longer match fails loudly, so tests and expectations always run against the inputs they were
written for. Re-pin after an intentional change with `python -m app.retrofit.inputs --pin <site>`.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from . import SITES

PINNED = (
    "existing_bms_points.csv",
    "rack_inventory.csv",
    "cooling_topology.csv",
    "site_requirements.md",
    "logbook.csv",
    "rack_drawing.txt",
    "config/original/mapping.yaml",
)
VENDOR_GLOB = "cdu_vendor_points@*.csv"
ZONE_NOTE = re.compile(r"zone (\d+) sensing cable (?:is inside|runs beneath) the (\S+)")
YAML_BLOCK = re.compile(r"```yaml\n(.*?)```", re.S)


class PinMismatch(RuntimeError):
    pass


@dataclass(frozen=True)
class VendorPoint:
    point: str
    register: int
    type: str
    units: str
    scale: float | None
    enum: dict[int, str]
    description: str

    @property
    def zone(self) -> int | None:
        m = re.search(r"zone (\d+)", self.description)
        return int(m.group(1)) if m else None


@dataclass(frozen=True)
class DrawingNote:
    zone: int
    location: str
    quote: str  # the whole note sentence, verbatim from the drawing
    doc: str = "rack_drawing.txt"


@dataclass
class Site:
    id: str
    dir: Path
    inventory: list[dict[str, str]]
    topology: list[dict[str, str]]
    bms_points: list[dict[str, str]]
    logbook: list[dict[str, str]]
    requirements_text: str
    requirements: dict[str, Any]
    drawing_text: str
    drawing: list[DrawingNote]
    vendor_points: dict[str, dict[str, VendorPoint]] = field(default_factory=dict)  # firmware -> point -> spec

    def liquid_racks(self) -> list[str]:
        return [r["rack"] for r in self.inventory if r["cooling"] == "liquid"]

    def cdu(self) -> str:
        return next(r["component"] for r in self.topology if r["type"] == "cdu")

    def rack_valve(self, rack: str) -> str | None:
        return next((r["component"] for r in self.topology if r["type"] == "valve" and r["serves"] == rack), None)

    def valves(self) -> list[str]:
        return [r["component"] for r in self.topology if r["type"] == "valve"]

    def hall(self) -> str:
        return self.inventory[-1]["hall"]

    def file_text(self, name: str) -> str:
        return (self.dir / name).read_text()


def read_csv(text: str) -> list[dict[str, str]]:
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.startswith("#")]
    return list(csv.DictReader(io.StringIO("\n".join(lines))))


def parse_vendor_points(text: str) -> dict[str, VendorPoint]:
    out = {}
    for r in read_csv(text):
        enum = {int(k): v for k, v in (pair.split("=", 1) for pair in r["enum"].split(";") if pair)}
        out[r["point"]] = VendorPoint(
            r["point"],
            int(r["register"]),
            r["type"],
            r["units"],
            float(r["scale"]) if r["scale"] else None,
            enum,
            r["description"],
        )
    return out


def parse_drawing(text: str, doc: str = "rack_drawing.txt") -> list[DrawingNote]:
    notes = []
    for line in text.splitlines():
        m = ZONE_NOTE.search(line)
        if m:
            sentence = re.sub(r"^\s*\d+\.\s*", "", line).strip()
            notes.append(DrawingNote(int(m.group(1)), m.group(2), sentence, doc))
    return notes


def requirements_yaml(md: str) -> dict[str, Any]:
    m = YAML_BLOCK.search(md)
    if not m:
        raise ValueError("site_requirements.md has no ```yaml block")
    data = yaml.safe_load(m.group(1))
    if not isinstance(data, dict):
        raise ValueError("site_requirements.md yaml block must be a mapping")
    return data


def site_dir(site_id: str) -> Path:
    d = SITES / site_id
    if not re.fullmatch(r"[a-z0-9_-]+", site_id) or not d.is_dir():
        raise KeyError(f"unknown site {site_id}")
    return d


def pinned_files(d: Path) -> list[str]:
    return [*PINNED, *sorted(p.name for p in d.glob(VENDOR_GLOB))]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hashes(site_id: str) -> dict[str, str]:
    d = site_dir(site_id)
    return {name: sha256(d / name) for name in pinned_files(d)}


def verify_pins(site_id: str) -> None:
    pins = json.loads((site_dir(site_id) / "PIN.json").read_text())
    now = hashes(site_id)
    bad = sorted(k for k in set(pins) | set(now) if pins.get(k) != now.get(k))
    if bad:
        raise PinMismatch(f"site {site_id}: inputs changed since pinning: {', '.join(bad)}")


def load_site(site_id: str, verify: bool = True) -> Site:
    d = site_dir(site_id)
    if verify:
        verify_pins(site_id)
    req_text = (d / "site_requirements.md").read_text()
    drawing = (d / "rack_drawing.txt").read_text()
    return Site(
        id=site_id,
        dir=d,
        inventory=read_csv((d / "rack_inventory.csv").read_text()),
        topology=read_csv((d / "cooling_topology.csv").read_text()),
        bms_points=read_csv((d / "existing_bms_points.csv").read_text()),
        logbook=read_csv((d / "logbook.csv").read_text()),
        requirements_text=req_text,
        requirements=requirements_yaml(req_text),
        drawing_text=drawing,
        drawing=parse_drawing(drawing),
        vendor_points={
            p.stem.split("@", 1)[1]: parse_vendor_points(p.read_text()) for p in sorted(d.glob(VENDOR_GLOB))
        },
    )


def write_pins(site_id: str) -> dict[str, str]:
    pins = hashes(site_id)
    (site_dir(site_id) / "PIN.json").write_text(json.dumps(pins, indent=2) + "\n")
    return pins


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--pin":
        print(json.dumps(write_pins(sys.argv[2]), indent=2))
    else:
        print("usage: python -m app.retrofit.inputs --pin <site>")
