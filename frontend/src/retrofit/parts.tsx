import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Check, X, Minus, FileCode2, FlaskConical, Radio, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Badge, cx } from '../components/ui';
import { DIMS, probe, type Report, type Status } from './api';
import { ModernizeProjects } from '../modern/WorkspaceNav';

const DIM_LABEL: Record<string, string> = { rack: 'Rack', response: 'Response', loop: 'Loop', availability: 'Backup', freshness: 'Freshness', control: 'Control' };

/** Live backend or the recorded snapshot, probed once. */
export function useLive() {
  const [status, setStatus] = useState<Status | null | undefined>(undefined);
  useEffect(() => { let on = true; probe().then((s) => { if (on) setStatus(s); }); return () => { on = false; }; }, []);
  return status;
}

export function SourceStrip({ status }: { status: Status | null | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] mb-5">
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-warning/50 bg-warning/10 text-warning px-2.5 py-1 font-medium">
        <TriangleAlert size={14} /> Constructed demo fault, not an Equinix incident · synthetic sites and target contract
      </span>
      {status === undefined ? null : status
        ? <Badge tone="ok"><Radio size={11} /> Backend live · every result computed now</Badge>
        : <Badge tone="warning"><Radio size={11} /> Backend not reachable · replaying the recorded backend run</Badge>}
    </div>
  );
}

export function Tabs() {
  const location = useLocation();
  const tabs = [
    ['/modernize/retrofit', 'Equipment model'],
    ['/modernize/retrofit/mapping', 'Mapping correction'],
    ['/modernize/retrofit/firmware', 'Firmware change'],
    ['/modernize/retrofit/handover', 'Readiness & handover'],
  ];
  return (
    <>
      <ModernizeProjects path={location.pathname} />
      <nav aria-label="Liquid-cooling modernization steps" className="flex flex-wrap gap-2 mb-5">
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => cx('h-12 px-4 rounded-xl border text-[15px] font-medium inline-flex items-center t', isActive ? 'border-text bg-surface' : 'border-border text-muted hover:text-text hover:bg-surface')}>{label}</NavLink>
        ))}
      </nav>
    </>
  );
}

export function Artifact({ n, title, done, empty, children, testid }: { n: number; title: string; done?: boolean; empty?: string; children?: ReactNode; testid?: string }) {
  return (
    <section data-testid={testid} className={cx('card overflow-hidden flex flex-col min-w-0', !children && 'opacity-60')}>
      <header className="px-4 h-11 flex items-center gap-2.5 border-b hairline">
        <span className={cx('h-6 w-6 grid place-items-center rounded-full mono text-[12px] border shrink-0', done ? 'bg-ok/15 text-ok border-ok/40' : 'border-border-strong text-faint')}>{done ? <Check size={13} strokeWidth={3} /> : n}</span>
        <h3 className="text-[15px] font-semibold truncate">{title}</h3>
      </header>
      <div className="p-4 grow min-w-0">{children ?? <p className="text-[14px] text-muted">{empty}</p>}</div>
    </section>
  );
}

