// Step 3: compare CDU options against the site's load, flow, space and interface, then the engineer chooses one.
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { HelpCircle, Sparkles, TriangleAlert } from 'lucide-react';
import { Badge, Button, Card, ModelBadge, PageHeader, SectionHeader, cx } from '../../components/ui';
import { useRetrofit } from '../store';
import { AgentPanel, Tri, WorkSplit } from '../parts';
import { DocLink } from '../DocViewer';
import { CapacityChart } from '../viz/b-capacity';

type V = 'pass' | 'fail' | 'unknown';
interface Cand { id: string; doc: string; kind: string; kw: number; lpm: number; size: string; kg: number; w: number; d: number; verdict: string }
const CANDS: Cand[] = [
  { id: 'KX-90', doc: 'cduA', kind: 'in-row, facility water', kw: 90, lpm: 220, size: '0.8 × 1.2 m', kg: 690, w: 0.8, d: 1.2, verdict: 'Below design flow and no growth margin' },
  { id: 'KX-140', doc: 'cduB', kind: 'in-row, facility water', kw: 140, lpm: 300, size: '1.2 × 1.2 m', kg: 980, w: 1.2, d: 1.2, verdict: 'Passes load, growth, flow and footprint' },
  { id: 'RX-120', doc: 'cduC', kind: 'liquid-to-air, into the hall', kw: 120, lpm: 260, size: '2.0 × 1.2 m', kg: 1150, w: 2.0, d: 1.2, verdict: 'Rejects 120 kW into hall air; too big for L-A' },
];
const LOC: Record<string, { w: number; d: number; size: string; mark: string; raised: boolean }> = {
  'L-A': { w: 1.2, d: 1.2, size: '1.2 × 1.2 m', mark: 'CDU end.', raised: true },
  'L-B': { w: 1.2, d: 1.2, size: '1.2 × 1.2 m', mark: 'Far end of row 3', raised: true },
  'L-C': { w: 2.0, d: 1.5, size: '2.0 × 1.5 m', mark: 'Corridor plant room.', raised: false },
};
const LOAD = 90, GROWTH = 117, DESIGN = 240;

interface Req { id: string; label: string; src: ReactNode; assumption?: boolean; cells: { v: V; note?: string }[] }

function requirements(loc: string): Req[] {
  const L = LOC[loc] ?? LOC['L-A'];
  const fits = (c: Cand) => c.w <= L.w && c.d <= L.d;
  return [
    { id: 'load', label: `Heat load now ≥ ${LOAD} kW`, src: <DocLink id="inventory" mark="GPU training" />,
      cells: CANDS.map((c) => ({ v: c.kw >= LOAD ? 'pass' : 'fail', note: c.kw === LOAD ? 'no margin' : undefined })) },
    { id: 'growth', label: `Heat load with 30% growth ≥ ${GROWTH} kW`, assumption: true, src: <span className="text-[12px] text-faint">assumption</span>,
      cells: CANDS.map((c) => ({ v: c.kw >= GROWTH ? 'pass' : 'fail' })) },
    { id: 'flow', label: `Secondary flow ≥ ${DESIGN} L/min design`, src: <DocLink id="requirements" mark="design 240 L/min" />,
      cells: CANDS.map((c) => ({ v: c.lpm >= DESIGN ? 'pass' : 'fail', note: `${c.lpm} L/min` })) },
    { id: 'space', label: `Footprint fits ${loc} (${L.size})`, src: <DocLink id="floorplan" mark={L.mark} />,
      cells: CANDS.map((c) => ({ v: fits(c) ? 'pass' : 'fail', note: c.size })) },
    { id: 'floor', label: 'Floor loading (stand above 900 kg filled)', src: <DocLink id="floorplan" mark="900 kg" />,
      cells: CANDS.map((c) => L.raised ? { v: 'pass', note: c.kg > 900 ? `${c.kg} kg · needs stand` : `${c.kg} kg` } : { v: 'unknown', note: 'not stated for L-C' }) },
    { id: 'water', label: 'Facility water conditions', src: <DocLink id="cduB" mark="facility water 20 C" label="datasheets" />,
      cells: CANDS.map((c) => ({ v: 'unknown', note: c.id === 'RX-120' ? 'hall air headroom?' : 'rated at 20 °C; site?' })) },
    { id: 'iface', label: 'Modbus TCP point list on file', src: <DocLink id="manual" mark="Firmware 2.3.0" />,
      cells: [{ v: 'unknown', note: 'not on file' }, { v: 'pass', note: 'firmware 2.3.0' }, { v: 'fail', note: 'BACnet, on request' }] },
    { id: 'oem', label: 'Rack OEM lists it for row 3', src: <DocLink id="cduB" mark="Rack compatibility" label="datasheets" />,
      cells: [{ v: 'unknown', note: 'not stated' }, { v: 'pass' }, { v: 'unknown', note: 'not stated' }] },
    { id: 'pumps', label: 'Pump redundancy N+1', src: <DocLink id="cduB" mark="Pumps" label="datasheets" />,
      cells: CANDS.map(() => ({ v: 'pass' })) },
  ];
}

