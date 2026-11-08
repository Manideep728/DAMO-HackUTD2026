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
    <div className="max-w-[1200px]">
      <h1 className="text-[22px] font-semibold tracking-tight">Legacy checks</h1>
      <p className="text-muted mt-1 mb-5">{live.length} legacy checks · {count('retired')} retired · {count('signed_off')} signed off · {count('blocked')} blocked · {count('parallel_run') + count('verified')} in progress · {count('drop')} to drop · {count('audit')} to audit</p>
      <div className="card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="text-left text-[11.5px] text-muted border-b hairline"><tr>{['Check', 'Watches', 'Stage', 'Findings', 'Coverage', 'Traces', 'Open CEX', ''].map((h) => <th key={h} className="font-medium px-4 h-10">{h}</th>)}</tr></thead>
          <tbody>
            {live.map((c) => (
              <tr key={c.id} className={cx('border-b hairline last:border-0 hover:bg-surface-2 t', c.id === 'check_rack_inlet' && 'bg-accent/5')}>
                <td className="px-4 py-2.5"><div className="mono font-semibold">{c.name}</div><div className="text-[11.5px] text-muted">{c.plugin}</div></td>
                <td className="px-4">{c.watches}</td>
                <td className="px-4"><Stepper stage={c.stage} />{c.blockedReason && <div className="text-[11px] text-critical mt-1">Blocked: {c.blockedReason}</div>}{c.dropReason && <div className="text-[11px] text-muted mt-1">{c.dropReason}</div>}</td>
                <td className="px-4 num">{c.findings ? `${c.findings.total} · ${c.findings.accepted} accepted` : '—'}</td>
                <td className="px-4 num">{c.coverage ? `${c.coverage.done.toLocaleString()} / ${c.coverage.total.toLocaleString()}` : '—'}</td>
                <td className="px-4 num">{c.traces ? `${c.traces.done} / ${c.traces.total}` : '—'}</td>
                <td className="px-4 num">{c.openCounterexamples ? <Badge tone="critical">{c.openCounterexamples}</Badge> : c.coverage ? <Badge tone="ok">0</Badge> : '—'}</td>
                <td className="px-4 text-right">{action(c, nav)}</td>
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
