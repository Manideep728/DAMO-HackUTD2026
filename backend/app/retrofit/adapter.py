"""The integration under test: raw CDU registers + mapping config → synthetic contract messages.

Stateful, like a real adapter: it tracks freshness (stale after max_age_s without a sample, good again only after
recovery_samples fresh samples in a row), raises leak events only on good data, carries out the configured leak
response, validates setpoint requests and falls back to local control when the remote source goes quiet. Every
behavior comes from the mapping config, so a wrong config produces wrong messages; the oracle catches them.
"""

from __future__ import annotations

from .contract import (
    CduState,
    CduTelemetry,
    ControlResult,
    ControlStatus,
    LeakEvent,
    LoopReading,
    Quality,
    ResponseAction,
)
from .inputs import Site
from .mapping import Mapping

Msg = CduTelemetry | LeakEvent | ResponseAction | ControlResult | ControlStatus


class Adapter:
    def __init__(self, mapping: Mapping, site: Site):
        self.m = mapping
        self.site = site
        self.points = site.vendor_points[mapping.device.firmware]
        self.quality = Quality.good
        self.last_sample: int | None = None
        self.fresh_run = 0
        self.leaks: dict[str, bool] = {z.point: False for z in mapping.leak_zones}
        self.last_heartbeat: int | None = None
        self.control_source = "remote"

    def _value(self, regs: dict[int, int], point: str) -> float | None:
        p = self.points.get(point)
        if p is None or p.register not in regs:
            return None
        return regs[p.register] * (p.scale or 1)

    def _state(self, regs: dict[int, int]) -> CduState | None:
        p = self.points.get(self.m.telemetry.get("state", ""))
        if p is None or p.register not in regs:
            return None
        label = p.enum.get(regs[p.register])
        ours = self.m.state_map.get(label or "")
        return CduState(ours) if ours is not None and ours in CduState.__members__ else None

    def _loop(self, regs: dict[int, int], loop: str) -> LoopReading:
        t = self.m.telemetry
        return LoopReading(
            supply_temp_c=self._value(regs, t.get(f"{loop}.supply_temp_c", "")),
            return_temp_c=self._value(regs, t.get(f"{loop}.return_temp_c", "")),
            flow_lpm=self._value(regs, t.get(f"{loop}.flow_lpm", "")),
        )

    def heartbeat(self, t: int) -> None:
        """The remote setpoint source says it is alive."""
        self.last_heartbeat = t

    def request(self, t: int, request_id: str, setpoint_c: float, write: dict[str, float]) -> ControlResult:
        lo, hi = self.m.control.approved_range_c
        if not lo <= setpoint_c <= hi:
            return ControlResult(
                t=t,
                request_id=request_id,
                accepted=False,
                setpoint_c=setpoint_c,
                reason=f"outside the approved range {lo:g}-{hi:g} °C",
            )
        write["setpoint"] = setpoint_c
        return ControlResult(t=t, request_id=request_id, accepted=True, setpoint_c=setpoint_c, reason="within range")

    def poll(self, t: int, regs: dict[int, int] | None, write: dict[str, float]) -> list[Msg]:
        out: list[Msg] = []
        dev, site = self.m.device.id, self.m.site
        if regs is None:
            if self.last_sample is not None and t - self.last_sample > self.m.freshness.max_age_s:
                self.quality, self.fresh_run = Quality.stale, 0
            if self.quality == Quality.stale:
                out.append(CduTelemetry(site=site, cdu_id=dev, t=t, quality=Quality.stale))
        else:
            self.last_sample = t
            if self.quality != Quality.good:
                self.fresh_run += 1
                self.quality = (
                    Quality.good if self.fresh_run >= self.m.freshness.recovery_samples else Quality.recovering
                )
            state = self._state(regs)
            out.append(
                CduTelemetry(
                    site=site,
                    cdu_id=dev,
                    t=t,
                    quality=self.quality,
                    state=state,
                    available_backup=state is not None and state.value in self.m.availability.backup_when,
                    primary=self._loop(regs, "primary"),
                    secondary=self._loop(regs, "secondary"),
                )
            )
            if self.quality == Quality.good:
                out += self._leaks(t, regs)
        out += self._fallback(t, write)
        return out

    def _leaks(self, t: int, regs: dict[int, int]) -> list[Msg]:
        out: list[Msg] = []
        for z in self.m.leak_zones:
            wet = self._value(regs, z.point)
            if wet is None or bool(wet) == self.leaks[z.point]:
                continue
            self.leaks[z.point] = bool(wet)
            zone = self.points[z.point].zone or 0
            out.append(
                LeakEvent(
                    site=self.m.site, cdu_id=self.m.device.id, t=t, zone=zone, location=z.location, active=bool(wet)
                )
            )
            if not wet:
                continue
            valve = self.m.valves.get(z.location)
            if self.m.leak_response.close_rack_valve and valve:
                out.append(ResponseAction(t=t, action="close_valve", target=valve, reason=f"leak zone {zone}"))
            out.append(
                ResponseAction(
                    t=t, action="notify", target=self.m.leak_response.notify, reason=f"leak zone {zone} at {z.location}"
                )
            )
        return out

    def _fallback(self, t: int, write: dict[str, float]) -> list[Msg]:
        if self.control_source != "remote" or self.last_heartbeat is None:
            return []
        if t - self.last_heartbeat <= self.m.control.heartbeat_timeout_s:
            return []
        self.control_source = "local_fallback"
        write["setpoint"] = self.m.control.fallback_setpoint_c
        return [ControlStatus(t=t, control_source="local_fallback", setpoint_c=self.m.control.fallback_setpoint_c)]
