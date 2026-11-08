import { useState, type ReactNode } from 'react';
import {
  Ban, BookOpen, Check, ChevronRight, CircleCheck, CircleDashed, CircleHelp, ClipboardList, Cpu, Droplets, EqualNot, Gauge, HardDrive,
  LoaderCircle, Map as MapIcon, Power, RotateCcw, Server, Sheet, Thermometer, UserCheck, Waves, X, type LucideIcon,
} from 'lucide-react';
import { cx } from '../../components/ui';
import { Stage } from './motion';
import { at } from './anim';

/* Instrument-panel palette (the app draws equipment on the always-dark panel; see .panel in index.css). */
const P = {
  bg: 'var(--panel)', s2: 'var(--panel-2)', s3: 'var(--panel-3)', line: 'var(--panel-border)',
  text: 'var(--panel-text)', muted: 'var(--panel-muted)', ok: 'var(--panel-ok)', liquid: 'var(--panel-liquid)',
  liquidRet: 'color-mix(in srgb, var(--panel-liquid) 45%, var(--panel-2))', bad: '#FF8A80',
};
/* Coolant on paper/ink surfaces: the panel teal pulled toward the text colour so it holds contrast in both themes. */
const LIQ = 'color-mix(in srgb, var(--panel-liquid) 62%, var(--text))';

/* ───────────────────────── 1 · Hero: CDU, two racks, a leak sensor mapped to the wrong rack ───────────────────────── */

function Rack({ x }: { x: number }) {
  return (
    <g>
      <rect x={x} y={90} width={140} height={180} rx={6} fill={P.s2} stroke={P.line} />
      {Array.from({ length: 10 }, (_, i) => (
        <g key={i}>
          <rect x={x + 14} y={104 + i * 15} width={112} height={10} rx={2} fill={P.s3} />
          <circle cx={x + 118} cy={109 + i * 15} r={1.8} fill={P.ok} opacity={0.85} />
        </g>
      ))}
      <rect x={x + 14} y={256} width={112} height={5} rx={2} fill={P.line} />
    </g>
  );
}

function Label({ x, y, children, align = 'center' }: { x: number; y: number; children: ReactNode; align?: 'center' | 'right' }) {
  const style = align === 'center'
    ? { left: `${(x / 600) * 100}%`, top: `${(y / 320) * 100}%`, transform: 'translate(-50%, -50%)' }
    : { right: `${100 - (x / 600) * 100}%`, top: `${(y / 320) * 100}%`, transform: 'translateY(-50%)' };
  return <span className="absolute mono text-[12px] leading-none whitespace-nowrap pointer-events-none" style={{ ...style, color: P.text }}>{children}</span>;
}

