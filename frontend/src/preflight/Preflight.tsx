import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, RotateCcw, Send, Wrench, Zap, CircleCheck, OctagonAlert, TriangleAlert, ShieldCheck, X, MousePointerClick, Loader2, Upload, Download } from 'lucide-react';
import { Badge, Button, cx } from '../components/ui';
import { FacilityMap, LAYERS } from './FacilityMap';
import { defaultZone, visibleNodes } from './mapView';
import { CutSetPanel, FindingsPanel, ImpactPanel, PlanResults, planOf } from './Panels';
import { pf, type Transient, type AgentEvent, type CutSets, type Facility, type Findings, type PlanSearch, type ServiceRed, type SimResult, type Toggle } from './api';

type Tab = 'impact' | 'weak' | 'findings' | 'plan' | 'agent';
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
  const [trans, setTrans] = useState<Transient | null>(null);
  const [findings, setFindings] = useState<Findings | null>(null);
  const [tab, setTab] = useState<Tab>('impact');
  const [zone, setZone] = useState('all');
  const [highlight, setHighlight] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHoverNow] = useState<string | null>(null);
  // Debounced hover: the chain highlight re-renders the map, so never do it mid-click.
  const hoverTimer = useRef<number | undefined>(undefined);
  const setHover = useCallback((id: string | null) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHoverNow(id), id ? 140 : 60);
  }, []);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  // Large sites open on one hall; reset the zone only when a different facility arrives, not after a decision.
  const shownFacility = useRef('');
  const loadFacility = useCallback(() => pf.facility().then((f) => {
    setFacility(f);
    const key = `${f.name}:${f.nodes.length}`;
    if (key !== shownFacility.current) { shownFacility.current = key; setZone(defaultZone(f)); }
  }).catch((e) => setError(e.message)), []);
  useEffect(() => {
    loadFacility();
    pf.findings().then(setFindings).catch((e) => setError(e.message));
  }, [loadFacility]);

  // Re-simulate whenever the scenario or the confirmed graph changes.
  useEffect(() => {
    if (!facility) return;
    let live = true;
    const maint = Object.entries(toggles).filter(([, s]) => s === 'maintenance').map(([n]) => n);
    const failed = Object.fromEntries(Object.entries(toggles).filter(([, s]) => s === 'failed')) as Record<string, Toggle>;
    // The baseline (nothing toggled) is refetched with every scenario, so it follows confirmed findings; with
    // nothing toggled the scenario is the baseline and one request serves both.
    const scenario = pf.redundancy(toggles);
    const baseline = Object.keys(toggles).length ? pf.redundancy({}) : scenario;
    Promise.all([
      pf.simulate(toggles), scenario, baseline,
      maint.length ? pf.maintenanceCuts(maint) : pf.cutsets(failed),
      Object.keys(failed).length ? pf.transient(Object.keys(failed)) : Promise.resolve(null),
    ]).then(([s, r, b, c, t]) => { if (live) { setSim(s); setRed(r.services); setBaseRed(b.services); setCuts(c); setTrans(t); setError(''); } })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [facility, toggles]);

  // Swapping the facility clears the scenario: the old toggles name equipment that may not exist any more.
  const swapFacility = async (what: string, load: () => Promise<{ name: string; nodes: number }>) => {
    try {
      const r = await load();
      setToggles({}); setHighlight([]); setSelected(null);
      await loadFacility();
      setFindings(await pf.findings());
      setNotice(`Loaded ${r.name}: ${r.nodes} nodes.`); setError('');
    } catch (e) {
      setError(`${what} failed: ${(e as Error).message.replace(/^import failed: /, '')}`);
    }
  };

  const setState = useCallback((id: string, st: Toggle | null) => setToggles((t) => {
    const copy = { ...t }; if (st) copy[id] = st; else delete copy[id]; return copy;
  }), []);
  const reset = () => { setToggles({}); setHighlight([]); setSelected(null); };

  const zones = useMemo(() => ['all', ...new Set((facility?.nodes ?? []).map((n) => n.zone))], [facility]);
  const maintenance = Object.entries(toggles).filter(([, s]) => s === 'maintenance').map(([n]) => n);
  const visibleFacility = useMemo(() => {
    if (!facility || zone === 'all') return facility;
    const keep = visibleNodes(facility, zone).all; // the zone plus everything feeding it
    return { ...facility, nodes: facility.nodes.filter((n) => keep.has(n.id)), edges: facility.edges.filter((e) => keep.has(e.consumer) && keep.has(e.supplier)), suspected: facility.suspected.filter((e) => keep.has(e.consumer) && keep.has(e.supplier)) };
  }, [facility, zone]);

  if (!facility || !visibleFacility) return <div className="text-muted">{error ? `Could not load the facility: ${error}` : 'Loading facility…'}</div>;
  const sel = selected ? facility.nodes.find((n) => n.id === selected) : undefined;
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
          <input ref={fileInput} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" aria-label="Facility file"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) swapFacility('Import', () => pf.importFacility(f)); }} />
          <Button onClick={() => fileInput.current?.click()} title="Load a facility from CSV or JSON. Replaces the demo hall and its records."><Upload size={14} /> Import</Button>
          <a href="/api/preflight/export.csv" download="facility.csv" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border hairline text-[13px] hover:bg-surface-2" title="Download the current graph as CSV"><Download size={14} /> Export</a>
          <Button onClick={() => swapFacility('Restoring the demo', pf.restoreDemo)}>Restore demo</Button>
        </div>
      </header>
      {error && <div className="text-critical text-[13px] whitespace-pre-wrap" role="alert">{error}</div>}
      {notice && !error && <div className="text-muted text-[13px]" role="status">{notice}</div>}
      {zone !== 'all' && <div className="text-muted text-[12.5px]" data-testid="zone-hint">Showing zone {zone} and what feeds it ({visibleFacility.nodes.length} of {facility.nodes.length} nodes). Pick Whole site to see everything.</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] items-start">
        {/* Map: the hero */}
        <section className="panel rounded-[18px] overflow-hidden relative h-[70vh] min-h-[480px] xl:h-[calc(100vh-170px)] xl:min-h-[600px] order-2 xl:order-none">
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
          <div className="absolute inset-x-0 bottom-0 top-[44px]">
            <FacilityMap facility={visibleFacility} sim={sim} toggles={toggles} selected={selected} hover={hover} picked={picked}
              onSelect={(id) => setSelected(id || null)} onHover={setHover} />
          </div>
          {!selected && !active && (
            <div className="absolute left-4 bottom-4 z-10 text-[12px] text-[var(--panel-muted)] flex items-center gap-1.5 pointer-events-none"><MousePointerClick size={13} /> Hover any equipment to trace its supply chain. Click it to rehearse a change.</div>
          )}
        </section>

        {/* Rail: what to change, what happens */}
        <aside className="grid gap-3 min-w-0 order-1 xl:order-none xl:max-h-[calc(100vh-170px)] xl:overflow-auto xl:pr-1">
          <div className="card p-4">
            <div className="text-[12.5px] text-muted mb-2">Rehearse a common change</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const on = JSON.stringify(p.changes) === JSON.stringify(toggles);
                return <button key={p.label} onClick={() => { setToggles(p.changes); setSelected(null); setHighlight([]); }} className={cx('h-8 px-2.5 rounded-lg border text-[12.5px] t text-left', on ? 'border-text bg-surface-2 font-medium' : 'border-border hover:border-border-strong hover:bg-surface-2')}>{p.label}</button>;
              })}
            </div>
          </div>

          {sel && (
            <div className="card p-4 pop-in" key={sel.id}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><div className="mono text-[15px] font-semibold">{sel.id}</div><div className="text-[12.5px] text-muted">{sel.label} · {LAYERS[sel.layer]} · zone {sel.zone}</div></div>
                <button onClick={() => setSelected(null)} className="text-faint hover:text-text" aria-label="Close"><X size={15} /></button>
              </div>
              <SelectedFacts facility={facility} id={sel.id} sim={sim} />
              <div className="grid grid-cols-3 gap-1.5 mt-3">
                <button onClick={() => setState(sel.id, 'maintenance')} className={cx('h-9 rounded-lg border text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 t', toggles[sel.id] === 'maintenance' ? 'border-warning bg-warning/15 text-warning' : 'border-border hover:bg-surface-2')}><Wrench size={13} /> Maintenance</button>
                <button onClick={() => setState(sel.id, 'failed')} className={cx('h-9 rounded-lg border text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 t', toggles[sel.id] === 'failed' ? 'border-critical bg-critical/15 text-critical' : 'border-border hover:bg-surface-2')}><Zap size={13} /> Fail</button>
                <button onClick={() => setState(sel.id, null)} className={cx('h-9 rounded-lg border text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 t', !toggles[sel.id] ? 'border-ok bg-ok/10 text-ok' : 'border-border hover:bg-surface-2')}><CircleCheck size={13} /> In service</button>
              </div>
            </div>
          )}

          <Verdict sim={sim} red={red} baseRed={baseRed} active={active} onPick={setHighlight} picked={picked} />

          <div className="card min-w-0 flex flex-col">
            <nav className="shrink-0 flex gap-1 px-3 pt-2 border-b hairline overflow-x-auto" aria-label="Panels">
              {TABS.map(([id, label]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={cx('h-9 px-2.5 text-[13px] font-medium t whitespace-nowrap border-b-2 -mb-px', tab === id ? 'text-text border-text' : 'text-muted border-transparent hover:text-text')}>
                  {label}{id === 'findings' && findings && findings.findings.some((f) => f.status === 'open' && f.classification !== 'confirms') && <span className="ml-1 text-untrusted">●</span>}
                </button>
              ))}
            </nav>
            <div key={tab} className="p-4 min-h-0 stage-in">
              {tab === 'impact' && <ImpactPanel sim={sim} red={red} transient={trans} onPick={setHighlight} />}
              {tab === 'weak' && <CutSetPanel cuts={cuts} maintenance={maintenance} picked={highlight.join('+')} onPick={setHighlight} />}
              {tab === 'findings' && <FindingsPanel data={findings} onShow={setHighlight} onModelRead={async () => {
                await pf.modelRead();
                setFindings(await pf.findings());
                await loadFacility();
              }} onDecide={async (f, d, actor, note) => {
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

function SelectedFacts({ facility, id, sim }: { facility: Facility; id: string; sim: SimResult | null }) {
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