export function CodeLines({ title, text, mark, max = 340 }: { title: string; text: string; mark?: number[]; max?: number }) {
  const lines = text.replace(/\n$/, '').split('\n');
  return (
    <div className="rounded-xl border hairline overflow-hidden bg-surface">
      <div className="px-3 h-8 flex items-center gap-2 text-[12px] text-muted border-b hairline mono"><FileCode2 size={13} />{title}</div>
      <pre className="overflow-auto text-[12.5px] leading-[1.55] m-0 py-2" style={{ maxHeight: max }}>
        {lines.map((l, i) => (
          <div key={i} className={cx('px-3 flex gap-3', mark?.includes(i + 1) && 'bg-critical/12 text-critical font-semibold')} data-mark={mark?.includes(i + 1) || undefined}>
            <span className="w-6 shrink-0 text-right text-faint select-none">{i + 1}</span><span className="whitespace-pre">{l || ' '}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

export function Diff({ diff, title = 'Change' }: { diff: string; title?: string }) {
  return (
    <div className="rounded-xl border hairline overflow-hidden bg-surface" data-testid="diff">
      <div className="px-3 h-8 flex items-center gap-2 text-[12px] text-muted border-b hairline mono"><FileCode2 size={13} />{title} · computed by difflib, not written by a model</div>
      <pre className="overflow-auto text-[12.5px] leading-[1.55] m-0 py-2 max-h-[340px]">
        {diff.replace(/\n$/, '').split('\n').map((l, i) => (
          <div key={i} className={cx('px-3 whitespace-pre', l.startsWith('+') && !l.startsWith('+++') && 'bg-ok/12 text-ok', l.startsWith('-') && !l.startsWith('---') && 'bg-critical/10 text-critical', l.startsWith('@@') && 'text-faint')}>{l || ' '}</div>
        ))}
      </pre>
    </div>
  );
}

const V = ({ v }: { v: string }) => v === 'pass' ? <Check size={16} className="text-ok mx-auto" aria-label="pass" /> : v === 'fail' ? <X size={16} className="text-critical mx-auto" aria-label="fail" /> : <Minus size={14} className="text-faint mx-auto" aria-label="not tested" />;

export function ReportView({ report, highlight }: { report: Report; highlight?: (id: string) => boolean }) {
  if (!report.schema.ok) {
    return <div className="text-[14px] text-critical">Schema/type check failed: {report.schema.issues.map((i) => `${i.where}: ${i.problem}`).join('; ')}</div>;
  }
  return (
    <div className="grid gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tone="ok"><ShieldCheck size={11} /> Schema/type check passed</Badge>
        <Badge tone={report.pass ? 'ok' : 'critical'}><FlaskConical size={11} /> Behavior {report.passed}/{report.total}</Badge>
        <span className="text-faint mono text-[12px]">firmware {report.firmware.device} · expectations {report.expectations_sha}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border hairline">
        <table className="w-full text-[13.5px]">
          <thead><tr className="border-b hairline text-left"><th className="th px-3 py-2">Case</th>{DIMS.map((d) => <th key={d} className="th px-1.5 py-2 text-center">{DIM_LABEL[d]}</th>)}</tr></thead>
          <tbody>
            {report.cases.map((c) => (
              <tr key={c.id} data-testid={`case-${c.id}`} data-pass={c.pass} className={cx('border-b hairline last:border-0 align-top', !c.pass && 'bg-critical/[0.05]', highlight?.(c.id) && 'bg-ok/[0.07]')}>
                <td className="px-3 py-2 min-w-[220px]">
                  <div className="font-medium flex items-center gap-1.5">{c.kind === 'regression' && <Badge tone="accent">regression</Badge>}{c.name}</div>
                  {(!c.pass || highlight?.(c.id)) && <ul className="text-[12.5px] text-muted mt-0.5 grid gap-0.5">{c.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                </td>
                {DIMS.map((d) => <td key={d} className="px-1.5 py-2 text-center"><V v={c.result[d]} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[12.5px]">
        <span className="text-muted mr-1">Held out (pass/fail only):</span>
        {report.held_out.map((h) => <Badge key={h.id} tone={h.pass ? 'ok' : 'critical'}>{h.pass ? <Check size={11} /> : <X size={11} />} {h.name}</Badge>)}
      </div>
      {report.sanity.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[12.5px]">
          <span className="text-muted mr-1">Must be rejected:</span>
          {report.sanity.map((s) => <Badge key={s.name} tone={s.rejected ? 'ok' : 'critical'}>{s.rejected ? <Check size={11} /> : <X size={11} />} {s.name}</Badge>)}
        </div>
      )}
    </div>
  );
}

/** The drawing with the cited sentence marked. */
export function Drawing({ text, quote }: { text: string; quote?: string }) {
  const parts = quote ? text.split(quote) : [text];
  return (
    <pre className="rounded-xl border hairline bg-surface overflow-auto text-[12.5px] leading-[1.55] p-3 m-0 max-h-[340px] whitespace-pre">
      {parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 && <mark data-testid="drawing-quote" className="bg-ok/20 text-text rounded px-0.5">{quote}</mark>}</span>)}
    </pre>
  );
}
