import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Droplets, ExternalLink } from 'lucide-react';
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

  useEffect(() => {
    if (!live) return;
    pf.retrofitFacility().then(setFacility).catch((e) => setError((e as Error).message));
  }, [live]);

  const equipment = useMemo(() => facility?.nodes.find((n) => n.id === selected) ?? null, [facility, selected]);
  const loadError = error || (live === null ? 'The backend is not reachable. Start it to inspect the shared Preflight model.' : '');

  return (
    <div className="mx-auto w-full max-w-[1360px]">
      <PageHeader kicker="Modernize · liquid cooling" title="Start with the equipment model"
        subtitle="One accepted graph connects facility water, the CDU, rack coolant, isolation valves, leak cables and GPU racks. Mapping changes and operations use this same model." />
      <Tabs />
      <SourceStrip status={live} />

      <section className="mb-6" aria-labelledby="cooling-path-title">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <h2 id="cooling-path-title" className="text-[18px] font-semibold">H1 liquid-cooling path</h2>
            <p className="text-[14px] text-muted max-w-[72ch]">Facility water is the primary loop. Everything after heat exchange in CDU-1 is the rack-facing secondary loop.</p>
          </div>
          <div className="ml-auto flex gap-2 text-[12px]"><Badge>primary water</Badge><Badge tone="accent"><Droplets size={11} /> secondary coolant</Badge></div>
        </div>

        {loadError && <div className="rounded-xl border border-critical/40 bg-critical/[0.06] p-4 text-[14px] text-critical">Could not load the equipment model: {loadError}</div>}
        {!facility && !loadError && <div className="h-[520px] rounded-xl border hairline grid place-items-center text-[14px] text-muted">Loading the Preflight equipment graph…</div>}
        {facility && (
          <div className="rounded-xl border hairline overflow-hidden bg-[var(--panel)]" data-testid="retrofit-model">
            <div className="h-[520px]"><FacilityMap facility={facility} sim={null} toggles={{}} selected={selected} hover={hover} picked={PICKED} expanded={EXPANDED} onSelect={(id) => setSelected(id || null)} onHover={setHover} frame={FRAME} /></div>
            <div className="min-h-14 px-4 py-3 border-t hairline flex flex-wrap items-center gap-3 text-[14px]">
              {equipment ? <><span className="mono font-semibold">{equipment.id}</span><span>{equipment.label}</span>{equipment.loop && <Badge tone={equipment.loop === 'secondary' ? 'accent' : 'neutral'}>{equipment.loop} loop</Badge>}</> : <span className="text-muted">Select equipment to inspect it.</span>}
              <Link to="/preflight?site=retrofit&focus=CDU-1" className="ml-auto h-10 px-3 inline-flex items-center gap-2 rounded-lg border hairline hover:bg-surface-2 t">Simulate in Preflight <ExternalLink size={14} /></Link>
            </div>
          </div>
        )}
      </section>

      <div className="flex justify-end"><Link to="/modernize/retrofit/mapping" className="btn btn-primary h-12 px-4 rounded-lg inline-flex items-center gap-2 text-[14px] font-semibold">Review the adapter mapping <ArrowRight size={15} /></Link></div>
    </div>
  );
}
