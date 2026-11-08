import { useMemo } from 'react';
import type { SourceFile, SourceRange } from '../data/types';
import type { StepState } from '../state/store';
import { cx, ModelBadge } from './ui';
import { Loader2, Check, AlertTriangle } from 'lucide-react';

/** Read-only, line-numbered source with highlighted ranges. */
export function CodeView({ file, highlights, compact }: { file: SourceFile; highlights?: SourceRange[]; compact?: boolean }) {
  const lines = useMemo(() => file.text.replace(/\n$/, '').split('\n'), [file.text]);
  const hi = new Set<number>();
  highlights?.filter((h) => h.file === file.file).forEach((h) => { for (let i = h.from; i <= h.to; i++) hi.add(i); });
  return (
    <div className="rounded-md border hairline overflow-hidden bg-surface">
      <div className="px-3 h-8 flex items-center text-[11.5px] text-muted border-b hairline mono">{file.file}</div>
      <pre className={cx('overflow-auto text-[12.5px] leading-[1.5] m-0', compact ? 'max-h-48' : 'max-h-[440px]')}>
        {lines.map((l, i) => { const n = i + 1, on = hi.has(n); return (
          <div key={n} className={cx('flex t', on && 'bg-accent/10')}>
            <span className={cx('w-10 shrink-0 text-right pr-3 select-none border-r-2', on ? 'border-accent text-accent' : 'border-transparent text-muted/60')}>{n}</span>
            <code className="pl-3 whitespace-pre">{l || ' '}</code>
          </div>); })}
      </pre>
    </div>
  );
}

export function YamlView({ yaml, onHoverLine, activeLine }: { yaml: string; onHoverLine?: (line: string | null) => void; activeLine?: string | null }) {
  const lines = yaml.replace(/\n$/, '').split('\n');
  return (
    <div className="rounded-md border hairline overflow-hidden bg-surface">
      <div className="px-3 h-8 flex items-center text-[11.5px] text-muted border-b hairline mono">generated/check_rack_inlet.rules.yml</div>
      <pre className="overflow-auto text-[12.5px] leading-[1.5] m-0 max-h-[440px]">
        {lines.map((l, i) => { const isRule = /^\s*- alert:/.test(l); const name = isRule ? l.split('alert:')[1].trim() : null; return (
          <div key={i} className={cx('flex t', isRule && 'cursor-pointer hover:bg-accent/10', activeLine && name === activeLine && 'bg-accent/15')} onMouseEnter={() => name && onHoverLine?.(name)} onMouseLeave={() => name && onHoverLine?.(null)}>
            <span className="w-10 shrink-0 text-right pr-3 select-none text-muted/60">{i + 1}</span><code className="pl-3 whitespace-pre">{l || ' '}</code>
          </div>); })}
      </pre>
    </div>
  );
}

/** Streamed steps: tool, label, model, timing. Never a bare spinner. */
export function Trace({ steps, title }: { steps: StepState[]; title?: string }) {
  if (!steps.length) return null;
  return (
    <ol className="grid gap-1.5" aria-label={title ?? 'steps'}>
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-2 text-[12.5px]">
          <span className={cx('mt-1 h-4 w-4 shrink-0 grid place-items-center rounded-full border', s.status === 'running' && 'border-accent text-accent', s.status === 'done' && 'bg-accent border-accent text-accent-ink', s.status === 'error' && 'border-critical text-critical')}>
            {s.status === 'running' ? <Loader2 size={10} className="animate-spin" /> : s.status === 'done' ? <Check size={10} /> : <AlertTriangle size={10} />}
          </span>
          <div className="min-w-0">
            <div className={cx(s.status === 'error' && 'text-critical')}>{s.label}</div>
            <div className="flex flex-wrap gap-2 text-[11px] text-muted mt-0.5">
              {s.tool && <span className="mono">{s.tool}</span>}
              {s.model && <ModelBadge model={s.model} />}
              {s.durationMs && s.status === 'done' && <span className="num">{(s.durationMs / 1000).toFixed(1)} s</span>}
              {s.status === 'running' && <Timer since={s.startedAt} />}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

import { useEffect, useState } from 'react';
function Timer({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 100); return () => clearInterval(id); }, []);
  return <span className="num text-accent">{((Date.now() - since) / 1000).toFixed(1)} s</span>;
}
