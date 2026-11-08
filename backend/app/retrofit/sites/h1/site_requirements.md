# Site requirements: hall H1 liquid row R3 (SYNTHETIC)

Constructed for the demo. Approved by the (fictional) site engineering review on 2026-10-28. The prose is for
people; the YAML block at the end is the machine-readable copy the test oracle reads. Both say the same thing.

## Approved responses

- **Leak at a rack:** close that rack's secondary isolation valve and notify Facilities. Do not shut down the CDU:
  the other rack on the loop keeps its cooling.
- **Leak inside the CDU cabinet (zone 1):** notify Facilities only. The CDU's own controller handles its protection.
- Never act on a leak signal that arrives on stale telemetry; report missing visibility instead.

## Operating limits

- Secondary coolant flow: at least 200 L/min with both racks loaded (design 240 L/min).
- Secondary supply temperature: 30–36 °C. Above 36 °C the GPUs start to throttle.
- Remote setpoint requests: accept only 30–35 °C.

## Fallback

If the remote setpoint source stops sending its heartbeat for 60 s, the CDU returns to local control at 32 °C and
the integration reports `control_source = local_fallback`.

## Ownership

| Scope | Owner |
|---|---|
| CDU-1, facility water, secondary loop, valves, leak cables | Facilities |
| GPU racks R3-01/R3-02 and the training workload | IT (GPU platform) |
| Secondary loop water chemistry | **TBD** (Facilities or the CDU vendor) |
| CDU firmware updates | **TBD** (Facilities or IT) |

## Field acceptance (must be witnessed on site; a simulation never closes these)

- FC-1 Wet test, leak zone 1 (CDU cabinet)
- FC-2 Wet test, leak zone 2
- FC-3 Wet test, leak zone 3
- FC-4 Valve stroke test V-R3-01
- FC-5 Valve stroke test V-R3-02
- FC-6 Secondary flow at design (240 L/min) with both racks loaded
- FC-7 Communications cable pull: integration reports stale within 30 s and recovers

## Runbook RB-LC-2: low secondary flow

1. Confirm the reading: compare CDU flow with secondary ΔT and rack inlet/GPU temperatures.
2. Check the secondary strainer differential and the last strainer maintenance note.
3. Check both CDU pumps are running and at commanded speed.
4. Facilities owns loop checks; IT owns the workload-impact assessment and any workload moves.
5. Close only when flow and supply temperature are back in limits **and** the job's progress is back to baseline,
   both held for 15 minutes.

```yaml
site: h1
leak_response:
  rack: {close: rack_isolation_valve, notify: Facilities, shutdown_cdu: false}
  cdu_cabinet: {notify: Facilities, shutdown_cdu: false}
limits:
  min_secondary_flow_lpm: 200
  design_secondary_flow_lpm: 240
  secondary_supply_c: [30, 36]
  setpoint_request_c: [30, 35]
fallback:
  heartbeat_timeout_s: 60
  setpoint_c: 32
owners:
  facilities: Facilities
  it: IT (GPU platform)
  unresolved: [Secondary loop water chemistry, CDU firmware updates]
field_checks:
  FC-1: Wet test, leak zone 1 (CDU cabinet)
  FC-2: Wet test, leak zone 2
  FC-3: Wet test, leak zone 3
  FC-4: Valve stroke test V-R3-01
  FC-5: Valve stroke test V-R3-02
  FC-6: Secondary flow at design (240 L/min) with both racks loaded
  FC-7: "Communications cable pull: integration reports stale within 30 s and recovers"
recovery_window_min: 15
job_recovered_fraction: 0.95
```
