import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Search, ShieldCheck, Check } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Stepper, Badge, PageHeader, SectionHeader, cx } from '../components/ui';
import type { LegacyCheck } from '../data/types';

export default function Checks() {
  const { ds, state } = useStore();
  const nav = useNavigate();
  const checks = ds.listChecks();
  const live = checks.map((c) => (c.id === 'check_rack_inlet' ? patch(c, state) : c));
  const count = (s: string) => live.filter((c) => c.stage === s).length;
  const summary: [string, number, string][] = [['Signed off', count('signed_off') + count('retired'), 'text-ok'], ['In progress', count('parallel_run') + count('verified'), 'text-text'], ['Blocked', count('blocked'), 'text-critical'], ['Not started', count('audit') + count('drop'), 'text-text']];
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader
        kicker={<>Hall 1 · Night shift</>}
        title="Retire legacy checks, with proof"
        subtitle="Old Nagios checks go in. Verified Prometheus rules come out. Along the way, the replay finds the real problems the old checks were hiding."
        actions={<Button variant="primary" onClick={() => nav('/read/check_rack_inlet')}>Start with check_rack_inlet <ArrowRight size={15} /></Button>}
      />

      <section className="grid md:grid-cols-3 gap-px rounded-[14px] overflow-hidden border hairline bg-border mb-12">
        {steps.map((st, i) => (
          <Link key={st.title} to={st.to} className="group bg-surface p-6 hover:bg-surface-2 t">
            <div className="flex items-center gap-3 mb-4">
              <span className="h-8 w-8 grid place-items-center rounded-lg bg-surface-2 border hairline text-muted group-hover:text-text t"><st.Icon size={16} aria-hidden /></span>
              <span className="mono text-[12px] text-faint">0{i + 1}</span>
              {state.done[st.screen] && <span className="ml-auto text-[12px] text-ok inline-flex items-center gap-1"><Check size={13} /> Done</span>}
            </div>
            <div className="font-semibold text-[15.5px] tracking-[-0.01em] mb-1.5">{st.title}</div>
            <p className="text-[13.5px] text-muted leading-relaxed">{st.body}</p>
            <div className="text-[12.5px] mt-4 text-faint">Decided by <span className="text-muted">{st.who}</span></div>
          </Link>
        ))}
      </section>

      <SectionHeader
        title="Legacy checks"
        subtitle={`${live.length} checks in Hall 1, each moving left to right until it is retired by proof.`}
        right={<dl className="hidden sm:flex gap-7">{summary.map(([label, n, cls]) => <div key={label}><dt className="text-[12px] text-muted">{label}</dt><dd className={cx('text-[20px] font-semibold num leading-tight', n ? cls : 'text-faint')}>{n}</dd></div>)}</dl>}
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left border-b hairline"><tr>{['Check', 'Watches', 'Stage', 'Findings', 'Coverage', 'Traces', 'Open CEX', ''].map((h) => <th key={h} className="th px-3 first:pl-5 h-11 whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {live.map((c) => (
              <tr key={c.id} className="border-b hairline last:border-0 hover:bg-surface-2 t">
                <td className="pl-5 pr-3 py-3.5"><div className="flex items-center gap-2"><span className="mono font-medium text-[13px]">{c.name}</span>{c.id === 'check_rack_inlet' && <Badge tone="accent">demo</Badge>}</div><div className="text-[12px] text-faint mt-0.5">{c.plugin}</div></td>
                <td className="px-3 text-[12.5px] text-muted min-w-[130px]">{c.watches}</td>
                <td className="px-3"><Stepper stage={c.stage} />{c.blockedReason && <div className="text-[11.5px] text-critical mt-1">Blocked: {c.blockedReason}</div>}{c.dropReason && <div className="text-[11.5px] text-muted mt-1">{c.dropReason}</div>}</td>
                <td className="px-3 num text-muted">{c.findings ? <><span className="text-text">{c.findings.total}</span> · {c.findings.accepted} accepted</> : '—'}</td>
                <td className="px-3 num text-muted">{c.coverage ? `${c.coverage.done.toLocaleString()} / ${c.coverage.total.toLocaleString()}` : '—'}</td>
                <td className="px-3 num text-muted">{c.traces ? `${c.traces.done} / ${c.traces.total}` : '—'}</td>
                <td className="px-3 num">{c.openCounterexamples ? <Badge tone="critical">{c.openCounterexamples}</Badge> : c.coverage ? <Badge tone="ok">0</Badge> : <span className="text-muted">—</span>}</td>
                <td className="px-3 pr-5 text-right">{action(c, nav)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12.5px] text-faint mt-4">Legacy plugins are unmodified; source, version and license are in <span className="mono">legacy/README.md</span>. Config drift (D10, D11, the rkowalski contact) is ours and declared there.</p>
    </div>
  );
}

const steps = [
  { title: 'Read the old check', body: 'Nemotron Super turns the plugin and its Nagios config into a plain-English rule card. Then the real plugin runs to confirm every threshold.', who: 'execution', to: '/read/check_rack_inlet', Icon: BookOpen, screen: 'read' as const },
  { title: 'Find what it hid', body: 'Replay 21 days of readings through the old check. Deterministic detectors surface the faulty sensor, the clogged filter and the dead mailbox.', who: 'you: accept or dismiss', to: '/find/check_rack_inlet', Icon: Search, screen: 'find' as const },
  { title: 'Prove the new rules', body: 'Generated Prometheus rules are run against every value the sensor can report and 500 timing traces, until there are zero mismatches.', who: 'you: sign the certificate', to: '/prove/check_rack_inlet', Icon: ShieldCheck, screen: 'prove' as const },
];

function patch(c: LegacyCheck, s: ReturnType<typeof useStore>['state']): LegacyCheck {
  const accepted = s.findings.filter((f) => f.status === 'accepted').length;
  const stage = s.certificate?.signedOffBy ? 'signed_off' : s.done.prove ? (s.gauntlet?.counterexamples.length ? 'blocked' : 'verified') : s.findings.length ? 'parallel_run' : s.done.read ? 'parallel_run' : 'audit';
  return { ...c, stage, findings: s.findings.length ? { total: s.findings.length, accepted } : c.findings, coverage: s.gauntlet ? { done: s.gauntlet.domain.count + 3, total: s.gauntlet.domain.count + 3 } : c.coverage, traces: s.gauntlet ? { done: s.gauntlet.traces.total, total: s.gauntlet.traces.total } : c.traces, openCounterexamples: s.gauntlet?.counterexamples.length ?? 0, blockedReason: stage === 'blocked' ? `${s.gauntlet!.counterexamples.length} open counterexample` : undefined };
}

function action(c: LegacyCheck, nav: (p: string) => void) {
  if (c.id === 'check_rack_inlet') return <Button className="h-8 px-3 text-[12.5px]" onClick={() => nav('/read/check_rack_inlet')}>Open <ArrowRight size={14} /></Button>;
  if (c.stage === 'signed_off') return <Button className="h-8 px-3 text-[12.5px]" disabled title="Cutover runs on the monitoring host; not part of this demo">Cutover</Button>;
  if (c.stage === 'blocked') return <Link to="/prove/check_rack_inlet" className="text-[12px] text-critical underline-offset-2 hover:underline">Open counterexample</Link>;
  if (c.stage === 'drop') return <Button className="h-8 px-3 text-[12.5px]" disabled>Retire (no replacement)</Button>;
  return <span className="text-[12px] text-muted">{c.stage === 'parallel_run' ? 'Running…' : 'Not started'}</span>;
}
