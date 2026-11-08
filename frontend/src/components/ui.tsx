import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { CircleCheck, Eye, TriangleAlert, OctagonAlert, HelpCircle, Info, WifiOff, Cpu, type LucideIcon } from 'lucide-react';
import type { Severity, Mode } from '../data/types';

export function cx(...a: (string | false | undefined | null)[]) { return a.filter(Boolean).join(' '); }

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', kbd, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; kbd?: string }) {
  const base = 'btn inline-flex items-center justify-center gap-2 h-10 px-3.5 rounded-control text-body font-medium disabled:opacity-45 disabled:cursor-not-allowed select-none whitespace-nowrap';
  const v = {
    primary: 'btn-primary',
    secondary: 'border border-border bg-surface hover:bg-surface-2 hover:border-border-strong text-text',
    ghost: 'text-muted hover:text-text hover:bg-surface-2',
    danger: 'border border-critical text-critical hover:bg-critical/10',
  }[variant];
  return (
    <button className={cx(base, v, className)} {...rest}>
      {children}
      {kbd && <span className={cx('kbd', variant === 'primary' && '!text-inverse-ink !bg-transparent !border-inverse-ink/25 opacity-70')}>{kbd}</span>}
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
    <span className={cx('inline-flex items-center gap-1 rounded-full font-semibold', m.cls, size === 'sm' ? 'h-5 px-2 text-[12px]' : 'h-6 px-2.5 text-[12px]')}>
      <m.Icon size={size === 'sm' ? 12 : 14} aria-hidden /> <span className="sev">{word ?? m.word}</span>
    </span>
  );
}

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'warning' | 'critical'; title?: string }) {
  const t = { neutral: 'border-border text-muted', accent: 'border-accent/40 text-accent', ok: 'border-ok/40 text-ok', warning: 'border-warning/40 text-warning', critical: 'border-critical/40 text-critical' }[tone];
  return <span title={title} className={cx('inline-flex items-center gap-1 min-h-6 px-2 rounded-control border text-label font-medium whitespace-nowrap', t)}>{children}</span>;
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
      {header && <header className="flex items-center gap-3 px-5 h-12 border-b hairline">{header}</header>}
      <div className="p-5">{children}</div>
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
    <ol className="flex items-center gap-1 whitespace-nowrap" aria-label={`Stage: ${blocked ? 'blocked at verified' : labels[stage]}`}>
      {stages.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span className={cx('h-2 w-2 rounded-full border t', i < idx && 'bg-accent border-accent', i === idx && !blocked && 'border-accent border-2', i === idx && blocked && 'border-critical border-2', i > idx && 'border-border')} />
          <span className={cx('text-[12px] whitespace-nowrap', i === idx ? (blocked ? 'text-critical font-semibold' : 'text-text font-semibold') : 'text-muted')}>{i === idx && blocked ? 'Blocked' : labels[s]}</span>
          {i < stages.length - 1 && <span className="w-3 h-px bg-border mx-0.5" />}
        </li>
      ))}
    </ol>
  );
}

export function Kbd({ k }: { k: string }) { return <span className="kbd">{k}</span>; }

export function Empty({ title, body, action, icon: Icon }: { title: string; body?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="card flex flex-col items-start gap-3 px-6 py-10">
      {Icon && <span className="h-10 w-10 grid place-items-center rounded-control bg-surface-2 border hairline text-muted mb-1"><Icon size={19} aria-hidden /></span>}
      <div className="font-semibold text-section">{title}</div>
      {body && <div className="text-muted text-body max-w-prose leading-relaxed">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** One header for every screen: optional step label, title, subtitle, actions on the right. */
export function PageHeader({ kicker, title, meta, subtitle, actions }: { kicker?: ReactNode; title: ReactNode; meta?: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-8">
      <div className="min-w-0 flex-[1_1_480px]">
        {kicker && <div className="kicker mb-2 flex items-center gap-2">{kicker}</div>}
        <h1 className="page-title">{title}</h1>
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        {subtitle && <p className="text-muted mt-2.5 max-w-prose text-body leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

export function SectionHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end gap-4 mb-4">
      <div className="min-w-0"><h2 className="section-title">{title}</h2>{subtitle && <p className="text-body text-muted mt-1">{subtitle}</p>}</div>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

export function CheckChip({ id }: { id: string }) {
  return <span className="mono text-[12px] h-6 px-2 inline-flex items-center rounded-md bg-surface-2 border hairline text-muted">{id}</span>;
}
