"""Acceptance scenarios as minute-by-minute BMC responses for one asset.

Each minute holds what the BMC's Thermal endpoint returns:
  "OK" | "Warning" | "Critical"  -> Temperatures[] with that Status.Health
  None                           -> temperature feed lost (Temperatures is empty)
Fan RPM is tracked separately for the early-warning case.
"""
from dataclasses import dataclass, field

ASSET = {"asset_id": "hpc-c2", "host": "Compute2", "rack": "R1-03 · U16", "owner": "HPC Ops"}
OWNERS = {"HPC Ops": {"receiver": "hpc-ops-primary", "primary": "Luis O.", "fallback": "Priya N."},
          "Platform": {"receiver": "platform-primary", "primary": "Dev K.", "fallback": "Priya N."}}


@dataclass
class Scenario:
    id: str
    name: str
    description: str
    timeline: list            # BMC thermal health per minute
    fan_rpm: list = field(default_factory=list)  # per minute; empty = all fans normal
    owner: str = "HPC Ops"
    held_out: bool = False
    early_warning: bool = False  # tests the intentional fan early-warning rule


def _t(*parts):
    out = []
    for value, minutes in parts:
        out += [value] * minutes
    return out


SCENARIOS = [
    Scenario("normal", "Normal", "All sensors Health OK for 40 min", _t(("OK", 40))),
    Scenario("sustained", "Sustained Critical", "CPU1 Temp Health Critical from minute 5 to 30", _t(("OK", 5), ("Critical", 25), ("OK", 10))),
    Scenario("spike", "Brief spike", "Critical for 2 min at minute 6, then OK", _t(("OK", 6), ("Critical", 2), ("OK", 32))),
    Scenario("missing", "Missing temperature feed", "Thermal returns no temperatures from minute 5 to 30", _t(("OK", 5), (None, 25), ("OK", 10))),
    Scenario("recovery", "Recovery", "Critical from minute 5 to 15, then OK", _t(("OK", 5), ("Critical", 10), ("OK", 25))),
    Scenario("early", "Fan stops before heat", "Fan 4 drops to 0 RPM at minute 4; CPU Health goes Critical at minute 9",
             _t(("OK", 9), ("Critical", 21), ("OK", 10)), fan_rpm=_t((9400, 4), (0, 26), (9400, 10)), early_warning=True),
    # Held-out: expectations fixed before generation; the agent only ever sees pass/fail counts.
    Scenario("h-escalate", "Warning escalates to Critical", "Warning from minute 5, Critical from minute 15 to 30", _t(("OK", 5), ("Warning", 10), ("Critical", 15), ("OK", 10)), held_out=True),
    Scenario("h-flap", "Feed flaps every 2 min", "Feed lost and restored every 2 min from minute 5 to 25", _t(("OK", 5), *[(None, 2), ("OK", 2)] * 5, ("OK", 15)), held_out=True),
    Scenario("h-platform", "Platform-owned asset", "Sustained Critical on a Platform-owned asset", _t(("OK", 5), ("Critical", 20), ("OK", 10)), owner="Platform", held_out=True),
]

BY_ID = {s.id: s for s in SCENARIOS}
