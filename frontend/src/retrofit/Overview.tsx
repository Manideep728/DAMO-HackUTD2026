import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Droplets, ExternalLink, Maximize2, Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, PageHeader } from '../components/ui';
import { FacilityMap } from '../preflight/FacilityMap';
import { pf, type Facility } from '../preflight/api';
import { SourceStrip, Tabs, useLive } from './parts';

const FRAME = ['V-FW-1', 'CDU-1', 'CDU-1-P1', 'CDU-1-P2', 'TCS-1', 'V-R3-01', 'R3-01', 'V-R3-02', 'R3-02'];
const PICKED = new Set<string>();
const EXPANDED = new Set(['R3']);

export function RetrofitOverviewPage() {
  const live = useLive();
  const [facility, setFacility] = useState<Facility | null>(null);
  const [selected, setSelected] = useState<string | null>('CDU-1');
  const [hover, setHover] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fullContext, setFullContext] = useState(false);

  useEffect(() => {
    if (!live) return;
    pf.retrofitFacility().then(setFacility).catch((e) => setError((e as Error).message));
  }, [live]);

  const equipment = useMemo(() => facility?.nodes.find((n) => n.id === selected) ?? null, [facility, selected]);
  const focused = useMemo(() => {
    if (!facility || fullContext) return facility;
    const ids = new Set(FRAME);
    return { ...facility, nodes: facility.nodes.filter((n) => ids.has(n.id)), edges: facility.edges.filter((e) => ids.has(e.consumer) && ids.has(e.supplier)) };
  }, [facility, fullContext]);
  const loadError = error || (live === null ? 'The backend is not reachable. Start it to inspect the shared Preflight model.' : '');

  return (
    <div className="mx-auto w-full max-w-[1360px]">
      <PageHeader kicker="Modernize · Liquid cooling" title="Start with the equipment model"
        meta={<><Badge tone="accent">Package v1</Badge><Badge>Model accepted</Badge></>}
        subtitle="One accepted graph connects facility water, the CDU, rack coolant, isolation valves, leak cables and GPU racks. Mapping changes, Preflight and operations use this same model." />
      <Tabs />
      <SourceStrip status={live} />

      <section className="mb-6" aria-labelledby="cooling-path-title">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <h2 id="cooling-path-title" className="text-[18px] font-semibold">H1 liquid-cooling path</h2>
            <p className="text-[14px] text-muted max-w-[72ch]">Facility water is the primary loop. Everything after heat exchange in CDU-1 is the rack-facing secondary loop.</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2"><Badge>Primary water</Badge><Badge tone="accent"><Droplets size={11} /> Secondary coolant</Badge><button onClick={() => setFullContext((v) => !v)} className="h-10 px-3 rounded-control border hairline text-label inline-flex items-center gap-2 hover:bg-surface t">{fullContext ? <Network size={14} /> : <Maximize2 size={14} />}{fullContext ? 'Focus cooling path' : 'Show full facility'}</button></div>
        </div>

        {loadError && <div className="rounded-xl border border-critical/40 bg-critical/[0.06] p-4 text-[14px] text-critical">Could not load the equipment model: {loadError}</div>}
        {!facility && !loadError && <div className="h-[520px] rounded-xl border hairline grid place-items-center text-[14px] text-muted">Loading the Preflight equipment graph…</div>}
        {focused && (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] rounded-surface border hairline overflow-hidden bg-[var(--panel)]" data-testid="retrofit-model">
            <div className="h-[540px] min-w-0"><FacilityMap facility={focused} sim={null} toggles={{}} selected={selected} hover={hover} picked={PICKED} expanded={EXPANDED} onSelect={(id) => setSelected(id || null)} onHover={setHover} frame={fullContext ? FRAME : undefined} /></div>
            <aside className="border-t lg:border-t-0 lg:border-l border-[var(--panel-border)] bg-[var(--panel-2)] p-5 text-[var(--panel-text)]">
              <p className="text-label text-[var(--panel-muted)] mb-3">Selected equipment</p>
              {equipment ? <div className="grid gap-5"><div><div className="mono text-section font-semibold">{equipment.id}</div><div className="text-body text-[var(--panel-muted)] mt-1">{equipment.label}</div></div><dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-label"><dt className="text-[var(--panel-muted)]">Type</dt><dd>{equipment.type}</dd><dt className="text-[var(--panel-muted)]">Loop</dt><dd>{equipment.loop ?? '—'}</dd><dt className="text-[var(--panel-muted)]">Source</dt><dd>Accepted equipment graph</dd></dl><Link to={`/preflight?site=retrofit&focus=${equipment.id}`} className="h-10 px-3 inline-flex items-center justify-center gap-2 rounded-control border border-[var(--panel-border)] hover:bg-[var(--panel-3)] t">Simulate in Preflight <ExternalLink size={14} /></Link></div> : <span className="text-muted">Select equipment to inspect it.</span>}
            </aside>
          </div>
        )}
      </section>

      <div className="flex justify-end"><Link to="/modernize/retrofit/mapping" className="btn btn-primary h-12 px-4 rounded-lg inline-flex items-center gap-2 text-[14px] font-semibold">Review the adapter mapping <ArrowRight size={15} /></Link></div>
    </div>
  );
}
