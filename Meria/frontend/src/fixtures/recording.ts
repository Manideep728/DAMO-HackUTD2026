import type { Series } from '../data/types';
import { mulberry32 } from '../engine/prng';

const rnd = mulberry32(7);
const DAYS = 21, STEP = 10, N = (DAYS * 1440) / STEP; // one point per 10 min
const noise = (a: number) => (rnd() - 0.5) * 2 * a;
const pts = (f: (i: number, minute: number) => number | null) => Array.from({ length: N }, (_, i) => ({ t: i * STEP, v: f(i, i * STEP) }));

const b7true = (m: number) => 26 + 0.4 * Math.sin((m / 1440) * Math.PI * 2) + noise(0.25);

export const series: Record<string, Series> = {
  'b7.reported': { id: 'b7.reported', label: 'B7 reported', unit: '°C', threshold: 32, color: 'untrusted', points: pts((_, m) => +(b7true(m) + (m >= 7 * 1440 ? 10 : 0)).toFixed(1)) },
  'b7.estimate': { id: 'b7.estimate', label: 'Neighbour estimate', unit: '°C', color: 'accent', dashed: true, points: pts((_, m) => +(26 + 0.4 * Math.sin((m / 1440) * Math.PI * 2) + noise(0.2)).toFixed(1)) },
  'b7.outlet': { id: 'b7.outlet', label: 'B7 outlet', unit: '°C', color: 'legacy', points: pts((_, m) => +(35 + 0.4 * Math.sin((m / 1440) * Math.PI * 2) + noise(0.3)).toFixed(1)) },
  'cub.perkw': { id: 'cub.perkw', label: 'CU-B cooling per kW', unit: '', color: 'warning', points: pts((_, m) => +(1.0 - 0.15 * (m / (DAYS * 1440)) + noise(0.012)).toFixed(3)) },
  'c.mean': { id: 'c.mean', label: 'Row C mean inlet', unit: '°C', threshold: 27, color: 'legacy', points: pts((_, m) => { const tod = m % 1440; const spike = tod >= 120 && tod < 160 ? 2.3 * Math.sin(((tod - 120) / 40) * Math.PI) : 0; return +(23.2 + spike * 2.6 + noise(0.2)).toFixed(1); }) },
  'a4.timeouts': { id: 'a4.timeouts', label: 'A4 timeouts per day', unit: '', color: 'warning', points: Array.from({ length: DAYS }, (_, d) => ({ t: d * 1440, v: 3 + Math.floor(rnd() * 4) })) },
};
