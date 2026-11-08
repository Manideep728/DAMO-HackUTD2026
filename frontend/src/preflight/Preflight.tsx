import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Info, RotateCcw, Send, Upload } from 'lucide-react';
import { Badge, Button, cx } from '../components/ui';
import { DependencyMap } from './DependencyMap';
import { CutSetPanel, FindingsPanel, ImpactPanel, PlanResults, planOf } from './Panels';
import { pf, type Transient, type AgentEvent, type CutSets, type Facility, type Findings, type PlanSearch, type ServiceRed, type SimResult, type Toggle } from './api';

type Tab = 'impact' | 'weak' | 'findings' | 'plan' | 'agent';
const TABS: [Tab, string][] = [['impact', 'Impact'], ['weak', 'Weak points'], ['findings', 'Findings'], ['plan', 'Plan'], ['agent', 'Ask']];
const NEXT: Record<string, Toggle | undefined> = { undefined: 'maintenance', maintenance: 'failed', failed: undefined };

export default function Preflight() {
  const [facility, setFacility] = useState<Facility | null>(null);
  const [toggles, setToggles] = useState<Record<string, Toggle>>({});
  const [sim, setSim] = useState<SimResult | null>(null);
  const [red, setRed] = useState<ServiceRed[]>([]);
  const [cuts, setCuts] = useState<CutSets | null>(null);
  const [trans, setTrans] = useState<Transient | null>(null);
  const [findings, setFindings] = useState<Findings | null>(null);
  const [tab, setTab] = useState<Tab>('impact');
  const [zone, setZone] = useState('all');
  const [highlight, setHighlight] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFacility = useCallback(() => pf.facility().then(setFacility).catch((e) => setError(e.message)), []);
  useEffect(() => { loadFacility(); pf.findings().then(setFindings).catch((e) => setError(e.message)); }, [loadFacility]);

  // Re-simulate whenever the scenario or the confirmed graph changes.
  useEffect(() => {
    if (!facility) return;
    let live = true;
    const maint = Object.entries(toggles).filter(([, s]) => s === 'maintenance').map(([n]) => n);
    const failed = Object.fromEntries(Object.entries(toggles).filter(([, s]) => s === 'failed')) as Record<string, Toggle>;
    setSim(null); setCuts(null); setTrans(null);
    Promise.all([
      pf.simulate(toggles), pf.redundancy(toggles),
      maint.length ? pf.maintenanceCuts(maint) : pf.cutsets(failed),
      Object.keys(failed).length ? pf.transient(Object.keys(failed)) : Promise.resolve(null),
    ]).then(([s, r, c, t]) => { if (live) { setSim(s); setRed(r.services); setCuts(c); setTrans(t); setError(''); } })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [facility, toggles]);

  // Swapping the facility clears the scenario: the old toggles name equipment that may not exist any more.
  const swapFacility = async (what: string, load: () => Promise<{ name: string; nodes: number }>) => {
    try {
      const r = await load();
      setToggles({}); setHighlight([]); setZone('all');
      await loadFacility();
      setFindings(await pf.findings());
      setNotice(`Loaded ${r.name}: ${r.nodes} nodes.`); setError('');
    } catch (e) {
      setError(`${what} failed: ${(e as Error).message.replace(/^import failed: /, '')}`);
    }
  };

  const toggle = useCallback((id: string) => setToggles((t) => {
    const next = NEXT[String(t[id])];
    const copy = { ...t };
    if (next) copy[id] = next; else delete copy[id];
    return copy;
  }), []);

  const shared = useMemo(() => new Set(red.flatMap((s) => s.single_points)), [red]);
  const zones = useMemo(() => ['all', ...new Set((facility?.nodes ?? []).map((n) => n.zone))], [facility]);
  const maintenance = Object.entries(toggles).filter(([, s]) => s === 'maintenance').map(([n]) => n);

  if (!facility) return <div className="text-muted">{error ? `Could not load the facility: ${error}` : 'Loading facility…'}</div>;
  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-[1_1_420px]">
          <div className="kicker mb-1">Preflight · {facility.name}</div>
          <h1 className="page-title">Rehearse a change before you make it</h1>
          <p className="text-muted mt-1 text-[14px] max-w-[720px]">Click equipment to put it in maintenance or fail it. The simulator shows what goes down, how much headroom is left, and which weak points the change creates.</p>
        </div>
        <div className="flex items-center gap-2">
          <select id="pf-zone" aria-label="Zoom to zone" value={zone} onChange={(e) => setZone(e.target.value)} className="h-9 px-2 rounded-lg border hairline bg-surface text-[13px]">
            {zones.map((z) => <option key={z} value={z}>{z === 'all' ? 'Whole site' : `Zone ${z}`}</option>)}
          </select>
          <Button onClick={() => { setToggles({}); setHighlight([]); }} disabled={!Object.keys(toggles).length}><RotateCcw size={14} /> Reset scenario</Button>
          <input ref={fileInput} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" aria-label="Facility file"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) swapFacility('Import', () => pf.importFacility(f)); }} />
          <Button onClick={() => fileInput.current?.click()} title="Load a facility from CSV or JSON. Replaces the demo hall and its records."><Upload size={14} /> Import</Button>
          <a href="/api/preflight/export.csv" download="facility.csv" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border hairline text-[13px] hover:bg-surface-2" title="Download the current graph as CSV"><Download size={14} /> Export</a>
          <Button onClick={() => swapFacility('Restoring the demo', pf.restoreDemo)}>Restore demo</Button>
        </div>
      </header>

      <div className="flex items-start gap-2 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-[12.5px]" role="note">
        <Info size={14} className="shrink-0 mt-0.5 text-muted" /> <span><b>Simplified model.</b> {facility.fidelity}</span>
      </div>
      {error && <div className="text-critical text-[13px] whitespace-pre-wrap" role="alert">{error}</div>}
      {notice && !error && <div className="text-muted text-[13px]" role="status">{notice}</div>}

      <div className="flex flex-wrap gap-2 items-center text-[12px]">
        <span className="text-muted">Scenario:</span>
        {Object.keys(toggles).length === 0 && <span className="text-faint">everything in service</span>}
        {Object.entries(toggles).map(([n, s]) => <Badge key={n} tone={s === 'failed' ? 'critical' : 'warning'}>{n} · {s}</Badge>)}
        <span className="ml-auto flex gap-3 text-faint"><Legend color="var(--legacy)" label="power" /><Legend color="var(--accent)" label="cooling" /><Legend color="var(--untrusted)" dashed label="suspected from records" /></span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(380px,1fr)]">
        <div className="h-[72vh] min-w-0">
          <DependencyMap facility={facility} sim={sim} toggles={toggles} highlight={new Set(highlight)} shared={shared} zone={zone} onToggle={toggle} />
        </div>
        <aside className="card min-w-0 flex flex-col max-h-[72vh]">
          <nav className="shrink-0 flex gap-1 px-3 pt-3 border-b hairline overflow-x-auto" aria-label="Panels">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={cx('h-9 px-3 text-[13px] font-medium rounded-t-lg t whitespace-nowrap', tab === id ? 'text-text border-b-2 border-accent' : 'text-muted hover:text-text')}>
                {label}{id === 'findings' && findings && findings.findings.some((f) => f.status === 'open' && f.classification !== 'confirms') && <span className="ml-1 text-untrusted">●</span>}
              </button>
            ))}
          </nav>
          <div className="p-4 overflow-auto min-h-0">
            {tab === 'impact' && <ImpactPanel sim={sim} red={red} transient={trans} onPick={setHighlight} />}
            {tab === 'weak' && <CutSetPanel cuts={cuts} maintenance={maintenance} picked={highlight.join('+')} onPick={setHighlight} />}
            {tab === 'findings' && <FindingsPanel data={findings} onShow={setHighlight} onDecide={async (f, d, actor, note) => {
              await pf.decide(f.id, d, actor, note);
              setFindings(await pf.findings());
              await loadFacility();
            }} />}
            {tab === 'plan' && <PlanPanel facility={facility} preset={maintenance} />}
            {tab === 'agent' && <AgentPanel onShow={setHighlight} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return <span className="inline-flex items-center gap-1"><svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : undefined} /></svg>{label}</span>;
}

