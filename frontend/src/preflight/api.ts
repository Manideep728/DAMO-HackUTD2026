/** Client for /api/preflight. Every call can fail; screens show the error instead of stale numbers. */

export type NodeState = 'operational' | 'degraded' | 'maintenance' | 'failed';
export type Toggle = 'maintenance' | 'failed';

export interface FNode {
  id: string; type: string; label: string; zone: string; capacity: number; base_load: number; heat_load: number;
  criticality: number; failure_rate: number | null; flexible_kw: number; layer: number; provenance: string; loop?: 'primary' | 'secondary' | null;
}
export interface FEdge {
  consumer: string; supplier: string; group: string; mode?: string; k?: number | null; resource?: string; loop?: 'primary' | 'secondary' | null;
  source: string; status: string; confidence: number; citations?: { doc_id: string; quote: string }[]; finding?: string;
}
export interface Facility {
  name: string; site?: 'demo' | 'retrofit' | 'imported'; fidelity: string; critical_services: string[]; nodes: FNode[]; edges: FEdge[]; suspected: FEdge[];
  windows: { nodes: string[]; start: number; end: number; label: string }[];
  load_source?: LoadSource;
}
/** Where the planner's hourly load comes from: Tiger meter data (or its last local snapshot), or the hand-written profile. */
export interface LoadSource {
  source: 'meters' | 'assumed' | 'none'; synced_at?: string; rows?: number; profile_weeks?: number;
  reconcile_days?: number; offline?: boolean; synthetic?: boolean;
}
export interface TraceStep { node: string; state: string; kind: string; group: string | null; missing: string[]; at: string | null; detail: string }
export interface SimResult {
  changes: Record<string, string>; lost: string[]; lost_count: number; lost_services: string[]; lost_kw: number;
  degraded: string[]; failed: string[]; min_margin: number; tightest: string | null; zone_margin: Record<string, number>;
  traces: Record<string, TraceStep[]>;
  nodes: Record<string, { state: NodeState; load_kw: Record<string, number>; margin_kw: number | null }>;
}
export interface CutSet { nodes: string[]; order: number; lost_services: string[]; lost_kw: number; impact: number; likelihood: number | null; was_order: number | null }
export interface CutSets { max_order: number; services: string[]; cut_sets: CutSet[]; total: number; single_points: string[]; notes: string[]; maintenance: string[] }
export interface GroupRed { node: string; group: string; resource: string; suppliers: string[]; needed: number; available: number; level: string; independence: number; shared: string[] }
export interface ServiceRed { service: string; capacity_level: string; independence: number; effective: string; single_points: string[]; groups: GroupRed[] }
export interface Transient {
  events: { t_s: number; what: string; nodes: string[] }[];
  lost_transient: string[]; lost_steady: string[]; assumptions: string[];
}
export interface Evidence { doc_id: string; date: string; kind: string; quote: string; reason: string; extractor?: string }
export interface Finding {
  id: string; consumer: string; supplier: string; classification: 'confirms' | 'contradicts' | 'new'; replaces: string | null;
  confidence: number; supporting: Evidence[]; contradicting: Evidence[]; set_aside: Evidence[]; status: string; claim: string;
  impact: { new_single_points?: string[]; single_points_after?: string[]; services_downgraded?: string[]; redundancy_after?: Record<string, string> };
}
export interface Findings { findings: Finding[]; rejected: { doc_id: string; quote: string; reason: string }[]; metrics: { precision: number; recall: number } | null; records: number; model_read: ModelRead | null }
export interface ModelRead {
  model: string; records: number; answered: number; proposed: number; kept: number; set_aside: number;
  rejected: { unknown_node: number; not_verbatim: number; wrong_pair: number }; new_findings: string[]; seconds: number;
}
export interface PlanEval {
  start: number; end: number; mitigations: string[]; lost_services: string[]; lost_load: string[]; lost_kw?: number;
  min_cut_order: number; single_points: string[]; min_margin: number; tightest: string | null; tightest_hour?: number | null; reasons: string[];
}
export interface PlanSearch { evaluated: number; top: PlanEval[]; rejected: PlanEval[]; rejected_total: number }
export interface AgentEvent { type: string; [k: string]: unknown }
/** Pause before each step of a paced (non-live) agent run, in ms: choosing a tool, reading its result, writing the answer. */
const STEP_MS: Record<string, number> = { tool_call: 800, tool_result: 250, final: 1000 };