const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function HeroRow() {
  const [run, setRun] = useState(0);
  return (
    <figure className="panel rounded-2xl overflow-hidden m-0">
      <div className="flex items-center gap-2 pl-4 pr-1 h-12 border-b" style={{ borderColor: P.line }}>
        <span className="mono text-[12px] uppercase tracking-[.08em]" style={{ color: P.text }}>Example scenario</span>
        <span className="mono text-[12px] hidden sm:inline" style={{ color: P.muted }}>· Hall H1 · Row 3</span>
        <button type="button" onClick={() => setRun((r) => r + 1)} className="ml-auto h-12 w-12 grid place-items-center rounded-xl t hover:bg-white/5" style={{ color: P.muted }} aria-label="Replay the example">
          <RotateCcw size={15} aria-hidden />
        </button>
      </div>
      <Stage key={run} eager>
        <div className="relative">
          <svg viewBox="0 0 600 320" className="block w-full h-auto" role="img"
            aria-label="Example: CDU-1 feeds racks R3-01 (Rack A) and R3-02 (Rack B) through a supply and return loop. Leak sensor LD-2 sits under Rack A, but the BMS maps it to Rack B. The mapping is then corrected to Rack A.">
            <path d="M12 270 H588" stroke={P.line} strokeWidth={1.5} />
            {/* return loop first, so the supply risers can cross over it */}
            <path className="lp-draw" pathLength={1} style={at(300, 800)} d="M118 70 V56 H525 V90" stroke={P.liquidRet} strokeWidth={3} {...line} />
            <path className="lp-draw" pathLength={1} style={at(800, 300)} d="M315 56 V90" stroke={P.liquidRet} strokeWidth={3} {...line} />
            <path d="M235 46 V66 M445 46 V66" stroke={P.bg} strokeWidth={9} />
            <path className="lp-draw" pathLength={1} style={at(200, 800)} d="M66 70 V40 H445 V90" stroke={P.liquid} strokeWidth={3} {...line} />
            <path className="lp-draw" pathLength={1} style={at(700, 300)} d="M235 40 V90" stroke={P.liquid} strokeWidth={3} {...line} />

            {/* CDU-1: heat exchanger, pump, vents */}
            <rect x={24} y={70} width={124} height={200} rx={8} fill={P.s2} stroke={P.line} />
            <rect x={44} y={100} width={84} height={56} rx={5} fill={P.bg} stroke={P.line} />
            <path d="M52 128 l8 -14 l8 28 l8 -28 l8 28 l8 -28 l8 28 l8 -28 l8 14" stroke={P.liquid} strokeWidth={1.6} {...line} />
            <circle cx={86} cy={198} r={18} fill={P.bg} stroke={P.line} />
            <path d="M86 198 L86 186 M86 198 L96.4 204 M86 198 L75.6 204" stroke={P.muted} strokeWidth={2} strokeLinecap="round" /><circle cx={86} cy={198} r={3} fill={P.muted} />
            {[0, 1, 2, 3].map((i) => <rect key={i} x={44} y={232 + i * 8} width={84} height={3} rx={1.5} fill={P.s3} />)}

            <Rack x={205} />
            <Rack x={415} />

            {/* rack highlights: B flags red while the wrong mapping is live, A settles green */}
            <rect className="lp-blip" style={at(1950, 1250)} x={410} y={85} width={150} height={190} rx={10} fill={P.bad} fillOpacity={0.08} stroke={P.bad} strokeWidth={2} />
            <g className="lp-fade" style={at(3550)}>
              <rect x={200} y={85} width={150} height={190} rx={10} fill={P.ok} fillOpacity={0.07} stroke={P.ok} strokeWidth={2} />
            </g>

            {/* wrong mapping: LD-2 → R3-02, then dimmed */}
            <g className="lp-dim-hard" style={at(3000)}>
              <path className="lp-draw" pathLength={1} style={at(1400, 600)} d="M275 305 V306 Q275 314 283 314 H477 Q485 314 485 306 V277" stroke={P.bad} strokeWidth={2} {...line} />
              <path className="lp-fade" style={at(1950)} d="M478.5 284 L485 277 L491.5 284" stroke={P.bad} strokeWidth={2} {...line} />
            </g>
            {/* corrected mapping: LD-2 → R3-01 */}
            <path className="lp-fade" style={at(3300)} d="M268.5 284 L275 277 L281.5 284" stroke={P.ok} strokeWidth={2.4} {...line} />

            {/* leak sensor LD-2, physically under Rack A */}
            <g className="lp-pop" style={at(1100)}>
              <circle cx={275} cy={296} r={12} fill="none" stroke={P.text} strokeOpacity={0.25} />
              <path d="M275 288 L283 296 L275 304 L267 296 Z" fill={P.bg} stroke={P.text} strokeWidth={1.6} />
              <circle cx={275} cy={296} r={2.2} fill={P.liquid} />
            </g>
          </svg>
          <Label x={86} y={18}>CDU-1</Label>
          <Label x={275} y={18}>R3-01 <span style={{ color: P.muted }}>· Rack A</span></Label>
          <Label x={485} y={18}>R3-02 <span style={{ color: P.muted }}>· Rack B</span></Label>
          <Label x={257} y={296} align="right">LD-2</Label>
        </div>

        <div className="border-t px-4 py-3 grid gap-2" style={{ borderColor: P.line }}>
          <div className="mono text-[12px]" style={{ color: P.muted }}>As-built drawing: LD-2 at R3-01 · BMS point <span style={{ color: P.text }}>leak_zone_2</span></div>
          <div className="lp-fade flex flex-wrap items-center gap-x-3 gap-y-1" style={at(1950)}>
            <span className="lp-dim-soft relative mono text-[13px]" style={{ ...at(3000), color: P.text }}>
              location: R3-02<span className="lp-strike absolute left-0 right-0 top-1/2 h-[1.5px]" style={{ ...at(3000), background: P.text }} />
            </span>
            <span className="lp-dim-soft inline-flex items-center gap-1 h-6 px-2 rounded-md text-[12px] font-semibold" style={{ ...at(3000), color: P.bad, background: 'rgb(255 138 128 / .12)' }}><X size={12} aria-hidden /> Behavior test fails</span>
          </div>
          <div className="lp-fade flex flex-wrap items-center gap-x-3 gap-y-1" style={at(3600)}>
            <span className="mono text-[13px]" style={{ color: P.text }}>location: R3-01</span>
            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[12px] font-semibold" style={{ color: P.ok, background: 'color-mix(in srgb, var(--panel-ok) 14%, transparent)' }}><Check size={12} aria-hidden /> Retest passes</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[12px]" style={{ color: P.muted }}>
            <Swatch c={P.liquid}>Supply</Swatch><Swatch c={P.liquidRet}>Return</Swatch><Swatch c={P.bad}>Mapping as found</Swatch><Swatch c={P.ok}>Corrected</Swatch>
          </div>
        </div>
      </Stage>
    </figure>
  );
}

