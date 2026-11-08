import type { VerifyResult, CoverageRun, ErrorCase, ExitState, Certificate, Counterexample } from '../data/types';
import { rulesYaml, oneShotYaml } from './source';

const MIN = -40, MAX = 125, STEP = 0.1;
const COUNT = Math.round((MAX - MIN) / STEP) + 1; // 1651

/** Nagios range semantics for a bare threshold N: alert when value < 0 or value > N. */
export const legacyState = (v: number): ExitState => (v < 0 || v > 32 ? 'CRITICAL' : v > 27 ? 'WARNING' : 'OK');
/** The one-shot translation only checks the upper bound. */
export const oneShotState = (v: number): ExitState => (v > 32 ? 'CRITICAL' : v > 27 ? 'WARNING' : 'OK');

function buildRuns(candidate: (v: number) => ExitState): CoverageRun[] {
  const runs: CoverageRun[] = [];
  let cur: CoverageRun | null = null;
  for (let i = 0; i < COUNT; i++) {
    const v = +(MIN + i * STEP).toFixed(1);
    const l = legacyState(v), c = candidate(v), m = l === c;
    if (cur && cur.legacy === l && cur.candidate === c) cur.to = v;
    else { cur = { from: v, to: v, legacy: l, candidate: c, match: m }; runs.push(cur); }
  }
  return runs;
}

const errLegacy: ErrorCase[] = [ { name: 'timeout', legacy: 'UNKNOWN', candidate: 'UNKNOWN', match: true }, { name: 'noSuchObject', legacy: 'UNKNOWN', candidate: 'UNKNOWN', match: true }, { name: 'non-numeric', legacy: 'UNKNOWN', candidate: 'UNKNOWN', match: true } ];
const errOneShot: ErrorCase[] = [ { name: 'timeout', legacy: 'UNKNOWN', candidate: 'OK', match: false }, { name: 'noSuchObject', legacy: 'UNKNOWN', candidate: 'OK', match: false }, { name: 'non-numeric', legacy: 'UNKNOWN', candidate: 'OK', match: false } ];

export const oneShotCounterexamples: Counterexample[] = [
  { id: 1, input: 'Reading −0.1 °C (sensor error value)', legacy: 'CRITICAL', candidate: 'OK', why: 'Nagios range "32" means outside 0..32. The rule only checked > 32, so every value below 0 is silent: 400 values.', round: 1 },
  { id: 2, input: 'Readings 26, 33, 33, 26 (1 min apart)', legacy: 'No page (soft state, 2 of 3 attempts)', candidate: 'Paged at the first 33', why: 'Retry behaviour lives in max_check_attempts=3 and retry_interval=1, which are not in the script. The rule had no for: clause.', round: 1 },
  { id: 3, input: 'SNMP timeout', legacy: 'UNKNOWN, paged', candidate: 'Silent', why: 'notification_options includes u. The rule had no case for missing data.', round: 1 },
];

export const oneShotVerify: VerifyResult = {
  checkId: 'check_rack_inlet', candidate: 'one-shot', domain: { min: MIN, max: MAX, step: STEP, count: COUNT },
  runs: buildRuns(oneShotState), errorCases: errOneShot, traces: { total: 500, mismatches: 37, seed: 7 },
  counterexamples: oneShotCounterexamples, pluginExecutions: COUNT + 3, elapsedSec: 41, rulesYaml: oneShotYaml,
};

export const gauntletVerify: VerifyResult = {
  checkId: 'check_rack_inlet', candidate: 'gauntlet', domain: { min: MIN, max: MAX, step: STEP, count: COUNT },
  runs: buildRuns(legacyState), errorCases: errLegacy, traces: { total: 500, mismatches: 0, seed: 7 },
  counterexamples: [], rounds: [ { round: 1, open: 3, durationSec: 48 }, { round: 2, open: 1, durationSec: 41 }, { round: 3, open: 0, durationSec: 45 } ],
  pluginExecutions: COUNT + 3, elapsedSec: 134, rulesYaml,
};

export const certificate: Certificate = {
  checkId: 'check_rack_inlet',
  domainText: '−40.0 … 125.0 °C in 0.1 °C steps (1,651 values) + timeout, noSuchObject, non-numeric',
  timingModel: 'check_interval 1m · retry_interval 1m · max_check_attempts 3 · notification_options w,u,c,r',
  traces: '500 generated (seed 7), 0 mismatches',
  counterexamples: '3 found during generation, 3 fixed, 0 open',
  intentionalDiffs: [
    'Adds RackInletSensorFault: fires when a reading disagrees with its neighbours by more than 5 °C for 10 min. Never removes a legacy alert. Evidence: accepted finding #1.',
    'Adds CoolingEffectivenessLow on cooling per kW vs 7 days earlier. Evidence: accepted finding #2.',
    'Pages go to the on-call roster instead of rkowalski@. Evidence: accepted finding #5.',
  ],
  notCovered: ['values outside the domain', 'flap detection (disabled in this config)'],
  legacySha: '9f2c4e81…a41e', rulesSha: '3b77d0c2…0c19', command: 'gauntlet verify check_rack_inlet --seed 7',
};
