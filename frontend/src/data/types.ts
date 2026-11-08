export type CheckStage = 'audit' | 'parallel_run' | 'verified' | 'signed_off' | 'retired' | 'blocked' | 'drop';
export type Mode = 'live' | 'cached' | 'mock';
export type Severity = 'critical' | 'warning' | 'watch' | 'info';

export interface LegacyCheck {
  id: string; name: string; plugin: string; watches: string; stage: CheckStage;
  findings?: { total: number; accepted: number };
  coverage?: { done: number; total: number };
  traces?: { done: number; total: number };
  openCounterexamples: number; blockedReason?: string; dropReason?: string;
}

export interface SourceFile { file: string; text: string; }
export interface SourceRange { file: string; from: number; to: number; }

export interface VerifyRun { input: string; legacy: string; expected: string; ok: boolean; }
export interface StatementVerification { status: 'pending' | 'running' | 'verified' | 'flagged' | 'config' | 'na'; runs: VerifyRun[]; note?: string; corrected?: string; }
export interface RuleCardStatement { id: string; section: 'checks' | 'thresholds' | 'pages_when' | 'pages_who' | 'ignores'; text: string; source: SourceRange[]; verification: StatementVerification; }
export interface RuleCard { checkId: string; model: string; statements: RuleCardStatement[]; mode: Mode; elapsedMs?: number; }

export interface SeriesPoint { t: number; v: number | null; }
export interface Series { id: string; label: string; unit: string; points: SeriesPoint[]; threshold?: number; color?: 'accent' | 'legacy' | 'untrusted' | 'warning'; dashed?: boolean; }

export interface Finding {
  id: number; severity: Severity; title: string; sentences: string; detector: string;
  detectorNumbers: Record<string, string | number>; action: string;
  target: { kind: 'rack' | 'unit' | 'row' | 'config'; id: string };
  evidence: { series: string[]; caption: string };
  status: 'open' | 'accepted' | 'dismissed';
  decision?: { by: string; at: string; reason?: string; workOrderId?: string };
  model: string; mode: Mode;
  workOrder?: { number: number; title: string; unit: string; location: string; likelyPart: string; labels: string[] };
}

export interface ReplaySummary { checkId: string; days: number; pluginRuns: number; legacyPages: number; sameFalseAlarm: number; pageTicks: number[]; detectorHits: { t: number; findingId: number }[]; }

export type ExitState = 'OK' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export interface CoverageRun { from: number; to: number; legacy: ExitState; candidate: ExitState; match: boolean; }
export interface ErrorCase { name: 'timeout' | 'noSuchObject' | 'non-numeric'; legacy: ExitState; candidate: ExitState; match: boolean; }
export interface Counterexample { id: number; input: string; legacy: string; candidate: string; why: string; round: number; }
export interface VerifyResult {
  checkId: string; candidate: 'one-shot' | 'gauntlet';
  domain: { min: number; max: number; step: number; count: number };
  runs: CoverageRun[]; errorCases: ErrorCase[];
  traces: { total: number; mismatches: number; seed: number };
  counterexamples: Counterexample[];
  rounds?: { round: number; open: number; durationSec: number }[];
  pluginExecutions: number; elapsedSec: number; rulesYaml: string;
}
export interface Certificate { checkId: string; domainText: string; timingModel: string; traces: string; counterexamples: string; intentionalDiffs: string[]; notCovered: string[]; legacySha: string; rulesSha: string; command: string; signedOffBy?: string; signedOffAt?: string; }

export interface WorkOrder { id: string; number: number; title: string; labels: string[]; unit: string; location: string; likelyPart: string; body: string; createdBy: string; at: string; }
export interface Handoff {
  shift: string; writtenBy: string; reviewedBy?: string;
  accepted: { findingId: number; title: string; workOrder: number; owner: string; eta: string; watch: string }[];
  dismissed: { findingId: number; title: string; reason: string }[];
  signedOff: string[]; timeline: { at: string; text: string }[];
  acknowledgedBy?: string; acknowledgedAt?: string;
}

export type Screen = 'read' | 'find' | 'prove';
export interface PlaybackStep { id: string; label: string; model?: string; tool?: string; durationMs?: number; }
export type EngineEvent =
  | { type: 'step'; screen: Screen; step: PlaybackStep; status: 'running' | 'done' | 'error' }
  | { type: 'ruleCard'; data: RuleCard }
  | { type: 'statementVerified'; statementId: string; verification: StatementVerification }
  | { type: 'replay'; data: ReplaySummary }
  | { type: 'finding'; data: Finding }
  | { type: 'rules'; yaml: string }
  | { type: 'verify'; data: VerifyResult }
  | { type: 'round'; round: number; open: number }
  | { type: 'certificate'; data: Certificate }
  | { type: 'handoff'; data: Handoff }
  | { type: 'mode'; mode: Mode }
  | { type: 'reset'; screen: Screen };

export type DirectorFlag = 'flaggedCard' | 'blockedSignoff' | 'nemotronOffline' | 'cached';

export interface DataSource {
  readonly kind: 'mock' | 'api';
  listChecks(): LegacyCheck[];
  source(checkId: string): SourceFile[];
  series(id: string): Series | undefined;
  subscribe(cb: (e: EngineEvent) => void): () => void;
  runRead(checkId: string): void;
  runFind(checkId: string): void;
  runProve(checkId: string): void;
  acceptFinding(id: number, by: string): Promise<WorkOrder>;
  dismissFinding(id: number, by: string, reason: string): Promise<void>;
  signOff(checkId: string, by: string): Promise<Certificate>;
  acknowledgeHandoff(by: string): Promise<void>;
  director: { restart(screen: Screen): void; jumpToEnd(screen: Screen): void; setSpeed(x: 1 | 2 | 5): void; toggle(flag: DirectorFlag, on: boolean): void; flags(): Record<DirectorFlag, boolean>; speed(): number };
}
