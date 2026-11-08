// Wire diagram: CDU-1 vendor points → BMS / integration points → equipment and alarm route.
// `fixed` moves the leak_zone_2 wire from R3-02 (design rev A, wrong) to R3-01 (as-built rev B). `rows="leak"` shows only the leak zones.
import type { CSSProperties } from 'react';

const W = 900, TOP = 52, GAP = 50, NH = 38;
const L = { x: 0, w: 170 }, M = { x: 320, w: 190 }, R = { x: 690, w: 210 };
const y = (at: number) => TOP + at * GAP;
const curve = (x1: number, y1: number, x2: number, y2: number) => { const mx = (x1 + x2) / 2; return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`; };

const POINTS = [
  { p: 'leak_zone_1', reg: '10001 · bool', bms: 'H1.CDU-1.LEAK.Z1', unit: 'leak alarm', to: 'cab' },
  { p: 'leak_zone_2', reg: '10002 · bool', bms: 'H1.CDU-1.LEAK.Z2', unit: 'leak alarm', to: 'lz2' },
  { p: 'leak_zone_3', reg: '10003 · bool', bms: 'H1.CDU-1.LEAK.Z3', unit: 'leak alarm', to: 'r2' },
  { p: 'sec_supply_temp', reg: '30010 · int16', bms: 'H1.CDU-1.SEC.SWT', unit: '°C ×0.1', to: 'tcs' },
  { p: 'sec_flow', reg: '30012 · uint16', bms: 'H1.CDU-1.SEC.FLOW', unit: 'L/min ×0.1', to: 'tcs' },
  { p: 'run_state', reg: '40001 · enum', bms: 'H1.CDU-1.STATE', unit: 'fault → alarm', to: 'fac' },
];
const TARGETS = [
  { id: 'cab', at: 0, name: 'CDU-1 cabinet', sub: 'notify Facilities' },
  { id: 'r1', at: 1, name: 'R3-01 · V-R3-01', sub: 'Rack A · close valve' },
  { id: 'r2', at: 2, name: 'R3-02 · V-R3-02', sub: 'Rack B · close valve' },
  { id: 'tcs', at: 3.5, name: 'TCS-1', sub: 'secondary loop' },
  { id: 'fac', at: 5, name: 'Facilities', sub: 'alarm route · on fault' },
];

const CSS = `.cw-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:cwDraw .9s cubic-bezier(.2,.7,.2,1) forwards}
@keyframes cwDraw{to{stroke-dashoffset:0}}
.cw-fade{animation:cwFade .5s ease both}
@keyframes cwFade{from{opacity:0}}
.cw-node{transition:fill .4s ease,stroke .4s ease}
@media (prefers-reduced-motion: reduce){.cw-draw{animation:none;stroke-dashoffset:0}.cw-fade{animation:none}}`;

type Tone = 'bad' | 'ok' | undefined;
const nodeStyle = (t: Tone): CSSProperties => t === 'bad'
  ? { fill: 'color-mix(in srgb, var(--critical) 10%, var(--surface))', stroke: 'var(--critical)' }
  : t === 'ok' ? { fill: 'color-mix(in srgb, var(--ok) 12%, var(--surface))', stroke: 'var(--ok)' }
    : { fill: 'var(--surface-2)', stroke: 'var(--border-strong)' };

function Node({ x, w, at, a, b, mono, tone }: { x: number; w: number; at: number; a: string; b: string; mono?: boolean; tone?: Tone }) {
  const cy = y(at);
  return (
    <g>
      <rect className="cw-node" x={x + 1} y={cy - NH / 2} width={w - 2} height={NH} rx={8} style={nodeStyle(tone)} strokeWidth={tone ? 1.5 : 1} />
      <text x={x + 12} y={cy - 3} fontSize={13} fontWeight={600} style={{ fill: 'var(--text)', fontFamily: mono ? 'var(--font-mono)' : undefined }}>{a}</text>
      <text x={x + 12} y={cy + 12} fontSize={12} style={{ fill: 'var(--text-muted)' }}>{b}</text>
    </g>
  );
}

export default function Wires({ fixed, rows = 'all' }: { fixed: boolean; rows?: 'all' | 'leak' }) {
  const pts = rows === 'leak' ? POINTS.slice(0, 3) : POINTS;
  const tgts = rows === 'leak' ? TARGETS.filter((t) => t.at < 3) : TARGETS;
  const H = y(pts.length - 1) + NH / 2 + 8;
  const at = (id: string) => (id === 'lz2' ? (fixed ? 1 : 2) : TARGETS.find((t) => t.id === id)!.at);
  const x1 = M.x + M.w, mid = (x1 + R.x) / 2;
  const wire = 'var(--text-faint)';
  return (
    <div className="overflow-x-auto">
      <style>{CSS}</style>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full max-w-[1040px]" style={{ minWidth: W }} role="img"
        aria-label={`Wire diagram: CDU-1 vendor points to BMS points to equipment. leak_zone_2 goes to ${fixed ? 'R3-01 (corrected)' : 'R3-02 (unverified; as-built drawing says R3-01)'}.`}>
        {[['CDU-1 vendor points (Modbus)', L.x], ['BMS / integration points', M.x], ['Equipment & alarm route', R.x]].map(([t, x]) => (
          <text key={t} x={Number(x) + 2} y={18} fontSize={12} fontWeight={500} style={{ fill: 'var(--text-muted)' }}>{t}</text>))}

        {pts.map((p, i) => (
          <g key={p.p} fill="none" strokeWidth={1.5} strokeLinecap="round">
            <path d={curve(L.x + L.w, y(i), M.x, y(i))} pathLength={1} className="cw-draw" style={{ stroke: wire, animationDelay: `${i * 70}ms` }} />
            {p.to !== 'lz2' && <path d={curve(x1, y(i), R.x, y(at(p.to)))} pathLength={1} className="cw-draw" style={{ stroke: wire, animationDelay: `${300 + i * 70}ms` }} />}
          </g>))}

        {!fixed && <g className="cw-fade">
          <path d={curve(x1, y(1), R.x, y(1))} fill="none" strokeWidth={1.5} strokeDasharray="3 5" style={{ stroke: wire, opacity: 0.6 }} />
          <text x={mid} y={y(1) - 8} textAnchor="middle" fontSize={12} style={{ fill: 'var(--text-muted)' }}>as-built rev B</text>
        </g>}
        <g key={fixed ? 'ok' : 'bad'}>
          {fixed
            ? <path d={curve(x1, y(1), R.x, y(1))} pathLength={1} className="cw-draw" fill="none" strokeWidth={2.5} strokeLinecap="round" style={{ stroke: 'var(--ok)' }} />
            : <g className="cw-fade">
              <path d={curve(x1, y(1), R.x, y(2))} fill="none" strokeWidth={2.5} strokeDasharray="7 5" style={{ stroke: 'var(--critical)' }} />
              <circle cx={mid} cy={(y(1) + y(2)) / 2} r={11} style={{ fill: 'var(--critical)' }} />
              <text x={mid} y={(y(1) + y(2)) / 2 + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} style={{ fill: '#fff' }}>?</text>
            </g>}
        </g>

        {pts.map((p, i) => <Node key={p.p} x={L.x} w={L.w} at={i} a={p.p} b={p.reg} mono tone={p.to === 'lz2' ? (fixed ? 'ok' : 'bad') : undefined} />)}
        {pts.map((p, i) => <Node key={p.bms} x={M.x} w={M.w} at={i} a={p.bms} b={p.unit} mono tone={p.to === 'lz2' ? (fixed ? 'ok' : 'bad') : undefined} />)}
        {tgts.map((t) => <Node key={t.id} x={R.x} w={R.w} at={t.at} a={t.name} b={t.sub} tone={t.id === 'r1' && fixed ? 'ok' : undefined} />)}
      </svg>
      <p className="text-[12px] text-muted mt-2">{fixed
        ? 'leak_zone_2 → R3-01 and V-R3-01, per as-built drawing rev B (decision D-1, J. Chen).'
        : 'leak_zone_2 → R3-02 comes from design drawing rev A. As-built rev B puts the cable under R3-01: needs field verification.'}</p>
    </div>
  );
}
