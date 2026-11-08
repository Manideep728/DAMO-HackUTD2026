import { useMemo, useState } from 'react';
import type { Series, CoverageRun, ErrorCase, ExitState } from '../data/types';
import { cx } from './ui';

const colorVar = (c?: Series['color']) => ({ accent: 'var(--accent)', legacy: 'var(--legacy)', untrusted: 'var(--untrusted)', warning: 'var(--warning)' }[c ?? 'accent']);

/** Multi-series sparkline with an optional legacy threshold line. */
export function Sparkline({ series, width = 420, height = 120, showAxis = true }: { series: Series[]; width?: number; height?: number; showAxis?: boolean }) {
  const all = series.flatMap((s) => s.points.map((p) => p.v).filter((v): v is number => v != null));
  const thr = series.map((s) => s.threshold).filter((t): t is number => t != null);
  const min = Math.min(...all, ...thr) - 0.5, max = Math.max(...all, ...thr) + 0.5;
  const tMax = Math.max(...series.map((s) => s.points.at(-1)?.t ?? 0));
  const pad = { l: showAxis ? 36 : 4, r: 8, t: 8, b: showAxis ? 18 : 4 };
  const X = (t: number) => pad.l + (t / tMax) * (width - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b);
  const path = (s: Series) => { let d = '', pen = false; for (const p of s.points) { if (p.v == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`; pen = true; } return d; };
  const days = Math.round(tMax / 1440);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label={series.map((s) => s.label).join(', ')}>
      {showAxis && [min + 0.5, (min + max) / 2, max - 0.5].map((v, i) => (
        <g key={i}><line x1={pad.l} x2={width - pad.r} y1={Y(v)} y2={Y(v)} stroke="var(--border)" /><text x={pad.l - 6} y={Y(v) + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)" className="mono">{v.toFixed(v > 10 ? 0 : 2)}</text></g>
      ))}
      {thr.map((t, i) => <g key={i}><line x1={pad.l} x2={width - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--legacy)" strokeDasharray="4 3" /><text x={width - pad.r} y={Y(t) - 3} textAnchor="end" fontSize="10" fill="var(--legacy)">legacy {t}</text></g>)}
      {series.map((s) => <path key={s.id} d={path(s)} fill="none" stroke={colorVar(s.color)} strokeWidth={1.5} strokeDasharray={s.dashed ? '3 3' : undefined} />)}
      {showAxis && <><text x={pad.l} y={height - 4} fontSize="10" fill="var(--text-muted)">day 1</text><text x={width - pad.r} y={height - 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">day {days}</text></>}
    </svg>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return <div className="flex flex-wrap gap-3 text-[12px] text-muted">{series.map((s) => <span key={s.id} className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2" style={{ borderColor: colorVar(s.color), borderStyle: s.dashed ? 'dashed' : 'solid' }} />{s.label}</span>)}</div>;
}

const stateColor: Record<ExitState, string> = { OK: 'var(--surface-2)', WARNING: 'var(--warning)', CRITICAL: 'var(--critical)', UNKNOWN: 'var(--untrusted)' };

/** Three bands (legacy, candidate, match) over the value domain, plus error-case cells. Contiguous runs drawn as single rects. */
export function CoverageStrip({ runs, errorCases, min, max, zoom, label }: { runs: CoverageRun[]; errorCases: ErrorCase[]; min: number; max: number; zoom?: [number, number]; label?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 760, bandH = 14, gap = 4, errW = 54, axisH = 16;
  const lo = zoom?.[0] ?? min, hi = zoom?.[1] ?? max;
  const plotW = W - (zoom ? 0 : errW * 3 + 12);
  const X = (v: number) => ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * plotW;
  const vis = runs.filter((r) => r.to >= lo && r.from <= hi);
  const H = bandH * 3 + gap * 2 + axisH + 14 + 26;
  const mismatches = runs.filter((r) => !r.match).reduce((n, r) => n + Math.round((r.to - r.from) / 0.1) + 1, 0);
  const ticks = useMemo(() => { const n = zoom ? 12 : 11; return Array.from({ length: n + 1 }, (_, i) => +(lo + ((hi - lo) * i) / n).toFixed(1)); }, [lo, hi, zoom]);
  const band = (y: number, pick: (r: CoverageRun) => string, name: string) => (
    <g>
      <text x={0} y={y - 3} fontSize="10" fill="var(--text-muted)">{name}</text>
      {vis.map((r, i) => <rect key={i} x={X(r.from)} y={y} width={Math.max(X(r.to + 0.1) - X(r.from), 0.6)} height={bandH} fill={pick(r)} onMouseEnter={() => setHover(`${r.from === r.to ? r.from.toFixed(1) : `${r.from.toFixed(1)}…${r.to.toFixed(1)}`} °C → legacy ${r.legacy} · new ${r.candidate} ${r.match ? '✓' : '✗ mismatch'}`)} onMouseLeave={() => setHover(null)} />)}
    </g>
  );
  const y1 = 14, y2 = y1 + bandH + gap + 12, y3 = y2 + bandH + gap + 12;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full h-auto" role="img" aria-label={label ?? 'value coverage'}>
        {band(y1, (r) => stateColor[r.legacy], 'Legacy (real plugin)')}
        {band(y2, (r) => stateColor[r.candidate], 'New rules (promtool)')}
        {band(y3, (r) => (r.match ? 'var(--ok)' : 'var(--critical)'), 'Match')}
        {!zoom && errorCases.map((e, i) => { const x = plotW + 12 + i * errW; return (
          <g key={e.name} onMouseEnter={() => setHover(`${e.name} → legacy ${e.legacy} · new ${e.candidate} ${e.match ? '✓' : '✗ mismatch'}`)} onMouseLeave={() => setHover(null)}>
            <rect x={x} y={y1} width={errW - 4} height={bandH} fill={stateColor[e.legacy]} /><rect x={x} y={y2} width={errW - 4} height={bandH} fill={stateColor[e.candidate]} /><rect x={x} y={y3} width={errW - 4} height={bandH} fill={e.match ? 'var(--ok)' : 'var(--critical)'} />
            <text x={x + (errW - 4) / 2} y={y3 + bandH + 12} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{e.name}</text>
          </g>); })}
        {ticks.map((t) => <g key={t}><line x1={X(t)} x2={X(t)} y1={y3 + bandH} y2={y3 + bandH + 4} stroke="var(--border)" /><text x={X(t)} y={y3 + bandH + 14} textAnchor="middle" fontSize="9.5" fill="var(--text-muted)" className="mono">{t}</text></g>)}
        <text x={W} y={H + 8} textAnchor="end" fontSize="10" fill="var(--text-muted)">°C{zoom ? ' · 0.1 °C steps' : ''}</text>
      </svg>
      <div className={cx('h-5 text-[12px] mono', hover ? 'text-text' : 'text-muted')} aria-live="polite">{hover ?? (mismatches ? `${mismatches} value mismatches` : 'hover a cell for the exact value')}</div>
    </div>
  );
}

/** Tiny step chart for a timing trace. */
export function StepChart({ values, threshold = 27, w = 160, h = 44, bad }: { values: number[]; threshold?: number; w?: number; h?: number; bad?: boolean }) {
  const min = Math.min(...values, threshold) - 1, max = Math.max(...values, threshold) + 1;
  const X = (i: number) => (i / (values.length - 1)) * (w - 4) + 2, Y = (v: number) => h - 4 - ((v - min) / (max - min)) * (h - 8);
  let d = ''; values.forEach((v, i) => { d += `${i ? 'L' : 'M'}${X(i)} ${Y(v)}`; if (i < values.length - 1) d += `L${X(i + 1)} ${Y(v)}`; });
  return <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" aria-hidden><line x1={2} x2={w - 2} y1={Y(threshold)} y2={Y(threshold)} stroke="var(--legacy)" strokeDasharray="3 2" /><path d={d} fill="none" stroke={bad ? 'var(--critical)' : 'var(--accent)'} strokeWidth={1.5} /></svg>;
}

/** The replay timeline: legacy page ticks (grey) and detector hits (accent dots) over 21 days. */
export function ReplayTimeline({ pageTicks, hits, days }: { pageTicks: number[]; hits: { t: number; findingId: number }[]; days: number }) {
  const W = 760, H = 28, T = days * 1440;
  const X = (t: number) => (t / T) * W;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-7" role="img" aria-label="legacy pages and detector hits over the replay">
        {Array.from({ length: days + 1 }, (_, d) => <line key={d} x1={X(d * 1440)} x2={X(d * 1440)} y1={0} y2={H} stroke="var(--border)" vectorEffect="non-scaling-stroke" />)}
        {pageTicks.map((t, i) => <line key={i} x1={X(t)} x2={X(t)} y1={4} y2={H - 4} stroke="var(--legacy)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={0.8} />)}
      </svg>
      <div className="relative h-0">{hits.map((h, i) => <span key={i} className="absolute -top-[18px] h-2 w-2 -ml-1 rounded-full bg-accent" style={{ left: `${(h.t / T) * 100}%` }} />)}</div>
      <div className="flex justify-between text-[12px] text-muted mt-1"><span>day 1</span><span>day {days}</span></div>
    </div>
  );
}