async function j<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/preflight${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { detail?: string }).detail || `${r.status} ${r.statusText}`);
  return data as T;
}

export const pf = {
  facility: () => j<Facility>('/facility'),
  simulate: (state_changes: Record<string, Toggle>) => j<SimResult>('/simulate', { state_changes }),
  cutsets: (baseline: Record<string, Toggle>, max_order = 2) => j<CutSets>('/cutsets', { baseline, max_order }),
  maintenanceCuts: (maintenance: string[], max_order = 2) => j<CutSets>('/cutsets', { max_order, maintenance }),
  redundancy: (state_changes: Record<string, Toggle>) => j<{ services: ServiceRed[] }>('/redundancy', { state_changes }),
  findings: () => j<Findings>('/findings'),
  modelRead: () => j<ModelRead>('/findings/model-read', {}),
  transient: (failed: string[]) => j<Transient>('/transient', { failed }),
  /** Upload a facility as CSV or JSON (the format Export writes). Replaces the demo records too. */
  async importFacility(file: File): Promise<{ name: string; nodes: number }> {
    const isJson = file.name.toLowerCase().endsWith('.json') || file.type.includes('json');
    const r = await fetch('/api/preflight/import', {
      method: 'POST', headers: { 'Content-Type': isJson ? 'application/json' : 'text/csv' }, body: await file.text(),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data as { detail?: string }).detail || `${r.status} ${r.statusText}`);
    return data as { name: string; nodes: number };
  },
  restoreDemo: () => j<{ name: string; nodes: number }>('/facility/demo', {}),
  loadRetrofit: () => j<{ name: string; nodes: number }>('/facility/retrofit', {}),
  /** Pull measured load and meter evidence from Tiger. 503 when the meter database can't be reached. */
  syncMeters: () => j<LoadSource>('/meters/sync', {}),
  decide: (id: string, decision: 'confirmed' | 'rejected', actor: string, note = '') =>
    j<Finding>(`/findings/${encodeURIComponent(id)}/decision`, { decision, actor, note }),
  searchPlans: (task: { name: string; nodes: string[]; duration_h: number; earliest: number; latest: number }) =>
    j<PlanSearch>('/plans/search', { task }),
  compare: (a: object, b: object) => j<{ a: PlanEval; b: PlanEval; differences: Record<string, [unknown, unknown]> }>('/plans/compare', { a, b }),
  /** Stream an agent run. Returns a stop function. Without a live model the backend sends the whole run at once,
   *  so those runs are revealed one step at a time, at about the pace of a real Nemotron turn. */
  ask(question: string, onEvent: (e: AgentEvent) => void): () => void {
    const ctrl = new AbortController();
    const timers: number[] = [];
    let paced = false, due = 0;
    const emit = (e: AgentEvent) => {
      if (ctrl.signal.aborted) return;
      if (e.type === 'start') paced = e.mode !== 'live';
      if (e.type === 'fallback') paced = true;
      if (!paced) { onEvent(e); return; }
      due = Math.max(due, Date.now()) + (STEP_MS[e.type] ?? 0);
      timers.push(window.setTimeout(() => onEvent(e), due - Date.now()));
    };
    (async () => {
      try {
        const r = await fetch('/api/preflight/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }), signal: ctrl.signal });
        if (!r.ok || !r.body) throw new Error(`${r.status} ${r.statusText}`);
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split(/\r?\n\r?\n/);
          buf = parts.pop() ?? '';
          for (const p of parts) {
            const line = p.split(/\r?\n/).find((l) => l.startsWith('data:'));
            if (!line) continue;
            try { const ev = JSON.parse(line.slice(5).trim()); if (ev.type) emit(ev); } catch { /* partial event */ }
          }
        }
      } catch (e) {
        if (!ctrl.signal.aborted) emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { ctrl.abort(); timers.forEach(clearTimeout); };
  },
};