function PlanPanel({ facility, preset }: { facility: Facility; preset: string[] }) {
  const [nodes, setNodes] = useState<string>(preset.join(', ') || 'CRAH-3');
  const [hours, setHours] = useState(4);
  const [earliest, setEarliest] = useState(0);
  const [latest, setLatest] = useState(48);
  const [res, setRes] = useState<PlanSearch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [compare, setCompare] = useState<number[]>([]);
  const [diff, setDiff] = useState<Record<string, [unknown, unknown]> | null>(null);
  const ids = new Set(facility.nodes.map((n) => n.id));

  const run = async () => {
    const list = nodes.split(/[,\s]+/).filter(Boolean);
    const unknown = list.filter((n) => !ids.has(n));
    if (!list.length || unknown.length) { setError(unknown.length ? `Unknown equipment: ${unknown.join(', ')}` : 'Name the equipment to take offline.'); return; }
    if (latest - earliest < hours) { setError('The allowed range is shorter than the task.'); return; }
    setBusy(true); setError(''); setRes(null); setCompare([]); setDiff(null);
    try { setRes(await pf.searchPlans({ name: `Maintenance on ${list.join(', ')}`, nodes: list, duration_h: hours, earliest, latest })); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!res || compare.length !== 2) { setDiff(null); return; }
    const list = nodes.split(/[,\s]+/).filter(Boolean);
    const [a, b] = compare.map((i) => planOf(res, i));
    pf.compare({ nodes: list, start: a.start, duration_h: hours, mitigations: a.mitigations }, { nodes: list, start: b.start, duration_h: hours, mitigations: b.mitigations })
      .then((d) => setDiff(d.differences)).catch((e) => setError(e.message));
  }, [compare, res, nodes, hours]);

  return (
    <div className="grid gap-3 text-[12.5px]">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 grid gap-1">Equipment to take offline<input id="pf-plan-nodes" value={nodes} onChange={(e) => setNodes(e.target.value)} className="h-8 px-2 rounded-md border hairline bg-surface mono" /></label>
        <label className="grid gap-1">Duration (hours)<input id="pf-plan-hours" type="number" min={1} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="h-8 px-2 rounded-md border hairline bg-surface" /></label>
        <label className="grid gap-1">Window (hour from–to)<span className="flex gap-1"><input id="pf-plan-from" type="number" min={0} value={earliest} onChange={(e) => setEarliest(Number(e.target.value))} className="h-8 w-full px-2 rounded-md border hairline bg-surface" /><input id="pf-plan-to" type="number" min={1} value={latest} onChange={(e) => setLatest(Number(e.target.value))} className="h-8 w-full px-2 rounded-md border hairline bg-surface" /></span></label>
      </div>
      <Button variant="primary" onClick={run} disabled={busy}>{busy ? 'Simulating windows…' : 'Find the safest window'}</Button>
      {error && <p className="text-critical">{error}</p>}
      {res && <Timeline res={res} windows={facility.windows} from={earliest} to={latest} />}
      {res && <PlanResults res={res} compare={compare} onToggleCompare={(i) => setCompare((c) => c.includes(i) ? c.filter((x) => x !== i) : [...c, i].slice(-2))} />}
      {diff && (
        <table className="w-full text-[12px] border-t hairline"><thead><tr className="text-muted text-left"><th className="py-1 font-medium">Differs</th><th className="font-medium">A</th><th className="font-medium">B</th></tr></thead>
          <tbody>{Object.entries(diff).map(([k, [a, b]]) => <tr key={k} className="border-t hairline"><td className="py-1">{k.replaceAll('_', ' ')}</td><td className="mono">{fmt(a)}</td><td className="mono">{fmt(b)}</td></tr>)}</tbody></table>
      )}
    </div>
  );
}

