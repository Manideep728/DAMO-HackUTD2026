import { qp } from '../lib/qp';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, X, Undo2, ExternalLink } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Card, Badge, StatusPill, ModeBadge, ModelBadge, Empty, cx } from '../components/ui';
import { Trace } from '../components/code';
import { FloorMap } from '../components/FloorMap';
import { Sparkline, Legend, ReplayTimeline } from '../components/viz';
import type { Finding, WorkOrder } from '../data/types';
import { MockDataSource } from '../data/MockDataSource';
import { ApiDataSource } from '../data/ApiDataSource';

const reasons = ['Known', 'Not a problem', 'Already fixed', 'Other'];
const order: Record<Finding['severity'], number> = { critical: 0, warning: 1, watch: 2, info: 3 };

export default function Find() {
  const { checkId = 'check_rack_inlet' } = useParams();
  const { state, ds, user } = useStore();
  const nav = useNavigate();
  const [sel, setSel] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Finding | null>(null);
  const [dismissing, setDismissing] = useState<Finding | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; until: number } | null>(null);
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const findings = useMemo(() => state.findings.slice().sort((a, b) => order[a.severity] - order[b.severity] || a.id - b.id), [state.findings]);
  const selected = findings.find((f) => f.id === sel) ?? findings[0];
  const steps = state.steps.find;
  const running = steps.some((s) => s.status === 'running');
  const handled = findings.filter((f) => f.status !== 'open').length;
  const accepted = findings.filter((f) => f.status === 'accepted').length;
  const workOrders = findings.filter((f) => f.decision?.workOrderId).length;

  useEffect(() => { if (qp('seek') === 'end' && !state.findings.length) setTimeout(() => ds.director.jumpToEnd('find'), 0); }, [ds, state.findings.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || confirm || dismissing) return;
      if (!selected) return;
      if ((e.key === 'a' || e.key === 'A') && selected.status === 'open') setConfirm(selected);
      if ((e.key === 'd' || e.key === 'D') && selected.status === 'open') setDismissing(selected);
      if ((e.key === 'u' || e.key === 'U') && toast && Date.now() < toast.until) undo(toast.id);
      if (e.key === 'ArrowRight' && handled > 0) nav(`/prove/${checkId}`);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const i = findings.indexOf(selected); const n = findings[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) setSel(n.id); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), toast.until - Date.now()); return () => clearTimeout(id); }, [toast]);

  const accept = async (f: Finding) => { setConfirm(null); const w = await ds.acceptFinding(f.id, user); setWo(w); setToast({ id: f.id, text: `Work order #${w.number} opened: ${w.title}`, until: Date.now() + 10000 }); };
  const dismiss = async (f: Finding, reason: string) => { setDismissing(null); await ds.dismissFinding(f.id, user, reason); setToast({ id: f.id, text: `Dismissed "${f.title}" (${reason})`, until: Date.now() + 10000 }); };
  const undo = (id: number) => { if (ds instanceof MockDataSource || ds instanceof ApiDataSource) ds.undoFinding(id); setToast(null); setWo(null); };

  const highlight = selected ? { kind: selected.target.kind, id: selected.target.id, label: selected.target.kind === 'config' ? undefined : selected.title } : undefined;
  const evSeries = selected?.evidence.series.map((id) => ds.series(id)).filter((s): s is NonNullable<typeof s> => !!s) ?? [];

  return (
    <div className="max-w-[1500px]">
      <div className="flex items-start gap-4 mb-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Find <span className="mono text-muted font-normal text-[16px]">{checkId}</span></h1>
          <p className="text-muted mt-1">What the old check was hiding. The detectors found each problem; Nemotron wrote the sentence; you decide.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!steps.length && <Button variant="primary" onClick={() => ds.runFind(checkId)}>Replay and find</Button>}
          {findings.length > 0 && <span className="text-[13px] num mr-2"><b>{findings.length}</b> findings · <b>{accepted}</b> accepted · <b>{workOrders}</b> work orders</span>}
          {handled > 0 && <Button variant="primary" kbd="→" onClick={() => nav(`/prove/${checkId}`)}>Continue to Prove <ArrowRight size={14} /></Button>}
        </div>
      </div>

      {state.replay && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px] mb-2">
            <span>Replayed <span className="mono">{checkId}</span> over <b>{state.replay.days} days</b> of recorded readings</span>
            <span><b className="num">{state.replay.pluginRuns.toLocaleString()}</b> runs of the real plugin</span>
            <span>it paged <b className="num">{state.replay.legacyPages}</b> times</span>
            <span><b className="num">{state.replay.sameFalseAlarm}</b> were the same false alarm</span>
            <span className="text-muted ml-auto text-[11.5px]">grey = legacy page · <span className="text-accent">●</span> = detector hit</span>
          </div>
          <ReplayTimeline pageTicks={state.replay.pageTicks} hits={state.replay.detectorHits} days={state.replay.days} />
        </Card>
      )}

      {!steps.length && !findings.length && <Empty title="Nothing replayed yet" body="The replay runs the real plugin, tick by tick, over 21 days of recorded hall readings, then seven deterministic detectors look for what it missed." />}
      {steps.length > 0 && !findings.length && <Card className="mb-4"><Trace steps={steps} /></Card>}

      {findings.length > 0 && (
        <div className="grid grid-cols-[2fr_1.75fr_1.25fr] gap-5 items-start">
          <ol className="grid gap-3" aria-label="Findings">
            {findings.map((f) => <FindingCard key={f.id} f={f} selected={selected?.id === f.id} onSelect={() => setSel(f.id)} onAccept={() => setConfirm(f)} onDismiss={() => setDismissing(f)} />)}
            {running && <li className="text-[12px] text-muted flex items-center gap-2"><ModelBadge model="Nemotron Nano" /> writing the next finding…</li>}
          </ol>
          <div className="card p-3 sticky top-0"><FloorMap highlight={highlight} /></div>
          <div className="grid gap-3 sticky top-0">
            {selected && (
              <Card header={<><span className="font-semibold text-[13px]">Evidence</span><span className="text-[11.5px] text-muted ml-auto">finding #{selected.id}</span></>}>
                {evSeries.length > 0 ? <><Sparkline series={evSeries} /><Legend series={evSeries} /></> : <div className="text-[12.5px] text-muted">{selected.evidence.caption}</div>}
                {evSeries.length > 0 && <div className="text-[11.5px] text-muted mt-1">{selected.evidence.caption}</div>}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] mt-3">
                  {Object.entries(selected.detectorNumbers).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="mono">{String(v)}</dd></div>)}
                </dl>
                <div className="flex flex-wrap gap-2 mt-3 text-[11.5px] text-muted items-center"><span>Found by</span><Badge><span className="mono">{selected.detector}</span></Badge><span>·</span><ModelBadge model={selected.model} /><span>wrote the sentence</span><ModeBadge mode={selected.mode} /></div>
              </Card>
            )}
            {wo && (
              <Card header={<><ExternalLink size={14} className="text-muted" /><span className="font-semibold text-[13px]">Work order #{wo.number}</span><Badge tone="ok">opened {wo.at}</Badge></>}>
                <div className="font-semibold text-[13.5px] mb-2">{wo.title}</div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]"><dt className="text-muted">Unit</dt><dd>{wo.unit}</dd><dt className="text-muted">Location</dt><dd>{wo.location}</dd><dt className="text-muted">Likely part</dt><dd>{wo.likelyPart}</dd><dt className="text-muted">Labels</dt><dd className="flex gap-1">{wo.labels.map((l) => <Badge key={l}>{l}</Badge>)}</dd><dt className="text-muted">Assigned</dt><dd>Luis O. (on-call facilities tech)</dd></dl>
              </Card>
            )}
          </div>
        </div>
      )}

      {confirm && (
        <Modal onClose={() => setConfirm(null)} title={`Accept: ${confirm.action}`}>
          <p className="text-[13px] text-muted mb-3">This opens a work order for Luis O. and adds the finding to the shift handoff. Nothing changes in the hall until a person does the work.</p>
          {confirm.workOrder && <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px] card p-3 mb-3"><dt className="text-muted">Title</dt><dd>{confirm.workOrder.title}</dd><dt className="text-muted">Unit</dt><dd>{confirm.workOrder.unit}</dd><dt className="text-muted">Location</dt><dd>{confirm.workOrder.location}</dd><dt className="text-muted">Likely part</dt><dd>{confirm.workOrder.likelyPart}</dd></dl>}
          <div className="flex gap-2 justify-end"><Button onClick={() => setConfirm(null)} kbd="Esc">Cancel</Button><Button variant="primary" autoFocus onClick={() => accept(confirm)} kbd="Enter">Create work order</Button></div>
        </Modal>
      )}
      {dismissing && (
        <Modal onClose={() => setDismissing(null)} title={`Dismiss: ${dismissing.title}`}>
          <p className="text-[13px] text-muted mb-3">Pick a reason. It goes in the handoff so the next shift knows why.</p>
          <div className="flex flex-wrap gap-2">{reasons.map((r, i) => <Button key={r} autoFocus={i === 0} onClick={() => dismiss(dismissing, r)}>{r}</Button>)}</div>
        </Modal>
      )}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 card px-4 py-2.5 flex items-center gap-3 shadow-[var(--shadow)] z-40 text-[13px]" role="status"><Check size={14} className="text-ok" />{toast.text}<Button variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => undo(toast.id)} kbd="U"><Undo2 size={13} /> Undo</Button><span className="h-0.5 w-20 bg-surface-2 overflow-hidden rounded"><span className="block h-full bg-accent" style={{ animation: 'shrink 10s linear forwards' }} /></span><style>{`@keyframes shrink{from{width:100%}to{width:0}}`}</style></div>}
    </div>
  );
}

