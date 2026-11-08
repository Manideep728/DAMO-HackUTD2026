import type { DataSource, EngineEvent, Screen, DirectorFlag, Certificate, WorkOrder, Handoff, Finding, LegacyCheck } from './types';
import { checks as checkFixtures } from '../fixtures/checks';
import { legacySource } from '../fixtures/source';
import { ruleCard, flaggedStatement } from '../fixtures/ruleCard';
import { findings as findingFixtures, replaySummary, detectorsInOrder } from '../fixtures/findings';
import { series } from '../fixtures/recording';
import { oneShotVerify, gauntletVerify, certificate } from '../fixtures/verify';

type Listener = (e: EngineEvent) => void;

export class MockDataSource implements DataSource {
  readonly kind = 'mock' as const;
  private listeners = new Set<Listener>();
  private timers: Record<Screen, number[]> = { read: [], find: [], prove: [] };
  private _speed: 1 | 2 | 5 = 1;
  private _flags: Record<DirectorFlag, boolean> = { flaggedCard: false, blockedSignoff: false, nemotronOffline: false, cached: false };
  private checks: LegacyCheck[] = structuredClone(checkFixtures);
  private findings: Finding[] = structuredClone(findingFixtures);
  private handoff: Handoff = { shift: 'Night shift · Sat 7 Nov 23:00 → Sun 8 Nov 07:00', writtenBy: 'Gauntlet (Nemotron Nano)', reviewedBy: 'Maya R.', accepted: [], dismissed: [], signedOff: [], timeline: [] };
  private cert: Certificate = structuredClone(certificate);

  listChecks() { return this.checks; }
  source(id: string) { return legacySource[id] ?? legacySource.check_rack_inlet; }
  series(id: string) { return series[id]; }
  subscribe(cb: Listener) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  private emit(e: EngineEvent) { this.listeners.forEach((l) => l(e)); }
  private mode() { return this._flags.cached ? 'cached' : 'mock'; }

  private schedule(screen: Screen, steps: { at: number; fn: () => void }[]) {
    this.clear(screen);
    for (const s of steps) this.timers[screen].push(window.setTimeout(s.fn, s.at / this._speed));
  }
  private clear(screen: Screen) { this.timers[screen].forEach(clearTimeout); this.timers[screen] = []; }

  // ---------- READ ----------
  private readPlan() {
    const steps: { at: number; fn: () => void }[] = [];
    let t = 0;
    const step = (id: string, label: string, dur: number, model?: string, tool?: string) => {
      steps.push({ at: t, fn: () => this.emit({ type: 'step', screen: 'read', step: { id, label, model, tool, durationMs: dur }, status: 'running' }) });
      t += dur;
      steps.push({ at: t, fn: () => this.emit({ type: 'step', screen: 'read', step: { id, label, model, tool, durationMs: dur }, status: 'done' }) });
    };
    if (this._flags.nemotronOffline) {
      steps.push({ at: 0, fn: () => this.emit({ type: 'step', screen: 'read', step: { id: 'off', label: 'Nemotron offline. Showing the cached card from 02:14. Execution checks still run locally.' }, status: 'error' }) });
      t = 600;
    } else {
      step('r1', 'Reading services.cfg', 400, 'Nemotron Super', 'read_file');
      step('r2', 'Reading commands.cfg', 300, 'Nemotron Super', 'read_file');
      step('r3', 'Reading contacts.cfg and hosts.cfg', 300, 'Nemotron Super', 'read_file');
      step('r4', 'Cross-checking inventory.csv', 500, 'Nemotron Super', 'read_table');
      step('r5', 'Cross-checking oncall_roster.csv', 400, 'Nemotron Super', 'read_table');
      step('r6', 'Writing rule card', 3200, 'Nemotron Super');
    }
    const card = structuredClone(ruleCard);
    card.mode = this._flags.nemotronOffline ? 'cached' : this.mode();
    card.elapsedMs = 5100;
    if (this._flags.flaggedCard) card.statements[2] = structuredClone(flaggedStatement);
    steps.push({ at: t, fn: () => this.emit({ type: 'ruleCard', data: card }) });
    t += 400;
    steps.push({ at: t, fn: () => this.emit({ type: 'step', screen: 'read', step: { id: 'x0', label: 'Checking the card by running the real plugin', tool: 'run_plugin' }, status: 'running' }) });
    for (const s of card.statements) {
      if (s.verification.status === 'na') continue;
      t += 600;
      const ver = structuredClone(s.verification);
      steps.push({ at: t, fn: () => this.emit({ type: 'statementVerified', statementId: s.id, verification: { ...ver, status: 'running' } }) });
      t += 350;
      const flagged = ver.runs.some((r) => !r.ok);
      steps.push({ at: t, fn: () => this.emit({ type: 'statementVerified', statementId: s.id, verification: { ...ver, status: flagged ? 'flagged' : ver.runs.length ? 'verified' : 'config' } }) });
    }
    t += 200;
    steps.push({ at: t, fn: () => this.emit({ type: 'step', screen: 'read', step: { id: 'x0', label: 'Checked the card by running the real plugin', tool: 'run_plugin', durationMs: t }, status: 'done' }) });
    return steps;
  }
  runRead() { this.emit({ type: 'reset', screen: 'read' }); this.schedule('read', this.readPlan()); }

