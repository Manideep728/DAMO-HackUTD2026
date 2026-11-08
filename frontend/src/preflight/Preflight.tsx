import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Info, RotateCcw, Send, Wrench, Zap, CircleCheck, OctagonAlert, TriangleAlert, ShieldCheck, X, MousePointerClick, Loader2, Upload, Download, ArrowUp, ArrowDown, Rows3, Sparkles, Search, Check, Settings2, CalendarClock, ChevronDown, Plus, HelpCircle, Gauge } from 'lucide-react';
import { Badge, Button, cx } from '../components/ui';
import { FacilityMap, LAYERS, TONE_WORD, toneOf, rowOf, groupId, type Tone } from './FacilityMap';
import { defaultZone, visibleNodes } from './mapView';
import { CutSetPanel, FindingsPanel, ImpactPanel, LoadSourceLine, PlanResults, planOf } from './Panels';
import { pf, type Transient, type AgentEvent, type CutSets, type Facility, type Findings, type PlanSearch, type ServiceRed, type SimResult, type Toggle } from './api';

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
  const [trans, setTrans] = useState<Transient | null>(null);
  const [findings, setFindings] = useState<Findings | null>(null);
  const [tab, setTab] = useState<Tab>('impact');
  const [zone, setZone] = useState('all');
  const [highlight, setHighlight] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [whyOpen, setWhyOpen] = useState(false);
  const [sheet, setSheet] = useState(false);          // iPad: the panels live in a bottom sheet over the map
  const [planSeed, setPlanSeed] = useState('');       // equipment picked on the map for Plan
  const [admin, setAdmin] = useState(false);
  const wide = useWide();
  const tablet = useWide(768);
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const focused = useRef('');
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

  // Deep link from the console (#/preflight?focus=R1-03): open that equipment's trace, with its row expanded.
  useEffect(() => {
    if (!facility || !focus || focused.current === focus) return;
    const n = facility.nodes.find((x) => x.id === focus);
    if (!n) return;
    focused.current = focus;
    if (n.type === 'rack') setExpanded((e) => new Set([...e, rowOf(focus)]));
    setSelected(focus);
  }, [facility, focus]);

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
      setToggles({}); setHighlight([]); setSelected(null); setExpanded(new Set());
      await loadFacility();
      setFindings(await pf.findings());
      setNotice(`Loaded ${r.name}: ${r.nodes} nodes.`); setError('');
    } catch (e) {
      setError(`${what} failed: ${(e as Error).message.replace(/^import failed: /, '')}`);
    }
  };

  // Meters: re-pull measured load and meter evidence from Tiger. Venue Wi-Fi often blocks its port; the app keeps
  // running on the last snapshot either way, so a failure is a notice, not a broken screen.
  const [syncing, setSyncing] = useState(false);
  const syncMeters = async () => {
    setAdmin(false); setSyncing(true);
    try {
      const r = await pf.syncMeters();
      await loadFacility();
      setFindings(await pf.findings());
      setNotice(`Meters synced from Tiger: ${r.rows?.toLocaleString()} readings.`); setError('');
    } catch (e) {
      setError(`Meter sync failed: ${(e as Error).message}. If you're on venue Wi-Fi, try a hotspot; the last snapshot stays in use.`);
    } finally { setSyncing(false); }
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
  const picked = new Set(highlight);
  const active = Object.keys(toggles).length > 0;
  const beside = active && whyOpen && !wide && tablet;
  const fresh = !!sim && JSON.stringify(Object.entries(sim.changes).sort()) === JSON.stringify(Object.entries(toggles).sort()); // sim matches the scenario
  const affected = sim ? facility.nodes.map((n) => n.id).filter((x) => toneOf(x, sim, toggles) !== 'ok') : [];
  const railTabs = wide || !tablet;  // desktop rail or phone stack; iPad uses the bottom sheet
  const panel = (
            <>
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
              {tab === 'plan' && <PlanPanel key={planSeed} facility={facility} preset={planSeed ? [planSeed] : maintenance} />}
              {tab === 'agent' && <AgentPanel onShow={setHighlight} />}
            </>
  );

  return (
    <div className="mx-auto w-full max-w-[1440px] -mt-6 grid gap-3">
      <header className="relative z-30 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.025em]">Rehearse a change before you make it</h1>
          <span className="text-[14px] text-muted">Preflight · {facility.name}</span>
          <Tip label="About this model" text={`Simplified model: power and cooling as kW budgets on a dependency graph. Not CFD, load flow or a protection study. ${facility.fidelity}`}><Info size={17} /></Tip>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select id="pf-zone" aria-label="Zoom to zone" value={zone} onChange={(e) => setZone(e.target.value)} className="h-12 px-3 rounded-xl border hairline bg-surface text-[14px]">
            {zones.map((z) => <option key={z} value={z}>{z === 'all' ? 'Whole site' : `Zone ${z}`}</option>)}
          </select>
          <Button className="!h-12 !rounded-xl !text-[14px]" onClick={reset} disabled={!active && !highlight.length && !selected}><RotateCcw size={15} /> Reset scenario</Button>
          <input ref={fileInput} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" aria-label="Facility file"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; setAdmin(false); if (f) swapFacility('Import', () => pf.importFacility(f)); }} />
          {/* Admin: facility data management, out of a technician's way */}
          <div className="relative">
            <Button className="!h-12 !rounded-xl !text-[14px]" aria-expanded={admin} aria-haspopup="menu" onClick={() => setAdmin((v) => !v)}><Settings2 size={15} /> Admin <ChevronDown size={14} /></Button>
            {admin && (
              <div role="menu" aria-label="Admin" className="absolute right-0 top-[calc(100%+6px)] z-50 w-[300px] card shadow-[var(--shadow)] p-1.5 grid pop-in">
                <button role="menuitem" onClick={() => fileInput.current?.click()} className="h-12 px-3 rounded-lg text-left text-[14px] hover:bg-surface-2 inline-flex items-center gap-2.5"><Upload size={16} /> <span className="grid leading-tight">Import<span className="text-[12px] text-muted">CSV or JSON, replaces the demo hall</span></span></button>
                <a role="menuitem" href="/api/preflight/export.csv" download="facility.csv" onClick={() => setAdmin(false)} className="h-12 px-3 rounded-lg text-[14px] hover:bg-surface-2 inline-flex items-center gap-2.5"><Download size={16} /> <span className="grid leading-tight">Export<span className="text-[12px] text-muted">the current graph as CSV</span></span></a>
                <button role="menuitem" onClick={() => { setAdmin(false); swapFacility('Restoring the demo', pf.restoreDemo); }} className="h-12 px-3 rounded-lg text-left text-[14px] hover:bg-surface-2 inline-flex items-center gap-2.5"><RotateCcw size={16} /> Restore demo</button>
                <button role="menuitem" onClick={syncMeters} disabled={syncing} className="h-12 px-3 rounded-lg text-left text-[14px] hover:bg-surface-2 inline-flex items-center gap-2.5 disabled:opacity-60">{syncing ? <Loader2 size={16} className="animate-spin" /> : <Gauge size={16} />} <span className="grid leading-tight">{syncing ? 'Syncing meters…' : 'Sync meters'}<span className="text-[12px] text-muted">{facility.load_source?.source === 'meters' ? `Tiger · ${facility.load_source.offline ? 'offline, last' : 'last'} sync ${facility.load_source.synced_at}` : 'measured load from Tiger'}</span></span></button>
              </div>
            )}
          </div>
        </div>
      </header>
      {error && <div className="text-critical text-[14px] whitespace-pre-wrap" role="alert">{error}</div>}
      {notice && !error && <div className="text-muted text-[14px]" role="status">{notice}</div>}
      {zone !== 'all' && <div className="text-muted text-[14px]" data-testid="zone-hint">Showing zone {zone} and what feeds it ({visibleFacility.nodes.length} of {facility.nodes.length} nodes). Pick Whole site to see everything.</div>}

      <div className="hidden md:flex min-[1400px]:hidden gap-2 overflow-x-auto -mb-1 pb-1" aria-label="Rehearse a common change">
        {PRESETS.map((p) => {
          const on = JSON.stringify(p.changes) === JSON.stringify(toggles);
          return <button key={p.label} onClick={() => { setToggles(p.changes); setSelected(null); setHighlight([]); }} className={cx('shrink-0 h-12 px-4 rounded-xl border text-[14px] t whitespace-nowrap', on ? 'border-text bg-surface font-medium' : 'border-border bg-surface/60 hover:bg-surface')}>{p.label}</button>;
        })}
      </div>
      <div className="grid gap-4 min-[1400px]:grid-cols-[minmax(0,1fr)_400px] items-start">
        {/* Map: the hero */}
        <section className="panel rounded-[18px] overflow-hidden relative h-[70vh] min-h-[480px] md:h-[calc(100vh-222px)] md:portrait:h-[calc(100vh-284px)] md:min-h-[540px] min-[1400px]:h-[calc(100vh-170px)] order-2 md:order-1">
          <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 px-4 py-3 pointer-events-none">
            <span className="text-[14px] text-[var(--panel-muted)] pointer-events-auto">Scenario:</span>
            {!active && <span className="text-[14px] text-[var(--panel-text)] opacity-80">everything in service</span>}
            {Object.entries(toggles).map(([n, s]) => (
              <span key={n} className={cx('pointer-events-auto pop-in h-12 pl-3 pr-1 rounded-xl text-[14px] inline-flex items-center gap-1 border', s === 'failed' ? 'border-[var(--critical)] text-[var(--critical)] bg-[var(--critical)]/10' : 'border-[var(--warning)] text-[var(--warning)] bg-[var(--warning)]/10')}>
                <span className="mono">{n}</span> · {s}
                <button onClick={() => setState(n, null)} className="h-11 w-11 grid place-items-center rounded-lg hover:bg-white/10" aria-label={`Return ${n} to service`}><X size={16} /></button>
              </span>
            ))}
            <span className="ml-auto hidden sm:flex gap-3 text-[12.5px] text-[var(--panel-muted)]"><Legend color="var(--panel-muted)" label="power" /><Legend color="var(--panel-accent)" label="cooling" /><Legend color="var(--untrusted)" dashed label="suspected from records" /><Legend color="var(--critical)" dashed label="lost supply" /></span>
          </div>
          <div className={cx('absolute inset-x-0 bottom-0 top-[72px] t', beside && 'md:left-[404px]')}>
            {/* Re-fit whenever the layout changes: Why opens beside the map (framing only what the scenario affects), or a row is expanded */}
            <FacilityMap key={`${beside ? `beside-why:${scenarioKey}:${fresh}` : 'full'}|${[...expanded].sort().join(',')}`} frame={beside && fresh ? affected : undefined} facility={visibleFacility} sim={sim} toggles={toggles} selected={selected} hover={hover} picked={picked} expanded={expanded}
              onSelect={(id) => setSelected(id || null)} onHover={setHover} />
          </div>
          {selected && (
            <Trace facility={facility} sim={sim} toggles={toggles} id={selected} expanded={expanded}
              onClose={() => setSelected(null)} onSelect={setSelected} onState={setState}
              onPlan={(x) => { setPlanSeed(x); setTab('plan'); setSheet(true); }}
              onToggleRow={(row) => { setExpanded((x) => { const n = new Set(x); if (n.has(row)) n.delete(row); else n.add(row); return n; }); setSelected(null); }} />
          )}
          {active && sim && whyOpen && !wide && (
            <Why facility={facility} sim={sim} red={red} baseRed={baseRed} toggles={toggles} expanded={expanded} onClose={() => setWhyOpen(false)} onShow={(ids) => { setHighlight(ids); if (ids.length === 1) setSelected(ids[0]); }} />
          )}
          {/* Bottom of the map: the verdict on the left, the panels' sheet handle on the right (iPad) */}
          <div className="absolute inset-x-3 bottom-3 z-10 flex flex-wrap-reverse items-end justify-between gap-2 pointer-events-none">
            {active && sim && (!whyOpen || wide) ? <VerdictStrip sim={sim} red={red} baseRed={baseRed} onWhy={whyOpen ? undefined : () => setWhyOpen(true)} />
              : !selected && !active ? <div className="text-[14px] text-[var(--panel-muted)] flex items-center gap-1.5 h-12 px-1"><MousePointerClick size={15} /> Tap any equipment to trace what feeds it and what it feeds.</div> : <span />}
            {!railTabs && !sheet && <PanelTabs tab={tab} findings={findings} onTab={(t) => { setTab(t); setSheet(true); }} className="pointer-events-auto ml-auto rounded-2xl bg-surface/95 backdrop-blur border hairline shadow-[var(--shadow)] p-1" />}
          </div>
          {!railTabs && sheet && (
            <div className="absolute inset-x-0 bottom-0 z-30 h-[78%] bg-surface text-text rounded-t-2xl border-t hairline shadow-[0_-12px_40px_rgba(0,0,0,.18)] flex flex-col sheet-in" role="dialog" aria-label="Panels">
              <div className="shrink-0 flex items-center gap-2 px-3 pt-2 pb-1 border-b hairline">
                <PanelTabs tab={tab} findings={findings} onTab={(t) => (t === tab ? setSheet(false) : setTab(t))} className="flex-1 min-w-0" underline />
                <button onClick={() => setSheet(false)} className="h-12 w-12 grid place-items-center rounded-xl text-muted hover:text-text hover:bg-surface-2 shrink-0" aria-label="Close panel"><ChevronDown size={20} /></button>
              </div>
              <div key={tab} className="flex-1 min-h-0 overflow-auto p-4 stage-in">{panel}</div>
            </div>
          )}
        </section>

        {/* Rail: what to change, what happens */}
        <aside className={cx('grid gap-3 min-w-0 order-1 md:order-2 min-[1400px]:max-h-[calc(100vh-170px)] min-[1400px]:overflow-auto min-[1400px]:pr-1', !railTabs && 'hidden')}>
          <div className="card p-4 md:hidden min-[1400px]:block">
            <div className="text-[12.5px] text-muted mb-2">Rehearse a common change</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const on = JSON.stringify(p.changes) === JSON.stringify(toggles);
                return <button key={p.label} onClick={() => { setToggles(p.changes); setSelected(null); setHighlight([]); }} className={cx('min-h-12 px-3 py-1.5 rounded-xl border text-[14px] t text-left', on ? 'border-text bg-surface-2 font-medium' : 'border-border hover:border-border-strong hover:bg-surface-2')}>{p.label}</button>;
              })}
            </div>
          </div>

          {active && sim && wide && whyOpen
            ? <Why docked facility={facility} sim={sim} red={red} baseRed={baseRed} toggles={toggles} expanded={expanded} onClose={() => setWhyOpen(false)} onShow={(ids) => { setHighlight(ids); if (ids.length === 1) setSelected(ids[0]); }} />
            : <Verdict sim={sim} red={red} baseRed={baseRed} active={active} onPick={setHighlight} picked={picked} />}

          {railTabs && <div className="card min-w-0 flex flex-col">
            <div className="shrink-0 px-3 pt-1 border-b hairline"><PanelTabs tab={tab} findings={findings} onTab={setTab} underline /></div>
            <div key={tab} className="p-4 min-h-0 stage-in">{panel}</div>
          </div>}
        </aside>
      </div>
    </div>
  );
}

