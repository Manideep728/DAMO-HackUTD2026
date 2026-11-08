import { Check, ClipboardList } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Card, Badge, Empty, PageHeader } from '../components/ui';

export default function Handoff() {
  const { state, ds } = useStore();
  const h = state.handoff;
  if (!h) return <div className="mx-auto w-full max-w-[900px]"><PageHeader title="Shift handoff" /><Empty icon={ClipboardList} title="No handoff yet" body="The handoff is written from decisions made on the Find and Prove screens." /></div>;
  const empty = !h.accepted.length && !h.dismissed.length && !h.signedOff.length;
  return (
    <div className="mx-auto w-full max-w-[900px] grid gap-4">
      <PageHeader
        kicker={<>{h.shift}</>}
        title="Shift handoff"
        subtitle={<>Written by {h.writtenBy}{h.reviewedBy ? `, reviewed by ${h.reviewedBy}` : ''}. Every decision from tonight, with a name and a time.</>}
        actions={h.acknowledgedBy ? <Badge tone="ok"><Check size={11} /> Acknowledged by {h.acknowledgedBy} · {h.acknowledgedAt}</Badge> : <Button variant="primary" disabled={empty} onClick={() => ds.acknowledgeHandoff('Dev K.')}>Acknowledge handoff</Button>}
      />
      {empty && <Empty icon={ClipboardList} title="Nothing to hand off yet" body="Accept or dismiss findings on the Find screen, or sign off a check on Prove. Each decision lands here with a name and a time, so nobody types a handoff at 7 AM." />}
      {h.accepted.length > 0 && (
        <Card header={<span className="font-semibold text-[13px]">Open · needs you</span>}>
          <ul className="grid gap-3">{h.accepted.map((a) => <li key={a.findingId} className="grid grid-cols-[1fr_auto] gap-2 text-[13px]"><div><div className="font-semibold">{a.title}</div><div className="text-muted">Work order #{a.workOrder} · {a.owner} · ETA {a.eta}</div><div className="text-[12.5px] mt-0.5">Watch: {a.watch}</div></div><Badge tone="warning">open</Badge></li>)}</ul>
        </Card>
      )}
      {h.dismissed.length > 0 && <Card header={<span className="font-semibold text-[13px]">Dismissed, with reasons</span>}><ul className="grid gap-1.5 text-[13px]">{h.dismissed.map((d) => <li key={d.findingId}><span className="font-semibold">{d.title}</span> <span className="text-muted">· {d.reason}</span></li>)}</ul></Card>}
      {h.signedOff.length > 0 && <Card header={<span className="font-semibold text-[13px]">Checks signed off tonight</span>}><ul className="text-[13px] mono">{h.signedOff.map((s) => <li key={s}>{s} · retired by proof · old check still running until cutover</li>)}</ul></Card>}
      {h.timeline.length > 0 && <Card header={<span className="font-semibold text-[13px]">Timeline</span>}><ol className="grid gap-1 text-[12.5px]">{h.timeline.map((t, i) => <li key={i} className="grid grid-cols-[48px_1fr] gap-3"><span className="mono text-muted">{t.at}</span><span>{t.text}</span></li>)}</ol></Card>}
    </div>
  );
}