  // ---------- FIND ----------
  private findPlan() {
    const steps: { at: number; fn: () => void }[] = [];
    let t = 0;
    steps.push({ at: 0, fn: () => this.emit({ type: 'step', screen: 'find', step: { id: 'replay', label: 'Replaying check_rack_inlet over 21 days of recorded readings', tool: 'run_plugin ×30,240' }, status: 'running' }) });
    t = 2500;
    steps.push({ at: t, fn: () => { this.emit({ type: 'step', screen: 'find', step: { id: 'replay', label: 'Replayed check_rack_inlet over 21 days', tool: 'run_plugin ×30,240', durationMs: 2500 }, status: 'done' }); this.emit({ type: 'replay', data: replaySummary }); } });
    for (const d of detectorsInOrder) {
      t += 400;
      steps.push({ at: t, fn: () => this.emit({ type: 'step', screen: 'find', step: { id: 'd-' + d, label: `Detector: ${d}`, durationMs: 400 }, status: 'running' }) });
      steps.push({ at: t + 380, fn: () => this.emit({ type: 'step', screen: 'find', step: { id: 'd-' + d, label: `Detector: ${d}`, durationMs: 400 }, status: 'done' }) });
    }
    for (const f of this.findings) {
      t += 800;
      steps.push({ at: t, fn: () => this.emit({ type: 'step', screen: 'find', step: { id: 'f-' + f.id, label: `Writing finding: ${f.title}`, model: 'Nemotron Nano', durationMs: 800 }, status: 'running' }) });
      steps.push({ at: t + 760, fn: () => { this.emit({ type: 'step', screen: 'find', step: { id: 'f-' + f.id, label: `Writing finding: ${f.title}`, model: 'Nemotron Nano', durationMs: 800 }, status: 'done' }); this.emit({ type: 'finding', data: { ...f, mode: this.mode() } }); } });
    }
    return steps;
  }
  runFind() { this.emit({ type: 'reset', screen: 'find' }); this.schedule('find', this.findPlan()); }

  async acceptFinding(id: number, by: string): Promise<WorkOrder> {
    const f = this.findings.find((x) => x.id === id)!;
    const at = new Date().toTimeString().slice(0, 5);
    const wo = f.workOrder ?? { number: 480 + id, title: f.action, unit: f.target.id, location: 'Hall 1', likelyPart: '—', labels: ['finding'] };
    f.status = 'accepted'; f.decision = { by, at, workOrderId: '#' + wo.number };
    this.handoff.accepted.push({ findingId: id, title: f.title, workOrder: wo.number, owner: 'Luis O.', eta: '08:30', watch: f.target.kind === 'rack' ? `${f.target.id} inlet must stay under 30 °C` : `${f.target.id}: confirm after work` });
    this.handoff.timeline.unshift({ at, text: `${by} accepted "${f.title}" → work order #${wo.number}` });
    this.bump();
    this.emit({ type: 'finding', data: { ...f } }); this.emit({ type: 'handoff', data: structuredClone(this.handoff) });
    return { id: 'wo-' + wo.number, number: wo.number, title: wo.title, labels: wo.labels, unit: wo.unit, location: wo.location, likelyPart: wo.likelyPart, body: `${f.sentences}\n\nEvidence: ${f.evidence.caption}\nFound by: ${f.detector}`, createdBy: by, at };
  }
  async dismissFinding(id: number, by: string, reason: string) {
    const f = this.findings.find((x) => x.id === id)!;
    const at = new Date().toTimeString().slice(0, 5);
    f.status = 'dismissed'; f.decision = { by, at, reason };
    this.handoff.dismissed.push({ findingId: id, title: f.title, reason });
    this.handoff.timeline.unshift({ at, text: `${by} dismissed "${f.title}" (${reason})` });
    this.bump();
    this.emit({ type: 'finding', data: { ...f } }); this.emit({ type: 'handoff', data: structuredClone(this.handoff) });
  }
  undoFinding(id: number) {
    const f = this.findings.find((x) => x.id === id)!; f.status = 'open'; f.decision = undefined;
    this.handoff.accepted = this.handoff.accepted.filter((a) => a.findingId !== id);
    this.handoff.dismissed = this.handoff.dismissed.filter((a) => a.findingId !== id);
    this.handoff.timeline.shift(); this.bump();
    this.emit({ type: 'finding', data: { ...f } }); this.emit({ type: 'handoff', data: structuredClone(this.handoff) });
  }
  private bump() {
    const c = this.checks.find((x) => x.id === 'check_rack_inlet')!;
    c.findings = { total: this.findings.length, accepted: this.findings.filter((f) => f.status === 'accepted').length };
    if (c.stage === 'audit') c.stage = 'parallel_run';
  }