function fmt(v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  return v == null ? '—' : String(v);
}

function Timeline({ res, windows, from, to }: { res: PlanSearch; windows: Facility['windows']; from: number; to: number }) {
  const span = Math.max(1, to - from);
  const x = (h: number) => `${((h - from) / span) * 100}%`;
  return (
    <div className="grid gap-1">
      <div className="relative h-9 rounded-md bg-surface-2 border hairline overflow-hidden" aria-label="Maintenance timeline">
        {windows.map((w) => <div key={w.label} title={w.label} className="absolute top-0 h-3 bg-watch/50" style={{ left: x(w.start), width: `calc(${x(w.end)} - ${x(w.start)})` }} />)}
        {res.top.map((p, i) => <div key={i} title={`hour ${p.start}–${p.end}`} className={cx('absolute bottom-0 h-5 rounded-sm', i === 0 ? 'bg-ok' : 'bg-ok/40')} style={{ left: x(p.start), width: `calc(${x(p.end)} - ${x(p.start)})` }} />)}
      </div>
      <div className="flex justify-between text-[10.5px] text-faint mono"><span>h{from}</span><span>top band: other scheduled work · green: candidate windows</span><span>h{to}</span></div>
    </div>
  );
}

function AgentPanel({ onShow }: { onShow: (nodes: string[]) => void }) {
  const [q, setQ] = useState('When is the safest time to take CRAH-3 offline for 4 hours?');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  const ask = () => {
    if (!q.trim() || running) return;
    setEvents([]); setRunning(true);
    stop.current = pf.ask(q.trim(), (e) => {
      setEvents((xs) => [...xs, e]);
      if (e.type === 'final' || e.type === 'error') setRunning(false);
    });
  };
  const start = events.find((e) => e.type === 'start');
  const final = events.find((e) => e.type === 'final') as (AgentEvent & { answer: Answer; problems: string[] }) | undefined;
  const examples = ['Are Pump A and Pump B independent?', 'What happens if ATS-1 fails?', 'What becomes a single point of failure while UTIL-A is in maintenance?'];
  return (
    <div className="grid gap-3 text-[12.5px]">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input id="pf-question" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 px-2 rounded-md border hairline bg-surface flex-1" aria-label="Question" />
        <Button variant="primary" type="submit" disabled={running}><Send size={14} /> Ask</Button>
      </form>
      <div className="flex flex-wrap gap-1">{examples.map((x) => <button key={x} type="button" className="kbd !h-auto py-0.5 text-left" onClick={() => setQ(x)}>{x}</button>)}</div>
      {start && <Badge tone={start.mode === 'live' ? 'ok' : 'neutral'}>{String(start.model)}</Badge>}
      <ol className="grid gap-1">
        {events.filter((e) => e.type === 'tool_call' || e.type === 'fallback' || e.type === 'rejected_answer' || e.type === 'error').map((e, i) => (
          <li key={i} className="rounded-md border hairline px-2 py-1 mono text-[11.5px]">
            {e.type === 'tool_call' && <><span className="text-accent">{String(e.id)}</span> {String(e.tool)}({JSON.stringify(e.args)})</>}
            {e.type === 'fallback' && <span className="text-warning">{String(e.reason)}</span>}
            {e.type === 'rejected_answer' && <span className="text-warning">Answer rejected: {(e.problems as string[]).join('; ')}</span>}
            {e.type === 'error' && <span className="text-critical">{String(e.message)}</span>}
          </li>
        ))}
      </ol>
      {final && <AnswerView a={final.answer} problems={final.problems} onShow={onShow} />}
    </div>
  );
}

