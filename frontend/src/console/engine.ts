/**
 * The console's night scenario: one simulated night on Hall 1, compressed so the first alarm lands within seconds.
 * Facts about the legacy check (4 attempts x 1 min retry, page to nagios@localhost) come from the pinned TTU config.
 * Readings, people and the incident are illustrative; the UI labels the run as scripted unless the backend is live.
 */
export const START_MIN = 0;           // 02:00
export const FAN_STOP = 6;            // 02:06 fan 4 on Compute2 stops
export const EARLY_WARN = 7;          // 02:07 Damo fan-stall early warning (for: 1m)
export const THERMAL_CRIT = 10;       // 02:10 BMC reports CPU Health Critical
export const OLD_PAGE = 13;           // 02:13 old check: HARD on 4th attempt -> would page nagios@localhost
export const DUP_ALERT = 13;          // 02:13 Damo thermal alert, grouped into the same incident
export const STALE_FROM = 4;          // 02:04 Compute3 stops sending Thermal samples
export const AUTO_END = 14;           // autoplay stops here and waits for the operator
export const MS_PER_MIN = 520;

export const clock = (m: number) => {
  const total = 120 + Math.floor(m);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export type RackState = 'ok' | 'warning' | 'critical' | 'stale' | 'recovered';
export interface Rack { id: string; row: number; col: number; liquid?: boolean; assets?: string[] }

export const racks: Rack[] = Array.from({ length: 4 * 8 }, (_, i) => {
  const row = Math.floor(i / 8) + 1, col = i % 8;
  const id = `R${row}${col}`;
  return { id, row, col, liquid: row === 4 && col < 4, assets: id === 'R12' ? ['hpc-c1', 'hpc-c2'] : id === 'R13' ? ['hpc-c3'] : undefined };
});

export const assets = {
  'hpc-c1': { host: 'Compute1', rack: 'R12', u: 'U14', owner: 'HPC Ops', primary: 'Luis O.', fallback: 'Priya N.' },
  'hpc-c2': { host: 'Compute2', rack: 'R12', u: 'U16', owner: 'HPC Ops', primary: 'Luis O.', fallback: 'Priya N.' },
  'hpc-c3': { host: 'Compute3', rack: 'R13', u: 'U02', owner: 'Platform', primary: 'Dev K.', fallback: 'Priya N.' },
} as const;

/** Deterministic pseudo-noise so the hall looks alive without randomness between renders. */
const wobble = (seed: number, m: number) => Math.sin(seed * 12.9898 + m * 0.7) * 0.35 + Math.sin(seed * 3.1 + m * 0.23) * 0.25;

export function inletTemp(rack: Rack, m: number) {
  return 22.2 + (rack.row - 1) * 0.35 + (rack.col % 3) * 0.2 + wobble(rack.row * 10 + rack.col, m);
}

/** CPU1 temperature and fan 4 RPM for Compute2 at minute m, given whether the fan has been fixed (minute or null). */
export function c2(m: number, fixedAt: number | null) {
  const fixed = fixedAt !== null && m >= fixedAt;
  const fanStopped = m >= FAN_STOP && !fixed;
  let temp = 61 + wobble(7, m) * 1.5;
  if (m >= FAN_STOP && !fixed) temp = Math.min(91, 61 + (m - FAN_STOP) * 7.5) + wobble(7, m);
  if (fixed) temp = Math.max(62, 91 - (m - (fixedAt as number)) * 9) + wobble(7, m);
  const health = fixed ? (temp < 70 ? 'OK' : 'Critical') : m >= THERMAL_CRIT ? 'Critical' : 'OK';
  return { temp, fan: fanStopped ? 0 : 9400 + wobble(3, m) * 120, health };
}

export type Stage = 'watching' | 'warned' | 'acked' | 'investigated' | 'dispatched' | 'recovered' | 'handed-off';

export interface FeedItem { m: number; kind: 'telemetry' | 'alert' | 'delivery' | 'dedupe' | 'workorder' | 'human' | 'agent' | 'recovery'; text: string; tone?: 'critical' | 'warning' | 'ok' | 'muted' }

/** Events that happen on their own as the clock runs. Operator actions append their own items. */
export const autoFeed: FeedItem[] = [
  { m: STALE_FROM, kind: 'telemetry', text: 'Compute3: no Thermal sample since 02:04, marked stale. Stale is never shown as healthy.', tone: 'warning' },
  { m: FAN_STOP, kind: 'telemetry', text: 'Compute2: fan 4 reads 0 RPM. CPU health still OK.', tone: 'warning' },
  { m: EARLY_WARN, kind: 'alert', text: 'FanStalledEarlyWarning on hpc-c2. Rules evaluated without the model.', tone: 'warning' },
  { m: EARLY_WARN, kind: 'delivery', text: 'Page to Luis O. (HPC Ops primary) failed: receiver returned 503.', tone: 'critical' },
  { m: EARLY_WARN, kind: 'delivery', text: 'Fallback SMS to Priya N. delivered.', tone: 'ok' },
  { m: EARLY_WARN, kind: 'workorder', text: 'Incident INC-1042 and work order WO-1042 opened for R12 · U16.' },
  { m: THERMAL_CRIT, kind: 'telemetry', text: 'Compute2: BMC reports CPU1 Temp Critical (91 °C).', tone: 'critical' },
  { m: DUP_ALERT, kind: 'dedupe', text: 'ThermalHealthCritical grouped into INC-1042. Same work order, no duplicate.', tone: 'muted' },
  { m: OLD_PAGE, kind: 'alert', text: 'The old Nagios check would page now, to nagios@localhost. Damo warned 6 min earlier.', tone: 'muted' },
];

export const evidence = [
  { id: 'e1', text: 'Fan 4 at 0 RPM since 02:06; fans 1–3 and 5–6 normal', src: 'telemetry' },
  { id: 'e2', text: 'CPU1 Temp Critical since 02:10, reading 91 °C', src: 'telemetry' },
  { id: 'e3', text: 'Rack R12 inlet 22.4 °C; neighbouring racks normal', src: 'telemetry' },
  { id: 'e4', text: 'Runbook §3: one failed fan can heat a CPU within minutes while inlet stays normal', src: 'runbook' },
];

export const hypotheses = [
  { title: 'Fan 4 failed; the CPU is genuinely hot', confidence: 'Likely', cites: 'e1 e2 e4', note: 'A local cause: only one host affected, inlet normal.' },
  { title: 'Thermal sensor misreporting', confidence: 'Unresolved', cites: 'e3', note: 'Normal inlet does not prove the sensor wrong. Verify, do not conclude.' },
];