  // ---------- PROVE ----------
  private provePlan() {
    const steps: { at: number; fn: () => void }[] = [];
    let t = 0;
    const step = (id: string, label: string, dur: number, model?: string, tool?: string, then?: () => void) => {
      steps.push({ at: t, fn: () => this.emit({ type: 'step', screen: 'prove', step: { id, label, model, tool, durationMs: dur }, status: 'running' }) });
      t += dur;
      steps.push({ at: t, fn: () => { this.emit({ type: 'step', screen: 'prove', step: { id, label, model, tool, durationMs: dur }, status: 'done' }); then?.(); } });
    };
    step('g1', 'Generating rules from the rule card and 3 accepted findings', 2800, 'Nemotron Super', undefined, () => this.emit({ type: 'rules', yaml: gauntletVerify.rulesYaml }));
    step('g2', 'promtool check rules', 600, undefined, 'promtool');
    step('o1', 'One-shot baseline: one Nemotron Super call, no tools', 1800, 'Nemotron Super');
    step('o2', 'Verifier on the one-shot rules: 1,654 inputs + 500 traces', 1500, undefined, 'sweep.py · promtool test', () => this.emit({ type: 'verify', data: { ...oneShotVerify } }));
    step('v1', 'Verifier on the Gauntlet rules, round 1', 1200, undefined, 'sweep.py · promtool test', () => this.emit({ type: 'round', round: 1, open: 3 }));
    step('v2', 'Feeding 3 counterexamples back', 1600, 'Nemotron Super');
    step('v3', 'Verifier, round 2', 1000, undefined, 'sweep.py · promtool test', () => this.emit({ type: 'round', round: 2, open: 1 }));
    step('v4', 'Feeding 1 counterexample back (soft state)', 1400, 'Nemotron Super');
    const blocked = this._flags.blockedSignoff;
    step('v5', 'Verifier, round 3', 1000, undefined, 'sweep.py · promtool test', () => {
      this.emit({ type: 'round', round: 3, open: blocked ? 1 : 0 });
      const g = structuredClone(gauntletVerify);
      if (blocked) { g.counterexamples = [{ id: 9, input: 'Readings 20, 19.9, 20, 19.9 (flapping at the threshold)', legacy: 'No page (soft state resets)', candidate: 'Paged', why: 'for: 2m holds across a one-sample recovery; the Nagios soft state resets on any OK.', round: 3 }]; g.traces.mismatches = 1; g.rounds![2].open = 1; }
      this.emit({ type: 'verify', data: g });
      if (!blocked) this.emit({ type: 'certificate', data: structuredClone(this.cert) });
    });
    return steps;
  }
  runProve() { this.emit({ type: 'reset', screen: 'prove' }); this.schedule('prove', this.provePlan()); }

  async signOff(checkId: string, by: string) {
    this.cert.signedOffBy = by; this.cert.signedOffAt = new Date().toTimeString().slice(0, 5);
    const c = this.checks.find((x) => x.id === checkId)!; c.stage = 'signed_off'; c.coverage = { done: 1654, total: 1654 }; c.traces = { done: 500, total: 500 };
    this.handoff.signedOff.push(checkId);
    this.handoff.timeline.unshift({ at: this.cert.signedOffAt, text: `${by} signed off ${checkId} (certificate ${this.cert.rulesSha})` });
    this.emit({ type: 'certificate', data: structuredClone(this.cert) }); this.emit({ type: 'handoff', data: structuredClone(this.handoff) });
    return structuredClone(this.cert);
  }
  async acknowledgeHandoff(by: string) { this.handoff.acknowledgedBy = by; this.handoff.acknowledgedAt = new Date().toTimeString().slice(0, 5); this.emit({ type: 'handoff', data: structuredClone(this.handoff) }); }
  getHandoff() { return structuredClone(this.handoff); }

  director = {
    restart: (s: Screen) => ({ read: () => this.runRead(), find: () => this.runFind(), prove: () => this.runProve() })[s](),
    jumpToEnd: (s: Screen) => {
      this.clear(s); this.emit({ type: 'reset', screen: s });
      const plan = ({ read: () => this.readPlan(), find: () => this.findPlan(), prove: () => this.provePlan() })[s]();
      plan.forEach((p) => p.fn());
    },
    setSpeed: (x: 1 | 2 | 5) => { this._speed = x; },
    toggle: (f: DirectorFlag, on: boolean) => { this._flags[f] = on; if (f === 'cached') this.emit({ type: 'mode', mode: on ? 'cached' : 'mock' }); },
    flags: () => ({ ...this._flags }),
    speed: () => this._speed,
  };
}
