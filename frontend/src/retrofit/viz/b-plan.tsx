// Step 4 visuals: what stays online around the CDU-1 tap, and the maintenance window timeline.
import { cx } from '../../components/ui';
import { reducedMotion, useGrow } from './b-grow';
import { T0, T1, WINDOW, hh } from './b-window';

type Tone = 'online' | 'work' | 'risk' | 'new';
const STROKE: Record<Tone, string> = { online: 'var(--ok)', work: 'var(--accent)', risk: 'var(--warning)', new: 'var(--border-strong)' };

function Node({ x, y, w, h, title, sub, tone, d = 0 }: { x: number; y: number; w: number; h: number; title: string; sub?: string; tone: Tone; d?: number }) {
  return (
    <g className="pop-in" style={{ animationDelay: `${d}ms`, transformBox: 'fill-box', transformOrigin: 'center' }}>
      <title>{`${title}${sub ? ` · ${sub}` : ''}`}</title>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="var(--surface)" stroke={STROKE[tone]} strokeWidth={tone === 'new' ? 1.5 : 2} strokeDasharray={tone === 'new' ? '5 4' : undefined} />
      <text x={x + 10} y={y + (sub ? 18 : h / 2 + 5)} fontSize={13} fontWeight={600} fill="var(--text)">{title}</text>
      {sub && <text x={x + 10} y={y + 34} fontSize={12} fill="var(--text-muted)">{sub}</text>}
    </g>
  );
}

function Pipe({ d, color, flow }: { d: string; color: string; flow?: boolean }) {
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" opacity={flow ? 0.45 : 1} strokeDasharray={flow ? undefined : '6 5'} />
      {flow && <path d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray="3 9" strokeLinecap="round">
        {!reducedMotion() && <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1s" repeatCount="indefinite" />}
      </path>}
    </g>
  );
}

