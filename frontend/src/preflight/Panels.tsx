import { useState } from 'react';
import { Check, X, FileText, CircleAlert } from 'lucide-react';
import { Badge, Button, StatusPill, cx } from '../components/ui';
import type { CutSets, Evidence, Finding, Findings, PlanEval, PlanSearch, ServiceRed, SimResult } from './api';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function ImpactPanel({ sim, red, onPick }: { sim: SimResult | null; red: ServiceRed[]; onPick: (nodes: string[]) => void }) {
  if (!sim) return <p className="text-muted text-[13px]">Simulating…</p>;
  const traced = Object.entries(sim.traces);
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Critical services lost" value={sim.lost_services.length} tone={sim.lost_services.length ? 'critical' : 'ok'} />
        <Stat label="Racks and workloads lost" value={`${sim.lost_count} · ${sim.lost_kw} kW`} tone={sim.lost_count ? 'critical' : 'ok'} />
        <Stat label="Lowest headroom" value={sim.tightest ? `${pct(sim.min_margin)} on ${sim.tightest}` : 'n/a'} tone={sim.min_margin < 0.1 ? 'warning' : 'ok'} />
        <Stat label="Degraded equipment" value={sim.degraded.length} tone={sim.degraded.length ? 'warning' : 'ok'} />
      </div>
      <section>
        <h3 className="text-[13px] font-semibold mb-2">Redundancy of critical services</h3>
        <p className="text-[12px] text-muted mb-2">Capacity asks whether there are enough suppliers. Independence asks how many failures it takes to lose them all. Click a row to show its shared dependencies.</p>
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-muted text-left"><th className="py-1 font-medium">Service</th><th className="font-medium">Capacity</th><th className="font-medium">Independent paths</th><th className="font-medium">Effective</th></tr></thead>
          <tbody>
            {red.map((s) => (
              <tr key={s.service} className="border-t hairline cursor-pointer hover:bg-surface-2" onClick={() => onPick(s.single_points)}>
                <td className="py-1.5 mono">{s.service}</td>
                <td>{s.capacity_level}</td>
                <td className="mono">{s.independence > 2 ? '3+' : s.independence}</td>
                <td><span className={cx('font-semibold', s.effective === 'N' || s.effective === 'below N' ? 'text-critical' : 'text-ok')}>{s.effective}</span>
                  {s.single_points.length > 0 && <span className="text-muted"> · shared: <span className="mono">{s.single_points.join(', ')}</span></span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {traced.length > 0 && (
        <section>
          <h3 className="text-[13px] font-semibold mb-2">Why it failed</h3>
          {traced.slice(0, 3).map(([id, steps]) => (
            <ol key={id} className="mb-3 border-l-2 border-critical/40 pl-3 grid gap-1 text-[12px]">
              {steps.map((s, i) => (
                <li key={i}><span className="mono font-semibold">{s.node}</span> <span className="text-muted">{s.kind === 'down' ? s.detail : s.kind === 'shed' ? s.detail : `${s.detail}${s.missing.length ? `, waiting on ${s.missing.join(', ')}` : ''}`}</span></li>
              ))}
            </ol>
          ))}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: 'ok' | 'warning' | 'critical' }) {
  return (
    <div className="rounded-lg border hairline px-3 py-2">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className={cx('mono text-[15px] font-semibold', tone === 'critical' ? 'text-critical' : tone === 'warning' ? 'text-warning' : 'text-text')}>{value}</div>
    </div>
  );
}

export function CutSetPanel({ cuts, maintenance, picked, onPick }: { cuts: CutSets | null; maintenance: string[]; picked: string; onPick: (nodes: string[]) => void }) {
  if (!cuts) return <p className="text-muted text-[13px]">Searching weak points…</p>;
  return (
    <div className="grid gap-3">
      <p className="text-[12.5px] text-muted">
        {cuts.total} minimal cut sets up to order {cuts.max_order}: groups of equipment whose joint failure loses a critical service
        {maintenance.length > 0 && <> while <span className="mono">{maintenance.join(', ')}</span> is in maintenance</>}. Click one to see it on the map.
      </p>
      {cuts.single_points.length > 0
        ? <div className="rounded-lg border border-critical/40 bg-critical/8 px-3 py-2 text-[12.5px]"><CircleAlert size={13} className="inline text-critical mr-1" />Single points of failure: <span className="mono font-semibold">{cuts.single_points.join(', ')}</span></div>
        : <div className="rounded-lg border border-ok/40 px-3 py-2 text-[12.5px] text-ok">No single point of failure.</div>}
      <ul className="grid gap-1">
        {cuts.cut_sets.slice(0, 40).map((c) => {
          const key = c.nodes.join('+');
          return (
            <li key={key}>
              <button type="button" onClick={() => onPick(c.nodes)} className={cx('w-full text-left rounded-lg border px-3 py-1.5 t hover:bg-surface-2 text-[12.5px]', picked === key ? 'border-critical' : 'hairline')}>
                <span className={cx('mono font-semibold mr-2', c.order === 1 && 'text-critical')}>order {c.order}</span>
                <span className="mono">{c.nodes.join(' + ')}</span>
                {c.was_order && c.was_order > c.order && <Badge tone="critical">was order {c.was_order}</Badge>}
                <span className="block text-muted text-[11.5px]">loses {c.lost_services.slice(0, 4).join(', ')}{c.lost_services.length > 4 ? ` +${c.lost_services.length - 4}` : ''} · {Math.round(c.lost_kw)} kW</span>
              </button>
            </li>
          );
        })}
      </ul>
      {cuts.notes.map((n) => <p key={n} className="text-[11.5px] text-faint">{n}</p>)}
    </div>
  );
}

export function FindingsPanel({ data, onDecide, onShow }: { data: Findings | null; onDecide: (f: Finding, d: 'confirmed' | 'rejected', actor: string, note: string) => Promise<void>; onShow: (nodes: string[]) => void }) {
  const [actor, setActor] = useState(() => { try { return localStorage.getItem('pf-actor') ?? ''; } catch { return ''; } });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!data) return <p className="text-muted text-[13px]">Reading records…</p>;
  const open = data.findings.filter((f) => f.classification !== 'confirms');
  const confirms = data.findings.filter((f) => f.classification === 'confirms' && f.status !== 'superseded');
  const decide = async (f: Finding, d: 'confirmed' | 'rejected') => {
    if (!actor.trim()) { setError('Enter your name first; every decision is logged.'); return; }
    setBusy(f.id); setError('');
    try { try { localStorage.setItem('pf-actor', actor.trim()); } catch { /* storage unavailable */ } await onDecide(f, d, actor.trim(), ''); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); }
  };
  return (
    <div className="grid gap-4">
      <label className="flex items-center gap-2 text-[12.5px]">Engineer
        <input id="pf-actor" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="your name" className="h-8 px-2 rounded-md border hairline bg-surface flex-1" />
      </label>
      {error && <p className="text-critical text-[12.5px]">{error}</p>}
      {open.map((f) => (
        <article key={f.id} className="rounded-xl border hairline p-3 grid gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={f.classification === 'contradicts' ? 'critical' : 'warning'}>{f.classification === 'contradicts' ? 'Contradicts the one-line' : 'New dependency'}</Badge>
            <Badge>{pct(f.confidence)} confidence</Badge>
            <Badge tone={f.status === 'confirmed' ? 'ok' : f.status === 'rejected' ? 'neutral' : 'accent'}>{f.status === 'open' ? 'Suspected' : f.status}</Badge>
          </div>
          <button type="button" className="text-left font-semibold text-[13.5px] hover:underline" onClick={() => onShow([f.consumer, f.supplier])}>{f.claim}</button>
          {f.impact.new_single_points && f.impact.new_single_points.length > 0 && (
            <p className="text-[12.5px] text-critical">If true: <span className="mono">{f.impact.new_single_points.join(', ')}</span> becomes a single point of failure; {f.impact.services_downgraded?.length ?? 0} critical services drop to N.</p>
          )}
          <Quotes title="Supporting" items={f.supporting} />
          {f.contradicting.length > 0 && <Quotes title="Contradicting" items={f.contradicting} />}
          {f.set_aside.length > 0 && <Quotes title="Not counted" items={f.set_aside} />}
          {f.status === 'open' && (
            <div className="flex gap-2">
              <Button variant="primary" disabled={busy === f.id} onClick={() => decide(f, 'confirmed')}><Check size={14} /> Confirm</Button>
              <Button disabled={busy === f.id} onClick={() => decide(f, 'rejected')}><X size={14} /> Reject</Button>
            </div>
          )}
        </article>
      ))}
      <details className="text-[12.5px]">
        <summary className="cursor-pointer text-muted">Rejected record claims ({data.rejected.length})</summary>
        <ul className="mt-2 grid gap-1.5">{data.rejected.map((r, i) => <li key={i}><span className="mono">{r.doc_id}</span> “{r.quote}” <span className="text-muted">· {r.reason}</span></li>)}</ul>
      </details>
      <details className="text-[12.5px]">
        <summary className="cursor-pointer text-muted">Documented edges confirmed by records ({confirms.length})</summary>
        <ul className="mt-2 grid gap-1">{confirms.map((f) => <li key={f.id} className="mono">{f.consumer} ← {f.supplier} <span className="text-muted">({f.supporting.map((s) => s.doc_id).join(', ')})</span></li>)}</ul>
      </details>
      {data.metrics
        ? <p className="text-[11.5px] text-faint">On the labelled demo corpus: precision {data.metrics.precision}, recall {data.metrics.recall}.</p>
        : <p className="text-[11.5px] text-faint">{data.records ? `${data.records} records read; no labels to score against.` : 'No maintenance records are loaded for this facility.'}</p>}
    </div>
  );
}

function Quotes({ title, items }: { title: string; items: Evidence[] }) {
  return (
    <div className="text-[12px]">
      <div className="text-muted mb-1">{title}</div>
      <ul className="grid gap-1">
        {items.map((q, i) => (
          <li key={i} className="flex gap-1.5"><FileText size={12} className="shrink-0 mt-0.5 text-faint" />
            <span><span className="mono">{q.doc_id}</span> <span className="text-faint">{q.date} · {q.kind.replace('_', ' ')}</span> “{q.quote}”{q.extractor === 'nemotron' && <span className="text-muted"> · name resolved by Nemotron</span>}{q.reason && <span className="text-muted"> · {q.reason}</span>}</span></li>
        ))}
      </ul>
    </div>
  );
}

export function PlanResults({ res, compare, onToggleCompare }: { res: PlanSearch; compare: number[]; onToggleCompare: (i: number) => void }) {
  const all = [...res.top.map((p) => ({ p, top: true })), ...res.rejected.slice(0, 8).map((p) => ({ p, top: false }))];
  return (
    <div className="grid gap-2">
      <p className="text-[12px] text-muted">{res.evaluated} windows and mitigations simulated. Tick two to compare.</p>
      {all.map(({ p, top }, i) => (
        <label key={`${p.start}-${p.mitigations.join(',')}-${i}`} className={cx('rounded-lg border px-3 py-2 text-[12.5px] grid gap-0.5 cursor-pointer', top ? (i === 0 ? 'border-ok' : 'hairline') : 'hairline opacity-80')}>
          <span className="flex items-center gap-2">
            <input type="checkbox" checked={compare.includes(i)} onChange={() => onToggleCompare(i)} />
            {top ? (i === 0 ? <StatusPill kind="ok" word="Recommended" size="sm" /> : <Badge>Alternative</Badge>) : <Badge tone="warning">Rejected</Badge>}
            <span className="mono font-semibold">hour {p.start}–{p.end}</span>
            {p.mitigations.length > 0 && <span className="text-muted">with {p.mitigations.join(', ').replaceAll('_', ' ')}</span>}
          </span>
          <span className="text-muted">cut-set order {p.min_cut_order}{p.single_points.length > 0 && <> · single points <span className="mono">{p.single_points.join(', ')}</span></>} · lowest headroom {pct(p.min_margin)}{p.tightest && <> on <span className="mono">{p.tightest}</span></>}</span>
          {p.reasons.length > 0 && <span className={top ? 'text-muted' : 'text-warning'}>{p.reasons.join('; ')}</span>}
        </label>
      ))}
    </div>
  );
}

export function planOf(res: PlanSearch, i: number): PlanEval {
  return i < res.top.length ? res.top[i] : res.rejected[i - res.top.length];
}
