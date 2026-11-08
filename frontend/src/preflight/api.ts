/** Client for /api/preflight. Every call can fail; screens show the error instead of stale numbers. */

export type NodeState = 'operational' | 'degraded' | 'maintenance' | 'failed';
export type Toggle = 'maintenance' | 'failed';

export interface FNode {
  id: string; type: string; label: string; zone: string; capacity: number; base_load: number; heat_load: number;
  criticality: number; failure_rate: number | null; flexible_kw: number; layer: number; provenance: string;
}
export interface FEdge {
  consumer: string; supplier: string; group: string; mode?: string; k?: number | null; resource?: string;
  source: string; status: string; confidence: number; citations?: { doc_id: string; quote: string }[]; finding?: string;
}
export interface Facility {
  name: string; fidelity: string; critical_services: string[]; nodes: FNode[]; edges: FEdge[]; suspected: FEdge[];
  windows: { nodes: string[]; start: number; end: number; label: string }[];
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
export interface Evidence { doc_id: string; date: string; kind: string; quote: string; reason: string }
export interface Finding {
  id: string; consumer: string; supplier: string; classification: 'confirms' | 'contradicts' | 'new'; replaces: string | null;
  confidence: number; supporting: Evidence[]; contradicting: Evidence[]; set_aside: Evidence[]; status: string; claim: string;
  impact: { new_single_points?: string[]; single_points_after?: string[]; services_downgraded?: string[]; redundancy_after?: Record<string, string> };
}
export interface Findings { findings: Finding[]; rejected: { doc_id: string; quote: string; reason: string }[]; metrics: { precision: number; recall: number } }
export interface PlanEval {
  start: number; end: number; mitigations: string[]; lost_services: string[]; lost_load: string[]; lost_kw?: number;
  min_cut_order: number; single_points: string[]; min_margin: number; tightest: string | null; tightest_hour?: number | null; reasons: string[];
}
export interface PlanSearch { evaluated: number; top: PlanEval[]; rejected: PlanEval[]; rejected_total: number }
export interface AgentEvent { type: string; [k: string]: unknown }

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
  decide: (id: string, decision: 'confirmed' | 'rejected', actor: string, note = '') =>
    j<Finding>(`/findings/${encodeURIComponent(id)}/decision`, { decision, actor, note }),
  searchPlans: (task: { name: string; nodes: string[]; duration_h: number; earliest: number; latest: number }) =>
    j<PlanSearch>('/plans/search', { task }),
  compare: (a: object, b: object) => j<{ a: PlanEval; b: PlanEval; differences: Record<string, [unknown, unknown]> }>('/plans/compare', { a, b }),
  /** Stream an agent run. Returns a stop function. */
  ask(question: string, onEvent: (e: AgentEvent) => void): () => void {
    const ctrl = new AbortController();
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
            try { const ev = JSON.parse(line.slice(5).trim()); if (ev.type) onEvent(ev); } catch { /* partial event */ }
          }
        }
      } catch (e) {
        if (!ctrl.signal.aborted) onEvent({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => ctrl.abort();
  },
};
