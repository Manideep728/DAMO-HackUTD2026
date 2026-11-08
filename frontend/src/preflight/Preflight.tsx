import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, RotateCcw, Send, Wrench, Zap, CircleCheck, OctagonAlert, TriangleAlert, ShieldCheck, X, MousePointerClick, Loader2, ArrowUp, ArrowDown, Rows3, Sparkles, Search, Check } from 'lucide-react';
import { Badge, Button, cx } from '../components/ui';
import { FacilityMap, LAYERS, TONE_WORD, toneOf, rowOf, groupId, type Tone } from './FacilityMap';
import { CutSetPanel, FindingsPanel, ImpactPanel, PlanResults, planOf } from './Panels';
import { pf, type AgentEvent, type CutSets, type Facility, type Findings, type PlanSearch, type ServiceRed, type SimResult, type Toggle } from './api';

type Tab = 'impact' | 'weak' | 'findings' | 'plan' | 'agent';
function useWide(px = 1400) {
  const q = `(min-width: ${px}px)`;
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const f = () => setWide(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, [q]);
  return wide;
}
const TABS: [Tab, string][] = [['impact', 'Impact'], ['weak', 'Weak points'], ['findings', 'Findings'], ['plan', 'Plan'], ['agent', 'Ask']];

/** One-click rehearsals, each checked against the simulator: safe, at risk, and the outage maintenance can cause. */
const PRESETS: { label: string; changes: Record<string, Toggle> }[] = [
  { label: 'Chiller CH-1 maintenance', changes: { 'CH-1': 'maintenance' } },
  { label: 'UPS-A maintenance', changes: { 'UPS-A': 'maintenance' } },
  { label: 'ATS-1 fails', changes: { 'ATS-1': 'failed' } },
  { label: 'UPS-A in maintenance, then UPS-B fails', changes: { 'UPS-A': 'maintenance', 'UPS-B': 'failed' } },
  { label: 'CRAH-1 in maintenance, then CRAH-2 fails', changes: { 'CRAH-1': 'maintenance', 'CRAH-2': 'failed' } },
];

