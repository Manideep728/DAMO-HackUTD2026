// Document preview overlay. `useDocs().open(id, mark)` opens a source document with the line containing `mark` highlighted.
// Step files link evidence with <DocLink id="drawingB" mark="zone 2" />.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, Lock, X } from 'lucide-react';
import { doc, type Doc } from './docs';
import { FloorPlan, RowDrawing } from './viz/a-Drawings';
import { Badge, cx } from '../components/ui';

interface Open { id: string; mark?: string }
const C = createContext<{ open: (id: string, mark?: string) => void } | null>(null);
export function useDocs() { const c = useContext(C); if (!c) throw new Error('DocsProvider missing'); return c; }

export function DocsProvider({ children }: { children: ReactNode }) {
  const [cur, setCur] = useState<Open | null>(null);
  return (
    <C.Provider value={{ open: (id, mark) => setCur({ id, mark }) }}>
      {children}
      {cur && <DocModal id={cur.id} mark={cur.mark} onClose={() => setCur(null)} />}
    </C.Provider>
  );
}

/** Small chip that opens a document at the cited line. */
export function DocLink({ id, mark, label }: { id: string; mark?: string; label?: string }) {
  const { open } = useDocs();
  const d = doc(id);
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); open(id, mark); }} title={`Open ${d.file}`}
      className="inline-flex items-center gap-1 h-6 px-2 rounded-md border hairline text-[12px] mono text-muted hover:text-text hover:border-border-strong t align-middle">
      <FileText size={12} />{label ?? d.file}
    </button>
  );
}

const hitOf = (lines: string[], mark?: string) => (mark ? lines.findIndex((l) => l.toLowerCase().includes(mark.toLowerCase())) : -1);
function cells(line: string) { const out: string[] = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; }

function SheetView({ text, mark }: { text: string; mark?: string }) {
  const lines = text.split('\n').filter((l) => l.trim());
  const caption = lines.filter((l) => l.startsWith('#')).map((l) => l.replace(/^#\s?/, ''));
  const [head, ...rows] = lines.filter((l) => !l.startsWith('#'));
  const h = cells(head); const hit = hitOf(rows, mark);
  return (<>
    {caption.length > 0 && <p className="px-4 py-2 text-[12px] text-muted border-b hairline">{caption.join(' ')}</p>}
    <table className="mono text-[12px] border-collapse min-w-full">
      <thead className="sticky top-0 z-10 bg-surface-2"><tr><th className="border hairline w-10" />{h.map((_, i) => <th key={i} className="border hairline px-2 h-6 font-normal text-faint">{String.fromCharCode(65 + i)}</th>)}</tr>
        <tr><th className="border hairline text-faint font-normal text-right px-2">1</th>{h.map((c, i) => <th key={i} className="border hairline px-2 h-7 text-left font-semibold whitespace-nowrap">{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} data-hit={i === hit || undefined} className={cx(i % 2 === 1 && 'bg-surface-2/40', i === hit && '!bg-accent/15')}>
        <td className="border hairline text-faint text-right px-2 bg-surface-2">{i + 2}</td>{h.map((_, j) => <td key={j} className="border hairline px-2 h-7 whitespace-nowrap">{cells(r)[j] ?? ''}</td>)}</tr>)}</tbody>
    </table>
  </>);
}

function TextView({ text, mark }: { text: string; mark?: string }) {
  const lines = text.split('\n'); const hit = hitOf(lines, mark);
  return <pre className="mono text-[12.5px] leading-[1.6] py-3">{lines.map((l, i) => (
    <div key={i} data-hit={i === hit || undefined} className={cx('px-4 flex gap-3', i === hit && 'bg-accent/10 border-l-2 border-accent', l.trim().startsWith('#') && 'text-faint')}><span className="text-faint w-6 text-right shrink-0 select-none">{i + 1}</span><span className="whitespace-pre-wrap">{l || ' '}</span></div>))}
  </pre>;
}

function DrawingView({ d, mark }: { d: Doc; mark?: string }) {
  const lines = d.text.split('\n'); const hit = hitOf(lines, mark);
  const notes = lines.map((l, i) => ({ l, i })).filter(({ l }) => /^(\d+\.|L-[ABC]\b|Floor loading)/.test(l));
  const noteNo = hit >= 0 ? Number(lines[hit].match(/^(\d+)\./)?.[1]) || undefined : undefined;
  const zone = mark?.match(/L-[ABC]/)?.[0] ?? null;
  return (<div className="p-4">
    <div className="overflow-x-auto rounded-lg border hairline bg-surface">{d.id === 'floorplan' ? <FloorPlan hi={zone} /> : <RowDrawing rev={d.id === 'drawingA' ? 'A' : 'B'} hi={noteNo} />}</div>
    <ol className="mt-3 grid gap-1 text-[13px]">{notes.map(({ l, i }) => <li key={i} data-hit={i === hit || undefined} className={cx('px-2 py-1 rounded-md', i === hit && 'bg-accent/10 border-l-2 border-accent')}>{l}</li>)}</ol>
    <details className="mt-3" open={hit >= 0 && !notes.some((x) => x.i === hit)}><summary className="text-[13px] text-muted cursor-pointer h-10 flex items-center">Text</summary><TextView text={d.text} mark={mark} /></details>
  </div>);
}

function DocModal({ id, mark, onClose }: Open & { onClose: () => void }) {
  const d = doc(id);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => { body.current?.querySelector('[data-hit]')?.scrollIntoView({ block: 'center' }); }, [id, mark]);
  const csv = d.kind === 'sheet' || d.kind === 'log' || (d.kind === 'manual' && d.text.includes(',register,'));
  return (
    <div className="overlay fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="card w-[min(960px,100%)] max-h-[88vh] flex flex-col shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={d.title}>
        <div className="px-4 py-2 flex items-center gap-2 border-b hairline shrink-0">
          <FileText size={15} className="text-muted shrink-0" />
          <div className="min-w-0"><div className="font-semibold text-[14px] truncate">{d.title}</div>
            <div className="text-[12px] text-faint mono truncate">{d.file} · {d.version} · synced {d.synced} · {d.sha}</div></div>
          <span className="ml-auto shrink-0"><Badge><Lock size={11} /> read-only</Badge></span>
          <button className="h-12 w-12 grid place-items-center text-muted hover:text-text shrink-0" onClick={onClose} aria-label="Close" autoFocus><X size={18} /></button>
        </div>
        <div ref={body} className="overflow-auto min-h-0">
          {d.kind === 'drawing' ? <DrawingView d={d} mark={mark} /> : csv ? <SheetView text={d.text} mark={mark} /> : <TextView text={d.text} mark={mark} />}
        </div>
      </div>
    </div>
  );
}