function Swatch({ c, children }: { c: string; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 h-[3px] rounded-full" style={{ background: c }} aria-hidden />{children}</span>;
}

/* ───────────────────────── 2 · Set the scene: four records, two that disagree ───────────────────────── */

function DocCard({ icon: I, title, file, claim, conflict, t, children }: { icon: LucideIcon; title: string; file: string; claim: string; conflict?: boolean; t: number; children: ReactNode }) {
  return (
    <div className="lp-rise card px-2.5 py-3 sm:px-3 flex flex-col min-w-0" style={at(t)}>
      <div className="h-10 flex items-start gap-1.5 min-w-0">
        <I size={14} className="text-muted mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight truncate">{title}</div>
          <div className="mono text-[12px] text-faint leading-tight mt-0.5 truncate">{file}</div>
        </div>
      </div>
      <div className="h-24 rounded-md bg-bg border hairline overflow-hidden relative">{children}</div>
      <div className={cx('mt-2.5 text-[12px] leading-snug', conflict ? 'text-critical font-medium' : 'text-muted')}>{claim}</div>
    </div>
  );
}

const svgFill = 'absolute inset-0 w-full h-full';

export function DocConflict() {
  return (
    <Stage className="grid gap-4 sm:grid-cols-2">
      <div className="grid grid-cols-2 gap-4">
        <DocCard icon={Waves} title="Cooling schematic" file="H1-row3-cooling.pdf" claim="CDU-1 loop feeds R3-01 and R3-02" t={0}>
          <svg viewBox="0 0 160 96" className={svgFill} preserveAspectRatio="xMidYMid meet" aria-hidden>
            <rect x={10} y={30} width={34} height={36} rx={4} fill="var(--surface-2)" stroke="var(--border-strong)" />
            <rect x={114} y={14} width={34} height={26} rx={3} fill="var(--surface-2)" stroke="var(--border-strong)" />
            <rect x={114} y={56} width={34} height={26} rx={3} fill="var(--surface-2)" stroke="var(--border-strong)" />
            <path d="M44 42 H86 V27 H114 M86 42 V69 H114" stroke={LIQ} strokeWidth={2} {...line} />
            <path d="M44 56 H96 V33 H114 M96 56 V75 H114" stroke={LIQ} strokeOpacity={0.45} strokeWidth={2} {...line} />
          </svg>
        </DocCard>
        <DocCard icon={BookOpen} title="Vendor manual" file="cdu-1-manual.pdf" claim="Leak input: rope sensor, NC contact" t={80}>
          <svg viewBox="0 0 160 96" className={svgFill} preserveAspectRatio="xMidYMid meet" aria-hidden>
            {[16, 26, 36, 46, 56].map((y, i) => <rect key={y} x={14} y={y} width={i === 0 ? 50 : i % 2 ? 76 : 64} height={4} rx={2} fill="var(--border-strong)" opacity={i === 0 ? 1 : 0.6} />)}
            <rect x={14} y={70} width={60} height={4} rx={2} fill="var(--border-strong)" opacity={0.6} />
            <rect x={104} y={18} width={44} height={60} rx={4} fill="var(--surface-2)" stroke="var(--border)" />
            <path d="M126 36 L136 46 L126 56 L116 46 Z" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} />
            <path d="M112 66 H140" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="3 3" />
          </svg>
        </DocCard>
      </div>
      <div className="relative grid grid-cols-2 gap-4">
        <DocCard icon={MapIcon} title="Floor plan" file="H1-as-built.dwg" claim="LD-2 under Rack A · R3-01" conflict t={160}>
          <svg viewBox="0 0 160 96" className={svgFill} preserveAspectRatio="xMidYMid meet" overflow="visible" aria-hidden>
            {Array.from({ length: 31 }, (_, i) => (i - 10) * 16).map((x) => <path key={x} d={`M${x} -40 V136`} stroke="var(--border)" strokeWidth={0.75} />)}
            {[-16, 0, 16, 32, 64, 80, 96, 112].map((y) => <path key={y} d={`M-200 ${y} H360`} stroke="var(--border)" strokeWidth={0.75} />)}
            {[0, 1, 2, 3].map((i) => <rect key={i} x={14 + i * 32} y={14} width={26} height={24} rx={2} fill="var(--surface-2)" stroke={i === 0 ? 'var(--critical)' : 'var(--border-strong)'} strokeWidth={i === 0 ? 1.6 : 1} />)}
            {[0, 1, 2, 3].map((i) => <rect key={i} x={14 + i * 32} y={58} width={26} height={24} rx={2} fill="var(--surface-2)" stroke="var(--border)" opacity={0.7} />)}
            <path className="lp-draw" pathLength={1} style={at(700, 450)} d="M33 48 H400" stroke="var(--critical)" strokeWidth={1.5} />
            <path d="M27 42 L33 48 L27 54 L21 48 Z" fill="var(--surface)" stroke="var(--critical)" strokeWidth={1.6} />
          </svg>
        </DocCard>
        <DocCard icon={Sheet} title="BMS points" file="bms_points.xlsx" claim="LD-2 → Rack B · R3-02" conflict t={240}>
          <div className="absolute inset-0 flex flex-col justify-center gap-0.5 px-1.5 mono text-[12px]">
            {[['LD-1', 'R3-03', false], ['LD-2', 'R3-02', true], ['LD-3', 'R3-04', false]].map(([p, r, hit]) => (
              <div key={p as string} className={cx('h-6 flex items-center justify-between gap-2 px-2 rounded-sm', hit ? 'bg-critical/10 text-critical font-semibold' : 'text-muted')}>
                <span>{p}</span><span>{r}</span>
              </div>
            ))}
          </div>
        </DocCard>
        {/* conflict connector, centred on the gap and on both highlighted lines */}
        <div className="lp-grow absolute left-1/2 top-[101px] -translate-x-1/2 -translate-y-1/2 w-[76px] flex items-center z-10 pointer-events-none" style={at(900)} aria-hidden>
          <span className="h-2 w-2 rounded-full bg-critical shrink-0" />
          <span className="flex-1 h-[2px] bg-critical" />
          <span className="h-7 w-7 rounded-full grid place-items-center bg-surface border-2 border-critical text-critical shrink-0"><EqualNot size={13} strokeWidth={2.5} /></span>
          <span className="flex-1 h-[2px] bg-critical" />
          <span className="h-2 w-2 rounded-full bg-critical shrink-0" />
        </div>
      </div>
      <p className="lp-fade sm:col-span-2 flex items-start gap-2 text-[14px] text-text" style={at(1100)}>
        <EqualNot size={16} className="text-critical mt-0.5 shrink-0" aria-hidden />
        <span><span className="font-semibold">Conflict, example scenario.</span> <span className="text-muted">The as-built floor plan places LD-2 under Rack A (R3-01). The BMS point list assigns it to Rack B (R3-02).</span></span>
      </p>
    </Stage>
  );
}

