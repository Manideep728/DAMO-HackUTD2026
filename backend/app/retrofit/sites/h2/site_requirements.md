# Site requirements: hall H7 row C liquid racks (SYNTHETIC)

Constructed for the demo as a second site: different names, mirrored layout, different limits. The YAML block is
the machine-readable copy the test oracle reads.

## Approved responses

- Leak at a rack: close that rack's secondary isolation valve and notify Facilities (H7). Do not shut down the CDU.
- Leak inside the CDU cabinet: notify Facilities (H7) only.

## Operating limits

- Secondary flow at least 180 L/min (design 220 L/min). Supply 28–34 °C. Remote setpoint requests 28–34 °C.

## Fallback

Remote setpoint heartbeat lost for 60 s: local control at 30 °C.

## Ownership

| Scope | Owner |
|---|---|
| CDU-07, loops, valves, leak cables | Facilities (H7) |
| Racks C-11/C-12 and workloads | IT (research cluster) |
| CDU firmware updates | **TBD** |

## Field acceptance (witnessed on site only)

- FC-1 Wet test, leak zone 1 (CDU cabinet)
- FC-2 Wet test, leak zone 2
- FC-3 Wet test, leak zone 3
- FC-4 Valve stroke test V-C-11
- FC-5 Valve stroke test V-C-12

```yaml
site: h2
leak_response:
  rack: {close: rack_isolation_valve, notify: Facilities (H7), shutdown_cdu: false}
  cdu_cabinet: {notify: Facilities (H7), shutdown_cdu: false}
limits:
  min_secondary_flow_lpm: 180
  design_secondary_flow_lpm: 220
  secondary_supply_c: [28, 34]
  setpoint_request_c: [28, 34]
fallback:
  heartbeat_timeout_s: 60
  setpoint_c: 30
owners:
  facilities: Facilities (H7)
  it: IT (research cluster)
  unresolved: [CDU firmware updates]
field_checks:
  FC-1: Wet test, leak zone 1 (CDU cabinet)
  FC-2: Wet test, leak zone 2
  FC-3: Wet test, leak zone 3
  FC-4: Valve stroke test V-C-11
  FC-5: Valve stroke test V-C-12
recovery_window_min: 15
job_recovered_fraction: 0.95
```
