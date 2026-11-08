// Shared building blocks for the six setup steps.
import { useEffect, useState, type ReactNode } from 'react';
import { Check, X, Loader2, ChevronDown, Sparkles, UserCheck } from 'lucide-react';
import { Card, ModelBadge, cx } from '../components/ui';
import { DocLink } from './DocViewer';

/** Pace of Nemotron's visible actions, matching the rest of the app. */
export const AGENT_MS = 900;
const finished = new Set<string>();

/** Renders `[[docId]]` or `[[docId|text to highlight]]` tokens in an agent line as document chips; a line containing ✗ gets a cross. */
function Line({ text }: { text: string }) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return (
    <li className="flex items-start gap-2 text-[13px] fresh-row">
      {text.includes('✗') ? <X size={14} className="text-critical shrink-0 mt-0.5" /> : <Check size={14} className="text-ok shrink-0 mt-0.5" />}
      <span className="min-w-0 leading-relaxed">{parts.map((p, i) => {
        const m = p.match(/^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/);
        return m ? <span key={i} className="mx-0.5"><DocLink id={m[1]} mark={m[2]} /></span> : <span key={i} className={i === 0 ? 'mono' : ''}>{p}</span>;
      })}</span>
    </li>
  );
}

/** Nemotron working on a step. Starts by itself when the step opens; afterwards the actions stay available, collapsed.
 *  Keeps its own timer (not the shared run slot) so a remount or hot reload just resumes the reveal. */
export function AgentPanel({ k, title, lines, ran, onDone, ms = AGENT_MS }: { k: string; title: string; lines: string[]; ran: boolean; onDone: () => void; ms?: number }) {
  const [openLog, setOpenLog] = useState(false);
  const [n, setN] = useState(0);
  const running = !ran && n <= lines.length;
  useEffect(() => {
    if (ran) return;
    if (n > lines.length) return;
    const id = window.setTimeout(() => {
      if (n === lines.length) { setN(n + 1); if (!finished.has(k)) { finished.add(k); onDone(); } } else setN(n + 1);
    }, ms);
    return () => window.clearTimeout(id);
  }, [ran, n, lines.length, ms, k, onDone]);
  useEffect(() => { if (!ran) finished.delete(k); }, [ran, k]);
  const shown = running ? lines.slice(0, n) : ran ? lines : [];
  return (
    <Card className="mb-6" header={<>
      {running ? <Loader2 size={14} className="animate-spin text-accent" /> : <Sparkles size={14} className="text-accent" />}
      <span className="font-semibold text-[14px]">{running ? title : `${title}: done`}</span>
      <ModelBadge model="Nemotron Super" />
      {!running && ran && <button className="ml-auto h-10 px-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-text" onClick={() => setOpenLog((v) => !v)} aria-expanded={openLog}>{lines.length} actions <ChevronDown size={14} className={cx('t', openLog && 'rotate-180')} /></button>}
    </>}>
      {(running || openLog) ? <ul className="grid gap-1.5">{shown.map((l, i) => <Line key={i} text={l} />)}</ul>
        : <p className="text-[13px] text-muted">{ran ? 'Every action links to the document it used.' : 'Starting…'}</p>}
    </Card>
  );
}

/** Who did what in this step: the agent's preparation on the left, the engineer's decision on the right. */
export function WorkSplit({ did, need, decided }: { did: ReactNode; need: ReactNode; decided?: boolean }) {
  return (
    <div className="grid md:grid-cols-2 gap-3 mb-6">
      <div className="card px-4 py-3 flex gap-2.5"><Sparkles size={16} className="text-accent shrink-0 mt-0.5" /><div className="text-[14px]"><div className="text-[12px] font-medium text-accent mb-0.5">Nemotron did</div>{did}</div></div>
      <div className={cx('card px-4 py-3 flex gap-2.5 t', decided ? 'border-ok/50' : 'border-warning/50')}><UserCheck size={16} className={cx('shrink-0 mt-0.5', decided ? 'text-ok' : 'text-warning')} /><div className="text-[14px]"><div className={cx('text-[12px] font-medium mb-0.5', decided ? 'text-ok' : 'text-warning')}>{decided ? 'Decided by you' : 'Needs your decision'}</div>{need}</div></div>
    </div>
  );
}

export const Pass = ({ ok, label }: { ok: boolean; label?: string }) => ok
  ? <span className="inline-flex items-center gap-1 text-ok font-semibold text-[13px]"><Check size={15} strokeWidth={2.5} /> {label ?? 'PASS'}</span>
  : <span className="inline-flex items-center gap-1 text-critical font-semibold text-[13px] chip-fail"><X size={15} strokeWidth={2.5} /> {label ?? 'FAIL'}</span>;

/** Tri-state cell for requirement comparisons. */
export const Tri = ({ v }: { v: 'pass' | 'fail' | 'unknown' }) => v === 'pass' ? <Pass ok label="pass" /> : v === 'fail' ? <Pass ok={false} label="fail" /> : <span className="text-warning text-[13px] font-semibold">unknown</span>;

export function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="card mono text-[12.5px] leading-[1.6] overflow-x-auto py-2">{diff.split('\n').map((l, i) => (
      <div key={i} className={cx('px-4', l.startsWith('+') && !l.startsWith('+++') && 'bg-ok/15 text-ok', l.startsWith('-') && !l.startsWith('---') && 'bg-critical/10 text-critical', l.startsWith('@@') && 'text-faint')}>{l || ' '}</div>))}
    </pre>
  );
}

export const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
