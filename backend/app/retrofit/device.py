"""SYNTHETIC CDU device simulator: the physical world the integration is tested against.

It holds physical state (temperatures, flow, which drip trays are wet, run state) and serves it as raw registers
encoded with the vendor point list of the firmware it runs. Which leak cable runs under which rack is a physical
fact passed in by the caller (the drawing, or an engineer's field-verified decision), never read from the config.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .inputs import Site, VendorPoint


@dataclass
class Physical:
    state: str = "running"  # a vendor state label for this firmware
    sec_supply: float = 32.0
    sec_return: float = 40.0
    sec_flow: float = 240.0
    fw_supply: float = 18.0
    fw_return: float = 24.0
    wet: set[str] = field(default_factory=set)  # locations whose drip tray is wet
    setpoint: float = 32.0
    control_source: str = "remote"


class Device:
    def __init__(self, site: Site, firmware: str, zones: dict[int, str]):
        self.points = site.vendor_points[firmware]
        self.firmware = firmware
        self.zones = zones  # zone number -> physical location
        self.phys = Physical()
        self.comm_ok = True

    def point(self, description_start: str) -> VendorPoint:
        return next(p for p in self.points.values() if p.description.startswith(description_start))

    def zone_point(self, zone: int) -> VendorPoint:
        return next(p for p in self.points.values() if p.type == "bool" and p.zone == zone)

    def leak(self, location: str, wet: bool = True) -> None:
        if location not in self.zones.values():
            raise KeyError(f"no leak cable at {location}")
        (self.phys.wet.add if wet else self.phys.wet.discard)(location)

    def registers(self) -> dict[int, int] | None:
        """One poll. None when communication is lost."""
        if not self.comm_ok:
            return None
        p = self.phys
        regs: dict[int, int] = {}
        state = self.point("Unit run state")
        regs[state.register] = next(k for k, v in state.enum.items() if v == p.state)
        for desc, value in (
            ("Secondary (rack-facing) coolant supply", p.sec_supply),
            ("Secondary (rack-facing) coolant return", p.sec_return),
            ("Secondary coolant flow", p.sec_flow),
            ("Facility (primary) water supply", p.fw_supply),
            ("Facility (primary) water return", p.fw_return),
            ("Secondary supply temperature setpoint", p.setpoint),
        ):
            pt = self.point(desc)
            regs[pt.register] = round(value / (pt.scale or 1))
        src = self.point("Who owns the supply setpoint")
        regs[src.register] = next(
            k for k, v in src.enum.items() if v == ("local" if p.control_source != "remote" else "remote")
        )
        for zone, location in self.zones.items():
            regs[self.zone_point(zone).register] = int(location in p.wet)
        return regs
