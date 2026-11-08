/**
 * The console's example scenario: one night on Hall 1, compressed so the first alarm lands within seconds.
 * A GPU on the liquid row returns a wrong answer while every temperature, utilization and health check stays green.
 * Readings, people, checksums and the incident are illustrative. The retrofit facts (CDU-1, TCS-1, V-R3-01, the
 * logbook) come from the accepted retrofit package; they are context for the investigation, not its cause.
 */
export const START_MIN = 0;           // 02:00
export const KAT_RUN = 6;             // 02:06 scheduled known-answer test starts on gpu-node-07
export const EARLY_WARN = 7;          // 02:07 KAT result: GPU-07 disagrees with the trusted reference
export const REPEAT = 10;             // 02:10 automatic rerun with the same pinned inputs reproduces it
export const OLD_PAGE = 13;           // 02:13 legacy Nagios/BMS checks: still green, never page
export const STALE_FROM = 4;          // 02:04 Compute3 stops sending samples
export const AUTO_END = 14;           // autoplay stops here and waits for the operator
export const FIX_AT = 58;             // 02:58 technician reseats GPU-07 (fast-forward)
export const MS_PER_MIN = 520;

export const clock = (m: number) => {
  const total = 120 + Math.floor(m);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export type RackState = 'ok' | 'warning' | 'critical' | 'stale' | 'recovered';
export interface Rack { id: string; row: number; col: number; liquid?: boolean; assets?: string[] }

/** Hall H1, the same hall Preflight simulates: air rows R1 and R2 (eight racks each) and the retrofitted liquid row R3. */
export const HALL = 'H1';
export const INCIDENT_RACK = 'R3-01';
export const STALE_RACK = 'R1-04';
export const LIQUID_RACKS = ['R3-01', 'R3-02'];
export const racks: Rack[] = [
  ...Array.from({ length: 2 * 8 }, (_, i) => {
    const row = Math.floor(i / 8) + 1, col = i % 8;
    const id = `R${row}-${String(col + 1).padStart(2, '0')}`;
    return { id, row, col, assets: id === STALE_RACK ? ['Compute3 U02'] : undefined };
  }),
  { id: 'R3-01', row: 3, col: 0, liquid: true, assets: ['gpu-node-07 U12'] },
  { id: 'R3-02', row: 3, col: 1, liquid: true, assets: ['gpu-node-08 U12'] },
];

/** What feeds a rack when the facility API is unreachable or the retrofit row is not loaded there. Live values come from /api/preflight/facility. */
export function fallbackFeeds(id: string) {
  if (id.startsWith('R3')) return { power: ['PDU-A3', 'PDU-B3'], cooling: [`V-${id}`, 'CRAH-1', 'CRAH-2'] };
  if (id.startsWith('R1')) return { power: ['PDU-A1', 'PDU-B1'], cooling: ['CRAH-1', 'CRAH-2'] };
  return { power: ['PDU-A2', 'PDU-B2'], cooling: ['CRAH-3', 'CRAH-4'] };
}

/** The GPU in question and the people around it. */
export const GPU = { id: 'GPU-07', server: 'gpu-node-07', rack: INCIDENT_RACK, u: 'U12', peer: 'GPU-06', owner: 'GPU platform', primary: 'Luis O.', fallback: 'Priya N.', tech: 'Ana P.' } as const;

/** The known-answer test: a small deterministic computation with pinned inputs and a trusted reference output. */
export const KAT = {
  name: 'KAT gemm-fp32', version: 'v3', seed: 1042,
  inputs: '2048 × 2048 fp32 matrix multiply, seed 1042, inputs pinned (sha 5e0c41d2)',
  method: 'Fixed reduction order. Checksum of the output plus element-wise max abs error against the trusted reference.',
  tolerance: '1.0e-4', tolBasis: 'fp32 accumulation bound for K = 2048, with a 4× margin',
  refSum: '9c1e47a0·b3d2', obsSum: '9c1e47a0·f15e', maxErr: '3.1e-2',
  schedule: 'every 6 h on each GPU; last pass on GPU-07 at 20:06',
} as const;

/** Deterministic pseudo-noise so the hall looks alive without randomness between renders. */
const wobble = (seed: number, m: number) => Math.sin(seed * 12.9898 + m * 0.7) * 0.35 + Math.sin(seed * 3.1 + m * 0.23) * 0.25;

/** Inlet °C on the air rows; secondary coolant supply °C on the liquid row (limits 30–36 °C from the retrofit package). */
export function inletTemp(rack: Rack, m: number) {
  if (rack.liquid) return 32.1 + rack.col * 0.15 + wobble(30 + rack.col, m) * 0.4;
  return 22.2 + (rack.row - 1) * 0.35 + (rack.col % 3) * 0.2 + wobble(rack.row * 10 + rack.col, m);
}

export type KatState = 'pass' | 'running' | 'mismatch';
/** GPU-07 at minute m: temperature, utilization and health stay green the whole night. Only the test result changes. */
export function gpu07(m: number, fixedAt: number | null) {
  const fixed = fixedAt !== null && m >= fixedAt;
  const kat: KatState = fixed ? 'pass' : m >= EARLY_WARN ? 'mismatch' : m >= KAT_RUN ? 'running' : 'pass';
  return { temp: 61 + wobble(7, m) * 1.5, util: 94 + wobble(3, m) * 2.5, health: 'OK', kat };
}
/** The peer in the same server, for the side-by-side rows. */
export const gpu06 = (m: number) => ({ temp: 60 + wobble(6, m) * 1.4, util: 93 + wobble(5, m) * 2.5 });

export type Stage = 'watching' | 'warned' | 'acked' | 'investigated' | 'dispatched' | 'recovered' | 'handed-off';

export interface FeedItem { m: number; kind: 'telemetry' | 'alert' | 'delivery' | 'dedupe' | 'workorder' | 'human' | 'agent' | 'recovery'; text: string; tone?: 'critical' | 'warning' | 'ok' | 'muted'; to?: string }

/** Events that happen on their own as the clock runs. Operator actions append their own items. */
export const autoFeed: FeedItem[] = [
  { m: STALE_FROM, kind: 'telemetry', text: 'Compute3: no sample since 02:04, marked stale. Stale is never shown as healthy.', tone: 'warning' },
  { m: KAT_RUN, kind: 'telemetry', text: `${GPU.server}: scheduled ${KAT.name} ${KAT.version} (seed ${KAT.seed}) started on all 8 GPUs. Temperature, utilization and health green.` },
  { m: EARLY_WARN, kind: 'alert', text: `Correctness mismatch · ${GPU.id} · cause not yet established. Max abs error ${KAT.maxErr} vs tolerance ${KAT.tolerance}. Rule evaluated without the model.`, tone: 'warning' },
  { m: EARLY_WARN, kind: 'delivery', text: `Page to ${GPU.primary} (GPU platform primary) failed: receiver returned 503.`, tone: 'critical' },
  { m: EARLY_WARN, kind: 'delivery', text: `Fallback SMS to ${GPU.fallback} delivered.`, tone: 'ok' },
  { m: EARLY_WARN, kind: 'alert', text: `Incident INC-1042 opened for ${GPU.id} · ${GPU.server} · ${INCIDENT_RACK}.` },
  { m: REPEAT, kind: 'alert', text: `Automatic rerun with the same pinned inputs: ${GPU.id} disagrees again (2 of 2).`, tone: 'critical' },
  { m: REPEAT, kind: 'dedupe', text: 'Repeat mismatch grouped into INC-1042. One incident, no duplicate page.', tone: 'muted' },
  { m: OLD_PAGE, kind: 'alert', text: `Legacy Nagios and BMS checks on ${GPU.server} are all green (${GPU.id} 61 °C, 94 % busy, health OK). They will never page for a wrong answer.`, tone: 'muted' },
];

/** Nemotron's read-only tool calls, in order. The console streams them; the work order keeps them as the transcript. */
export const toolCalls = [
  { tool: 'run_known_answer_test', args: `${GPU.id}, gemm-fp32 v3, seed ${KAT.seed}, runs=3`, result: `mismatch 3 of 3, max abs error ${KAT.maxErr}` },
  { tool: 'compare_peer', args: `${GPU.peer}, same server, same inputs`, result: 'matches the reference; repeat runs bit-identical' },
  { tool: 'get_versions', args: GPU.server, result: 'driver 550.90.07, VBIOS 96.00.89 on all 8 GPUs' },
  { tool: 'recent_changes', args: `${GPU.server}, 7 days`, result: 'no driver, firmware or config change since 11-01' },
  { tool: 'get_retrofit_map', args: INCIDENT_RACK, result: 'CDU-1 → TCS-1 → V-R3-01, coolant in limits' },
  { tool: 'search_logbook', args: 'R3 | CDU-1 | V-R3-0x', result: 'strainer cleaned 10-30, flush 11-05 (context)' },
  { tool: 'propose_hypotheses', args: '', result: '3 ranked; cause not yet established' },
];
export const toolLine = (t: (typeof toolCalls)[number]) => `${t.tool}(${t.args}) → ${t.result}`;

export const evidence = [
  { id: 'e1', short: 'Mismatch 3 of 3', text: `${KAT.name} ${KAT.version}, seed ${KAT.seed}: GPU-07 output differs from the reference on 3 of 3 runs; max abs error ${KAT.maxErr} vs tolerance ${KAT.tolerance}`, src: 'test' },
  { id: 'e2', short: 'Peer GPU-06 matches', text: 'GPU-06 in the same server, same inputs and driver: checksum matches the reference on every run', src: 'test' },
  { id: 'e3', short: 'Same driver and firmware', text: 'Driver 550.90.07 and VBIOS 96.00.89 on all 8 GPUs; no driver, firmware or config change since 2026-11-01', src: 'inventory' },
  { id: 'e4', short: 'Deterministic method', text: 'gemm-fp32 v3 uses a fixed reduction order and a pinned seed; repeat runs on GPU-06 are bit-identical', src: 'test spec' },
  { id: 'e5', short: 'Coolant in limits', text: 'R3-01 is cooled by CDU-1 via TCS-1 and V-R3-01; secondary supply about 32 °C, inside 30–36 °C. Context, not cause', src: 'retrofit map' },
  { id: 'e6', short: 'CDU-1 strainer, flush', text: 'CDU-1 strainer cleaned 2026-10-30; commissioning flush complete 2026-11-05. Context, not cause', src: 'logbook' },
];

export const hypotheses = [
  { title: 'GPU-07 hardware fault', confidence: 'Most likely', cites: ['e1', 'e2', 'e3'], note: 'It reproduces on GPU-07 only. The peer on the same server, driver and inputs passes.' },
  { title: 'Software or driver issue', confidence: 'Less likely', cites: ['e3'], note: 'GPU-06 runs the same driver and firmware and passes. Not ruled out until someone confirms.' },
  { title: 'Numerical nondeterminism', confidence: 'Ruled out', cites: ['e4'], note: 'A deterministic method with a pinned seed cannot explain a stable 3 of 3 mismatch.' },
  { title: 'Liquid-cooling retrofit', confidence: 'Context', cites: ['e5', 'e6'], note: 'Coolant is in limits and the recent work is logged. Context, not cause.' },
];

/** The next test Nemotron recommends. Only the GPU platform team runs it; Damo never drains or stops anything. */
export const NEXT_TEST = 'Drain gpu-node-07 (operator decision), run the vendor field diagnostic on GPU-07, reseat or replace it, then rerun the known-answer test 3 times and compare with GPU-06.';
export const UNKNOWN = ['Whether the fault is in GPU-07 memory or compute', 'Which jobs ran on GPU-07 since the last pass at 20:06', 'Whether a reseat clears it or the card must be replaced'];
export const WO_PATH = '/wo/WO-1042';
