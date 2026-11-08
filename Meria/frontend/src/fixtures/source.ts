import type { SourceFile } from '../data/types';

export const legacySource: Record<string, SourceFile[]> = {
  check_rack_inlet: [
    {
      file: 'services.cfg',
      text: `define service {
    use                     generic-service
    hostgroup_name          hall1-racks
    service_description     Inlet
    check_command           check_rack_inlet!27!32
    check_interval          1
    retry_interval          1
    max_check_attempts      3
    notification_interval   3
    notification_options    w,u,c,r
    contact_groups          facilities
    ; added 2014-06 by rk, do not change thresholds without DC lead sign-off
}
`,
    },
    {
      file: 'commands.cfg',
      text: `define command {
    command_name    check_rack_inlet
    command_line    $USER1$/check_snmp -H $HOSTADDRESS$ -C $USER3$ -P 2c \\
                    -o .1.3.6.1.4.1.52100.1.2.1.1.4.$_HOSTRACKIDX$ \\
                    -w $ARG1$ -c $ARG2$ -u 'C' -l 'Inlet' -t 10
}
`,
    },
    {
      file: 'contacts.cfg',
      text: `define contact {
    contact_name                    rkowalski
    alias                           Rob Kowalski
    email                           rkowalski@northmark.example
    service_notification_period     24x7
    service_notification_options    w,u,c,r
    service_notification_commands   notify-service-by-email
}

define contactgroup {
    contactgroup_name   facilities
    members             rkowalski
}
`,
    },
    {
      file: 'hosts.cfg',
      text: `define hostgroup {
    hostgroup_name  hall1-racks
    members         A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,B1,B2,B3,B4,B5,B6,B7,B8,B9,B10,C1,C2,C3,C4,C5,C6,C7,C8,C9,C10,D1,D2,D3,D4,D5,D6,D7,D8,D9,D10
}
`,
    },
    {
      file: 'inventory.csv',
      text: `rack,row,status,pdu,cooling_unit,gpu,decommissioned_on
A1,A,active,PDU A-1,CU-A,no,
A4,A,active,PDU A-1,CU-A,no,
B6,B,active,PDU B-2,CU-B,no,
B7,B,active,PDU B-2,CU-B,no,
B8,B,active,PDU B-2,CU-B,no,
D6,D,active,PDU D-2,CU-D,yes,
D7,D,active,PDU D-2,CU-D,yes,
D8,D,active,PDU D-2,CU-D,yes,
D10,D,decommissioned,,,no,2024-03-18
D11,D,active,PDU D-2,CU-D,yes,
`,
    },
    {
      file: 'oncall_roster.csv',
      text: `name,role,shift,email,phone
Luis Ortega,facilities tech,night,luis.ortega@northmark.example,+1-555-0142
Maya Rivera,operator,night,maya.rivera@northmark.example,+1-555-0117
Dev Kapoor,shift lead,day,dev.kapoor@northmark.example,+1-555-0163
Priya Shah,thermal engineer,day,priya.shah@northmark.example,+1-555-0188
`,
    },
  ],
};

export const rulesYaml = `groups:
  - name: check_rack_inlet            # replaces Nagios service "Inlet" on 39 racks
    rules:
      - alert: RackInletWarning
        expr: rack_inlet_celsius > 27 or rack_inlet_celsius < 0   # Nagios range "27" = outside 0..27
        for: 2m                                                   # max_check_attempts=3, retry_interval=1m
        labels: { severity: warning, replaces: "services.cfg:5 -w 27", kind: must-keep }
      - alert: RackInletCritical
        expr: rack_inlet_celsius > 32 or rack_inlet_celsius < 0
        for: 2m
        labels: { severity: critical, replaces: "services.cfg:5 -c 32", kind: must-keep }
      - alert: RackInletUnknown
        expr: rack_inlet_read_ok == 0                             # SNMP timeout -> UNKNOWN
        for: 2m
        labels: { severity: warning, replaces: "services.cfg:9 notification_options u", kind: must-keep }
      - alert: RackInletSensorFault
        expr: abs(rack_inlet_celsius - rack_inlet_neighbour_estimate) > 5
        for: 10m
        labels: { severity: warning, found_by: "finding:1 B7 sensor faulty", kind: improvement }
      - alert: CoolingEffectivenessLow
        expr: cooling_per_kw / cooling_per_kw offset 7d < 0.9
        labels: { severity: warning, found_by: "finding:2 CU-B losing effectiveness", kind: improvement }
`;

export const oneShotYaml = `groups:
  - name: rack_inlet
    rules:
      - alert: RackInletWarning
        expr: rack_inlet_celsius > 27
        labels: { severity: warning }
      - alert: RackInletCritical
        expr: rack_inlet_celsius > 32
        labels: { severity: critical }
`;