export function DependencyDiagram() {
  const ok = 'var(--ok)';
  return (
    <figure className="min-w-0">
      <div className="overflow-x-auto -mx-5 px-5">
        <svg viewBox="0 0 1000 370" className="w-full min-w-[900px] max-w-[1120px]" role="img" aria-label="CHW plant feeds CHW-LOOP, which serves CRAH-1 to 4 and rows R1 and R2 (must stay online). A new tap V-FW-1 feeds CDU-1 and TCS-1 inside the isolation boundary, serving new racks R3-01 and R3-02. PNL-CDU has a single feed from SWGR-A.">
          <Pipe d="M216 112 H260" color={ok} flow />
          <Pipe d="M380 112 H405 V60 H430" color={ok} flow />
          <Pipe d="M570 60 H595 V38 H620" color={ok} flow />
          <Pipe d="M570 60 H595 V92 H620" color={ok} flow />
          <Pipe d="M405 112 V218 H430" color="var(--accent)" />
          <Pipe d="M526 218 H556 M666 218 H696" color="var(--accent)" />
          <Pipe d="M792 218 H811 V190 H830 M811 218 V246 H830" color="var(--panel-liquid)" />
          <Pipe d="M526 322 H556 M611 300 V240" color="var(--warning)" />
          <rect x={416} y={170} width={390} height={84} rx={12} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="7 5" />
          <text x={424} y={164} fontSize={12} fill="var(--text-muted)">Isolation boundary: work inside it; nothing outside it is switched off</text>
          <g className="pop-in"><rect x={16} y={24} width={200} height={176} rx={10} fill="none" stroke={ok} strokeWidth={2} />
            <text x={28} y={46} fontSize={13} fontWeight={600} fill="var(--text)">CHW plant</text>
            <text x={28} y={190} fontSize={12} fill="var(--text-muted)">pumps 2N</text></g>
          <Node x={30} y={60} w={82} h={36} title="CH-1" tone="online" d={60} />
          <Node x={120} y={60} w={82} h={36} title="CH-2" tone="online" d={90} />
          <Node x={30} y={106} w={82} h={36} title="PUMP-A" tone="online" d={120} />
          <Node x={120} y={106} w={82} h={36} title="PUMP-B" tone="online" d={150} />
          <Node x={260} y={92} w={120} h={40} title="CHW-LOOP" tone="online" d={180} />
          <Node x={430} y={36} w={140} h={48} title="CRAH-1..4" sub="on CHW-LOOP" tone="online" d={220} />
          <Node x={620} y={16} w={210} h={44} title="Row R1" sub="IT inference · customer" tone="online" d={260} />
          <Node x={620} y={70} w={210} h={44} title="Row R2" sub="IT batch · customer" tone="online" d={290} />
          <Node x={430} y={196} w={96} h={44} title="V-FW-1" sub="new tap" tone="work" d={340} />
          <Node x={556} y={196} w={110} h={44} title="CDU-1" sub="N · single unit" tone="work" d={380} />
          <Node x={696} y={196} w={96} h={44} title="TCS-1" sub="secondary" tone="work" d={420} />
          <Node x={830} y={170} w={160} h={40} title="R3-01 Rack A" tone="new" d={460} />
          <Node x={830} y={226} w={160} h={40} title="R3-02 Rack B" tone="new" d={490} />
          <Node x={430} y={300} w={96} h={44} title="SWGR-A" sub="only source" tone="risk" d={530} />
          <Node x={556} y={300} w={110} h={44} title="PNL-CDU" sub="feeds both pumps" tone="risk" d={560} />
          <g className="pop-in" style={{ animationDelay: '620ms' }}>
            <path d="M688 312 l8 -14 l8 14 z" fill="var(--warning)" /><text x={712} y={316} fontSize={12} fill="var(--text)">Single feed: losing SWGR-A stops both CDU pumps</text>
            <path d="M24 222 l8 -14 l8 14 z" fill="var(--warning)" /><text x={48} y={220} fontSize={12} fill="var(--text)">Chiller headroom with</text><text x={48} y={236} fontSize={12} fill="var(--text)">CDU-1 added: not verified</text>
          </g>
          <text x={830} y={286} fontSize={12} fill="var(--text-muted)">new · not yet in service</text>
        </svg>
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-[12px] text-muted">
        {[['border-ok border-2', 'Must stay online'], ['border-accent border-2', 'In-scope work'], ['border-warning border-2', 'Flagged risk'], ['border-border-strong border-dashed border-2', 'New, not in service']].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5"><span className={cx('h-3 w-4 rounded-[3px]', c)} />{l}</span>))}
      </figcaption>
    </figure>
  );
}

export function WindowTimeline() {
  const g = useGrow();
  const x = (m: number) => `${((m - T0) / (T1 - T0)) * 100}%`;
  const hours = [60, 120, 180, 240, 300];
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <div className="min-w-[760px] grid grid-cols-[minmax(240px,1fr)_2fr] gap-x-4">
        <div className="text-[12px] text-muted pb-2">Sat, window {hh(T0)}–{hh(T1)}</div>
        <div className="relative h-5">{hours.map((h) => <span key={h} className={cx('absolute mono text-[12px] text-faint', h === T0 ? '' : h === T1 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: x(h) }}>{hh(h)}</span>)}</div>
        {WINDOW.map((t, i) => (
          <div key={t.name} className="contents">
            <div className="py-2 border-t hairline min-w-0">
              <div className="text-[13px] font-medium">{t.hold && <span className="mono text-accent mr-1.5">{t.hold}</span>}{t.name}</div>
              <div className="text-[12px] text-muted">{t.owner} · {hh(t.s)}–{hh(t.e)}</div>
              {t.abort && <div className="text-[12px] text-warning mt-0.5">Abort: {t.abort}</div>}
            </div>
            <div className="relative border-t hairline">
              {hours.map((h) => <span key={h} className="absolute inset-y-0 border-l hairline" style={{ left: x(h) }} aria-hidden />)}
              <div className="seg-fill absolute top-3 h-5 rounded-[4px] bg-accent" title={`${t.name} · ${t.owner} · ${hh(t.s)}–${hh(t.e)}`}
                style={{ left: x(t.s), width: g ? `calc(${x(t.e)} - ${x(t.s)})` : 0, transitionDelay: `${i * 110}ms`, opacity: t.hold ? 0.55 : 1 }} />
              {t.hold && <span className="absolute top-3.5 h-4 w-4 rotate-45 bg-text ring-2 ring-[var(--surface)] -translate-x-1/2 pop-in" style={{ left: x(t.e), animationDelay: `${i * 110 + 500}ms` }} title={`Hold point ${t.hold}: ${t.abort}`} />}
            </div>
          </div>))}
        <div className="py-2 border-t hairline"><div className="text-[13px] font-medium">Rollback</div><div className="text-[12px] text-muted">Close V-FW-1, drain the branch · CRAHs unaffected</div></div>
        <div className="relative border-t hairline">
          <div className="absolute top-3 h-5 rounded-[4px] border border-border-strong" style={{ left: x(90), right: 0, background: 'repeating-linear-gradient(45deg, var(--surface-3) 0 4px, transparent 4px 9px)' }} title="Rollback available from 01:30; start by 04:30 to finish inside the window" />
          <span className="absolute top-2.5 h-6 border-l-2 border-text" style={{ left: x(270) }} title="Last rollback start: 04:30" />
        </div>
      </div>
      <div className="text-[12px] text-muted mt-2 flex items-center gap-2"><span className="h-3 w-3 rotate-45 bg-text inline-block" /> hold point: stop until it passes · line at 04:30: last rollback start</div>
    </div>
  );
}