function FindingCard({ f, selected, onSelect, onAccept, onDismiss }: { f: Finding; selected: boolean; onSelect: () => void; onAccept: () => void; onDismiss: () => void }) {
  const done = f.status !== 'open';
  return (
    <li className={cx('card p-4 cursor-pointer t', selected && 'border-accent', done && 'opacity-80', f.status === 'accepted' && 'border-l-4 border-l-ok', f.status === 'dismissed' && 'border-l-4 border-l-border')} onClick={onSelect} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect()} aria-selected={selected}>
      <div className="flex items-center gap-2 mb-1.5"><StatusPill kind={f.severity} size="sm" /><span className="font-semibold text-[14px]">{f.title}</span><span className="ml-auto text-[11px] text-muted mono">{f.target.id}</span></div>
      <p className="text-[13px] leading-snug">{f.sentences}</p>
      <div className="flex items-center gap-2 mt-2 text-[11.5px] text-muted flex-wrap"><span>Found by</span><Badge><span className="mono">{f.detector}</span></Badge><span>· Suggested: <span className="text-text">{f.action}</span></span></div>
      <div className="flex items-center gap-2 mt-3">
        {f.status === 'open' && <><Button variant="primary" className="h-9 px-3 text-[13px]" kbd={selected ? 'A' : undefined} onClick={(e) => { e.stopPropagation(); onAccept(); }}><Check size={14} /> Accept</Button><Button className="h-9 px-3 text-[13px]" kbd={selected ? 'D' : undefined} onClick={(e) => { e.stopPropagation(); onDismiss(); }}><X size={14} /> Dismiss</Button></>}
        {f.status === 'accepted' && <span className="text-[12.5px] text-ok flex items-center gap-1.5"><Check size={14} /> Work order {f.decision?.workOrderId} · {f.decision?.at} · {f.decision?.by}</span>}
        {f.status === 'dismissed' && <span className="text-[12.5px] text-muted flex items-center gap-1.5"><X size={14} /> Dismissed: {f.decision?.reason} · {f.decision?.at} · {f.decision?.by}</span>}
      </div>
    </li>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="fixed inset-0 bg-black/50 grid place-items-center z-50" onClick={onClose}><div className="card p-5 w-[520px] shadow-[var(--shadow)]" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}><div className="font-semibold text-[15px] mb-2">{title}</div>{children}</div></div>;
}
