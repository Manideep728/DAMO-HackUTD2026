// Step 1: connect the project's sources and show where each fact the integration needs lives.
import { useState } from 'react';
import { Check, CircleCheck, HelpCircle, OctagonAlert, Upload, Lock } from 'lucide-react';
import { Badge, Button, Card, PageHeader, SectionHeader, cx } from '../../components/ui';
import { useModern } from '../../modern/store';
import { AgentPanel, WorkSplit } from '../parts';
import { useRetrofit } from '../store';
import { DOCS } from '../docs';
import { DocLink, useDocs } from '../DocViewer';

const LINES = [
  'Connected to H1 retrofit project library (read-only)',
  'Indexed 15 documents in 9 folders',
  'Read [[drawingB|zone 2]] and [[drawingA|zone 2]]: two revisions disagree on leak zone 2 ✗',
  'Read [[logbook|re-routed]]: leak cables re-routed from the CDU end on 2026-10-21, matching rev B',
  'Read [[topology|LD-2]]: leak cables listed by zone, not by rack',
  'Read [[mapping|R3-02]]: the draft maps zone 2 to R3-02, as rev A does ✗',
  'Read [[manual|run_state]] and [[manual24|Release note]]: firmware 2.4.0 renumbers run_state ✗',
  'Read [[requirements|Operating limits]], [[inventory|R3-01]], [[electrical|SWGR-A only]], [[floorplan|Candidate]]: limits, loads, power, locations linked',
  'Not stated in any source: facility water supply temperature, L-C floor loading; 2 owners TBD ✗',
];
const AT: Record<string, number> = { drawingB: 2, drawingA: 2, logbook: 3, topology: 4, mapping: 5, manual: 6, manual24: 6, bms: 8 };
const COLS: [string, string][] = [['drawingB', 'Dwg rev B'], ['drawingA', 'Dwg rev A'], ['floorplan', 'Floor plan'], ['topology', 'Topology'], ['inventory', 'Inventory'], ['electrical', 'One-line'], ['manual', 'Points 2.3'], ['manual24', 'Points 2.4'], ['cduA', 'KX-90'], ['cduB', 'KX-140'], ['cduC', 'RX-120'], ['requirements', 'Site reqs'], ['mapping', 'Mapping'], ['logbook', 'Logbook'], ['bms', 'BMS export']];

