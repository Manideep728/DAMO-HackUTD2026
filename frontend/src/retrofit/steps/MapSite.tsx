// Step 2: map what is installed and what connects to what, with evidence per link, then choose where the CDU goes.
import { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { Badge, Button, Card, ModelBadge, PageHeader, SectionHeader, cx } from '../../components/ui';
import { useModern } from '../../modern/store';
import { AgentPanel, Tri, WorkSplit } from '../parts';
import { useRetrofit } from '../store';
import { doc, lineOf } from '../docs';
import { DocLink } from '../DocViewer';
import { FloorPlan, LOCS, type Loc } from '../viz/a-Drawings';

const LINES = [
  'Read [[inventory|R3-01]]: R3-01 Rack A and R3-02 Rack B, liquid, 45 kW each, on CDU-1',
  'Read [[topology|V-FW-1]]: CHW-LOOP → V-FW-1 → CDU-1 → TCS-1 → V-R3-01, V-R3-02',
  'Read [[floorplan|CHW-LOOP]] and [[bms|CRAH-1]]: CRAH-1..4 likely share CHW-LOOP (inferred)',
  'Read [[drawingB|zone 1]]: LD-1 in the CDU-1 cabinet; [[drawingB|zone 3]]: LD-3 under R3-02',
  'LD-2: [[drawingB|zone 2]] says R3-01, [[drawingA|zone 2]] says R3-02 ✗',
  'Read [[electrical|SWGR-A only]]: PNL-CDU has a single feed; both CDU pumps share it ✗',
  'Read [[electrical|2N]]: PDU-A3 and PDU-B3 feed both racks 2N',
  'Checked [[bms|LDP-1]]: no CDU-1 or row 3 points in the BMS; facility water temperature not stated ✗',
  'Compared 3 locations in [[floorplan|Candidate]]: L-A recommended (2.4 m pipe, 1.0 m clearance, support stand)',
];
type State = 'confirmed' | 'inferred' | 'conflict' | 'missing';
type Ev = [string, string];
interface Nd { id: string; label: string; sub?: string; x: number; y: number; w: number; h: number; at: number; ev: Ev[]; note: string; state?: State }
interface Lk { id: string; label: string; pts: string; medium: 'primary' | 'secondary' | 'power' | 'signal'; state: State; at: number; ev: Ev[]; note: string; q?: [number, number] }
const NODES: Nd[] = [
  ...[60, 145, 230, 315].map((x, i) => ({ id: `CRAH-${i + 1}`, label: `CRAH-${i + 1}`, x, y: 50, w: 70, h: 30, at: 2, ev: [['bms', `CRAH-${i + 1}.SAT`]] as Ev[], note: 'Air cooling for rows 1 and 2.' })),
  { id: 'CHW', label: 'CHW-LOOP', sub: 'facility water', x: 110, y: 200, w: 150, h: 52, at: 1, ev: [['topology', 'CHW-LOOP,cooling_loop'], ['bms', 'CHW-LOOP.SWT']], note: 'Primary chilled water. Feeds CDU-1 through V-FW-1.' },
  { id: 'V-FW-1', label: 'V-FW-1', x: 255, y: 200, w: 20, h: 14, at: 1, ev: [['topology', 'V-FW-1,valve']], note: 'Facility water valve to CDU-1.' },
  { id: 'CDU-1', label: 'CDU-1', sub: 'pumps P1 · P2', x: 390, y: 200, w: 130, h: 100, at: 1, ev: [['topology', 'CDU-1,cdu'], ['electrical', 'CDU-1 pump 1']], note: 'Coolant distribution unit for row 3. Two pumps on one panel.' },
  { id: 'TCS-1', label: 'TCS-1', sub: 'secondary loop', x: 545, y: 200, w: 96, h: 44, at: 1, ev: [['topology', 'TCS-1,cooling_loop']], note: 'Rack-facing secondary loop.' },
  { id: 'V-R3-01', label: 'V-R3-01', x: 655, y: 120, w: 20, h: 14, at: 1, ev: [['topology', 'V-R3-01,valve'], ['drawingB', 'Rack isolation valves']], note: 'Isolation valve for R3-01.' },
  { id: 'V-R3-02', label: 'V-R3-02', x: 655, y: 280, w: 20, h: 14, at: 1, ev: [['topology', 'V-R3-02,valve'], ['logbook', 'V-R3-02']], note: 'Isolation valve for R3-02. Stroked OK 2026-11-02.' },
  { id: 'R3-01', label: 'R3-01', sub: 'Rack A · 45 kW', x: 775, y: 120, w: 120, h: 56, at: 0, ev: [['inventory', 'R3-01'], ['drawingB', 'R3-01  Rack A']], note: 'GPU rack, liquid-cooled.' },
  { id: 'R3-02', label: 'R3-02', sub: 'Rack B · 45 kW', x: 775, y: 280, w: 120, h: 56, at: 0, ev: [['inventory', 'R3-02']], note: 'GPU rack, liquid-cooled.' },
  { id: 'PDU-A3', label: 'PDU-A3', sub: 'UPS-A', x: 910, y: 160, w: 76, h: 34, at: 6, ev: [['electrical', 'PDU-A3 from UPS-A']], note: '2N rack power, path A.' },
  { id: 'PDU-B3', label: 'PDU-B3', sub: 'UPS-B', x: 910, y: 240, w: 76, h: 34, at: 6, ev: [['electrical', 'PDU-A3 from UPS-A']], note: '2N rack power, path B.' },
  { id: 'LD-1', label: 'LD-1', x: 330, y: 300, w: 18, h: 18, at: 3, ev: [['drawingB', 'zone 1']], note: 'Leak zone 1, inside the CDU-1 cabinet drip tray.' },
  { id: 'LD-2', label: 'LD-2', x: 700, y: 200, w: 18, h: 18, at: 4, state: 'conflict', ev: [['drawingB', 'zone 2'], ['drawingA', 'zone 2'], ['mapping', 'R3-02'], ['logbook', 're-routed']], note: 'Rev B (as-built) says R3-01; rev A and the draft mapping say R3-02.' },
  { id: 'LD-3', label: 'LD-3', x: 700, y: 360, w: 18, h: 18, at: 3, ev: [['drawingB', 'zone 3'], ['drawingA', 'zone 3']], note: 'Leak zone 3, under R3-02 in both revisions.' },
  { id: 'SWGR-A', label: 'SWGR-A', x: 230, y: 395, w: 90, h: 32, at: 5, ev: [['electrical', 'SWGR-A only']], note: 'Only source for PNL-CDU.' },
  { id: 'PNL-CDU', label: 'PNL-CDU', sub: 'single feed', x: 420, y: 395, w: 100, h: 34, at: 5, ev: [['electrical', 'SWGR-A only'], ['electrical', 'Loss of SWGR-A']], note: 'Both CDU pumps share this panel. Loss of SWGR-A stops both.' },
  { id: 'BMS', label: 'BMS', sub: 'existing', x: 545, y: 60, w: 100, h: 34, at: 7, state: 'missing', ev: [['bms', 'LDP-1.ZONE2']], note: '13 existing points; none for row 3 or CDU-1.' },
  { id: 'SWT', label: 'Supply temp ?', x: 110, y: 310, w: 110, h: 30, at: 7, state: 'missing', ev: [['bms', 'CHW-LOOP.SWT'], ['cduB', 'facility water 20 C']], note: 'No site value in any source; datasheets rate at 20 °C.' },
];
const LINKS: Lk[] = [
  { id: 'l1', label: 'CHW-LOOP → V-FW-1', pts: '185,200 245,200', medium: 'primary', state: 'confirmed', at: 1, ev: [['topology', 'V-FW-1,valve']], note: 'Stated in the topology.' },
  { id: 'l2', label: 'V-FW-1 → CDU-1', pts: '265,200 325,200', medium: 'primary', state: 'confirmed', at: 1, ev: [['topology', 'CDU-1,cdu']], note: 'Stated in the topology.' },
  { id: 'l3', label: 'CDU-1 → TCS-1', pts: '455,200 497,200', medium: 'secondary', state: 'confirmed', at: 1, ev: [['topology', 'TCS-1,cooling_loop']], note: 'Stated in the topology.' },
  { id: 'l4', label: 'TCS-1 → V-R3-01 → R3-01', pts: '593,192 620,192 620,120 715,120', medium: 'secondary', state: 'confirmed', at: 1, ev: [['topology', 'V-R3-01,valve']], note: 'Stated in the topology and drawing note 4.' },
  { id: 'l5', label: 'TCS-1 → V-R3-02 → R3-02', pts: '593,208 620,208 620,280 715,280', medium: 'secondary', state: 'confirmed', at: 1, ev: [['topology', 'V-R3-02,valve']], note: 'Stated in the topology and drawing note 4.' },
  ...[60, 145, 230, 315].map((x, i) => ({ id: `c${i}`, label: `CHW-LOOP → CRAH-${i + 1}`, pts: `110,174 110,100 ${x},100 ${x},65`, medium: 'primary' as const, state: 'inferred' as const, at: 2, ev: [['floorplan', 'CHW-LOOP'], ['bms', 'Chilled water supply']] as Ev[], note: 'Not stated. Inferred from shared plant points: a CHW-LOOP fault would hit air and liquid cooling together.' })),
  { id: 'd1', label: 'LD-1 → CDU-1 cabinet', pts: '330,291 330,250', medium: 'signal', state: 'confirmed', at: 3, ev: [['drawingB', 'zone 1'], ['drawingA', 'zone 1']], note: 'Both revisions agree.' },
  { id: 'd2a', label: 'LD-2 → R3-01 ?', pts: '709,193 735,148', medium: 'signal', state: 'conflict', at: 4, ev: [['drawingB', 'zone 2'], ['logbook', 're-routed']], note: 'Rev B, as-built 2026-10-21. The logbook supports it.' },
  { id: 'd2b', label: 'LD-2 → R3-02 ?', pts: '709,207 735,252', medium: 'signal', state: 'conflict', at: 4, ev: [['drawingA', 'zone 2'], ['mapping', 'R3-02']], note: 'Rev A (routes to be confirmed on site) and the draft mapping.' },
  { id: 'd3', label: 'LD-3 → R3-02', pts: '709,352 735,308', medium: 'signal', state: 'confirmed', at: 3, ev: [['drawingB', 'zone 3']], note: 'Both revisions put zone 3 under R3-02.' },
  { id: 'p1', label: 'SWGR-A → PNL-CDU', pts: '275,395 370,395', medium: 'power', state: 'confirmed', at: 5, ev: [['electrical', 'SWGR-A only']], note: 'Single feed, no transfer switch.' },
  { id: 'p2', label: 'PNL-CDU → CDU-1 pumps', pts: '420,378 420,250', medium: 'power', state: 'confirmed', at: 5, ev: [['electrical', 'Loss of SWGR-A']], note: 'Both pumps on one panel.' },
  ...([['A3', 160, 128], ['A3', 166, 272], ['B3', 234, 136], ['B3', 246, 286]] as const).map(([p, y, ry], i) => ({ id: `u${i}`, label: `PDU-${p} → ${ry < 200 ? 'R3-01' : 'R3-02'}`, pts: `872,${y} 835,${ry}`, medium: 'power' as const, state: 'confirmed' as const, at: 6, ev: [['electrical', '2N']] as Ev[], note: '2N to both racks.' })),
  { id: 'm1', label: 'CDU-1 → BMS', pts: '390,150 390,60 495,60', medium: 'signal', state: 'missing', at: 7, q: [440, 60], ev: [['bms', 'LDP-1.ZONE2']], note: 'No CDU-1 points in the existing BMS yet. Step 5 drafts them.' },
  { id: 'm2', label: 'CHW-LOOP supply temperature', pts: '110,226 110,295', medium: 'primary', state: 'missing', at: 7, q: [110, 262], ev: [['bms', 'CHW-LOOP.SWT']], note: 'No site value in any source.' },
];
const MED = { primary: 'var(--panel-accent)', secondary: 'var(--panel-liquid)', power: '#D9A441', signal: 'var(--panel-muted)' };
const stroke = (l: Lk) => l.state === 'conflict' ? '#FF8A80' : l.state === 'missing' ? '#6b685f' : MED[l.medium];
const dash = (s: State) => s === 'inferred' ? '6 5' : s === 'missing' ? '3 5' : undefined;
const TONE = { confirmed: 'ok', inferred: 'neutral', conflict: 'critical', missing: 'warning' } as const;
const quote = ([id, m]: Ev) => doc(id).text.split('\n')[lineOf(id, m) - 1]?.trim() ?? '';

function CoolingMap({ progress }: { progress: number }) {
  const [sel, setSel] = useState<string>('LD-2');
  const vis = (at: number) => progress > at;
  const item = NODES.find((x) => x.id === sel) ?? LINKS.find((x) => x.id === sel);
  const state: State = (item && ('medium' in item ? item.state : item.state ?? 'confirmed')) || 'confirmed';
  const pick = (id: string) => ({ role: 'button', tabIndex: 0, onClick: () => setSel(id), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') setSel(id); }, style: { cursor: 'pointer' } });
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4 mb-8">
      <div className="panel rounded-2xl p-3 min-w-0">
        <style>{`@keyframes aflow{to{stroke-dashoffset:-32}}.a-flow{animation:aflow 1.4s linear infinite}@keyframes apulse{50%{opacity:.35}}.a-pulse{animation:apulse 1.2s ease-in-out infinite}@keyframes adraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}.a-draw{stroke-dasharray:1;animation:adraw .7s ease both}@media (prefers-reduced-motion:reduce){.a-flow,.a-pulse,.a-draw{animation:none}}`}</style>
        <div className="overflow-x-auto">
          <svg viewBox="0 0 960 440" className="w-full min-w-[720px] block" role="img" aria-label="Cooling and power map for row 3 with evidence state per link">
            {LINKS.filter((l) => vis(l.at)).map((l) => (
              <g key={l.id} {...pick(l.id)} aria-label={`${l.label}: ${l.state}`}>
                <polyline points={l.pts} fill="none" stroke="transparent" strokeWidth="14" />
                {l.state === 'confirmed' || l.state === 'conflict'
                  ? <polyline points={l.pts} pathLength={1} fill="none" stroke={stroke(l)} strokeWidth={sel === l.id ? 4 : l.medium === 'signal' || l.medium === 'power' ? 1.8 : 3} strokeLinejoin="round" className={cx('a-draw', l.state === 'conflict' && 'a-pulse')} />
                  : <polyline points={l.pts} fill="none" stroke={stroke(l)} strokeWidth={sel === l.id ? 3.5 : 2} strokeDasharray={dash(l.state)} strokeLinejoin="round" className="pop-in" />}
                {l.state === 'confirmed' && (l.medium === 'primary' || l.medium === 'secondary') && <polyline points={l.pts} fill="none" stroke="var(--panel-text)" strokeOpacity=".55" strokeWidth="1.5" strokeDasharray="2 14" className="a-flow" />}
                {l.q && <g><circle cx={l.q[0]} cy={l.q[1]} r="9" fill="var(--panel)" stroke="#6b685f" /><text x={l.q[0]} y={l.q[1] + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--panel-muted)">?</text></g>}
              </g>))}
            {NODES.filter((nd) => vis(nd.at)).map((nd) => {
              const small = nd.w <= 20; const on = sel === nd.id;
              const edge = nd.state === 'conflict' ? '#FF8A80' : nd.state === 'missing' ? '#6b685f' : on ? 'var(--panel-text)' : 'var(--panel-border)';
              return (
                <g key={nd.id} {...pick(nd.id)} className="pop-in" aria-label={nd.label}>
                  {small && nd.h === 14 ? <path d={`M${nd.x - 10} ${nd.y - 7} L${nd.x + 10} ${nd.y + 7} L${nd.x + 10} ${nd.y - 7} L${nd.x - 10} ${nd.y + 7} Z`} fill="var(--panel-2)" stroke={on ? 'var(--panel-text)' : MED.secondary} strokeWidth="1.5" />
                    : small ? <circle cx={nd.x} cy={nd.y} r="9" fill="var(--panel-2)" stroke={edge} strokeWidth={nd.state === 'conflict' || on ? 2.5 : 1.5} className={nd.state === 'conflict' ? 'a-pulse' : undefined} />
                      : <rect x={nd.x - nd.w / 2} y={nd.y - nd.h / 2} width={nd.w} height={nd.h} rx="8" fill="var(--panel-2)" stroke={edge} strokeWidth={on ? 2 : 1.2} strokeDasharray={nd.state === 'missing' ? '3 4' : undefined} />}
                  <text x={small ? nd.x + (nd.id.startsWith('LD') ? 14 : 0) : nd.x} y={small ? (nd.id.startsWith('LD') ? nd.y + 4 : nd.y + 22) : nd.sub ? nd.y - 2 : nd.y + 4} textAnchor={small && nd.id.startsWith('LD') ? 'start' : 'middle'} fontSize="12" fontWeight="600" fill="var(--panel-text)" className="mono">{nd.label}</text>
                  {nd.sub && !small && <text x={nd.x} y={nd.y + 13} textAnchor="middle" fontSize="10.5" fill={nd.id === 'PNL-CDU' ? '#E3A640' : 'var(--panel-muted)'}>{nd.sub}</text>}
                  {nd.id === 'CDU-1' && ['P1', 'P2'].map((p, i) => <g key={p}><circle cx={370 + i * 40} cy={228} r="11" fill="none" stroke="var(--panel-muted)" /><text x={370 + i * 40} y={232} textAnchor="middle" fontSize="10" fill="var(--panel-muted)">{p}</text></g>)}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-2 pt-2 text-[12px] text-[var(--panel-muted)]">
          {([['confirmed', 'var(--panel-text)', undefined], ['inferred', 'var(--panel-text)', '6 5'], ['conflicting', '#FF8A80', undefined], ['missing', '#6b685f', '3 5']] as const).map(([s, c, d]) => <span key={s} className="inline-flex items-center gap-1.5"><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke={c} strokeWidth="2.5" strokeDasharray={d} /></svg>{s}</span>)}
          <span className="sm:ml-auto inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm" style={{ background: MED.primary }} />facility water</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm" style={{ background: MED.secondary }} />secondary</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm" style={{ background: MED.power }} />power</span>
        </div>
      </div>
      <Card className="min-w-0" header={<><span className="font-semibold text-[14px] truncate mono">{item?.label}</span><span className="ml-auto"><Badge tone={TONE[state]}>{state}</Badge></span></>}>
        <p className="text-[13.5px] mb-3">{item?.note}</p>
        <ul className="grid gap-2">{item?.ev.map((e, i) => <li key={i} className="grid gap-1"><DocLink id={e[0]} mark={e[1]} /><span className="mono text-[12px] text-muted bg-surface-2 rounded-md px-2 py-1 break-words">L{lineOf(e[0], e[1])}: {quote(e)}</span></li>)}</ul>
      </Card>
    </div>
  );
}

const CRIT: { k: string; ev: Ev; v: Record<Loc, ['pass' | 'fail' | 'unknown', string]> }[] = [
  { k: 'Space', ev: ['floorplan', 'Candidate'], v: { 'L-A': ['pass', '1.2 × 1.2 m'], 'L-B': ['pass', '1.2 × 1.2 m'], 'L-C': ['pass', '2.0 × 1.5 m'] } },
  { k: 'Floor loading', ev: ['floorplan', 'Floor loading'], v: { 'L-A': ['pass', 'stand above 900 kg'], 'L-B': ['pass', 'stand above 900 kg'], 'L-C': ['unknown', 'not in any source'] } },
  { k: 'Pipe route', ev: ['floorplan', 'L-B'], v: { 'L-A': ['pass', '2.4 m'], 'L-B': ['fail', '9.5 m across both racks'], 'L-C': ['fail', '28 m, penetration not approved'] } },
  { k: 'Electrical supply', ev: ['electrical', 'PNL-CDU'], v: { 'L-A': ['pass', 'PNL-CDU, single feed'], 'L-B': ['pass', 'PNL-CDU, single feed'], 'L-C': ['unknown', 'feed route not stated'] } },
  { k: 'Service clearance', ev: ['floorplan', '1.0 m'], v: { 'L-A': ['pass', '1.0 m front'], 'L-B': ['fail', '0.6 m, blocks aisle'], 'L-C': ['unknown', 'not stated'] } },
];

export default function MapSite() {
  const { st, set } = useRetrofit();
  const busy = useModern().busy;
  const progress = st.mapped ? 99 : busy?.key === 's2' ? busy.log.length : 0;
  const [at, setAt] = useState<string | null>(() => { try { return localStorage.getItem('damo-retrofit-a-survey'); } catch { return null; } });
  const choose = (l: Loc) => { if (!st.mapped) return; set(l === st.location ? { location: l } : { location: l, surveyVerified: false }); };
  const verify = () => { const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); setAt(t); try { localStorage.setItem('damo-retrofit-a-survey', t); } catch { /* not persisted */ } set({ surveyVerified: true }); };
  const cnt = (s: State) => LINKS.filter((l) => l.state === s).length;
  return (
    <div>
      <PageHeader kicker="Step 2 of 6" title="Map the site" subtitle="What's installed, what connects to what, and where the CDU can go." />
      <AgentPanel k="s2" title="Mapping the site" lines={LINES} ran={st.mapped} onDone={() => set({ mapped: true })} />
      <WorkSplit did={<>Mapped {NODES.length} components and {LINKS.length} links: {cnt('confirmed')} confirmed, {cnt('inferred')} inferred, {cnt('conflict')} conflicting, {cnt('missing')} missing. Recommends L-A.</>}
        need={st.location && st.surveyVerified ? <>{st.location} chosen; survey verified by R. Alvarez.</> : 'Choose the CDU location; R. Alvarez verifies the survey.'} decided={!!st.location && st.surveyVerified} />
      <SectionHeader title="Cooling and power map" subtitle="Click any component or link for its evidence." />
      <CoolingMap progress={progress} />
      <SectionHeader title="Where the CDU can go" subtitle="Hall H1, row 3. Choose a location." />
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-3 overflow-x-auto min-w-0"><FloorPlan selected={st.location} onSelect={choose} recommended={progress > 8 ? 'L-A' : undefined} /></div>
        <div className="card overflow-x-auto min-w-0">
          <table className="w-full text-[13px]">
            <thead className="border-b hairline"><tr><th className="th text-left px-3 h-10">Check</th>{LOCS.map((l) => <th key={l} className={cx('th text-left px-3', st.location === l && 'text-text')}>{l}{l === 'L-A' && progress > 8 && <span className="ml-1.5"><Badge tone="accent">recommended</Badge></span>}</th>)}</tr></thead>
            <tbody>{CRIT.map((c) => <tr key={c.k} className="border-b hairline last:border-0 align-top">
              <td className="px-3 py-2"><div className="font-medium">{c.k}</div><div className="mt-1"><DocLink id={c.ev[0]} mark={c.ev[1]} label={doc(c.ev[0]).file.replace(/\..*$/, '')} /></div></td>
              {LOCS.map((l) => <td key={l} className={cx('px-3 py-2', st.location === l && 'bg-surface-2')}>{progress > 8 ? <><Tri v={c.v[l][0]} /><div className="text-[12px] text-muted">{c.v[l][1]}</div></> : <span className="text-faint">…</span>}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </div>
      {progress > 8 && <p className="text-[13px] text-muted mb-4 flex items-center gap-2 flex-wrap"><ModelBadge model="Nemotron Super" /> Recommends L-A: shortest pipe (2.4 m), 1.0 m clearance; needs a support stand.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {LOCS.map((l) => <Button key={l} className={cx('h-12', st.location === l && '!border-text bg-surface-2 font-semibold')} disabled={!st.mapped} onClick={() => choose(l)}>Choose {l}</Button>)}
        <Button variant="primary" className="h-12 sm:ml-auto" disabled={!st.location || st.surveyVerified} onClick={verify}><UserCheck size={15} /> Verify survey as R. Alvarez (facility engineer)</Button>
      </div>
      {st.surveyVerified && st.location && <p className="mt-3 text-[13px] text-ok flex items-center gap-1.5 pop-in"><UserCheck size={14} /> Recorded {at ? `${at} · ` : ''}R. Alvarez · {st.location} · source floorplan rev C</p>}
    </div>
  );
}
