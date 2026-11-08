// Step 5: review the drafted BMS mappings (signal map and physical map kept separate) and approve the draft for commissioning.
import { useState } from 'react';
import { Check, Download, TriangleAlert } from 'lucide-react';
import { Badge, Button, Card, PageHeader, cx } from '../../components/ui';
import { AgentPanel, DiffView, WorkSplit, download } from '../parts';
import { DocLink } from '../DocViewer';
import { S, useRetrofit } from '../store';
import Wires from '../viz/c-wires';

const LINES = [
  'Read 11 points from [[manual|leak_zone_2]] (CDU-1 fw 2.3.0, Modbus TCP)',
  'Checked [[bms|LDP-1]]: 13 existing points, none for row 3, no name collisions',
  'Applied units and scaling from the register map: temperatures and flow ×0.1',
  'Assigned loops from [[topology|TCS-1]]: sec_* → TCS-1 (secondary), fw_* → facility water (primary)',
  "Alarm routes from [[requirements|Leak at a rack]]: rack leak → close that rack's valve + notify Facilities",
  'Setpoint writes limited to 30–35 °C, fallback 32 °C after 60 s without heartbeat',
  'leak_zone_2 → R3-02 comes from design [[drawingA|zone 2]]; as-built [[drawingB|zone 2]] says R3-01 and [[logbook|re-routed]] ✗ needs field verification',
];

type Row = { p: string; reg: string; rw: 'R' | 'R/W'; unit: string; bms: string; eq: string; loop: string; meaning: string; route: string; doc: string; mark: string; hold?: boolean };
const POINTS: Row[] = [
  { p: 'run_state', reg: '40001', rw: 'R', unit: 'enum', bms: 'H1.CDU-1.STATE', eq: 'CDU-1', loop: '—', meaning: 'Unit run state', route: 'Facilities on fault', doc: 'manual', mark: 'run_state' },
  { p: 'control_source', reg: '40010', rw: 'R', unit: 'enum', bms: 'H1.CDU-1.CTRL_SRC', eq: 'CDU-1', loop: '—', meaning: 'Who owns the setpoint', route: '—', doc: 'manual', mark: 'control_source' },
  { p: 'supply_setpoint', reg: '40011', rw: 'R/W', unit: '°C ×0.1', bms: 'H1.CDU-1.SEC.SP', eq: 'CDU-1', loop: 'secondary', meaning: 'Supply setpoint, 30–35 °C', route: 'reject outside range', doc: 'requirements', mark: 'Remote setpoint' },
  { p: 'leak_zone_1', reg: '10001', rw: 'R', unit: 'bool', bms: 'H1.CDU-1.LEAK.Z1', eq: 'CDU-1 cabinet', loop: '—', meaning: 'Leak in CDU cabinet', route: 'notify Facilities', doc: 'drawingB', mark: 'zone 1' },
  { p: 'fw_supply_temp', reg: '30020', rw: 'R', unit: '°C ×0.1', bms: 'H1.CDU-1.PRI.SWT', eq: 'V-FW-1', loop: 'primary', meaning: 'Facility water supply', route: '—', doc: 'manual', mark: 'fw_supply_temp' },
  { p: 'fw_return_temp', reg: '30021', rw: 'R', unit: '°C ×0.1', bms: 'H1.CDU-1.PRI.RWT', eq: 'V-FW-1', loop: 'primary', meaning: 'Facility water return', route: '—', doc: 'manual', mark: 'fw_return_temp' },
  { p: 'sec_supply_temp', reg: '30010', rw: 'R', unit: '°C ×0.1', bms: 'H1.CDU-1.SEC.SWT', eq: 'TCS-1', loop: 'secondary', meaning: 'Rack coolant supply', route: 'Facilities > 36 °C', doc: 'manual', mark: 'sec_supply_temp' },
  { p: 'sec_return_temp', reg: '30011', rw: 'R', unit: '°C ×0.1', bms: 'H1.CDU-1.SEC.RWT', eq: 'TCS-1', loop: 'secondary', meaning: 'Rack coolant return', route: '—', doc: 'manual', mark: 'sec_return_temp' },
  { p: 'sec_flow', reg: '30012', rw: 'R', unit: 'L/min ×0.1', bms: 'H1.CDU-1.SEC.FLOW', eq: 'TCS-1', loop: 'secondary', meaning: 'Rack coolant flow', route: 'Facilities < 200', doc: 'manual', mark: 'sec_flow' },
  { p: 'leak_zone_2', reg: '10002', rw: 'R', unit: 'bool', bms: 'H1.CDU-1.LEAK.Z2', eq: 'R3-02 · V-R3-02', loop: '—', meaning: 'Leak under a rack', route: 'close valve + Facilities', doc: 'mapping', mark: 'R3-02', hold: true },
  { p: 'leak_zone_3', reg: '10003', rw: 'R', unit: 'bool', bms: 'H1.CDU-1.LEAK.Z3', eq: 'R3-02 · V-R3-02', loop: '—', meaning: 'Leak under R3-02', route: 'close valve + Facilities', doc: 'drawingB', mark: 'zone 3' },
];

const BMS_BEFORE = ['H1.CRAH-1..4 (5)', 'PLANT.CHW-LOOP (2)', 'PLANT.PUMP-A/B (2)', 'H1.R1/R2.INLET (2)', 'H1.LDP-1 (2)'];
const draftDiff = `--- existing BMS (no CDU-1 section)\n+++ mapping.yaml (draft)\n@@ -0,0 +1,${String(S.original).split('\n').length} @@\n` + String(S.original).trimEnd().split('\n').map((l: string) => '+' + l).join('\n');

