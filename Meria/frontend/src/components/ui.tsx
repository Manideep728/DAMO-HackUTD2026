import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { CircleCheck, Eye, TriangleAlert, OctagonAlert, HelpCircle, Info, WifiOff, Cpu, type LucideIcon } from 'lucide-react';
import type { Severity, Mode } from '../data/types';

export function cx(...a: (string | false | undefined | null)[]) { return a.filter(Boolean).join(' '); }

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', kbd, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; kbd?: string }) {
  const base = 'inline-flex items-center gap-2 h-10 px-4 rounded-md text-[14px] font-semibold t disabled:opacity-45 disabled:cursor-not-allowed select-none';
  const v = {
    primary: 'bg-accent text-accent-ink hover:brightness-110',
    secondary: 'border border-border bg-surface hover:bg-surface-2 text-text',
    ghost: 'text-muted hover:text-text hover:bg-surface-2',
    danger: 'border border-critical text-critical hover:bg-critical/10',
  }[variant];
  return (
    <button className={cx(base, v, className)} {...rest}>
      {children}
      {kbd && <span className={cx('kbd', variant === 'primary' && 'opacity-70 !text-accent-ink !bg-transparent !border-accent-ink/40')}>{kbd}</span>}
    </button>
  );
}

const sevMeta: Record<Severity | 'ok' | 'untrusted' | 'offline', { word: string; Icon: LucideIcon; cls: string }> = {
  critical: { word: 'Critical', Icon: OctagonAlert, cls: 'text-critical bg-critical/15' },
  warning: { word: 'Warning', Icon: TriangleAlert, cls: 'text-warning bg-warning/15' },
  watch: { word: 'Watch', Icon: Eye, cls: 'text-watch bg-watch/15' },
  info: { word: 'Info', Icon: Info, cls: 'text-muted bg-surface-2' },
  ok: { word: 'OK', Icon: CircleCheck, cls: 'text-ok bg-ok/15' },
  untrusted: { word: 'Untrusted', Icon: HelpCircle, cls: 'text-untrusted bg-untrusted/15' },
  offline: { word: 'Offline', Icon: WifiOff, cls: 'text-muted bg-surface-2' },
};
export function StatusPill({ kind, word, size = 'md' }: { kind: keyof typeof sevMeta; word?: string; size?: 'sm' | 'md' }) {
  const m = sevMeta[kind];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full font-semibold', m.cls, size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-[12px]')}>
      <m.Icon size={size === 'sm' ? 12 : 14} aria-hidden /> <span className="sev">{word ?? m.word}</span>
    </span>
  );
}

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'warning' | 'critical'; title?: string }) {
  const t = { neutral: 'border-border text-muted', accent: 'border-accent/40 text-accent', ok: 'border-ok/40 text-ok', warning: 'border-warning/40 text-warning', critical: 'border-critical/40 text-critical' }[tone];
  return <span title={title} className={cx('inline-flex items-center gap-1 h-5 px-1.5 rounded border text-[11px] font-medium whitespace-nowrap', t)}>{children}</span>;
}

export function ModeBadge({ mode }: { mode: Mode }) {
  const label = { live: 'Live', cached: 'Cached', mock: 'Mock' }[mode];
  const tone = mode === 'live' ? 'ok' : mode === 'cached' ? 'warning' : 'neutral';
  return <Badge tone={tone} title={mode === 'live' ? 'Responses from Nemotron right now' : mode === 'cached' ? 'Responses recorded from an earlier live run' : 'Fixture data, no model calls'}>{label}</Badge>;
}

export function ModelBadge({ model }: { model: string }) { return <Badge tone="accent"><Cpu size={11} aria-hidden /> {model}</Badge>; }

export function Card({ children, className, header }: { children: ReactNode; className?: string; header?: ReactNode }) {
  return (
    <section className={cx('card', className)}>
      {header && <header className="flex items-center gap-3 px-4 h-11 border-b hairline">{header}</header>}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stepper({ stage }: { stage: string }) {
  const stages = ['audit', 'parallel_run', 'verified', 'signed_off', 'retired'];
  const labels: Record<string, string> = { audit: 'Audit', parallel_run: 'Parallel run', verified: 'Verified', signed_off: 'Signed off', retired: 'Retired' };
  if (stage === 'drop') return <span className="text-[12px] text-muted">Drop · no replacement</span>;
  const blocked = stage === 'blocked';
  const idx = blocked ? 2 : stages.indexOf(stage);
  return (
    <ol className="flex items-center gap-1" aria-label={`Stage: ${blocked ? 'blocked at verified' : labels[stage]}`}>
      {stages.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span className={cx('h-2 w-2 rounded-full border t', i < idx && 'bg-accent border-accent', i === idx && !blocked && 'border-accent border-2', i === idx && blocked && 'border-critical border-2', i > idx && 'border-border')} />
          <span className={cx('text-[11px]', i === idx ? (blocked ? 'text-critical font-semibold' : 'text-text font-semibold') : 'text-muted')}>{i === idx && blocked ? 'Blocked' : labels[s]}</span>
          {i < stages.length - 1 && <span className="w-3 h-px bg-border mx-0.5" />}
        </li>
      ))}
    </ol>
  );
}

export function Kbd({ k }: { k: string }) { return <span className="kbd">{k}</span>; }

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 p-6 rounded-lg border border-dashed hairline">
      <div className="font-semibold">{title}</div>
      {body && <div className="text-muted text-[13px] max-w-prose">{body}</div>}
      {action}
    </div>
  );
}