/* ───────────────────────── 3 · Artifact strip: one sensor, six retained records ───────────────────────── */

function Chip({ tone, icon: I, children }: { tone: 'ok' | 'critical' | 'accent'; icon: LucideIcon; children: ReactNode }) {
  const c = { ok: 'text-ok bg-ok/12 border-ok/30', critical: 'text-critical bg-critical/10 border-critical/30', accent: 'text-accent bg-accent/10 border-accent/30' }[tone];
  return <span className={cx('inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-[12px] font-semibold whitespace-nowrap', c)}><I size={13} strokeWidth={2.4} aria-hidden />{children}</span>;
}

export function ArtifactStrip() {
  const items: { label: string; note: string; body: ReactNode }[] = [
    {
      label: 'Source drawing', note: 'LD-2 at R3-01',
      body: (
        <svg viewBox="0 0 150 72" className={svgFill} preserveAspectRatio="xMidYMid meet" aria-hidden>
          <rect x={30} y={12} width={38} height={34} rx={3} fill="var(--surface-2)" stroke="var(--ok)" strokeWidth={1.6} />
          <rect x={80} y={12} width={38} height={34} rx={3} fill="var(--surface-2)" stroke="var(--border-strong)" />
          <path d="M49 52 L55 58 L49 64 L43 58 Z" fill="var(--surface)" stroke="var(--text)" strokeWidth={1.5} />
          <path d="M14 46 H136" stroke="var(--border-strong)" />
        </svg>
      ),
    },
    {
      label: 'Original mapping', note: 'as found in the BMS',
      body: (
        <pre className="absolute inset-0 m-0 px-2.5 py-2 mono text-[12px] leading-[1.45] text-muted overflow-hidden"><span className="text-text">leak_zone_2:</span>{'\n'}  sensor: LD-2{'\n'}  <span className="text-critical font-semibold">location: R3-02</span></pre>
      ),
    },
    { label: 'Failed test', note: 'alarm names R3-02', body: <div className="absolute inset-0 grid place-items-center lp-pop" style={at(500)}><Chip tone="critical" icon={X}>FAIL</Chip></div> },
    { label: 'Engineer decision', note: 'use the drawing', body: <div className="absolute inset-0 grid place-items-center lp-pop" style={at(700)}><Chip tone="accent" icon={UserCheck}>Approved</Chip></div> },
    {
      label: 'Configuration diff', note: 'one line, sourced',
      body: (
        <div className="absolute inset-0 flex flex-col justify-center gap-1 px-1.5 mono text-[12px]">
          <div className="lp-grow origin-left rounded-sm px-1.5 h-6 flex items-center bg-critical/10 text-critical whitespace-nowrap overflow-hidden" style={at(850)}>− location: R3-02</div>
          <div className="lp-grow origin-left rounded-sm px-1.5 h-6 flex items-center bg-ok/12 text-ok whitespace-nowrap overflow-hidden" style={at(1000)}>+ location: R3-01</div>
        </div>
      ),
    },
    { label: 'Passing retest', note: 'alarm names R3-01', body: <div className="absolute inset-0 grid place-items-center lp-pop" style={at(1200)}><Chip tone="ok" icon={Check}>PASS</Chip></div> },
  ];
  return (
    <Stage>
      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {items.map((it, i) => (
          <li key={it.label} className="lp-rise relative card p-3 min-w-0" style={at(i * 90)}>
            <div className="flex items-baseline gap-1.5 text-[12px] mb-2"><span className="mono text-faint">{i + 1}</span><span className="font-semibold text-text truncate">{it.label}</span></div>
            <div className="relative h-[76px] rounded-md bg-bg border hairline overflow-hidden">{it.body}</div>
            <div className="mono text-[12px] text-muted mt-2 leading-snug">{it.note}</div>
            {i < items.length - 1 && <ChevronRight size={14} className="hidden lg:block absolute top-1/2 -right-[13px] -translate-y-1/2 text-faint" aria-hidden />}
          </li>
        ))}
      </ol>
    </Stage>
  );
}

