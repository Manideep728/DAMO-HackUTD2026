# legacy/

The old guard. `services.cfg`, `commands.cfg`, `contacts.cfg`, `hosts.cfg` are real Nagios Core config for one check, `check_rack_inlet`, as a typical site would run it (thresholds 27/32 °C, retries 3, paging on w,u,c,r).

**Declared drift (ours, on purpose):** D10 is still in the hostgroup though decommissioned 2024-03-18; D11 is active but not monitored; contact `rkowalski@` is not on `oncall_roster.csv`. Every real site has some of this; it is what the audit cross-checks find.

**Plugin.** The verifier runs whatever binary `LEGACY_PLUGIN` points at and only looks at its exit code. On the demo machine use the real one:

    sudo apt install monitoring-plugins-basic
    export LEGACY_PLUGIN=/usr/lib/nagios/plugins/check_snmp   # GPL-3, monitoring-plugins.org, v2.3+

`check_snmp` in this folder is a stand-in with the same threshold semantics (Monitoring Plugins range syntax: a bare `27` means "outside 0..27", `@` inverts, `~` is unbounded) for machines without net-snmp. It is labelled as such in the UI's mode badge.
