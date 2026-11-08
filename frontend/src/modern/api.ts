/** Client for the backend harness (/api/ttu). Every call can fail; callers fall back to the scripted demo and say so. */
export interface LiveStatus { tools: { promtool: boolean; amtool: boolean }; plugin_executable: boolean; nemotron_key: boolean; models: { super: string; nano: string }; pin: string; github_work_orders: boolean }
export interface LiveCase { id: string; name: string; scenario: string; result: Record<'missedExtra' | 'severity' | 'timing' | 'recipient' | 'recovery', 'pass' | 'fail'>; pass: boolean; notes: string[]; receivers: string[]; legacy: string[]; candidate: string[] }
export interface LiveReport {
  version: string; valid: boolean; promtool_check: string; cases: LiveCase[]; held_out: { id: string; name: string; pass: boolean }[];
  sanity: { name: string; rejected: boolean; failed_cases: string[] }[]; plugin: { bmc_health: string; state: string; output: string; ms: number; how: string }[];
  legacy_config: Record<string, string | number>; legacy_recipient: string; elapsed_s: number; error?: string
}
export interface AgentEvent { type: 'start' | 'tool' | 'thought' | 'note' | 'error' | 'done'; [k: string]: unknown }

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error || `${r.status} ${r.statusText}`);
  return body as T;
}

export const api = {
  status: () => j<LiveStatus>('/api/ttu/status'),
  inputs: () => j<{ pin: string; files: { path: string; kind: string; status: string; note?: string }[]; gaps: { item: string; status: string; where: string; impact: string }[]; facts: Record<string, unknown> }>('/api/ttu/inputs'),
  test: (version: string, candidate?: { rules: string; alertmanager: string }) => j<LiveReport>(`/api/ttu/test/${version}`, { method: 'POST', body: JSON.stringify(candidate ?? {}) }),
  ops: (path: string, body: object = {}) => j<Record<string, unknown>>(`/api/ttu/ops/${path}`, { method: 'POST', body: JSON.stringify(body) }),
  opsState: () => j<Record<string, unknown>>('/api/ttu/ops/state'),
  /** Stream an agent job. Returns a stop function. */
  agent(job: 'recover' | 'repair' | 'investigate', onEvent: (e: AgentEvent) => void, seed = 'v1') {
    const es = new EventSource(`/api/ttu/agent/${job}?seed=${seed}`);
    es.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* ignore partial */ } };
    es.addEventListener('end', () => es.close());
    es.onerror = () => { onEvent({ type: 'error', text: 'Lost connection to the backend.' }); es.close(); };
    return () => es.close();
  },
};
