import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Stepper, Badge, cx } from '../components/ui';
import type { LegacyCheck } from '../data/types';

export default function Checks() {
  const { ds, state } = useStore();
  const nav = useNavigate();
  const checks = ds.listChecks();
  const live = checks.map((c) => (c.id === 'check_rack_inlet' ? patch(c, state) : c));
  const count = (s: string) => live.filter((c) => c.stage === s).length;
  return (
    <div className="max-w-[1400px]">
      <div className="mb-6">
        <div className="eyebrow mb-2">Hall 1 · Night shift</div>
        <h1 className="page-title">Legacy checks</h1>
        <p className="text-muted mt-1.5 max-w-[640px]">Old monitoring scripts go in. Verified rules come out. Each check moves left to right until it is retired by proof.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {([['Total', live.length, 'text'], ['Retired', count('retired'), 'ok'], ['Signed off', count('signed_off'), 'accent'], ['In progress', count('parallel_run') + count('verified'), 'accent'], ['Blocked', count('blocked'), 'critical'], ['To audit / drop', count('audit') + count('drop'), 'muted']] as [string, number, string][]).map(([label, n, tone]) => (
          <div key={label} className="card px-4 py-3">
            <div className="th">{label}</div>
            <div className={cx('text-[26px] font-semibold num leading-tight mt-1', { text: 'text-text', ok: 'text-ok', accent: 'text-accent', critical: n ? 'text-critical' : 'text-faint', muted: 'text-muted' }[tone])}>{n}</div>
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left border-b hairline bg-surface-2/50"><tr>{['Check', 'Watches', 'Stage', 'Findings', 'Coverage', 'Traces', 'Open CEX', ''].map((h) => <th key={h} className="th px-3 first:pl-4 h-10 whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {live.map((c) => (
              <tr key={c.id} className={cx('border-b hairline last:border-0 hover:bg-surface-2 t', c.id === 'check_rack_inlet' && 'bg-accent/[0.06] shadow-[inset_3px_0_0_var(--accent)]')}>
                <td className="px-4 py-3"><div className="mono font-semibold">{c.name}</div><div className="text-[11.5px] text-muted">{c.plugin}</div></td>
                <td className="px-3 text-[12.5px] text-muted min-w-[130px]">{c.watches}</td>
                <td className="px-3"><Stepper stage={c.stage} />{c.blockedReason && <div className="text-[11px] text-critical mt-1">Blocked: {c.blockedReason}</div>}{c.dropReason && <div className="text-[11px] text-muted mt-1">{c.dropReason}</div>}</td>
                <td className="px-3 num">{c.findings ? `${c.findings.total} · ${c.findings.accepted} accepted` : '—'}</td>
                <td className="px-3 num">{c.coverage ? `${c.coverage.done.toLocaleString()} / ${c.coverage.total.toLocaleString()}` : '—'}</td>
                <td className="px-3 num">{c.traces ? `${c.traces.done} / ${c.traces.total}` : '—'}</td>
                <td className="px-3 num">{c.openCounterexamples ? <Badge tone="critical">{c.openCounterexamples}</Badge> : c.coverage ? <Badge tone="ok">0</Badge> : '—'}</td>
                <td className="px-3 pr-4 text-right">{action(c, nav)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted mt-4">Legacy plugins are unmodified; source, version and license are in <span className="mono">legacy/README.md</span>. Config drift (D10, D11, the rkowalski contact) is ours and declared there.</p>
    </div>
  );
}

function patch(c: LegacyCheck, s: ReturnType<typeof useStore>['state']): LegacyCheck {
  const accepted = s.findings.filter((f) => f.status === 'accepted').length;
  const stage = s.certificate?.signedOffBy ? 'signed_off' : s.done.prove ? (s.gauntlet?.counterexamples.length ? 'blocked' : 'verified') : s.findings.length ? 'parallel_run' : s.done.read ? 'parallel_run' : 'audit';
  return { ...c, stage, findings: s.findings.length ? { total: s.findings.length, accepted } : c.findings, coverage: s.gauntlet ? { done: s.gauntlet.domain.count + 3, total: s.gauntlet.domain.count + 3 } : c.coverage, traces: s.gauntlet ? { done: s.gauntlet.traces.total, total: s.gauntlet.traces.total } : c.traces, openCounterexamples: s.gauntlet?.counterexamples.length ?? 0, blockedReason: stage === 'blocked' ? `${s.gauntlet!.counterexamples.length} open counterexample` : undefined };
}

function action(c: LegacyCheck, nav: (p: string) => void) {
  if (c.id === 'check_rack_inlet') return <Button variant="primary" className="h-8 px-3 text-[12px]" onClick={() => nav('/read/check_rack_inlet')}>Open <ArrowRight size={14} /></Button>;
  if (c.stage === 'signed_off') return <Button className="h-8 px-3 text-[12px]" disabled title="Cutover runs on the monitoring host; not part of this demo">Cutover</Button>;
  if (c.stage === 'blocked') return <Link to="/prove/check_rack_inlet" className="text-[12px] text-critical underline-offset-2 hover:underline">Open counterexample</Link>;
  if (c.stage === 'drop') return <Button className="h-8 px-3 text-[12px]" disabled>Retire (no replacement)</Button>;
  return <span className="text-[12px] text-muted">{c.stage === 'parallel_run' ? 'Running…' : 'Not started'}</span>;
}