export default function SelectCdu() {
  const { st, set } = useRetrofit();
  const loc = st.location ?? 'L-A';
  const L = LOC[loc] ?? LOC['L-A'];
  const lines = useMemo(() => [
    'read [[cduA|Heat rejection]]: 90 kW, 220 L/min, 0.8 × 1.2 m, 690 kg',
    'read [[cduB|Heat rejection]]: 140 kW, 300 L/min, 1.2 × 1.2 m, 980 kg, OEM-listed for row 3',
    'read [[cduC|Heat rejection]]: 120 kW liquid-to-air, 2.0 × 1.2 m, BACnet point list on request',
    'load from [[inventory|GPU training]]: R3-01 + R3-02 = 2 × 45 kW = 90 kW',
    'flow from [[requirements|design 240 L/min]]: 240 L/min design, 200 L/min minimum',
    `space at ${loc} in [[floorplan|${L.mark}]]: ${L.size} free`,
    'floor loading in [[floorplan|900 kg]]: support stand needed above 900 kg filled',
    'interface: [[manual|Firmware 2.3.0]] is the KX-140 Modbus TCP point list',
    'facility water supply temperature not stated in any site source ✗',
    'hall air cooling headroom for a liquid-to-air unit not stated ✗',
    'compared 3 options against 9 requirements',
  ], [loc, L.mark, L.size]);
  const onDone = useCallback(() => set({ compared: true }), [set]);
  const reqs = useMemo(() => requirements(loc), [loc]);
  const tally = CANDS.map((_, ci) => {
    const cells = reqs.map((r) => r.cells[ci].v);
    return { pass: cells.filter((v) => v === 'pass').length, fail: reqs.filter((r) => r.cells[ci].v === 'fail').map((r) => r.label), unknown: cells.filter((v) => v === 'unknown').length };
  });
  const recIdx = 1;
  const [pick, setPick] = useState<string>(st.cdu ?? 'KX-140'); // the recommended model is preselected
  const chosenIdx = CANDS.findIndex((c) => c.id === pick);
  const chosen = chosenIdx >= 0 ? CANDS[chosenIdx] : null;

  return (
    <div>
      <PageHeader kicker="Step 3 of 6" title="Select the CDU"
        subtitle="Compare options against the site's load, water, space and interface, then choose one."
        meta={<><Badge>H1 · row 3 · R3-01 + R3-02</Badge><Badge>Location {loc}</Badge></>} />
      <AgentPanel k="s3" title="Nemotron comparing CDU options" lines={lines} ran={st.compared} onDone={onDone} />

      {st.compared && <div className="stage-in">
        <WorkSplit decided={!!st.cdu}
          did={<>Read 3 datasheets and 4 site documents, checked each option against 9 requirements, and listed what no source states.</>}
          need={<>Approve the CDU (KX-140 recommended). This records a design choice, not procurement approval.</>} />

        <Card className="mb-6" header={<><span className="font-semibold text-[14px]">Capacity and flow</span><span className="text-[13px] text-muted hidden sm:inline">datasheet ratings at 20 °C facility water</span></>}>
          <CapacityChart
            heat={CANDS.map((c) => ({ name: c.id, value: c.kw, ok: c.kw >= GROWTH, note: c.kw >= GROWTH ? 'covers load with growth' : `no margin over ${LOAD} kW; below ${GROWTH} kW with growth` }))}
            flow={CANDS.map((c) => ({ name: c.id, value: c.lpm, ok: c.lpm >= DESIGN, note: c.lpm >= DESIGN ? 'meets design flow' : `below ${DESIGN} L/min design` }))} />
        </Card>

        <Card className="mb-6" header={<><span className="font-semibold text-[14px]">Requirements</span><span className="text-[13px] text-muted hidden sm:inline">every row cites its source</span></>}>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead><tr className="text-left text-[12px] text-muted">
                <th className="font-medium pb-2 pr-3">Requirement</th><th className="font-medium pb-2 pr-3">Source</th>
                {CANDS.map((c, ci) => <th key={c.id} className={cx('font-medium pb-2 px-3 rounded-t-lg', ci === chosenIdx && 'bg-surface-2')}>
                  <span className="inline-flex items-center gap-1.5"><DocLink id={c.doc} mark="Heat rejection" label={c.id} />{ci === recIdx && <span className="text-[12px] text-accent">recommended</span>}</span></th>)}
              </tr></thead>
              <tbody>{reqs.map((r, ri) => (
                <tr key={r.id} className="border-t hairline align-top">
                  <td className="py-2.5 pr-3"><div className="font-medium">{r.label}</div>{r.assumption && <div className="text-[12px] text-faint mt-0.5">assumption, not a site requirement</div>}</td>
                  <td className="py-2.5 pr-3">{r.src}</td>
                  {r.cells.map((c, ci) => (
                    <td key={ci} className={cx('py-2.5 px-3', ci === chosenIdx && 'bg-surface-2')}>
                      <div className="cell-in" style={{ animationDelay: `${ri * 50 + ci * 30}ms` }}><Tri v={c.v} /></div>
                      {c.note && <div className="text-[12px] text-muted mt-0.5">{c.note}</div>}
                    </td>))}
                </tr>))}
              </tbody>
              <tfoot><tr className="border-t hairline text-[12px] text-muted">
                <td className="pt-2.5" colSpan={2}>Total</td>
                {tally.map((t, ci) => <td key={ci} className={cx('pt-2.5 px-3 mono', ci === chosenIdx && 'bg-surface-2 rounded-b-lg')}>{t.pass} pass · {t.fail.length} fail · {t.unknown} ?</td>)}
              </tr></tfoot>
            </table>
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card header={<span className="font-semibold text-[14px]">Sizing assumptions</span>}>
            <ul className="grid gap-2.5 text-[13.5px]">
              <li className="min-w-0">Load is the sum of design kW for R3-01 and R3-02: 90 kW. <DocLink id="inventory" mark="GPU training" /></li>
              <li className="min-w-0">30% growth allowance gives 117 kW. Nemotron's assumption; confirm with IT.</li>
              <li className="min-w-0">Ratings are at 6 K approach and 20 °C facility water; warmer water lowers capacity. <DocLink id="cduB" mark="facility water 20 C" /></li>
              <li className="min-w-0">Design flow 240 L/min with both racks loaded; 200 L/min is the operating minimum. <DocLink id="requirements" mark="design 240 L/min" /></li>
            </ul>
          </Card>
          <Card header={<><span className="font-semibold text-[14px]">Open questions</span><Badge tone="warning">3</Badge></>}>
            <ul className="grid gap-2.5 text-[13.5px]">
              {[['Facility water supply temperature at the CHW-LOOP tap', 'Facilities', 'no site source states it'],
                ['Hall air cooling headroom for the 120 kW RX-120 rejects into H1', 'Facilities', 'only matters for RX-120'],
                ['Support stand design for KX-140 (980 kg on raised floor)', 'Facilities · structural', 'floor plan: stand above 900 kg']].map(([q, who, why]) => (
                <li key={q} className="flex gap-2 min-w-0"><HelpCircle size={15} className="text-warning shrink-0 mt-0.5" />
                  <span className="min-w-0"><span className="font-medium">{q}</span><span className="block text-[12px] text-muted">{who} · {why}</span></span></li>))}
            </ul>
          </Card>
        </div>

        <SectionHeader title="Choose the CDU" subtitle={`For CDU-1 at ${loc}. Selecting records your design choice.`} />
        <div className="card p-4 mb-4 flex gap-3 items-start border-accent/40">
          <Sparkles size={16} className="text-accent shrink-0 mt-0.5" />
          <div className="min-w-0 text-[14px]">
            <div className="flex flex-wrap items-center gap-2 mb-1"><span className="font-semibold">Nemotron recommends KX-140 at {loc}</span><ModelBadge model="Nemotron Super" /></div>
            <p className="text-muted">The only option that passes load with growth, design flow and the {loc} footprint. Needs a support stand (980 kg). Facility water temperature is still unknown.</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3" role="radiogroup" aria-label="CDU model">{CANDS.map((c, ci) => {
          const on = pick === c.id; const t = tally[ci];
          return (
            <button key={c.id} role="radio" aria-checked={on} onClick={() => setPick(c.id)}
              className={cx('text-left card p-4 t min-w-0 flex flex-col gap-2', on ? 'border-text bg-surface-2' : 'hover:border-border-strong')}>
              <div className="flex items-center gap-2.5">
                <span className={cx('h-4 w-4 rounded-full border grid place-items-center shrink-0', on ? 'border-text' : 'border-border-strong')}>{on && <span className="h-2 w-2 rounded-full bg-text" />}</span>
                <span className="font-semibold text-[15px]">{c.id}</span>
                {ci === recIdx && <span className="ml-auto text-[12px] text-accent">recommended</span>}
              </div>
              <div className="text-[12px] text-muted">{c.kind}</div>
              <div className="mono text-[12px]">{c.kw} kW · {c.lpm} L/min · {c.size} · {c.kg} kg</div>
              <div className="text-[13px]">{c.verdict}</div>
              <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                <Badge tone="ok">{t.pass} pass</Badge>
                {t.fail.length > 0 && <Badge tone="critical">{t.fail.length} fail</Badge>}
                {t.unknown > 0 && <Badge tone="warning">{t.unknown} unknown</Badge>}
              </div>
            </button>);
        })}</div>
        {chosen && <div className="mt-3 grid gap-1.5 pop-in" key={chosen.id}>
          {tally[chosenIdx].fail.length > 0 && <div className="flex items-start gap-2 text-[13px] text-warning">
            <TriangleAlert size={15} className="shrink-0 mt-0.5" />
            <span>{chosen.id} fails {tally[chosenIdx].fail.length}: {tally[chosenIdx].fail.join('; ')}. Recorded as a deliberate exception.</span>
          </div>}
          <div className="flex flex-wrap items-center gap-3 mt-2"><span className="text-[12px] text-faint">Selected by J. Chen (mechanical engineer) · not procurement approval</span>
            <Button variant="primary" className="h-12 sm:ml-auto" onClick={() => set({ cdu: chosen.id, step: st.step + 1 })}>Approve {chosen.id} & continue</Button></div>
        </div>}
      </div>}
    </div>
  );
}