export default function Mappings() {
  const { st, set } = useRetrofit();
  const [tab, setTab] = useState<'signal' | 'physical'>('signal');
  return (
    <div>
      <PageHeader kicker="Step 5 of 6" title="Review mappings" subtitle="Before and after: equipment, sensor names, units and alarm routes." />
      <AgentPanel k="s5" title="Nemotron drafting the BMS mapping" lines={LINES} ran={st.drafted} onDone={() => set({ drafted: true })} />
      <WorkSplit decided={st.mappingReviewed}
        did={<>Drafted 11 BMS points from the CDU-1 manual with scaling, loops and alarm routes, and flagged one location the documents disagree on.</>}
        need={<>Approve the draft for offline commissioning. LD-2 (zone 2) stays on hold until a technician verifies it.</>} />
      {st.drafted && <>
        <div className="flex gap-2 mb-3" role="tablist">
          {(['signal', 'physical'] as const).map((t) => <Button key={t} role="tab" aria-selected={tab === t} variant={tab === t ? 'primary' : 'secondary'} onClick={() => setTab(t)}>{t === 'signal' ? 'Signal map' : 'Physical map'}</Button>)}
        </div>
        {tab === 'signal' ? (<>
          <div className="card p-4 mb-4 pop-in"><Wires fixed={st.fixApproved} /></div>
          <div className="card overflow-x-auto mb-6 pop-in">
            <table className="w-full text-[13px]">
              <thead className="text-left border-b hairline"><tr>{['Point', 'Register', 'Units', 'BMS point', 'Equipment', 'Loop', 'Meaning', 'Alarm route', 'Source', 'Status'].map((h) => <th key={h} className="th px-3 h-11 whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{POINTS.map((r, i) => (
                <tr key={r.p} className={cx('border-b hairline last:border-0 enter-row', r.hold && 'bg-critical/5')} style={{ animationDelay: `${i * 40}ms` }}>
                  <td className="px-3 py-2.5 mono whitespace-nowrap">{r.p}</td>
                  <td className="px-3 py-2.5 mono text-muted whitespace-nowrap">{r.reg} · {r.rw}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.unit}</td>
                  <td className="px-3 py-2.5 mono whitespace-nowrap">{r.bms}</td>
                  <td className={cx('px-3 py-2.5 mono whitespace-nowrap', r.hold && 'text-critical font-semibold')}>{r.eq}{r.hold && ' ?'}</td>
                  <td className="px-3 py-2.5 text-muted">{r.loop}</td>
                  <td className="px-3 py-2.5">{r.meaning}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.route}</td>
                  <td className="px-3 py-2.5"><DocLink id={r.doc} mark={r.mark} /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.hold ? <span className="text-warning font-semibold inline-flex items-center gap-1"><TriangleAlert size={13} /> needs field verification</span> : <span className="text-ok inline-flex items-center gap-1"><Check size={13} /> reviewed</span>}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        </>) : (
          <div className="card p-5 mb-6 pop-in">
            <div className="grid sm:grid-cols-3 gap-3">{[['CDU-1', 'LD-1 zone 1 (cabinet)', 'drawingB', 'zone 1'], ['R3-01 Rack A', 'LD-2 zone 2 per as-built rev B', 'drawingB', 'zone 2'], ['R3-02 Rack B', 'LD-3 zone 3 · LD-2 per design rev A', 'drawingA', 'zone 2']].map(([eq, ld, d, m]) => (
              <div key={eq} className="rounded-xl border hairline p-3"><div className="mono font-semibold">{eq}</div><div className="text-[13px] text-muted mt-1">{ld}</div><div className="mt-2"><DocLink id={d} mark={m} /></div></div>))}
            </div>
            <p className="text-[13px] text-warning mt-3 flex items-center gap-1.5"><TriangleAlert size={14} /> Design rev A and as-built rev B disagree on LD-2. A technician confirms it during FC-2. <DocLink id="logbook" mark="re-routed" /></p>
          </div>
        )}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 mb-6">
          <Card header={<span className="font-semibold text-[14px]">Existing BMS → after</span>}>
            <div className="text-[13px] text-muted mb-1">Before: 13 points, none for row 3</div>
            <ul className="text-[13px] mono grid gap-0.5 mb-3">{BMS_BEFORE.map((b) => <li key={b}>{b}</li>)}</ul>
            <div className="text-[13px] text-ok font-medium">After: 24 points (+11 H1.CDU-1.*)</div>
          </Card>
          <div className="min-w-0">
            <div className="flex items-center mb-2"><span className="font-semibold text-[14px]">mapping.yaml draft</span>
              <Button className="ml-auto" onClick={() => download('mapping.yaml', String(S.original))}><Download size={14} /> Download mapping.yaml</Button></div>
            <div className="max-h-[320px] overflow-auto rounded-[14px]"><DiffView diff={draftDiff} /></div>
          </div>
        </div>
        <Card>
          {st.mappingReviewed
            ? <div className="flex items-center gap-2 text-[14px]"><Check size={16} className="text-ok" /> Draft approved for commissioning by Maya R. <Badge tone="warning">LD-2 held for field verification</Badge></div>
            : <div className="flex flex-wrap items-center gap-3"><span className="text-[14px] text-muted">10 points reviewed, 1 held.</span>
              <Button variant="primary" className="ml-auto" onClick={() => set({ mappingReviewed: true })}><Check size={15} /> Approve draft for commissioning; hold LD-2 for field verification (Maya R.)</Button></div>}
        </Card>
      </>}
    </div>
  );
}