export default function Preflight() {
  const [facility, setFacility] = useState<Facility | null>(null);
  const [toggles, setToggles] = useState<Record<string, Toggle>>({});
  const [sim, setSim] = useState<SimResult | null>(null);
  const [red, setRed] = useState<ServiceRed[]>([]);
  const [baseRed, setBaseRed] = useState<ServiceRed[]>([]);
  const [cuts, setCuts] = useState<CutSets | null>(null);
  const [findings, setFindings] = useState<Findings | null>(null);
  const [tab, setTab] = useState<Tab>('impact');
  const [zone, setZone] = useState('all');
  const [highlight, setHighlight] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [whyOpen, setWhyOpen] = useState(false);
  const wide = useWide();
  // A new scenario opens the explanation automatically: root cause and the agent's check catch the eye.
  const scenarioKey = JSON.stringify(toggles);
  useEffect(() => { setWhyOpen(Object.keys(toggles).length > 0); }, [scenarioKey]);  // eslint-disable-line react-hooks/exhaustive-deps
  const [hover, setHoverNow] = useState<string | null>(null);
  // Debounced hover: the chain highlight re-renders the map, so never do it mid-click.
  const hoverTimer = useRef<number | undefined>(undefined);
  const setHover = useCallback((id: string | null) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHoverNow(id), id ? 140 : 60);
  }, []);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const [error, setError] = useState('');

  const loadFacility = useCallback(() => pf.facility().then(setFacility).catch((e) => setError(e.message)), []);
  useEffect(() => {
    loadFacility();
    pf.findings().then(setFindings).catch((e) => setError(e.message));
    pf.redundancy({}).then((r) => setBaseRed(r.services)).catch(() => undefined);
  }, [loadFacility]);

  // Re-simulate whenever the scenario or the confirmed graph changes.
  useEffect(() => {
    if (!facility) return;
    let live = true;
    const maint = Object.entries(toggles).filter(([, s]) => s === 'maintenance').map(([n]) => n);
    const failed = Object.fromEntries(Object.entries(toggles).filter(([, s]) => s === 'failed')) as Record<string, Toggle>;
    Promise.all([pf.simulate(toggles), pf.redundancy(toggles), maint.length ? pf.maintenanceCuts(maint) : pf.cutsets(failed)])
      .then(([s, r, c]) => { if (live) { setSim(s); setRed(r.services); setCuts(c); setError(''); } })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [facility, toggles]);

  const setState = useCallback((id: string, st: Toggle | null) => setToggles((t) => {
    const copy = { ...t }; if (st) copy[id] = st; else delete copy[id]; return copy;
  }), []);
  const reset = () => { setToggles({}); setHighlight([]); setSelected(null); };

  const zones = useMemo(() => ['all', ...new Set((facility?.nodes ?? []).map((n) => n.zone))], [facility]);
  const maintenance = Object.entries(toggles).filter(([, s]) => s === 'maintenance').map(([n]) => n);
  const visibleFacility = useMemo(() => {
    if (!facility || zone === 'all') return facility;
    const keep = new Set(facility.nodes.filter((n) => n.zone === zone).map((n) => n.id));
    return { ...facility, nodes: facility.nodes.filter((n) => keep.has(n.id)), edges: facility.edges.filter((e) => keep.has(e.consumer) && keep.has(e.supplier)), suspected: facility.suspected.filter((e) => keep.has(e.consumer) && keep.has(e.supplier)) };
  }, [facility, zone]);

  if (!facility || !visibleFacility) return <div className="text-muted">{error ? `Could not load the facility: ${error}` : 'Loading facility…'}</div>;
  const picked = new Set(highlight);
  const active = Object.keys(toggles).length > 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] -mt-5 grid gap-4">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-[24px] font-semibold tracking-[-0.025em]">Rehearse a change before you make it</h1>
            <span className="text-[13px] text-muted">Preflight · {facility.name}</span>
          </div>
          <p className="text-[12.5px] text-faint mt-0.5 flex items-center gap-1.5" title={facility.fidelity}><Info size={12} /> Simplified model: power and cooling as kW budgets on a dependency graph. Not CFD, load flow or a protection study.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select id="pf-zone" aria-label="Zoom to zone" value={zone} onChange={(e) => setZone(e.target.value)} className="h-9 px-2 rounded-lg border hairline bg-surface text-[13px]">
            {zones.map((z) => <option key={z} value={z}>{z === 'all' ? 'Whole site' : `Zone ${z}`}</option>)}
          </select>
          <Button onClick={reset} disabled={!active && !highlight.length && !selected}><RotateCcw size={14} /> Reset scenario</Button>
        </div>
      </header>
      {error && <div className="text-critical text-[13px]" role="alert">{error}</div>}

      <div className="hidden md:flex min-[1400px]:hidden gap-2 overflow-x-auto -mb-1 pb-1" aria-label="Rehearse a common change">
        {PRESETS.map((p) => {
          const on = JSON.stringify(p.changes) === JSON.stringify(toggles);
          return <button key={p.label} onClick={() => { setToggles(p.changes); setSelected(null); setHighlight([]); }} className={cx('shrink-0 h-11 px-3.5 rounded-xl border text-[13.5px] t whitespace-nowrap', on ? 'border-text bg-surface font-medium' : 'border-border bg-surface/60 hover:bg-surface')}>{p.label}</button>;
        })}
      </div>
      <div className="grid gap-4 min-[1400px]:grid-cols-[minmax(0,1fr)_400px] items-start">
        {/* Map: the hero */}
        <section className="panel rounded-[18px] overflow-hidden relative h-[70vh] min-h-[480px] md:h-[calc(100vh-232px)] md:portrait:h-[calc(100vh-290px)] md:min-h-[540px] min-[1400px]:h-[calc(100vh-170px)] order-2 md:order-1">
          <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 px-4 py-3 pointer-events-none">
            <span className="text-[12px] text-[var(--panel-muted)] pointer-events-auto">Scenario:</span>
            {!active && <span className="text-[12px] text-[var(--panel-text)] opacity-80">everything in service</span>}
            {Object.entries(toggles).map(([n, s]) => (
              <span key={n} className={cx('pointer-events-auto pop-in h-6 pl-2 pr-1 rounded-md text-[12px] inline-flex items-center gap-1 border', s === 'failed' ? 'border-[var(--critical)] text-[var(--critical)] bg-[var(--critical)]/10' : 'border-[var(--warning)] text-[var(--warning)] bg-[var(--warning)]/10')}>
                <span className="mono">{n}</span> · {s}
                <button onClick={() => setState(n, null)} className="h-4 w-4 grid place-items-center rounded hover:bg-white/10" aria-label={`Return ${n} to service`}><X size={11} /></button>
              </span>
            ))}
            <span className="ml-auto hidden sm:flex gap-3 text-[11.5px] text-[var(--panel-muted)]"><Legend color="var(--panel-muted)" label="power" /><Legend color="var(--panel-accent)" label="cooling" /><Legend color="var(--untrusted)" dashed label="suspected from records" /><Legend color="var(--critical)" dashed label="lost supply" /></span>
          </div>
          <div className={cx('absolute inset-x-0 bottom-0 top-[44px] t', active && whyOpen && !wide && !selected && 'md:left-[404px]')}>
            <FacilityMap key={active && whyOpen && !wide && !selected ? 'beside-why' : 'full'} facility={visibleFacility} sim={sim} toggles={toggles} selected={selected} hover={hover} picked={picked} expanded={expanded}
              onSelect={(id) => setSelected(id || null)} onHover={setHover} />
          </div>
          {selected && (
            <Trace facility={facility} sim={sim} toggles={toggles} id={selected} expanded={expanded}
              onClose={() => setSelected(null)} onSelect={setSelected} onState={setState}
              onToggleRow={(row) => { setExpanded((x) => { const n = new Set(x); if (n.has(row)) n.delete(row); else n.add(row); return n; }); setSelected(null); }} />
          )}
          {active && sim && whyOpen && !wide && !selected && (
            <Why facility={facility} sim={sim} red={red} baseRed={baseRed} toggles={toggles} expanded={expanded} onClose={() => setWhyOpen(false)} onShow={setHighlight} />
          )}
          {active && !selected && sim && (!whyOpen || wide) && <VerdictStrip sim={sim} red={red} baseRed={baseRed} onWhy={whyOpen ? undefined : () => setWhyOpen(true)} />}
          {!selected && !active && (
            <div className="absolute left-4 bottom-4 z-10 text-[13px] text-[var(--panel-muted)] flex items-center gap-1.5 pointer-events-none"><MousePointerClick size={14} /> Tap any equipment to trace what feeds it and what it feeds.</div>
          )}
        </section>

        {/* Rail: what to change, what happens */}
        <aside className="grid gap-3 min-w-0 order-1 md:order-2 min-[1400px]:max-h-[calc(100vh-170px)] min-[1400px]:overflow-auto min-[1400px]:pr-1">
          <div className="card p-4 md:hidden min-[1400px]:block">
            <div className="text-[12.5px] text-muted mb-2">Rehearse a common change</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const on = JSON.stringify(p.changes) === JSON.stringify(toggles);
                return <button key={p.label} onClick={() => { setToggles(p.changes); setSelected(null); setHighlight([]); }} className={cx('h-8 px-2.5 rounded-lg border text-[12.5px] t text-left', on ? 'border-text bg-surface-2 font-medium' : 'border-border hover:border-border-strong hover:bg-surface-2')}>{p.label}</button>;
              })}
            </div>
          </div>

          {active && sim && wide && whyOpen
            ? <Why docked facility={facility} sim={sim} red={red} baseRed={baseRed} toggles={toggles} expanded={expanded} onClose={() => setWhyOpen(false)} onShow={setHighlight} />
            : <Verdict sim={sim} red={red} baseRed={baseRed} active={active} onPick={setHighlight} picked={picked} />}

          <div className="card min-w-0 flex flex-col">
            <nav className="shrink-0 flex gap-1 px-3 pt-2 border-b hairline overflow-x-auto" aria-label="Panels">
              {TABS.map(([id, label]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={cx('h-9 px-2.5 text-[13px] font-medium t whitespace-nowrap border-b-2 -mb-px', tab === id ? 'text-text border-text' : 'text-muted border-transparent hover:text-text')}>
                  {label}{id === 'findings' && findings && findings.findings.some((f) => f.status === 'open' && f.classification !== 'confirms') && <span className="ml-1 text-untrusted">●</span>}
                </button>
              ))}
            </nav>
            <div key={tab} className="p-4 min-h-0 stage-in">
              {tab === 'impact' && <ImpactPanel sim={sim} red={red} onPick={setHighlight} />}
              {tab === 'weak' && <CutSetPanel cuts={cuts} maintenance={maintenance} picked={highlight.join('+')} onPick={setHighlight} />}
              {tab === 'findings' && <FindingsPanel data={findings} onShow={setHighlight} onDecide={async (f, d, actor, note) => {
                await pf.decide(f.id, d, actor, note);
                setFindings(await pf.findings());
                await loadFacility();
              }} />}
              {tab === 'plan' && <PlanPanel facility={facility} preset={maintenance} />}
              {tab === 'agent' && <AgentPanel onShow={setHighlight} />}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function SelectedFacts({ facility, id, sim }: { facility: Facility; id: string; sim: SimResult | null }) {
  const n = facility.nodes.find((x) => x.id === id)!;
  const feeds = new Set([...facility.edges, ...facility.suspected].filter((e) => e.supplier === id).map((e) => e.consumer));
  const needs = new Set([...facility.edges, ...facility.suspected].filter((e) => e.consumer === id).map((e) => e.supplier));
  const st = sim?.nodes[id];
  const spare = st?.margin_kw;
  return (
    <div className="grid grid-cols-3 gap-2 mt-3 text-[12px]">
      <Fact label="State" value={(st?.state ?? 'operational').replace(/^./, (c) => c.toUpperCase())} tone={st?.state === 'failed' ? 'critical' : st?.state === 'operational' || !st ? 'ok' : 'warning'} />
      <Fact label="Spare" value={spare == null || !n.capacity ? '—' : `${Math.round(spare)} kW`} />
      <Fact label="Feeds · needs" value={`${feeds.size} · ${needs.size}`} />
    </div>
  );
}
function Fact({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warning' | 'critical' }) {
  return <div className="rounded-lg bg-surface-2 px-2.5 py-1.5"><div className="text-faint text-[11px]">{label}</div><div className={cx('mono font-semibold', tone === 'critical' ? 'text-critical' : tone === 'warning' ? 'text-warning' : tone === 'ok' ? 'text-ok' : '')}>{value}</div></div>;
}

/** The answer a planner needs, in one card: is this safe, and what does it cost in redundancy? */
function Verdict({ sim, red, baseRed, active, onPick, picked }: { sim: SimResult | null; red: ServiceRed[]; baseRed: ServiceRed[]; active: boolean; onPick: (n: string[]) => void; picked: Set<string> }) {
  if (!active) return (
    <div className="card p-4"><div className="flex items-center gap-2 font-semibold text-[15px]"><ShieldCheck size={17} className="text-ok" /> Everything in service</div>
      <p className="text-[12.5px] text-muted mt-1">{baseRed.length ? `${baseRed.filter((s) => s.effective === '2N').length} of ${baseRed.length} critical services are fully redundant (2N).` : 'Loading redundancy…'} Pick a change to see what it costs.</p></div>
  );
  if (!sim) return <div className="card p-4 text-[13px] text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Simulating…</div>;
  const base = new Map(baseRed.map((s) => [s.service, s.effective]));
  const dropped = red.filter((s) => base.get(s.service) && base.get(s.service) !== s.effective && (s.effective === 'N' || s.effective === 'below N'));
  const spofs = [...new Set(red.flatMap((s) => s.single_points))];
  const outage = sim.lost_services.length > 0;
  const risk = !outage && (dropped.length > 0 || sim.min_margin < 0.1);
  const tone = outage ? 'critical' : risk ? 'warning' : 'ok';
  const Icon = outage ? OctagonAlert : risk ? TriangleAlert : CircleCheck;
  return (
    <div key={JSON.stringify([sim.lost_count, dropped.length, spofs.length])} className={cx('card p-4 pop-in', tone === 'critical' ? 'border-critical/60' : tone === 'warning' ? 'border-warning/60' : 'border-ok/50')}>
      <div className={cx('flex items-center gap-2 font-semibold text-[16px]', tone === 'critical' ? 'text-critical' : tone === 'warning' ? 'text-warning' : 'text-ok')}>
        <Icon size={18} /> {outage ? 'Outage' : risk ? 'Safe, but exposed' : 'Safe'}
      </div>
      <p className="text-[13.5px] mt-1.5 leading-relaxed">
        {outage ? <>{sim.lost_services.length} critical services and {sim.lost_count} racks or workloads go down ({sim.lost_kw} kW).</>
          : dropped.length ? <>Nothing goes down, but <b>{dropped.length} critical services</b> drop to a single path ({dropped.map((d) => base.get(d.service)).filter((v, i, a) => a.indexOf(v) === i).join('/')} → N). One more failure takes them out.</>
            : <>Nothing goes down and redundancy holds.</>}
      </p>
      <div className="grid grid-cols-3 gap-2 mt-3 text-[12px]">
        <Fact label="Services lost" value={String(sim.lost_services.length)} tone={outage ? 'critical' : 'ok'} />
        <Fact label="Degraded" value={String(sim.degraded.length)} tone={sim.degraded.length ? 'warning' : 'ok'} />
        {outage ? <Fact label="Load lost" value={`${sim.lost_kw} kW`} tone="critical" />
          : <Fact label="Tightest" value={sim.tightest ? `${Math.round(sim.min_margin * 100)}%` : '—'} tone={sim.min_margin < 0.1 ? 'warning' : 'ok'} />}
      </div>
      {spofs.length > 0 && (
        <div className="mt-3">
          <div className="text-[12px] text-muted mb-1.5">New single points of failure · click to show on the map</div>
          <div className="flex flex-wrap gap-1.5">{spofs.map((s) => <button key={s} onClick={() => onPick(picked.has(s) ? [] : [s])} className={cx('h-7 px-2 rounded-md border mono text-[12px] t', picked.has(s) ? 'border-untrusted bg-untrusted/15 text-untrusted' : 'border-untrusted/40 text-untrusted hover:bg-untrusted/10')}>{s}</button>)}
            <button onClick={() => onPick(spofs)} className="h-7 px-2 rounded-md text-[12px] text-muted hover:text-text">show all</button></div>
        </div>
      )}
      {sim.tightest && !outage && <div className="text-[12px] text-faint mt-2.5">Tightest headroom: <span className="mono text-muted">{sim.tightest}</span> at {Math.round(sim.min_margin * 100)}%.</div>}
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

/** Trace: everything upstream (what it needs) and downstream (what it feeds), layer by layer, in words. */
function Trace({ facility, sim, toggles, id, expanded, onClose, onSelect, onState, onToggleRow }: {
  facility: Facility; sim: SimResult | null; toggles: Record<string, Toggle>; id: string; expanded: Set<string>;
  onClose: () => void; onSelect: (id: string) => void; onState: (id: string, s: Toggle | null) => void; onToggleRow: (row: string) => void;
}) {
  const isGroup = id.startsWith('row:');
  const row = isGroup ? id.slice(4) : null;
  const members = isGroup ? facility.nodes.filter((n) => n.type === 'rack' && rowOf(n.id) === row).map((n) => n.id) : [id];
  const node = facility.nodes.find((n) => n.id === (isGroup ? members[0] : id));
  const live = [...facility.edges, ...facility.suspected].filter((e) => e.status !== 'rejected');
  const walk = (dir: 'up' | 'down') => {
    const seen = new Set<string>(members); const q = [...members];
    while (q.length) {
      const x = q.shift()!;
      for (const e of live) {
        const y = dir === 'up' ? (e.consumer === x ? e.supplier : null) : (e.supplier === x ? e.consumer : null);
        if (y && !seen.has(y)) { seen.add(y); q.push(y); }
      }
    }
    members.forEach((m) => seen.delete(m));
    return [...seen];
  };
  const byLayer = (ids: string[], dir: 'up' | 'down') => {
    const m = new Map<number, string[]>();
    for (const x of ids) { const n = facility.nodes.find((k) => k.id === x); if (n) m.set(n.layer, [...(m.get(n.layer) ?? []), x]); }
    return [...m].sort((a, b) => (dir === 'up' ? b[0] - a[0] : a[0] - b[0]));
  };
  const up = byLayer(walk('up'), 'up');
  const down = byLayer(walk('down'), 'down');
  const tone = (x: string) => toneOf(x, sim, toggles);
  const own: Tone = isGroup ? (members.some((m) => tone(m) === 'down') ? 'down' : members.some((m) => tone(m) !== 'ok') ? 'degraded' : 'ok') : tone(id);
  const downCount = members.filter((m) => tone(m) === 'down').length;

  const Item = ({ x }: { x: string }) => {
    const t = tone(x); const st = sim?.nodes[x]; const n = facility.nodes.find((k) => k.id === x)!;
    const isRack = n.type === 'rack' && !expanded.has(rowOf(x));
    return (
      <button onClick={() => onSelect(isRack ? groupId(rowOf(x)) : x)} className="w-full flex items-center gap-2 h-11 px-3 rounded-lg text-left hover:bg-surface-2 t">
        <span className={cx('h-2.5 w-2.5 rounded-full shrink-0', t === 'down' ? 'bg-critical' : t === 'ok' ? 'bg-ok' : 'bg-warning')} />
        <span className="mono text-[14px] font-semibold">{x}</span>
        <span className={cx('text-[12px] font-semibold uppercase tracking-wide', t === 'down' ? 'text-critical' : t === 'ok' ? 'text-ok' : 'text-warning')}>{TONE_WORD[t]}</span>
        {st && st.margin_kw !== null && n.capacity > 0 && <span className="ml-auto mono text-[12px] text-muted">{Math.round(st.margin_kw)} kW spare</span>}
      </button>
    );
  };
  const Section = ({ title, icon, groups }: { title: string; icon: React.ReactNode; groups: [number, string[]][] }) => (
    <div>
      <div className="text-[12.5px] font-semibold text-muted flex items-center gap-1.5 px-1 mb-1">{icon}{title}</div>
      {groups.length === 0 ? <div className="text-[13px] text-faint px-3 py-2">Nothing</div> : groups.map(([layer, ids]) => {
        const racks = ids.filter((x) => facility.nodes.find((n) => n.id === x)?.type === 'rack');
        const rows = [...new Set(racks.map(rowOf))];
        const others = ids.filter((x) => !racks.includes(x));
        return (
          <div key={layer} className="mb-1.5">
            <div className="text-[11px] uppercase tracking-wide text-faint px-3 mt-1">{LAYERS[layer]}</div>
            {others.map((x) => <Item key={x} x={x} />)}
            {rows.map((r) => {
              const rs = racks.filter((x) => rowOf(x) === r); const dn = rs.filter((x) => tone(x) === 'down').length;
              return expanded.has(r) ? rs.map((x) => <Item key={x} x={x} />) : (
                <button key={r} onClick={() => onSelect(groupId(r))} className="w-full flex items-center gap-2 h-11 px-3 rounded-lg text-left hover:bg-surface-2 t">
                  <span className={cx('h-2.5 w-2.5 rounded-full shrink-0', dn ? 'bg-critical' : 'bg-ok')} />
                  <span className="mono text-[14px] font-semibold">Row {r}</span>
                  <span className={cx('text-[12px] font-semibold uppercase tracking-wide', dn ? 'text-critical' : 'text-ok')}>{dn ? `${dn} of ${rs.length} down` : `${rs.length} racks OK`}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="absolute z-20 pop-in bg-surface text-text shadow-[var(--shadow)] border hairline flex flex-col inset-x-2 bottom-2 max-h-[62%] rounded-2xl md:inset-x-auto md:right-3 md:top-[52px] md:bottom-3 md:w-[360px] md:max-h-none" role="dialog" aria-label={`Trace for ${id}`}>
      <div className="p-4 pb-3 border-b hairline">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="mono text-[18px] font-semibold">{isGroup ? `Row ${row}` : id}</div>
            <div className="text-[13px] text-muted">{isGroup ? `${members.length} racks` : `${node?.label} · ${node ? LAYERS[node.layer] : ''}`}</div>
          </div>
          <span className={cx('text-[12px] font-semibold uppercase tracking-wide px-2 h-7 inline-flex items-center rounded-md', own === 'down' ? 'bg-critical/15 text-critical' : own === 'ok' ? 'bg-ok/15 text-ok' : 'bg-warning/15 text-warning')}>{isGroup && downCount ? `${downCount} down` : TONE_WORD[own]}</span>
          <button onClick={onClose} className="h-9 w-9 grid place-items-center rounded-lg text-muted hover:text-text hover:bg-surface-2" aria-label="Close trace"><X size={18} /></button>
        </div>
        {!isGroup && (
          <div className="grid grid-cols-3 gap-1.5 mt-3">
            <button onClick={() => onState(id, 'maintenance')} className={cx('h-11 rounded-lg border text-[13px] font-medium inline-flex items-center justify-center gap-1.5 t', toggles[id] === 'maintenance' ? 'border-warning bg-warning/15 text-warning' : 'border-border hover:bg-surface-2')}><Wrench size={14} /> Maintenance</button>
            <button onClick={() => onState(id, 'failed')} className={cx('h-11 rounded-lg border text-[13px] font-medium inline-flex items-center justify-center gap-1.5 t', toggles[id] === 'failed' ? 'border-critical bg-critical/15 text-critical' : 'border-border hover:bg-surface-2')}><Zap size={14} /> Fail</button>
            <button onClick={() => onState(id, null)} className={cx('h-11 rounded-lg border text-[13px] font-medium inline-flex items-center justify-center gap-1.5 t', !toggles[id] ? 'border-ok bg-ok/10 text-ok' : 'border-border hover:bg-surface-2')}><CircleCheck size={14} /> In service</button>
          </div>
        )}
        {(isGroup || node?.type === 'rack') && (
          <button onClick={() => onToggleRow(row ?? rowOf(id))} className="mt-3 w-full h-11 rounded-lg border hairline text-[13px] font-medium inline-flex items-center justify-center gap-1.5 hover:bg-surface-2 t">
            <Rows3 size={15} /> {expanded.has(row ?? rowOf(id)) ? `Group row ${row ?? rowOf(id)} again` : `Show the ${members.length} racks on the map`}
          </button>
        )}
      </div>
      <div className="p-2 overflow-auto grid gap-3">
        <Section title="Needs (upstream)" icon={<ArrowUp size={13} />} groups={up} />
        <Section title="Feeds (downstream)" icon={<ArrowDown size={13} />} groups={down} />
      </div>
    </div>
  );
}

/** Same verdict as the rail card, compact, inside the map: on an iPad the answer appears where you are looking. */
function VerdictStrip({ sim, red, baseRed, onWhy }: { sim: SimResult; red: ServiceRed[]; baseRed: ServiceRed[]; onWhy?: () => void }) {
  const base = new Map(baseRed.map((x) => [x.service, x.effective]));
  const dropped = red.filter((x) => base.get(x.service) && base.get(x.service) !== x.effective && (x.effective === 'N' || x.effective === 'below N')).length;
  const outage = sim.lost_services.length > 0;
  const risk = !outage && (dropped > 0 || sim.min_margin < 0.1);
  const Icon = outage ? OctagonAlert : risk ? TriangleAlert : CircleCheck;
  const text = outage ? `Outage · ${sim.lost_services.length} critical services, ${sim.lost_kw} kW lost`
    : dropped ? `Safe, but exposed · ${dropped} services down to one path` : risk ? `Safe, but tight · ${Math.round(sim.min_margin * 100)}% headroom on ${sim.tightest}` : 'Safe · nothing goes down, redundancy holds';
  return (
    <div key={text} className={cx('absolute left-3 bottom-3 z-10 pop-in max-w-[calc(100%-90px)] rounded-xl px-3.5 h-11 inline-flex items-center gap-2 text-[14px] font-semibold border shadow-[var(--shadow)]',
      outage ? 'bg-[#3a1715] border-[var(--critical)] text-[#FF8A80]' : risk ? 'bg-[#33260f] border-[var(--warning)] text-[var(--warning)]' : 'bg-[#13281f] border-[var(--panel-ok)] text-[var(--panel-ok)]')} role="status">
      <Icon size={17} className="shrink-0" /><span className="truncate">{text}</span>
      {onWhy && <button onClick={onWhy} className="ml-1 h-8 px-3 rounded-lg bg-white/15 hover:bg-white/25 text-[13px] font-semibold shrink-0">Why?</button>}
    </div>
  );
}

type Verd = { tone: 'critical' | 'warning' | 'ok'; title: string; line: string; dropped: number };
function verdictOf(sim: SimResult, red: ServiceRed[], baseRed: ServiceRed[]): Verd {
  const base = new Map(baseRed.map((x) => [x.service, x.effective]));
  const dropped = red.filter((x) => base.get(x.service) && base.get(x.service) !== x.effective && (x.effective === 'N' || x.effective === 'below N')).length;
  if (sim.lost_services.length) return { tone: 'critical', title: 'Outage', line: `${sim.lost_services.length} critical services and ${sim.lost_count} racks or workloads go down (${sim.lost_kw} kW).`, dropped };
  if (dropped || sim.min_margin < 0.1) return { tone: 'warning', title: 'Safe, but exposed', line: dropped ? `Nothing goes down, but ${dropped} critical services are left on a single path. One more failure takes them out.` : `Nothing goes down, but ${sim.tightest} is down to ${Math.round(sim.min_margin * 100)}% headroom.`, dropped };
  return { tone: 'ok', title: 'Safe', line: 'Nothing goes down and redundancy holds.', dropped };
}

const STATE_PHRASE: Record<Tone, [string, string]> = {
  ok: ['is still OK', 'are still OK'], degraded: ['runs on its remaining supply', 'run on their remaining supply'],
  maint: ['is taken out for maintenance', 'are taken out for maintenance'], down: ['goes down', 'go down'],
};

/** Why: the root-cause chain from the change to the impact, and Nemotron's own check of it. Opens with every scenario. */
function Why({ facility, sim, red, baseRed, toggles, expanded, onClose, onShow, docked }: {
  facility: Facility; sim: SimResult; red: ServiceRed[]; baseRed: ServiceRed[]; toggles: Record<string, Toggle>; expanded: Set<string>;
  onClose: () => void; onShow: (n: string[]) => void; docked?: boolean;
}) {
  const v = verdictOf(sim, red, baseRed);
  const live = [...facility.edges, ...facility.suspected].filter((e) => e.status !== 'rejected');
  const tone = (x: string) => toneOf(x, sim, toggles);
  // Walk downstream from the changed equipment, hop by hop, through affected equipment only.
  const hops: string[][] = [];
  const seen = new Set<string>(Object.keys(toggles));
  let frontier = Object.keys(toggles);
  while (frontier.length && hops.length < 8) {
    hops.push(frontier);
    const next: string[] = [];
    for (const x of frontier) for (const e of live) if (e.supplier === x && !seen.has(e.consumer) && tone(e.consumer) !== 'ok') { seen.add(e.consumer); next.push(e.consumer); }
    frontier = next;
  }
  const trace = Object.values(sim.traces).find((t) => t && t.length) ?? [];
  const missingFor = (x: string) => trace.find((t) => t.node === x)?.missing ?? [];
  const nameOf = (x: string) => facility.nodes.find((n) => n.id === x);

  const describe = (ids: string[]) => {
    const racks = ids.filter((x) => nameOf(x)?.type === 'rack' && !expanded.has(rowOf(x)));
    const rows = [...new Set(racks.map(rowOf))].map((r) => ({ r, n: racks.filter((x) => rowOf(x) === r).length, t: tone(racks.find((x) => rowOf(x) === r)!) }));
    const rest = ids.filter((x) => !racks.includes(x));
    return { rest, rows };
  };

  // Nemotron's check runs automatically for the scenario.
  const question = (() => {
    const parts = Object.entries(toggles).map(([n, st]) => (st === 'failed' ? `${n} fails` : `${n} is in maintenance`));
    return `What happens if ${parts.join(' and ')}?`;
  })();
  const [events, setEvents] = useState<AgentEvent[]>([]);
  useEffect(() => {
    setEvents([]);
    const stop = pf.ask(question, (e) => setEvents((xs) => [...xs, e]));
    return stop;
  }, [question]);
  const start = events.find((e) => e.type === 'start');
  const calls = events.filter((e) => e.type === 'tool_call');
  const final = events.find((e) => e.type === 'final') as (AgentEvent & { answer: { recommendation: string }; problems: string[] }) | undefined;
  const err = events.find((e) => e.type === 'error');

  const head = v.tone === 'critical' ? 'bg-critical' : v.tone === 'warning' ? 'bg-warning' : 'bg-ok';
  const Icon = v.tone === 'critical' ? OctagonAlert : v.tone === 'warning' ? TriangleAlert : CircleCheck;
  return (
    <div className={cx('z-20 pop-in bg-surface text-text border-2 flex flex-col overflow-hidden rounded-2xl min-w-0', docked ? 'relative' : 'absolute inset-x-2 bottom-2 max-h-[70%] md:inset-x-auto md:left-3 md:top-[52px] md:bottom-3 md:w-[390px] md:max-h-none shadow-[var(--shadow)]',
      v.tone === 'critical' ? 'border-critical alarm-card' : v.tone === 'warning' ? 'border-warning alarm-card-warn' : 'border-ok')} role="dialog" aria-label="Why: root cause and agent check">
      <div className={cx('px-4 py-3 text-white', head)}>
        <div className="flex items-center gap-2">
          <Icon size={20} className="shrink-0" />
          <span className="text-[17px] font-bold tracking-[-0.01em]">{v.title}</span>
          <button onClick={onClose} className="ml-auto h-9 w-9 grid place-items-center rounded-lg hover:bg-white/15" aria-label="Close explanation"><X size={18} /></button>
        </div>
        <p className="text-[13.5px] mt-1 opacity-95 leading-snug">{v.line}</p>
      </div>

      <div className="overflow-auto overflow-x-hidden p-4 grid gap-5 min-w-0 [&>section]:min-w-0">
        <section>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5"><Search size={13} /> Root cause, step by step</div>
          <ol className="relative grid gap-3 pl-1">
            {hops.map((ids, i) => {
              const { rest, rows } = describe(ids);
              const last = i === hops.length - 1;
              return (
                <li key={i} className="grid grid-cols-[28px_1fr] gap-2.5 stage-in" style={{ animationDelay: `${i * 140}ms` }}>
                  <div className="flex flex-col items-center">
                    <span className={cx('h-7 w-7 rounded-full grid place-items-center text-[12.5px] font-bold text-white mono', i === 0 ? 'bg-text' : last && v.tone === 'critical' ? 'bg-critical' : 'bg-warning')}>{i + 1}</span>
                    {!last && <span className="w-[2px] flex-1 bg-border-strong mt-1" />}
                  </div>
                  <div className="pb-1">
                    {i === 0 ? (
                      <div className="text-[14px] leading-snug grid gap-0.5">{Object.entries(toggles).map(([n, t]) => (
                        <div key={n}><button onClick={() => onShow([n])} className="mono font-semibold underline decoration-dotted underline-offset-2 hover:text-accent">{n}</button><span className="text-muted"> {t === 'failed' ? 'fails' : 'is taken out for maintenance'}</span></div>
                      ))}</div>
                    ) : (
                    <div className="text-[14px] leading-snug">
                      {rest.map((x, k) => (
                        <span key={x}>
                          {k > 0 && ', '}
                          <button onClick={() => onShow([x])} className="mono font-semibold underline decoration-dotted underline-offset-2 hover:text-accent">{x}</button>
                        </span>
                      ))}
                      {rest.length > 0 && rows.length > 0 && ', '}
                      {rows.map((r, k) => <span key={r.r} className="font-semibold">{k > 0 && ', '}{r.n} racks in row {r.r}</span>)}
                      <span className="text-muted"> {i === 0
                        ? Object.entries(toggles).map(([n, t]) => `${n} ${t === 'failed' ? 'fails' : 'is in maintenance'}`).length > 1 ? 'are changed: ' + Object.entries(toggles).map(([n, t]) => `${n} ${t === 'failed' ? 'fails' : 'in maintenance'}`).join(', ') : (Object.values(toggles)[0] === 'failed' ? 'fails' : 'is taken out for maintenance')
                        : STATE_PHRASE[tone(ids[0])][ids.length > 1 || rows.length > 0 ? 1 : 0]}</span>
                    </div>
                    )}
                    {i > 0 && (() => {
                      const why = missingFor(ids.find((x) => missingFor(x).length) ?? '');
                      return why.length ? <div className="text-[12.5px] text-muted mt-0.5">needs {why.join(' or ')}, and {why.length > 1 ? 'all of them are' : 'it is'} out</div> : null;
                    })()}
                  </div>
                </li>
              );
            })}
            {hops.length <= 1 && <li className="text-[13.5px] text-muted pl-1">No other equipment is affected.</li>}
          </ol>
          {v.dropped > 0 && v.tone !== 'critical' && <div className="mt-2 text-[13px] rounded-lg bg-warning/10 text-warning px-3 py-2">Redundancy: {v.dropped} critical services drop from 2N/N+1 to N.</div>}
        </section>

        <section className="panel rounded-xl p-3.5 overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-[var(--panel-accent)]" />
            <span className="text-[13px] font-semibold">Nemotron checked this</span>
            <span className="ml-auto text-[11px] text-[var(--panel-muted)]">{start ? String(start.model) : 'starting…'}</span>
          </div>
          <div className="text-[12px] text-[var(--panel-muted)] mb-2">“{question}”</div>
          <ol className="grid gap-1.5">
            {calls.map((c, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] mono enter-row min-w-0"><Check size={13} className="text-[var(--panel-ok)] shrink-0 mt-0.5" /><span className="text-[var(--panel-accent)] shrink-0">{String(c.tool)}</span><span className="text-[var(--panel-muted)] truncate min-w-0">{JSON.stringify(c.args)}</span></li>
            ))}
            {!final && !err && <li className="flex gap-2 text-[12.5px] text-[var(--panel-muted)]"><Loader2 size={13} className="animate-spin shrink-0" /> calling tools…</li>}
          </ol>
          {final && <div className="mt-2.5 pt-2.5 border-t border-[var(--panel-border)] text-[13.5px] font-medium pop-in">{final.answer.recommendation}</div>}
          {final && <div className={cx('text-[11.5px] mt-1', final.problems.length ? 'text-[#FF8A80]' : 'text-[var(--panel-ok)]')}>{final.problems.length ? `Unverified: ${final.problems.join('; ')}` : 'Every claim traces to a tool result.'}</div>}
          {err && <div className="text-[12px] text-[#FF8A80] mt-2">{String(err.message)}</div>}
        </section>
      </div>
    </div>
  );
}
