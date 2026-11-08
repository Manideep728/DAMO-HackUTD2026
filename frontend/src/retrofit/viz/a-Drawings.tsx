// Engineering drawings drawn from the source documents: the row 3 rack drawing (rev A / rev B) and the hall H1 floor plan.
// Paper styling (surface + ink tokens) so they read as drawing sheets in both themes.
import { useState } from 'react';

const INK = 'var(--text)';
const MUTED = 'var(--text-muted)';
const FAINT = 'var(--text-faint)';
const PIPE = 'var(--accent)';
const CABLE = 'var(--warning)';

/** Plan view of row 3. Rev A and rev B differ in where leak cables 2 and 3 run. `hi` emphasises one numbered note. */
export function RowDrawing({ rev, hi }: { rev: 'A' | 'B'; hi?: number }) {
  const A = rev === 'A';
  const racks = [{ id: 'R3-01', name: 'Rack A', x: 180 }, { id: 'R3-02', name: 'Rack B', x: 410 }];
  // leak cables: [zone, x1, x2, y, note]
  const cables: [number, number, number, number, number][] = [
    [1, 54, 136, 188, 1],
    A ? [2, 420, 610, 188, 2] : [2, 190, 380, 188, 2],
    A ? [3, 420, 610, 101, 3] : [3, 420, 610, 188, 3],
  ];
  const lit = (n: number) => hi === n;
  return (
    <svg viewBox="0 0 760 330" className="w-full min-w-[620px] block" role="img" aria-label={`Drawing RD-H1-R3 rev ${rev}: row 3 plan with leak cable routes`}>
      <defs>
        <pattern id={`hatch-${rev}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke={FAINT} strokeWidth="1" /></pattern>
      </defs>
      <rect x="6" y="6" width="748" height="318" fill="none" stroke={MUTED} strokeWidth="1" />
      <rect x="10" y="10" width="740" height="310" fill="none" stroke={FAINT} strokeWidth="0.5" />
      {/* secondary header pipes */}
      <g stroke={PIPE} strokeWidth="2" fill="none">
        <path d="M150 112 H166 V36 H680" /><path d="M150 124 H172 V44 H680" />
        {racks.map((r) => <path key={r.id} d={`M${r.x + 105} 36 V90`} />)}
      </g>
      <text x="684" y="44" fontSize="10" fill={MUTED}>TCS-1 sec. supply/return</text>
      {racks.map((r) => (
        <g key={r.id}>
          <path d={`M${r.x + 98} 62 L${r.x + 112} 72 L${r.x + 112} 62 L${r.x + 98} 72 Z`} fill="var(--surface)" stroke={PIPE} strokeWidth="1.5" />
          <text x={r.x + 118} y="70" fontSize="10.5" fill={INK} className="mono">V-{r.id}</text>
        </g>
      ))}
      {lit(4) && <rect x="268" y="54" width="340" height="26" rx="4" fill="var(--accent-soft)" stroke={PIPE} strokeDasharray="3 3" />}
      {/* CDU */}
      <rect x="40" y="90" width="110" height="110" fill="var(--surface-2)" stroke={INK} strokeWidth="1.5" />
      <text x="95" y="128" textAnchor="middle" fontSize="14" fontWeight="600" fill={INK}>CDU-1</text>
      <text x="95" y="144" textAnchor="middle" fontSize="10" fill={MUTED}>leak panel LD</text>
      <rect x="50" y="180" width="90" height="14" fill={`url(#hatch-${rev})`} stroke={MUTED} strokeWidth="0.75" />
      {/* racks */}
      {racks.map((r) => (
        <g key={r.id}>
          <rect x={r.x} y="90" width="210" height="110" fill="var(--surface-2)" stroke={INK} strokeWidth="1.5" />
          <rect x={r.x + 10} y="96" width="190" height="10" fill="none" stroke={MUTED} strokeWidth="0.75" />
          <text x={r.x + 105} y="134" textAnchor="middle" fontSize="14" fontWeight="600" fill={INK}>{r.id}</text>
          <text x={r.x + 105} y="150" textAnchor="middle" fontSize="11" fill={MUTED}>{r.name} · rear manifold top · drip tray bottom</text>
          <rect x={r.x + 10} y="180" width="190" height="14" fill={`url(#hatch-${rev})`} stroke={MUTED} strokeWidth="0.75" />
        </g>
      ))}
      <text x="636" y="150" fontSize="11" fill={MUTED}>end of row</text>
      {/* leak cables and leads back to the CDU panel */}
      {cables.map(([z, x1, x2, y, n]) => {
        const leadY = 210 + z * 9;
        return (
          <g key={z} opacity={hi && !lit(n) ? 0.45 : 1}>
            <line x1={x1} y1={y} x2={x2} y2={y} stroke={CABLE} strokeWidth={lit(n) ? 4 : 2.5} strokeDasharray="7 4" />
            {z > 1 && <polyline points={`${x1},${y} ${x1 - 6},${y} ${x1 - 6},${leadY} ${70 + z * 18},${leadY} ${70 + z * 18},200`} fill="none" stroke={CABLE} strokeWidth="1" strokeDasharray="2 3" />}
            <text x={(x1 + x2) / 2} y={y - 6} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={INK} className="mono">LD-{z} · zone {z}</text>
          </g>
        );
      })}
      {A && <text x="300" y="250" fontSize="10.5" fill={CABLE} fontStyle="italic">leads: route TBC on site (note 5)</text>}
      {/* note balloons */}
      {([[1, 160, 170], [2, A ? 622 : 392, 188], [3, 622, A ? 101 : 170], [4, 400, 67], ...(A ? [[5, 288, 246]] : [])] as [number, number, number][]).map(([n, x, y]) => (
        <g key={n}>
          <circle cx={x} cy={y} r="9" fill={lit(n) ? PIPE : 'var(--surface)'} stroke={lit(n) ? PIPE : INK} strokeWidth="1.2" />
          <text x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill={lit(n) ? 'var(--accent-ink)' : INK}>{n}</text>
        </g>
      ))}
      {/* legend */}
      <g fontSize="10" fill={MUTED}>
        <line x1="24" y1="262" x2="52" y2="262" stroke={CABLE} strokeWidth="2.5" strokeDasharray="7 4" /><text x="58" y="265">leak sensing cable</text>
        <line x1="24" y1="280" x2="52" y2="280" stroke={PIPE} strokeWidth="2" /><text x="58" y="283">secondary pipe</text>
        <path d="M30 293 L44 301 L44 293 L30 301 Z" fill="none" stroke={PIPE} strokeWidth="1.2" /><text x="58" y="300">isolation valve</text>
      </g>
      {/* title block */}
      <g fontSize="9" fill={FAINT}>
        <rect x="430" y="244" width="320" height="76" fill="var(--surface)" stroke={MUTED} strokeWidth="1" />
        <line x1="430" y1="270" x2="750" y2="270" stroke={MUTED} strokeWidth="0.75" />
        <line x1="430" y1="295" x2="750" y2="295" stroke={MUTED} strokeWidth="0.75" />
        <line x1="560" y1="270" x2="560" y2="320" stroke={MUTED} strokeWidth="0.75" />
        <line x1="620" y1="270" x2="620" y2="320" stroke={MUTED} strokeWidth="0.75" />
        <line x1="690" y1="270" x2="690" y2="320" stroke={MUTED} strokeWidth="0.75" />
        <text x="438" y="255">TITLE</text>
        <text x="438" y="266" fontSize="11" fontWeight="600" fill={INK}>Hall H1 row 3: liquid-cooled GPU row</text>
        <text x="438" y="280">DRAWING NO.</text><text x="438" y="291" fontSize="11" fill={INK} className="mono">RD-H1-R3</text>
        <text x="566" y="280">REV</text><text x="566" y="291" fontSize="11" fontWeight="700" fill={INK}>{rev}</text>
        <text x="626" y="280">DATE</text><text x="626" y="291" fontSize="10.5" fill={INK} className="mono">{A ? '2026-09-12' : '2026-10-21'}</text>
        <text x="696" y="280">BY</text><text x="696" y="291" fontSize="10.5" fill={INK}>J. Chen</text>
        <text x="438" y="306">STATUS</text><text x="438" y="316" fontSize="10.5" fontWeight="700" fill={A ? MUTED : 'var(--ok)'}>{A ? 'ISSUED FOR CONSTRUCTION' : 'AS-BUILT'}</text>
        <text x="566" y="306">SHEET</text><text x="566" y="316" fontSize="10.5" fill={INK}>1 of 1</text>
        <text x="626" y="306">SCALE</text><text x="626" y="316" fontSize="10.5" fill={INK}>NTS</text>
        <text x="696" y="306">SYNTHETIC</text><text x="696" y="316" fontSize="9" fill={INK}>demo</text>
      </g>
    </svg>
  );
}

export const LOCS = ['L-A', 'L-B', 'L-C'] as const;
export type Loc = (typeof LOCS)[number];
const ZONE: Record<Loc, { x: number; y: number; w: number; h: number; route: string; len: string; lx: number; ly: number }> = {
  'L-A': { x: 66, y: 202, w: 48, h: 40, route: 'M90 242 V264', len: '2.4 m', lx: 98, ly: 258 },
  'L-B': { x: 540, y: 202, w: 48, h: 40, route: 'M564 242 V252 H90 V264', len: '9.5 m', lx: 330, ly: 248 },
  'L-C': { x: 646, y: 236, w: 76, h: 50, route: 'M646 261 H620 V300 H90 V264', len: '28 m', lx: 330, ly: 296 },
};

/** Hall H1 floor plan with the three candidate CDU locations. Interactive when `onSelect` is given. */
export function FloorPlan({ selected, onSelect, hi, recommended }: { selected?: string | null; onSelect?: (l: Loc) => void; hi?: string | null; recommended?: Loc }) {
  const [hover, setHover] = useState<Loc | null>(null);
  const active = (hover ?? selected ?? hi ?? null) as Loc | null;
  const rack = (x: number, y: number, liquid?: boolean, key?: string) => (
    <rect key={key} x={x} y={y} width="46" height="34" rx="3" fill={liquid ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={liquid ? PIPE : 'var(--border-strong)'} strokeWidth={liquid ? 1.5 : 1} />
  );
  return (
    <svg viewBox="0 0 760 340" className="w-full min-w-[600px] block select-none" role="img" aria-label="Hall H1 floor plan with candidate CDU locations L-A, L-B and L-C">
      <rect x="16" y="16" width="584" height="308" fill="var(--surface)" stroke={MUTED} strokeWidth="1.5" />
      <line x1="600" y1="16" x2="600" y2="324" stroke={INK} strokeWidth="5" />
      <rect x="606" y="196" width="146" height="128" fill="var(--surface-2)" stroke={MUTED} strokeWidth="1" />
      <text x="614" y="214" fontSize="10.5" fill={MUTED}>corridor plant room</text>
      <text x="606" y="190" fontSize="10.5" fill={MUTED}>wall</text>
      {/* CRAHs */}
      {[['CRAH-1', 40], ['CRAH-2', 110], ['CRAH-3', 420], ['CRAH-4', 490]].map(([n, x]) => (
        <g key={n}><rect x={x} y="26" width="62" height="24" rx="3" fill="var(--surface-2)" stroke={MUTED} /><text x={Number(x) + 31} y="42" textAnchor="middle" fontSize="10.5" fill={INK} className="mono">{n}</text></g>
      ))}
      {/* rows */}
      <g fontSize="11" fill={MUTED}>
        <text x="24" y="94" fontWeight="600" fill={INK}>R1</text>
        {Array.from({ length: 8 }, (_, i) => rack(66 + i * 52, 72, false, `r1-${i}`))}
        <text x="490" y="94">air · inference</text>
        <text x="275" y="128" textAnchor="middle" fill={FAINT}>hot aisle 1.2 m</text>
        <text x="24" y="158" fontWeight="600" fill={INK}>R2</text>
        {Array.from({ length: 8 }, (_, i) => rack(66 + i * 52, 136, false, `r2-${i}`))}
        <text x="490" y="158">air · batch</text>
        <text x="275" y="192" textAnchor="middle" fill={FAINT}>cold aisle 1.5 m</text>
        <text x="24" y="226" fontWeight="600" fill={INK}>R3</text>
        {rack(122, 205, true, 'r3-1')}{rack(174, 205, true, 'r3-2')}
        <text x="145" y="226" textAnchor="middle" fontSize="10" fill={INK} className="mono">R3-01</text>
        <text x="197" y="226" textAnchor="middle" fontSize="10" fill={INK} className="mono">R3-02</text>
        {Array.from({ length: 6 }, (_, i) => <rect key={i} x={228 + i * 52} y="205" width="46" height="34" rx="3" fill="none" stroke="var(--border)" strokeDasharray="2 3" />)}
        <text x="340" y="198" textAnchor="middle" fontSize="10" fill={FAINT}>liquid · GPU training</text>
      </g>
      {/* CHW mains */}
      <line x1="20" y1="268" x2="596" y2="268" stroke={PIPE} strokeWidth="2" strokeDasharray="10 5" opacity="0.7" />
      <text x="24" y="284" fontSize="10.5" fill={MUTED}>CHW-LOOP mains under floor</text>
      <circle cx="90" cy="268" r="4" fill={PIPE} />
      {/* wall penetration */}
      <g stroke="var(--critical)" strokeWidth="2"><line x1="594" y1="294" x2="606" y2="306" /><line x1="606" y1="294" x2="594" y2="306" /></g>
      <text x="590" y="318" textAnchor="end" fontSize="10" fill="var(--critical)">penetration not approved</text>
      {/* route of the active candidate */}
      {active && (
        <g key={active} className="pop-in">
          <path d={ZONE[active].route} fill="none" stroke={PIPE} strokeWidth="3" strokeLinejoin="round" />
          <rect x={ZONE[active].lx - 4} y={ZONE[active].ly - 11} width="44" height="15" rx="3" fill="var(--surface)" />
          <text x={ZONE[active].lx} y={ZONE[active].ly} fontSize="11" fontWeight="700" fill={PIPE}>{ZONE[active].len}</text>
        </g>
      )}
      {/* candidate zones */}
      {LOCS.map((l) => {
        const z = ZONE[l]; const on = selected === l || hi === l; const click = !!onSelect;
        return (
          <g key={l} role={click ? 'button' : undefined} tabIndex={click ? 0 : undefined} aria-label={click ? `Choose ${l}` : undefined} aria-pressed={click ? selected === l : undefined}
            style={{ cursor: click ? 'pointer' : undefined }}
            onClick={() => onSelect?.(l)} onKeyDown={(e) => { if (click && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect?.(l); } }}
            onMouseEnter={() => click && setHover(l)} onMouseLeave={() => setHover(null)}>
            <rect x={z.x - 6} y={z.y - 6} width={z.w + 12} height={z.h + 12} fill="transparent" />
            <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="4" fill={on || hover === l ? 'var(--accent-soft)' : 'transparent'} stroke={on ? PIPE : INK} strokeWidth={on ? 2.5 : 1.2} strokeDasharray={on ? undefined : '4 3'} />
            <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={on ? PIPE : INK}>{l}</text>
            {recommended === l && <text x={z.x + z.w / 2} y={z.y - 10} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={PIPE}>recommended</text>}
          </g>
        );
      })}
      <text x="24" y="314" fontSize="10" fill={FAINT}>Hall H1 · raised floor · slab 12 kPa / 7 kN point · rev C · not to scale</text>
    </svg>
  );
}
