import type { DataSource, EngineEvent, Screen, DirectorFlag, Certificate, WorkOrder, LegacyCheck, SourceFile, Series } from './types';
import { MockDataSource } from './MockDataSource';

/**
 * Talks to the FastAPI backend. Streams come over Server-Sent Events and carry the same
 * EngineEvent shapes the mock emits, so screens don't know which source they're on.
 * Static reads (checks, source, series) are fetched once at startup.
 */
export class ApiDataSource implements DataSource {
  readonly kind = 'api' as const;
  private listeners = new Set<(e: EngineEvent) => void>();
  private streams: Partial<Record<Screen, EventSource>> = {};
  private checks: LegacyCheck[] = [];
  private sources: Record<string, SourceFile[]> = {};
  private seriesCache: Record<string, Series> = {};
  private fallback = new MockDataSource(); // for series/static fallbacks and director flags
  private _flags: Record<DirectorFlag, boolean> = { flaggedCard: false, blockedSignoff: false, nemotronOffline: false, cached: false };
  private _speed: 1 | 2 | 5 = 1;

  async init() {
    const [c, s] = await Promise.all([fetch('/api/checks').then((r) => r.json()), fetch('/api/series').then((r) => r.json())]);
    this.checks = c; this.seriesCache = s;
    for (const ch of this.checks) this.sources[ch.id] = await fetch(`/api/source/${ch.id}`).then((r) => r.json());
    const mode = await fetch('/api/mode').then((r) => r.json());
    this.emit({ type: 'mode', mode: mode.mode });
  }
  listChecks() { return this.checks; }
  source(id: string) { return this.sources[id] ?? this.fallback.source(id); }
  series(id: string) { return this.seriesCache[id] ?? this.fallback.series(id); }
  subscribe(cb: (e: EngineEvent) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  private emit(e: EngineEvent) { this.listeners.forEach((l) => l(e)); }

  private open(screen: Screen, checkId: string) {
    this.streams[screen]?.close();
    this.emit({ type: 'reset', screen });
    const q = new URLSearchParams({ speed: String(this._speed), ...Object.fromEntries(Object.entries(this._flags).map(([k, v]) => [k, String(v)])) });
    const es = new EventSource(`/api/${screen}/${checkId}?${q}`);
    es.onmessage = (m) => { try { this.emit(JSON.parse(m.data)); } catch { /* ignore */ } };
    es.addEventListener('end', () => es.close());
    es.onerror = () => { es.close(); this.emit({ type: 'step', screen, step: { id: 'err', label: 'Backend unreachable. Start it with `make dev`, or switch to ?source=mock.' }, status: 'error' }); };
    this.streams[screen] = es;
  }
  runRead(id: string) { this.open('read', id); }
  runFind(id: string) { this.open('find', id); }
  runProve(id: string) { this.open('prove', id); }

  private async post<T>(url: string, body: unknown): Promise<T> {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    for (const ev of data.events ?? []) this.emit(ev);
    return data.result as T;
  }
  acceptFinding(id: number, by: string) { return this.post<WorkOrder>(`/api/findings/${id}/accept`, { by }); }
  dismissFinding(id: number, by: string, reason: string) { return this.post<void>(`/api/findings/${id}/dismiss`, { by, reason }); }
  undoFinding(id: number) { return this.post<void>(`/api/findings/${id}/undo`, {}); }
  signOff(checkId: string, by: string) { return this.post<Certificate>(`/api/signoff/${checkId}`, { by }); }
  acknowledgeHandoff(by: string) { return this.post<void>(`/api/handoff/ack`, { by }); }
  async refreshHandoff() { const h = await fetch('/api/handoff').then((r) => r.json()); this.emit({ type: 'handoff', data: h }); }

  director = {
    restart: (s: Screen) => { const id = this.checks[0]?.id ?? 'check_rack_inlet'; this.open(s, id); },
    jumpToEnd: (s: Screen) => { const id = this.checks[0]?.id ?? 'check_rack_inlet'; this._speed = 5; this.open(s, id); this._speed = 1; },
    setSpeed: (x: 1 | 2 | 5) => { this._speed = x; },
    toggle: (f: DirectorFlag, on: boolean) => { this._flags[f] = on; if (f === 'cached') fetch('/api/mode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: on ? 'cached' : 'live' }) }).then((r) => r.json()).then((m) => this.emit({ type: 'mode', mode: m.mode })); },
    flags: () => ({ ...this._flags }),
    speed: () => this._speed,
  };
}
