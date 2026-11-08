import { qp } from '../lib/qp';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ShieldCheck, FileWarning, Loader2, Check } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Card, Badge, ModeBadge, ModelBadge, Empty, cx } from '../components/ui';
import { CodeView, Trace } from '../components/code';
import type { RuleCardStatement, SourceRange } from '../data/types';

const sectionTitle: Record<RuleCardStatement['section'], string> = { checks: 'What it checks', thresholds: 'Thresholds', pages_when: 'When it actually pages', pages_who: 'Who it pages', ignores: 'What it ignores' };

export default function Read() {
  const { checkId = 'check_rack_inlet' } = useParams();
  const { state, ds } = useStore();
  const nav = useNavigate();
  const files = ds.source(checkId);
  const [hover, setHover] = useState<SourceRange[] | undefined>();
  const card = state.ruleCard;
  const steps = state.steps.read;
  const running = steps.some((s) => s.status === 'running');
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight' && state.done.read) nav(`/find/${checkId}`); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [state.done.read, nav, checkId]);
  useEffect(() => { if (qp('seek') === 'end' && !card) setTimeout(() => ds.director.jumpToEnd('read'), 0); }, [ds, card]);
  const bySection = useMemo(() => { const m = new Map<RuleCardStatement['section'], RuleCardStatement[]>(); card?.statements.forEach((s) => m.set(s.section, [...(m.get(s.section) ?? []), s])); return m; }, [card]);
  const verified = card?.statements.filter((s) => s.verification.status === 'verified').length ?? 0;
  const flagged = card?.statements.filter((s) => s.verification.status === 'flagged').length ?? 0;
  const checkable = card?.statements.filter((s) => s.verification.runs.length).length ?? 0;
  const filesWithHi = files;
  return (
    <div className="grid grid-cols-[55fr_45fr] gap-6 max-w-[1400px]">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight">Read <span className="mono text-muted font-normal text-[16px]">{checkId}</span></h1>
        <p className="text-muted mt-1 mb-4">The legacy check as it runs today: the plugin invocation and the Nagios config around it. Nobody on this team wrote it.</p>
        <div className="grid gap-3">{filesWithHi.map((f) => <CodeView key={f.file} file={f} highlights={hover} compact={f.file.endsWith('.csv') || f.file === 'hosts.cfg'} />)}</div>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-[18px] font-semibold">Rule card</h2>
          {card && <ModeBadge mode={card.mode} />}
          {card && <ModelBadge model={card.model} />}
          <div className="ml-auto flex gap-2">
            {!card && !running && <Button variant="primary" onClick={() => ds.runRead(checkId)}>Read with Nemotron</Button>}
            {card && state.done.read && <Button variant="primary" kbd="→" onClick={() => nav(`/find/${checkId}`)}>Continue to Find <ArrowRight size={14} /></Button>}
            {card && !state.done.read && <Button variant="secondary" disabled><Loader2 size={14} className="animate-spin" /> Checking…</Button>}
          </div>
        </div>
        {!card && !steps.length && <Empty title="No rule card yet" body="Nemotron Super reads the plugin and its config and writes a plain-English card. Then the real plugin is run to confirm every statement on it." />}
        {steps.length > 0 && <Card className="mb-3"><Trace steps={steps} title="Read steps" /></Card>}
        {card && (
          <div className="grid gap-3">
            <div className={cx('card p-3 flex items-center gap-2 text-[13px]', flagged ? 'border-critical/50' : verified === checkable && checkable > 0 ? 'border-ok/50' : '')}>
              {flagged ? <FileWarning size={16} className="text-critical" /> : <ShieldCheck size={16} className={verified === checkable && checkable ? 'text-ok' : 'text-muted'} />}
              <span><b>{verified}/{checkable}</b> statements verified by execution{flagged ? <span className="text-critical">, {flagged} flagged and regenerated</span> : ''}.</span>
              <span className="text-muted ml-auto text-[11.5px]">We don't trust the model's reading. We run the code to check it.</span>
            </div>
            {Array.from(bySection.entries()).map(([sec, list]) => (
              <Card key={sec} header={<span className="text-[12px] font-semibold text-muted uppercase tracking-wide">{sectionTitle[sec]}</span>}>
                <ul className="grid gap-3">{list.map((s) => <Statement key={s.id} s={s} onHover={setHover} />)}</ul>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Statement({ s, onHover }: { s: RuleCardStatement; onHover: (r?: SourceRange[]) => void }) {
  const v = s.verification;
  return (
    <li className="grid gap-1.5" onMouseEnter={() => onHover(s.source)} onMouseLeave={() => onHover(undefined)} tabIndex={0} onFocus={() => onHover(s.source)} onBlur={() => onHover(undefined)}>
      <div className="flex items-start gap-2">
        <p className={cx('text-[13.5px] leading-snug flex-1', v.status === 'flagged' && 'strike text-muted')}>{s.text}</p>
        <VerifyBadge v={v} />
      </div>
      {v.status === 'flagged' && v.corrected && <p className="text-[13.5px] leading-snug text-text">{v.corrected} <Badge tone="ok">regenerated</Badge></p>}
      <div className="flex flex-wrap gap-1.5">{s.source.map((r, i) => <Badge key={i}><span className="mono">{r.file}:{r.from}{r.to !== r.from ? `–${r.to}` : ''}</span></Badge>)}</div>
      {(v.status === 'verified' || v.status === 'flagged' || v.status === 'running') && v.runs.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] mono pl-1">
          {v.runs.map((r, i) => <li key={i} className={cx(r.ok ? 'text-muted' : 'text-critical')}>ran plugin at <b className="text-text">{r.input}</b> → {r.legacy} {r.ok ? '✓' : `✗ (card said ${r.expected})`}</li>)}
        </ul>
      )}
      {v.note && v.status !== 'flagged' && v.status !== 'config' && <div className="text-[11.5px] text-muted">{v.note}</div>}
      {v.status === 'config' && v.note && <div className="text-[11.5px] text-muted">{v.note}</div>}
      {v.status === 'flagged' && v.note && <div className="text-[12px] text-critical">{v.note}</div>}
    </li>
  );
}

function VerifyBadge({ v }: { v: RuleCardStatement['verification'] }) {
  if (v.status === 'verified') return <Badge tone="ok"><ShieldCheck size={11} /> Verified by execution</Badge>;
  if (v.status === 'flagged') return <Badge tone="critical"><FileWarning size={11} /> Flagged</Badge>;
  if (v.status === 'running') return <Badge tone="accent"><Loader2 size={11} className="animate-spin" /> Running plugin</Badge>;
  if (v.status === 'na') return <Badge>Observation</Badge>;
  if (v.status === 'config') return <Badge tone="accent"><Check size={11} /> Cross-checked</Badge>;
  return <Badge>{v.runs.length ? 'Pending' : 'Config check'}</Badge>;
}
