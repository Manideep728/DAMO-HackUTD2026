import type { LegacyCheck } from '../data/types';

export const checks: LegacyCheck[] = [
  { id: 'check_rack_inlet', name: 'check_rack_inlet', plugin: 'check_snmp', watches: 'Inlet °C · 39 racks', stage: 'audit', findings: { total: 0, accepted: 0 }, openCounterexamples: 0 },
  { id: 'check_cu_status', name: 'check_cu_status', plugin: 'check_snmp', watches: 'Cooling unit running flag · 4 units', stage: 'signed_off', findings: { total: 1, accepted: 1 }, coverage: { done: 3, total: 3 }, traces: { done: 500, total: 500 }, openCounterexamples: 0 },
  { id: 'check_pdu_load', name: 'check_pdu_load', plugin: 'check_snmp', watches: 'PDU load % · 8 PDUs', stage: 'parallel_run', findings: { total: 2, accepted: 1 }, coverage: { done: 1001, total: 1001 }, traces: { done: 312, total: 500 }, openCounterexamples: 0 },
  { id: 'check_ups_battery', name: 'check_ups_battery', plugin: 'check_apc (Perl)', watches: 'UPS charge % · 2 units', stage: 'blocked', findings: { total: 1, accepted: 0 }, coverage: { done: 101, total: 101 }, traces: { done: 497, total: 500 }, openCounterexamples: 1, blockedReason: '1 counterexample: trace #212, flapping at 20%' },
  { id: 'check_rack_inlet_d10', name: 'check_rack_inlet_d10', plugin: 'check_snmp', watches: 'Inlet °C · D10', stage: 'drop', openCounterexamples: 0, dropReason: 'D10 not in inventory since 2024-03' },
  { id: 'check_room_humidity', name: 'check_room_humidity', plugin: 'check_snmp', watches: 'Relative humidity % · 4 sensors', stage: 'audit', openCounterexamples: 0 },
];