/* ───────────────────────── 4 · GPU reliability: healthy status, mismatched output ───────────────────────── */

const EXPECTED = '7c1e09ab 4f2da94f';
const OBSERVED = '7c1e09ab 4f2da95b';

function Hash({ value, against }: { value: string; against?: string }) {
  return (
    <span className="mono text-[13px] break-all">
      {value.split('').map((ch, i) => {
        const diff = against !== undefined && against[i] !== ch;
        return <span key={i} className={diff ? 'text-critical font-semibold underline decoration-2 underline-offset-2' : undefined}>{ch}</span>;
      })}
    </span>
  );
}

const testStates: { word: string; icon: LucideIcon; cls: string }[] = [
  { word: 'Not run', icon: CircleDashed, cls: 'text-faint' },
  { word: 'Running', icon: LoaderCircle, cls: 'text-accent' },
  { word: 'Passed', icon: CircleCheck, cls: 'text-ok' },
  { word: 'Mismatch', icon: EqualNot, cls: 'text-critical' },
  { word: 'Inconclusive', icon: CircleHelp, cls: 'text-watch' },
  { word: 'Blocked', icon: Ban, cls: 'text-warning' },
];

export function GpuMismatch() {
  const health: [LucideIcon, string, string, string][] = [
    [Thermometer, 'Temperature', '61 °C', 'Normal'],
    [Gauge, 'Utilization', '94 %', 'Normal'],
    [Power, 'Availability', 'Online', 'Online'],
  ];
  const evidence: [string, string, boolean][] = [
    ['Test and input version', 'matmul-fp32 v3 · inputs pinned', true],
    ['Expected vs observed', 'both outputs retained', true],
    ['GPU identity', 'GPU-07 · serial recorded', true],
    ['Software and configuration', 'driver and firmware versions', true],
    ['Recent work', 'maintenance note, two days earlier', true],
    ['Next approved test', 'controlled repeat · awaiting operator', false],
  ];
  return (
    <Stage className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 h-12 border-b hairline">
        <Cpu size={16} className="text-muted" aria-hidden />
        <span className="mono font-semibold text-[14px]">GPU-07</span>
        <span className="text-[13px] text-muted hidden sm:inline">· incident view</span>
        <span className="ml-auto inline-flex items-center h-[22px] px-2 rounded-md border hairline text-[12px] font-medium text-muted">Example scenario</span>
      </div>

      <div className="grid sm:grid-cols-[1fr_auto_1fr]">
        <section className="lp-rise p-4" aria-label="Health checks">
          <div className="kicker mb-3">Health checks</div>
          <ul className="grid gap-2">
            {health.map(([I, k, v, w]) => (
              <li key={k} className="flex items-center gap-2 text-[13px]">
                <I size={14} className="text-muted shrink-0" aria-hidden />
                <span className="text-muted">{k}</span>
                <span className="mono ml-auto">{v}</span>
                <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-ok/12 text-ok text-[12px] font-semibold"><CircleCheck size={12} aria-hidden />{w}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="relative flex sm:flex-col items-center justify-center px-4 sm:px-0" aria-hidden>
          <span className="flex-1 h-px sm:h-auto sm:w-px bg-border" />
          <span className="lp-pop h-9 w-9 my-2 sm:my-0 mx-2 sm:mx-3 rounded-full grid place-items-center border-2 border-critical bg-surface text-critical shrink-0" style={at(500)}><EqualNot size={16} strokeWidth={2.5} /></span>
          <span className="flex-1 h-px sm:h-auto sm:w-px bg-border" />
        </div>
        <section className="lp-rise p-4" style={at(150)} aria-label="Known-answer test">
          <div className="kicker mb-3">Known-answer test</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-baseline text-[13px]">
            <dt className="text-muted">Expected</dt><dd className="m-0"><Hash value={EXPECTED} /></dd>
            <dt className="text-muted">Observed</dt><dd className="m-0"><Hash value={OBSERVED} against={EXPECTED} /></dd>
            <dt className="text-muted">Method</dt><dd className="m-0 text-[13px]">Deterministic reference, bitwise match <span className="text-muted">(or a justified tolerance)</span></dd>
          </dl>
        </section>
      </div>

      <div className="lp-fade flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 border-y hairline bg-critical/[.07]" style={at(650)} role="status">
        <EqualNot size={16} className="text-critical shrink-0" aria-hidden />
        <span className="text-[14px] font-semibold text-critical">Correctness mismatch detected</span>
        <span className="text-[14px] text-muted">· Cause not yet established</span>
      </div>

      <div className="p-4">
        <div className="kicker mb-3">Evidence kept with the incident</div>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
          {evidence.map(([k, v, done], i) => (
            <li key={k} className="lp-rise flex items-start gap-2 text-[13px]" style={at(800 + i * 70)}>
              {done ? <CircleCheck size={15} className="text-ok mt-0.5 shrink-0" aria-label="Recorded" /> : <CircleDashed size={15} className="text-faint mt-0.5 shrink-0" aria-label="Not run yet" />}
              <span><span className="font-medium">{k}</span><br /><span className="text-muted mono text-[12px]">{v}</span></span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-4 py-3 border-t hairline bg-surface-2/50 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
        <span className="text-muted font-medium">Test states</span>
        {testStates.map(({ word, icon: I, cls }) => <span key={word} className="inline-flex items-center gap-1.5"><I size={14} className={cls} aria-hidden /><span className="text-text">{word}</span></span>)}
      </div>
    </Stage>
  );
}

/* ───────────────────────── 5 · Why together: GPU → server → rack → CDU / power, tied to the record ───────────────────────── */

export function ContextChain() {
  const nodes: { icon: LucideIcon; id: string; role: string; extra?: ReactNode }[] = [
    { icon: Cpu, id: 'GPU-07', role: 'Accelerator under investigation', extra: <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-critical"><EqualNot size={13} aria-hidden /> Test mismatch</span> },
    { icon: HardDrive, id: 'Server', role: 'Host in rack R3-01' },
    { icon: Server, id: 'Rack R3-01', role: 'Rack A · hall H1 row 3' },
    { icon: Droplets, id: 'CDU-1 · power', role: 'Cooling loop and supply feed' },
  ];
  const records = ['Accepted configuration v1', 'LD-2 mapping corrected', 'Driver update', 'Tray maintenance'];
  return (
    <Stage>
      <ol className="grid gap-8 md:grid-cols-4">
        {nodes.map(({ icon: I, id, role, extra }, i) => (
          <li key={id} className="lp-rise relative card p-4 min-w-0" style={at(i * 120)}>
            <div className="flex items-center gap-2 mb-1.5"><span className="h-8 w-8 rounded-lg border hairline grid place-items-center text-muted shrink-0"><I size={15} aria-hidden /></span><span className="mono font-semibold text-[14px] truncate">{id}</span></div>
            <div className="text-[13px] text-muted">{role}</div>
            {extra && <div className="mt-2">{extra}</div>}
            {i < nodes.length - 1 && (
              <span className="absolute grid place-items-center text-faint left-1/2 -bottom-8 h-8 w-8 -translate-x-1/2 md:left-auto md:translate-x-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:-right-8 rotate-90 md:rotate-0" aria-hidden>
                <ChevronRight size={16} />
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="grid md:grid-cols-4 gap-8" aria-hidden>
        {nodes.map((n, i) => <span key={n.id} className={cx('lp-fade mx-auto h-8 w-0 border-l-2 border-dashed border-border-strong', i > 0 && 'hidden md:block')} style={at(500 + i * 80)} />)}
      </div>
      <div className="lp-rise rounded-xl border-2 border-dashed border-border-strong bg-surface-2/60 p-4 flex flex-wrap items-center gap-x-4 gap-y-3" style={at(800)}>
        <span className="inline-flex items-center gap-2 font-semibold text-[14px]"><ClipboardList size={16} className="text-muted" aria-hidden /> Changes &amp; work orders</span>
        <span className="text-[12px] text-muted">tied to these assets · example</span>
        <ul className="flex flex-wrap gap-2 w-full lg:w-auto lg:ml-auto">
          {records.map((r) => <li key={r} className="inline-flex items-center h-8 px-2.5 rounded-md border hairline bg-surface text-[12px] mono text-text">{r}</li>)}
        </ul>
      </div>
    </Stage>
  );
}
