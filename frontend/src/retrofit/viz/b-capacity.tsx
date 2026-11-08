// Step 3 chart: each candidate's heat rejection and secondary flow against the site's requirement lines.
import { Check, X } from 'lucide-react';
import { cx } from '../../components/ui';
import { useGrow } from './b-grow';

export interface BarRow { name: string; value: number; ok: boolean; note: string }
interface Ref { at: number; label: string; key: string; dashed?: boolean }

function Panel({ title, unit, max, ticks, refs, rows }: { title: string; unit: string; max: number; ticks: number[]; refs: Ref[]; rows: BarRow[] }) {
  const grown = useGrow();
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <figure className="min-w-0">
      <figcaption className="mb-3">
        <div className="text-[14px] font-semibold">{title}</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">{refs.map((r) => (
          <span key={r.label} className="inline-flex items-center gap-1.5 text-[12px] text-muted">
            <span className={cx('w-4 border-t-2', r.dashed ? 'border-dashed border-muted' : 'border-text')} aria-hidden />{r.key}
          </span>))}
        </div>
      </figcaption>
      <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-x-3">
        <div />
        <div className="relative h-5">{refs.map((r) => (
          <span key={r.label} className="absolute -translate-x-1/2 mono text-[12px] text-muted" style={{ left: pct(r.at) }}>{r.label}</span>))}
        </div>
        <div className="grid gap-2">{rows.map((r) => (
          <div key={r.name} className="h-7 flex items-center gap-1 text-[13px] font-medium">
            {r.ok ? <Check size={13} className="text-ok shrink-0" aria-label="meets" /> : <X size={13} className="text-critical shrink-0" aria-label="below" />}{r.name}
          </div>))}
        </div>
        <div className="relative">
          {ticks.map((t) => <span key={t} className="absolute top-0 bottom-6 border-l hairline" style={{ left: pct(t) }} aria-hidden />)}
          <div className="relative grid gap-2">{rows.map((r, i) => (
            <div key={r.name} className="h-7 relative" title={`${r.name}: ${r.value} ${unit} · ${r.note}`}>
              <div className={cx('seg-fill absolute left-0 top-1 h-5 rounded-r-[4px] flex items-center justify-end pr-2 overflow-hidden', r.ok ? 'bg-accent' : 'bg-critical')}
                style={{ width: grown ? pct(r.value) : 0, transitionDelay: `${i * 90}ms` }}>
                <span className="mono text-[12px] font-semibold text-accent-ink whitespace-nowrap">{r.value}</span>
              </div>
            </div>))}
          </div>
          {refs.map((r) => (
            <span key={r.label} className={cx('absolute -top-1 bottom-6 border-l-2', r.dashed ? 'border-dashed border-muted' : 'border-text')} style={{ left: pct(r.at) }} aria-hidden />))}
          <div className="relative h-6 mt-1 border-t hairline">{ticks.map((t) => (
            <span key={t} className={cx('absolute top-1 mono text-[12px] text-faint', t === 0 ? '' : t === max ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: pct(t) }}>{t}</span>))}
          </div>
        </div>
      </div>
      <div className="text-[12px] text-faint text-right">{unit}</div>
    </figure>
  );
}

export function CapacityChart({ heat, flow }: { heat: BarRow[]; flow: BarRow[] }) {
  return (
    <div className="grid md:grid-cols-2 gap-x-10 gap-y-8">
      <Panel title="Heat rejection" unit="kW" max={180} ticks={[0, 60, 120, 180]} rows={heat}
        refs={[{ at: 90, label: '90', key: '90 kW load now (inventory)' }, { at: 117, label: '117', key: '117 kW with 30% growth (assumption)', dashed: true }]} />
      <Panel title="Secondary flow" unit="L/min" max={360} ticks={[0, 120, 240, 360]} rows={flow}
        refs={[{ at: 200, label: '200', key: '200 L/min minimum', dashed: true }, { at: 240, label: '240', key: '240 L/min design (requirements)' }]} />
    </div>
  );
}
