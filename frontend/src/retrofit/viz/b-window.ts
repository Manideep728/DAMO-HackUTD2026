// Maintenance window for MOP-H1-R3-01 (minutes after midnight, Saturday).
export const T0 = 60, T1 = 300; // 01:00 to 05:00, minutes after midnight
export const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export interface Task { name: string; owner: string; s: number; e: number; hold?: string; abort?: string }
export const WINDOW: Task[] = [
  { name: 'Pre-checks', owner: 'Facilities', s: 60, e: 90, hold: 'H1', abort: 'Chiller headroom not confirmed: do not start' },
  { name: 'Close V-FW-1 branch isolation (CHW mains stay in service)', owner: 'Facilities', s: 90, e: 105 },
  { name: 'Hot-tap / connect CDU-1 primary', owner: 'Mechanical contractor', s: 105, e: 165 },
  { name: 'Fill & vent secondary TCS-1', owner: 'Mechanical contractor', s: 165, e: 210 },
  { name: 'Leak check: no drips for 15 min', owner: 'Facilities', s: 210, e: 225, hold: 'H2', abort: 'Any drip: roll back' },
  { name: 'Energise PNL-CDU, start CDU-1 pumps', owner: 'Facilities (electrical)', s: 225, e: 255 },
  { name: 'Flow ≥ 200 L/min', owner: 'Facilities + IT', s: 255, e: 270, hold: 'H3', abort: 'Flow below 200 L/min: stop pumps, roll back' },
];