type C = { t: 's' | 'x' | 'q'; m: string; says: string };
interface Fact { label: string; status: 'consistent' | 'conflict' | 'missing'; c: Record<string, C> }
const FACTS: Fact[] = [
  { label: 'Rack protected by leak zone 2', status: 'conflict', c: { drawingB: { t: 'x', m: 'zone 2', says: 'under R3-01 (Rack A)' }, drawingA: { t: 'x', m: 'zone 2', says: 'under R3-02 (Rack B)' }, mapping: { t: 'x', m: 'R3-02', says: 'leak_zone_2 → R3-02' }, logbook: { t: 's', m: 're-routed', says: 'cables re-routed, rev B as-built' }, topology: { t: 'q', m: 'LD-2', says: 'zone only, no rack' } } },
  { label: 'Rack protected by leak zone 3', status: 'consistent', c: { drawingB: { t: 's', m: 'zone 3', says: 'under R3-02 drip tray' }, drawingA: { t: 's', m: 'zone 3', says: 'under R3-02 rear manifold' }, mapping: { t: 's', m: 'leak_zone_3', says: 'leak_zone_3 → R3-02' }, topology: { t: 'q', m: 'LD-3', says: 'zone only, no rack' } } },
  { label: 'Isolation valve for each rack', status: 'consistent', c: { topology: { t: 's', m: 'V-R3-01', says: 'V-R3-01 → R3-01, V-R3-02 → R3-02' }, drawingB: { t: 's', m: 'Rack isolation valves', says: 'note 4' }, drawingA: { t: 's', m: 'Rack isolation valves', says: 'note 4' }, mapping: { t: 's', m: 'valves:', says: 'valves per rack' }, logbook: { t: 's', m: 'V-R3-02', says: 'V-R3-02 stroked OK' } } },
  { label: 'CDU-1 point registers and states', status: 'conflict', c: { manual: { t: 'x', m: 'run_state', says: '2=standby' }, manual24: { t: 'x', m: 'Release note', says: '2=running_degraded, standby=4' }, mapping: { t: 's', m: 'firmware: 2.3.0', says: 'written for 2.3.0' }, cduB: { t: 's', m: 'firmware 2.3.0', says: 'point list §7, fw 2.3.0' } } },
  { label: 'Secondary flow limit', status: 'consistent', c: { requirements: { t: 's', m: 'at least 200 L/min', says: '≥200, design 240 L/min' }, logbook: { t: 's', m: '240 L/min', says: 'flow back to 240 L/min' }, manual: { t: 's', m: 'sec_flow', says: 'register 30012, ×0.1' } } },
  { label: 'Secondary supply temperature limits', status: 'consistent', c: { requirements: { t: 's', m: '30–36', says: '30–36 °C' }, mapping: { t: 's', m: 'approved_range_c', says: 'setpoints 30–35 °C' } } },
  { label: 'Rack heat load', status: 'consistent', c: { inventory: { t: 's', m: 'R3-01', says: '45 kW each, on CDU-1' } } },
  { label: 'CDU footprint and weight', status: 'consistent', c: { cduA: { t: 's', m: 'Footprint', says: '0.8×1.2 m, 690 kg' }, cduB: { t: 's', m: 'Footprint', says: '1.2×1.2 m, 980 kg' }, cduC: { t: 's', m: 'Footprint', says: '2.0×1.2 m, 1150 kg' }, floorplan: { t: 's', m: '900 kg', says: 'stand above 900 kg' } } },
  { label: 'CDU power feed', status: 'consistent', c: { electrical: { t: 's', m: 'SWGR-A only', says: 'single feed from SWGR-A' } } },
  { label: 'Leak response per rack', status: 'consistent', c: { requirements: { t: 's', m: 'Leak at a rack', says: 'close rack valve, notify' }, mapping: { t: 's', m: 'close_rack_valve', says: 'close_rack_valve: true' } } },
  { label: 'Facility water supply temperature', status: 'missing', c: { bms: { t: 'q', m: 'CHW-LOOP.SWT', says: 'point exists, no value' }, cduB: { t: 'q', m: 'facility water 20 C', says: 'rating condition only' }, manual: { t: 'q', m: 'fw_supply_temp', says: 'register only' } } },
  { label: 'Owner: loop water chemistry', status: 'missing', c: { requirements: { t: 'q', m: 'water chemistry', says: 'owner TBD' } } },
  { label: 'Owner: CDU firmware updates', status: 'missing', c: { requirements: { t: 'q', m: 'CDU firmware updates', says: 'owner TBD' } } },
  { label: 'CDU location constraints', status: 'consistent', c: { floorplan: { t: 's', m: 'Candidate', says: 'L-A, L-B, L-C described' } } },
  { label: 'Floor loading at L-C', status: 'missing', c: { floorplan: { t: 'q', m: 'Floor loading', says: 'covers L-A and L-B only' } } },
];
const n = { linked: FACTS.filter((f) => Object.values(f.c).some((c) => c.t !== 'q')).length, conflict: FACTS.filter((f) => f.status === 'conflict').length, missing: FACTS.filter((f) => f.status === 'missing').length };
const FOLDERS = [...new Set(DOCS.map((d) => d.folder))];
const KIND: Record<string, string> = { sheet: 'spreadsheet', manual: 'manual', drawing: 'drawing', doc: 'document', log: 'log', config: 'config' };

function Mark({ c }: { c: C }) {
  if (c.t === 'q') return <span className="h-3.5 w-3.5 rounded-full border-2 border-dashed border-warning" />;
  return <span className={cx('grid place-items-center rounded-full', c.t === 'x' && 'h-5 w-5 border-2 border-critical')}><span className="h-2.5 w-2.5 rounded-full bg-text" /></span>;
}