function PanelTabs({ tab, findings, onTab, className, underline }: { tab: Tab; findings: Findings | null; onTab: (t: Tab) => void; className?: string; underline?: boolean }) {
  const flag = findings?.findings.some((f) => f.status === 'open' && f.classification !== 'confirms');
  return (
    <nav className={cx('flex gap-1 overflow-x-auto', className)} aria-label="Panels">
      {TABS.map(([id, label]) => (
        <button key={id} type="button" onClick={() => onTab(id)} aria-pressed={tab === id}
          className={cx('h-12 px-3 text-[14px] font-medium t whitespace-nowrap shrink-0', underline ? cx('border-b-2 -mb-px', tab === id ? 'text-text border-text' : 'text-muted border-transparent hover:text-text') : 'rounded-xl text-text hover:bg-surface-2')}>
          {label}{id === 'findings' && flag && <span className="ml-1 text-untrusted" aria-label="needs review">●</span>}
        </button>
      ))}
    </nav>
  );
}

/** Tap-to-open explanation: glossary and model notes that work with touch (no hover). */
export function Tip({ label, text, children, className }: { label: string; text: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={cx('relative inline-flex align-middle', className)}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={label} title={label} className="h-12 min-w-12 px-2 inline-flex items-center justify-center gap-1 rounded-xl text-muted hover:text-text hover:bg-surface-2 t">{children}</button>
      {open && <span role="note" onClick={() => setOpen(false)} className="absolute left-0 top-[calc(100%+4px)] z-50 w-[320px] max-w-[80vw] card shadow-[var(--shadow)] p-3 text-[14px] leading-snug text-text font-normal normal-case tracking-normal pop-in">{text}</span>}
    </span>
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
  return <div className="rounded-lg bg-surface-2 px-2.5 py-1.5"><div className="text-muted text-[12px]">{label}</div><div className={cx('mono font-semibold', tone === 'critical' ? 'text-critical' : tone === 'warning' ? 'text-warning' : tone === 'ok' ? 'text-ok' : '')}>{value}</div></div>;
}

/** The answer a planner needs, in one card: is this safe, and what does it cost in redundancy? */
function Verdict({ sim, red, baseRed, active, onPick, picked }: { sim: SimResult | null; red: ServiceRed[]; baseRed: ServiceRed[]; active: boolean; onPick: (n: string[]) => void; picked: Set<string> }) {
  if (!active) return (
    <div className="card p-4"><div className="flex items-center gap-2 font-semibold text-[15px]"><ShieldCheck size={17} className="text-ok" /> Everything in service</div>
      <p className="text-[14px] text-muted mt-1">{baseRed.length ? `${baseRed.filter((s) => s.effective === '2N').length} of ${baseRed.length} critical services are fully redundant (2N).` : 'Loading redundancy…'} Pick a change to see what it costs.<Tip label="What do 2N, N+1 and N mean?" text={GLOSSARY}><HelpCircle size={16} /></Tip></p></div>
  );
  if (!sim) return <div className="card p-4 text-[14px] text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Simulating…</div>;
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
      <p className="text-[14px] mt-1.5 leading-relaxed">
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
          <div className="text-[14px] text-muted mb-1.5">New single points of failure · tap to show on the map</div>
          <div className="flex flex-wrap gap-1.5">{spofs.map((s) => <button key={s} onClick={() => onPick(picked.has(s) ? [] : [s])} className={cx('h-12 px-3 rounded-lg border mono text-[14px] t', picked.has(s) ? 'border-untrusted bg-untrusted/15 text-untrusted' : 'border-untrusted/40 text-untrusted hover:bg-untrusted/10')}>{s}</button>)}
            <button onClick={() => onPick(spofs)} className="h-12 px-3 rounded-lg text-[14px] text-muted hover:text-text">show all</button></div>
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

  const list = nodes.split(/[,\s]+/).filter(Boolean);
  const toggle = (id: string) => setNodes((list.includes(id) ? list.filter((x) => x !== id) : [...list, id]).join(', '));
  const suggest = facility.nodes.filter((n) => ['crah', 'chiller', 'pump', 'ups', 'pdu', 'ats', 'generator', 'switchgear'].includes(n.type)).map((n) => n.id);
  const num = 'h-12 w-[72px] px-2 rounded-xl border hairline bg-surface text-center mono text-[14px]';
  return (
    <div className="@container">
    <div className="grid gap-4 text-[14px] @3xl:grid-cols-2 @3xl:gap-x-6 items-start">
    <div className="grid gap-4 min-w-0">
      <div className="grid gap-2">
        <div className="flex items-baseline gap-2 flex-wrap"><span className="font-medium">Equipment to take offline</span><span className="text-[14px] text-muted">tap to add or remove, or pick it on the map</span></div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" aria-label="Equipment">
          {suggest.map((id) => <button key={id} type="button" aria-pressed={list.includes(id)} onClick={() => toggle(id)} className={cx('shrink-0 h-12 px-3 rounded-xl border mono text-[14px] t inline-flex items-center gap-1.5', list.includes(id) ? 'border-text bg-text text-bg font-semibold' : 'border-border hover:bg-surface-2')}>{list.includes(id) ? <Check size={14} /> : <Plus size={14} className="text-muted" />}{id}</button>)}
        </div>
        <label className="flex items-center gap-2 text-[14px] text-muted">IDs<input id="pf-plan-nodes" value={nodes} onChange={(e) => setNodes(e.target.value)} className="h-12 px-3 rounded-xl border hairline bg-surface mono text-[14px] text-text flex-1 min-w-0" /></label>
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center gap-3"><span className="font-medium flex-1">Duration <span className="text-muted font-normal">· {hours} h</span></span><input id="pf-plan-hours" aria-label="Duration in hours" type="number" min={1} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value))} className={num} /></div>
        <input type="range" min={1} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="range" aria-label="Duration slider" />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center gap-3"><span className="font-medium flex-1">Allowed window <span className="text-muted font-normal">· from now +{earliest} h to +{latest} h</span></span>
          <input id="pf-plan-from" aria-label="Window start, hours from now" type="number" min={0} value={earliest} onChange={(e) => setEarliest(Number(e.target.value))} className={num} />
          <input id="pf-plan-to" aria-label="Window end, hours from now" type="number" min={1} value={latest} onChange={(e) => setLatest(Number(e.target.value))} className={num} /></div>
        <div className="relative h-12">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-surface-3" />
          <div className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full bg-text" style={{ left: `${(earliest / 48) * 100}%`, right: `${100 - (Math.min(48, latest) / 48) * 100}%` }} />
          <input type="range" min={0} max={48} value={earliest} onChange={(e) => setEarliest(Math.min(Number(e.target.value), latest - 1))} className="range range-dual" aria-label="Window start slider" />
          <input type="range" min={0} max={48} value={latest} onChange={(e) => setLatest(Math.max(Number(e.target.value), earliest + 1))} className="range range-dual" aria-label="Window end slider" />
        </div>
        <div className="flex justify-between text-[12px] text-muted mono"><span>now</span><span>+12 h</span><span>+24 h</span><span>+36 h</span><span>+48 h</span></div>
      </div>
      <Button variant="primary" onClick={run} disabled={busy} className="!h-12 !rounded-xl !text-[15px]">{busy ? 'Simulating windows…' : 'Find the safest window'}</Button>
      <LoadSourceLine src={facility.load_source} />
      {error && <p className="text-critical">{error}</p>}
    </div>
    <div className="grid gap-3 min-w-0">
      {!res && !busy && <p className="text-muted @3xl:pt-1">Pick equipment and a window, then find the safest time. Every candidate window is simulated, with and without mitigations.</p>}
      {res && <Timeline res={res} windows={facility.windows} from={earliest} to={latest} />}
      {res && <PlanResults res={res} compare={compare} onToggleCompare={(i) => setCompare((c) => c.includes(i) ? c.filter((x) => x !== i) : [...c, i].slice(-2))} />}
      {diff && (
        <table className="w-full text-[12px] border-t hairline"><thead><tr className="text-muted text-left"><th className="py-1 font-medium">Differs</th><th className="font-medium">A</th><th className="font-medium">B</th></tr></thead>
          <tbody>{Object.entries(diff).map(([k, [a, b]]) => <tr key={k} className="border-t hairline"><td className="py-1">{k.replaceAll('_', ' ')}</td><td className="mono">{fmt(a)}</td><td className="mono">{fmt(b)}</td></tr>)}</tbody></table>
      )}
    </div>
    </div>
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
      <div className="flex justify-between gap-2 text-[12px] text-muted mono"><span>+{from} h</span><span className="text-center">top band: other scheduled work · green: candidate windows</span><span>+{to} h</span></div>
    </div>
  );
}

function AgentPanel({ onShow }: { onShow: (nodes: string[]) => void }) {
  const [q, setQ] = useState('When is the safest time to take CRAH-3 offline for 4 hours?');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  const ask = (text = q) => {
    if (!text.trim() || running) return;
    setQ(text); setEvents([]); setRunning(true);
    stop.current = pf.ask(text.trim(), (e) => {
      setEvents((xs) => [...xs, e]);
      if (e.type === 'final' || e.type === 'error') setRunning(false);
    });
  };
  const start = events.find((e) => e.type === 'start');
  const final = events.find((e) => e.type === 'final') as (AgentEvent & { answer: Answer; problems: string[] }) | undefined;
  const examples = ['Are Pump A and Pump B independent?', 'What happens if ATS-1 fails?', 'What becomes a single point of failure while UTIL-A is in maintenance?'];
  return (
    <div className="grid gap-3 text-[14px]">
      <div className="text-[14px] text-muted">Tap a question, or type your own.</div>
      <div className="grid gap-1.5">{examples.map((x) => <button key={x} type="button" disabled={running} className="min-h-12 px-3 py-2 rounded-xl border hairline text-left hover:bg-surface-2 t inline-flex items-center gap-2 disabled:opacity-50" onClick={() => ask(x)}><Sparkles size={15} className="text-accent shrink-0" />{x}</button>)}</div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input id="pf-question" value={q} onChange={(e) => setQ(e.target.value)} className="h-12 px-3 rounded-xl border hairline bg-surface flex-1 min-w-0" aria-label="Question" />
        <Button variant="primary" type="submit" disabled={running} className="!h-12 !rounded-xl"><Send size={15} /> Ask</Button>
      </form>
      {start && <Badge tone={start.mode === 'live' ? 'ok' : 'neutral'}>{String(start.model)}</Badge>}
      <ol className="grid gap-1">
        {events.filter((e) => e.type === 'tool_call' || e.type === 'fallback' || e.type === 'rejected_answer' || e.type === 'error').map((e, i) => (
          <li key={i} className="rounded-md border hairline px-2 py-1 mono text-[12.5px]">
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
      <p className={cx('font-semibold text-[14px]', a.refused && 'text-muted')} onMouseEnter={() => onShow(nodesIn(a.recommendation))}>{a.recommendation}{ev(a.recommendation_evidence)}</p>
      {a.claims?.map((c, i) => <p key={i}>{c.text}{ev(c.evidence)}</p>)}
      {a.rejected_alternatives && a.rejected_alternatives.length > 0 && <div><div className="text-muted">Rejected</div>{a.rejected_alternatives.map((r, i) => <p key={i}><span className="mono">{r.option}</span>: {r.reason}{ev(r.evidence)}</p>)}</div>}
      {a.risks && a.risks.length > 0 && <div><div className="text-muted">Risks</div>{a.risks.map((r, i) => <p key={i} className="text-warning" onMouseEnter={() => onShow(nodesIn(r.text))}>{r.text}{ev(r.evidence)}</p>)}</div>}
      {a.assumptions && a.assumptions.length > 0 && <div className="text-faint">Assumes: {a.assumptions.join('; ')}</div>}
      <div className={cx('text-[12.5px]', problems.length ? 'text-critical' : 'text-ok')}>{problems.length ? `Unverified: ${problems.join('; ')}` : 'Every claim traces to a tool result.'}</div>
    </section>
  );
}

/** Trace: everything upstream (what it needs) and downstream (what it feeds), layer by layer, in words. */
function Trace({ facility, sim, toggles, id, expanded, onClose, onSelect, onState, onToggleRow, onPlan }: {
  facility: Facility; sim: SimResult | null; toggles: Record<string, Toggle>; id: string; expanded: Set<string>;
  onClose: () => void; onSelect: (id: string) => void; onState: (id: string, s: Toggle | null) => void; onToggleRow: (row: string) => void; onPlan: (id: string) => void;
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
      <button onClick={() => onSelect(isRack ? groupId(rowOf(x)) : x)} className="w-full flex items-center gap-2 h-12 px-3 rounded-lg text-left hover:bg-surface-2 t">
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
      {groups.length === 0 ? <div className="text-[14px] text-faint px-3 py-2">Nothing</div> : groups.map(([layer, ids]) => {
        const racks = ids.filter((x) => facility.nodes.find((n) => n.id === x)?.type === 'rack');
        const rows = [...new Set(racks.map(rowOf))];
        const others = ids.filter((x) => !racks.includes(x));
        return (
          <div key={layer} className="mb-1.5">
            <div className="text-[12px] uppercase tracking-wide text-muted px-3 mt-1">{LAYERS[layer]}</div>
            {others.map((x) => <Item key={x} x={x} />)}
            {rows.map((r) => {
              const rs = racks.filter((x) => rowOf(x) === r); const dn = rs.filter((x) => tone(x) === 'down').length;
              return expanded.has(r) ? rs.map((x) => <Item key={x} x={x} />) : (
                <button key={r} onClick={() => onSelect(groupId(r))} className="w-full flex items-center gap-2 h-12 px-3 rounded-lg text-left hover:bg-surface-2 t">
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
    <div className="absolute z-20 pop-in bg-surface text-text shadow-[var(--shadow)] border hairline flex flex-col inset-x-2 bottom-2 max-h-[62%] rounded-2xl md:inset-x-auto md:right-3 md:top-[72px] md:bottom-3 md:w-[360px] md:max-h-none" role="dialog" aria-label={`Trace for ${id}`}>
      <div className="p-4 pb-3 border-b hairline">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="mono text-[18px] font-semibold">{isGroup ? `Row ${row}` : id}</div>
            <div className="text-[14px] text-muted">{isGroup ? `${members.length} racks` : `${node?.label} · ${node ? LAYERS[node.layer] : ''}`}</div>
          </div>
          <span className={cx('text-[12px] font-semibold uppercase tracking-wide px-2 h-7 inline-flex items-center rounded-md', own === 'down' ? 'bg-critical/15 text-critical' : own === 'ok' ? 'bg-ok/15 text-ok' : 'bg-warning/15 text-warning')}>{isGroup && downCount ? `${downCount} down` : TONE_WORD[own]}</span>
          <button onClick={onClose} className="h-12 w-12 -mr-1 -mt-1 grid place-items-center rounded-xl text-muted hover:text-text hover:bg-surface-2" aria-label="Close trace"><X size={20} /></button>
        </div>
        {!isGroup && (
          <div className="grid grid-cols-3 gap-1.5 mt-3">
            <button onClick={() => onState(id, 'maintenance')} className={cx('h-12 rounded-lg border text-[14px] font-medium inline-flex items-center justify-center gap-1.5 t', toggles[id] === 'maintenance' ? 'border-warning bg-warning/15 text-warning' : 'border-border hover:bg-surface-2')}><Wrench size={14} /> Maintenance</button>
            <button onClick={() => onState(id, 'failed')} className={cx('h-12 rounded-lg border text-[14px] font-medium inline-flex items-center justify-center gap-1.5 t', toggles[id] === 'failed' ? 'border-critical bg-critical/15 text-critical' : 'border-border hover:bg-surface-2')}><Zap size={14} /> Fail</button>
            <button onClick={() => onState(id, null)} className={cx('h-12 rounded-lg border text-[14px] font-medium inline-flex items-center justify-center gap-1.5 t', !toggles[id] ? 'border-ok bg-ok/10 text-ok' : 'border-border hover:bg-surface-2')}><CircleCheck size={15} /> In service</button>
          </div>
        )}
        {!isGroup && node?.type !== 'rack' && node?.type !== 'workload' && (
          <button onClick={() => onPlan(id)} className="mt-2 w-full h-12 rounded-lg border hairline text-[14px] font-medium inline-flex items-center justify-center gap-1.5 hover:bg-surface-2 t"><CalendarClock size={16} /> Plan maintenance on {id}</button>
        )}
        {(isGroup || node?.type === 'rack') && (
          <button onClick={() => onToggleRow(row ?? rowOf(id))} className="mt-3 w-full h-12 rounded-lg border hairline text-[14px] font-medium inline-flex items-center justify-center gap-1.5 hover:bg-surface-2 t">
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
    <div key={text} className={cx('pointer-events-auto pop-in max-w-full rounded-xl pl-3.5 pr-1.5 min-h-12 py-1 inline-flex items-center gap-2 text-[14.5px] font-semibold border shadow-[var(--shadow)]',
      outage ? 'bg-[#3a1715] border-[var(--critical)] text-[#FF8A80]' : risk ? 'bg-[#33260f] border-[var(--warning)] text-[var(--warning)]' : 'bg-[#13281f] border-[var(--panel-ok)] text-[var(--panel-ok)]')} role="status">
      <Icon size={18} className="shrink-0" /><span className="leading-snug">{text}</span>
      {onWhy ? <button onClick={onWhy} className="ml-1 h-11 px-4 rounded-lg bg-white/15 hover:bg-white/25 text-[14px] font-semibold shrink-0">Why?</button> : <span className="w-2" />}
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

const GLOSSARY = '2N: two independent supplies, either can carry the full load. N+1: one spare unit. N: no spare left, so one more failure is an outage.';

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
  // Wait until the scenario settles: with a key every run spends Nemotron calls, and clicking through a few
  // changes should not start one run per click.
  useEffect(() => {
    setEvents([]);
    let stop = () => {};
    const timer = window.setTimeout(() => { stop = pf.ask(question, (e) => setEvents((xs) => [...xs, e])); }, 800);
    return () => { window.clearTimeout(timer); stop(); };
  }, [question]);
  const start = events.find((e) => e.type === 'start');
  const calls = events.filter((e) => e.type === 'tool_call');
  const final = events.find((e) => e.type === 'final') as (AgentEvent & { answer: { recommendation: string }; problems: string[] }) | undefined;
  const err = events.find((e) => e.type === 'error');
  const agentRef = useRef<HTMLElement>(null);

  const head = v.tone === 'critical' ? 'bg-critical' : v.tone === 'warning' ? 'bg-warning' : 'bg-ok';
  const Icon = v.tone === 'critical' ? OctagonAlert : v.tone === 'warning' ? TriangleAlert : CircleCheck;
  return (
    <div className={cx('z-20 pop-in bg-surface text-text border-2 flex flex-col overflow-hidden rounded-2xl min-w-0', docked ? 'relative' : 'absolute inset-x-2 bottom-2 max-h-[70%] md:inset-x-auto md:left-3 md:top-[72px] md:bottom-3 md:w-[390px] md:max-h-none shadow-[var(--shadow)]',
      v.tone === 'critical' ? 'border-critical alarm-card' : v.tone === 'warning' ? 'border-warning alarm-card-warn' : 'border-ok')} role="dialog" aria-label="Why: root cause and agent check">
      <div className={cx('px-4 py-3 text-white', head)}>
        <div className="flex items-center gap-2">
          <Icon size={20} className="shrink-0" />
          <span className="text-[17px] font-bold tracking-[-0.01em]">{v.title}</span>
          <button onClick={onClose} className="ml-auto h-12 w-12 -mr-2 grid place-items-center rounded-xl hover:bg-white/15" aria-label="Close explanation"><X size={20} /></button>
        </div>
        <p className="text-[14px] mt-1 opacity-95 leading-snug">{v.line}</p>
        {/* The agent's verdict, always in view; tap for its tool calls */}
        <button onClick={() => agentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })} className="mt-2 w-full min-h-12 rounded-lg bg-black/20 hover:bg-black/30 px-3 py-1.5 text-left text-[14px] font-semibold inline-flex items-center gap-2 t">
          {final || err ? <Sparkles size={16} className="shrink-0" /> : <Loader2 size={16} className="shrink-0 animate-spin" />}
          <span className="flex-1">{err ? 'Nemotron could not check this' : final ? (final.problems.length ? `Nemotron checked · ${final.problems.length} claim${final.problems.length > 1 ? 's' : ''} unverified` : `Nemotron checked · ${calls.length} tool call${calls.length === 1 ? '' : 's'} · every claim cited`) : 'Nemotron is checking this…'}</span>
          <ArrowDown size={16} className="shrink-0 opacity-80" />
        </button>
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
                      <div className="text-[14px] leading-snug flex flex-wrap gap-1.5">{Object.entries(toggles).map(([n, t]) => (
                        <button key={n} onClick={() => onShow([n])} className="h-11 px-2.5 rounded-lg border hairline bg-surface-2 hover:border-text inline-flex items-center gap-1.5 t"><span className="mono font-semibold">{n}</span><span className={t === 'failed' ? 'text-critical' : 'text-warning'}>{t === 'failed' ? 'fails' : 'maintenance'}</span></button>
                      ))}</div>
                    ) : (
                    <div className="text-[14px] leading-snug flex flex-wrap items-center gap-1.5">
                      {rest.map((x) => <button key={x} onClick={() => onShow([x])} className="h-11 px-2.5 rounded-lg border hairline bg-surface-2 hover:border-text mono font-semibold t">{x}</button>)}
                      {rows.map((r) => <button key={r.r} onClick={() => onShow([groupId(r.r)])} className="h-11 px-2.5 rounded-lg border hairline bg-surface-2 hover:border-text font-semibold t">{r.n} racks in row {r.r}</button>)}
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
            {hops.length <= 1 && <li className="text-[14px] text-muted pl-1">No other equipment is affected.</li>}
          </ol>
          {v.dropped > 0 && v.tone !== 'critical' && <div className="mt-2 text-[14px] rounded-lg bg-warning/10 text-warning pl-3 pr-1 py-1 flex items-center gap-1">Redundancy: {v.dropped} critical services drop from 2N/N+1 to N.<Tip className="ml-auto" label="What do 2N, N+1 and N mean?" text={GLOSSARY}><HelpCircle size={17} /></Tip></div>}
        </section>

        <section ref={agentRef} className="panel rounded-xl p-3.5 overflow-hidden scroll-mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-[var(--panel-accent)]" />
            <span className="text-[14px] font-semibold">Nemotron checked this</span>
            <span className="ml-auto text-[12px] text-[var(--panel-muted)]">{start ? String(start.model) : 'starting…'}</span>
          </div>
          <div className="text-[12px] text-[var(--panel-muted)] mb-2">“{question}”</div>
          <ol className="grid gap-1.5">
            {calls.map((c, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] mono enter-row min-w-0"><Check size={13} className="text-[var(--panel-ok)] shrink-0 mt-0.5" /><span className="text-[var(--panel-accent)] shrink-0">{String(c.tool)}</span><span className="text-[var(--panel-muted)] break-all min-w-0">{JSON.stringify(c.args)}</span></li>
            ))}
            {!final && !err && <li className="flex gap-2 text-[12.5px] text-[var(--panel-muted)]"><Loader2 size={13} className="animate-spin shrink-0" /> calling tools…</li>}
          </ol>
          {final && <div className="mt-2.5 pt-2.5 border-t border-[var(--panel-border)] text-[14px] font-medium pop-in">{final.answer.recommendation}</div>}
          {final && <div className={cx('text-[12.5px] mt-1', final.problems.length ? 'text-[#FF8A80]' : 'text-[var(--panel-ok)]')}>{final.problems.length ? `Unverified: ${final.problems.join('; ')}` : 'Every claim traces to a tool result.'}</div>}
          {err && <div className="text-[12px] text-[#FF8A80] mt-2">{String(err.message)}</div>}
        </section>
      </div>
    </div>
  );
}