interface Answer {
  refused?: boolean; recommendation: string; recommendation_evidence?: string[];
  claims?: { text: string; evidence: string[] }[]; rejected_alternatives?: { option: string; reason: string; evidence: string[] }[];
  risks?: { text: string; evidence: string[] }[]; assumptions?: string[];
}

function AnswerView({ a, problems, onShow }: { a: Answer; problems: string[]; onShow: (n: string[]) => void }) {
  const ev = (e?: string[]) => e && e.length ? <span className="mono text-faint"> [{e.join(', ')}]</span> : null;
  const nodesIn = (t: string) => [...t.matchAll(/\b[A-Z]{1,6}\d?-[A-Z0-9]{1,3}(?:-[0-9]{2})?\b/g)].map((m) => m[0]);
  return (
    <section className="rounded-xl border hairline p-3 grid gap-2">
      <p className={cx('font-semibold text-[13.5px]', a.refused && 'text-muted')} onMouseEnter={() => onShow(nodesIn(a.recommendation))}>{a.recommendation}{ev(a.recommendation_evidence)}</p>
      {a.claims?.map((c, i) => <p key={i}>{c.text}{ev(c.evidence)}</p>)}
      {a.rejected_alternatives && a.rejected_alternatives.length > 0 && <div><div className="text-muted">Rejected</div>{a.rejected_alternatives.map((r, i) => <p key={i}><span className="mono">{r.option}</span>: {r.reason}{ev(r.evidence)}</p>)}</div>}
      {a.risks && a.risks.length > 0 && <div><div className="text-muted">Risks</div>{a.risks.map((r, i) => <p key={i} className="text-warning" onMouseEnter={() => onShow(nodesIn(r.text))}>{r.text}{ev(r.evidence)}</p>)}</div>}
      {a.assumptions && a.assumptions.length > 0 && <div className="text-faint">Assumes: {a.assumptions.join('; ')}</div>}
      <div className={cx('text-[11.5px]', problems.length ? 'text-critical' : 'text-ok')}>{problems.length ? `Unverified: ${problems.join('; ')}` : 'Every claim traces to a tool result.'}</div>
    </section>
  );
}