function Coverage({ progress, picked }: { progress: number; picked: Set<string> }) {
  const { open } = useDocs();
  const [hov, setHov] = useState<string | null>(null);
  const all = progress >= LINES.length;
  const shown = (id: string) => all || progress > (AT[id] ?? 7);
  return (
    <Card className="mb-6" header={<><span className="font-semibold text-[14px]">Where each fact lives</span><span className="text-[12px] text-muted hidden sm:inline">One integration, 15 facts, scattered over 15 documents.</span></>}>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="text-[13px] border-separate border-spacing-0">
          <thead><tr>
            <th className="th text-left pr-3 align-bottom min-w-[220px]">Fact the integration needs</th>
            {COLS.map(([id, s]) => <th key={id} className={cx('th align-bottom px-0.5 h-24 w-8', !picked.has(id) && 'opacity-30')}><span className="inline-block whitespace-nowrap [writing-mode:vertical-rl] rotate-180 text-[12px]">{s}</span></th>)}
            <th className="th text-left pl-3 align-bottom">Across sources</th>
          </tr></thead>
          <tbody>{FACTS.map((f, i) => (
            <tr key={f.label} className="hover:bg-surface-2 t">
              <td className="pr-3 h-9 border-t hairline whitespace-nowrap">{f.label}</td>
              {COLS.map(([id, s], j) => {
                const c = f.c[id];
                return <td key={id} className={cx('border-t hairline text-center p-0', !picked.has(id) && 'opacity-30')}>
                  {c && shown(id) ? <button className="cell-in h-9 w-8 grid place-items-center mx-auto" style={{ animationDelay: `${(i * 14 + j * 10)}ms` }}
                    onMouseEnter={() => setHov(`${f.label} · ${s}: ${c.says}`)} onMouseLeave={() => setHov(null)} onFocus={() => setHov(`${f.label} · ${s}: ${c.says}`)}
                    onClick={() => open(id, c.m)} aria-label={`${f.label}, ${s}: ${c.says}`}><Mark c={c} /></button>
                    : <span className="inline-block h-1 w-1 rounded-full bg-border-strong" />}
                </td>;
              })}
              <td className="pl-3 border-t hairline whitespace-nowrap">{all ? (
                f.status === 'conflict' ? <span className="inline-flex items-center gap-1 text-critical font-semibold text-[12px]"><OctagonAlert size={13} /> conflict</span>
                  : f.status === 'missing' ? <span className="inline-flex items-center gap-1 text-warning font-semibold text-[12px]"><HelpCircle size={13} /> missing</span>
                    : <span className="inline-flex items-center gap-1 text-ok text-[12px]"><CircleCheck size={13} /> consistent</span>) : <span className="text-faint">…</span>}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5"><Mark c={{ t: 's', m: '', says: '' }} /> states it</span>
        <span className="inline-flex items-center gap-1.5"><Mark c={{ t: 'x', m: '', says: '' }} /> contradicts another source</span>
        <span className="inline-flex items-center gap-1.5"><Mark c={{ t: 'q', m: '', says: '' }} /> mentions it, no answer</span>
        <span className="mono text-[12px] text-text min-h-5 sm:ml-auto">{hov ?? 'Click a mark to open the document at that line.'}</span>
      </div>
    </Card>
  );
}

export default function Connect() {
  const { st, set } = useRetrofit();
  const busy = useModern().busy;
  const progress = st.connected ? LINES.length : busy?.key === 's1' ? busy.log.length : 0;
  const [picked, setPicked] = useState<Set<string>>(() => new Set(DOCS.map((d) => d.id)));
  const [err, setErr] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const toggle = (ids: string[], on: boolean) => setPicked((p) => { const s = new Set(p); ids.forEach((id) => (on ? s.add(id) : s.delete(id))); return s; });
  return (
    <div>
      <PageHeader kicker="Step 1 of 6" title="Connect sources" subtitle="Connect a knowledge base, choose the project's documents, or import files." />
      <AgentPanel k="s1" title="Reading project sources" lines={LINES} ran={st.connected} onDone={() => set({ connected: true })} />
      <WorkSplit did={<>Linked {n.linked} facts across 15 documents; found {n.conflict} conflicts and {n.missing} gaps.</>} need="Review the gaps; nothing to approve yet." decided={st.connected} />
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card header={<span className="font-semibold text-[14px]">Connect a knowledge base</span>}>
          <ul className="grid gap-2">
            <li className="flex items-center gap-2 min-h-12"><span className="min-w-0"><span className="block text-[14px] font-medium">H1 retrofit project library</span><span className="text-[12px] text-muted inline-flex items-center gap-1"><Lock size={11} /> read-only · synced 2026-11-08 06:02</span></span><span className="ml-auto">{progress > 0 ? <Badge tone="ok"><Check size={11} /> connected</Badge> : <Badge>connecting</Badge>}</span></li>
            {['Google Drive', 'SharePoint', 'Confluence'].map((c) => (
              <li key={c} className="flex items-center gap-2 min-h-12 border-t hairline pt-2"><span className="min-w-0"><span className="block text-[14px]">{c}</span><span className="text-[12px] text-muted">not connected</span></span><Button className="ml-auto h-12" onClick={() => setErr(c)}>Connect</Button></li>))}
          </ul>
          {err && <p className="mt-2 text-[13px] text-critical">{err}: connector not configured on this server.</p>}
        </Card>
        <Card header={<span className="font-semibold text-[14px]">Choose existing documents</span>}>
          <div className="text-[12px] text-muted mb-2">Site H1 › Row 3 retrofit · {picked.size} of {DOCS.length} selected</div>
          <ul className="grid gap-0.5 max-h-[300px] overflow-y-auto">{FOLDERS.map((f) => {
            const ds = DOCS.filter((d) => d.folder === f); const on = ds.every((d) => picked.has(d.id));
            return <li key={f}>
              <label className="flex items-center gap-2 min-h-9 text-[13.5px] font-medium"><input type="checkbox" className="h-4 w-4" checked={on} onChange={(e) => toggle(ds.map((d) => d.id), e.target.checked)} /> {f}</label>
              <ul className="pl-6">{ds.map((d) => <li key={d.id}><label className="flex items-center gap-2 min-h-8 text-[12.5px] mono text-muted"><input type="checkbox" className="h-4 w-4" checked={picked.has(d.id)} onChange={(e) => toggle([d.id], e.target.checked)} /> {d.file}</label></li>)}</ul>
            </li>;
          })}</ul>
        </Card>
        <Card header={<span className="font-semibold text-[14px]">Import files</span>}>
          <label className="flex flex-col items-center justify-center gap-2 min-h-28 rounded-xl border-2 border-dashed hairline text-[13px] text-muted cursor-pointer hover:border-border-strong t">
            <Upload size={18} /> Choose files
            <input type="file" multiple className="sr-only" onChange={(e) => setFiles([...(e.target.files ?? [])].map((f) => f.name))} />
          </label>
          {files.length > 0 && <ul className="mt-3 grid gap-1">{files.map((f) => <li key={f} className="text-[12.5px] flex gap-2"><span className="mono truncate">{f}</span><span className="ml-auto text-muted whitespace-nowrap">queued, not parsed in this demo</span></li>)}</ul>}
        </Card>
      </div>
      <Coverage progress={progress} picked={picked} />
      <SectionHeader title="Sources" subtitle="Pinned by version and hash." />
      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left border-b hairline"><tr>{['Source', 'Kind', 'Folder', 'Version', 'Last sync', 'SHA', 'Status'].map((h) => <th key={h} className="th px-4 h-10 whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {DOCS.map((d) => <tr key={d.id} className="border-b hairline">
              <td className="px-4 py-2"><DocLink id={d.id} /></td><td className="px-4 text-muted">{KIND[d.kind]}</td><td className="px-4 text-muted">{d.folder}</td>
              <td className="px-4 whitespace-nowrap">{d.version}</td><td className="px-4 mono text-[12px] whitespace-nowrap">{d.synced}</td><td className="px-4 mono text-[12px]">{d.sha}</td>
              <td className="px-4">{picked.has(d.id) ? <Badge tone="ok">pinned</Badge> : <Badge>excluded</Badge>}</td></tr>)}
            {['Facility water supply temperature', 'Floor loading for L-C'].map((m) => <tr key={m} className="border-b hairline last:border-0">
              <td className="px-4 py-2.5">{m}</td><td className="px-4 text-muted" colSpan={5}>not in any source</td><td className="px-4"><Badge tone="warning">missing</Badge></td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
