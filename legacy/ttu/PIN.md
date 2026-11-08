# Vendored legacy inputs (TTU Nagios–Redfish)

- Source: https://github.com/nsfcac/Nagios-Redfish-API-Integration
- Pinned commit: `d55eadf9ff05ee5a0ce7a077880da440ac3117d2` (master, fetched 2026-11-08)
- License: BSD-3-Clause (see `LICENSE`). Authors: Texas Tech University HPCC and Dell Inc.
- Files are byte-for-byte copies. Nothing here is modified; the harness runs `redfishplugins/check_temperature.sh` as shipped.

Referenced by the shipped config but **not** in the repo (shown as gaps in M1): `check_*_health.py`, `check_storage.sh`,
`check_cpuload.sh`, `check_memoryusage.sh`, the `check-host-alive` command, `resource.cfg` and the `nagios.cfg` service timeout.
