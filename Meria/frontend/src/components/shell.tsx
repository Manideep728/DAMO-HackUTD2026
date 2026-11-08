import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ListChecks, BookOpen, Search, ShieldCheck, ClipboardList, Sun, Moon, HelpCircle, X, Play, SkipForward, RotateCcw } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Kbd, ModeBadge, cx } from './ui';
import type { Screen, DirectorFlag } from '../data/types';

const nav = [
  { to: '/', label: 'Checks', Icon: ListChecks, key: '1' },
  { to: '/read/check_rack_inlet', label: 'Read', Icon: BookOpen, key: '2' },
  { to: '/find/check_rack_inlet', label: 'Find', Icon: Search, key: '3' },
  { to: '/prove/check_rack_inlet', label: 'Prove', Icon: ShieldCheck, key: '4' },
  { to: '/handoff', label: 'Handoff', Icon: ClipboardList, key: '5' },
];

export function Shell({ children }: { children: ReactNode }) {
  const { state, ds } = useStore();
  const nav$ = useNavigate();
  const loc = useLocation();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as 'dark' | 'light') || 'dark');
  const [help, setHelp] = useState(false);
  const [director, setDirector] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); setDirector((v) => !v); return; }
      if (e.key === '?') { setHelp((v) => !v); return; }
      if (e.key === 'Escape') { setHelp(false); setDirector(false); return; }
      if (e.key === 'h' || e.key === 'H') { nav$('/handoff'); return; }
      const n = nav.find((x) => x.key === e.key); if (n) nav$(n.to);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [nav$]);
  const stage = state.certificate?.signedOffBy ? 'Signed off' : state.done.prove ? 'Verified' : state.done.find ? 'Parallel run' : state.done.read ? 'Read' : 'Audit';
  const screen: Screen | null = loc.pathname.startsWith('/read') ? 'read' : loc.pathname.startsWith('/find') ? 'find' : loc.pathname.startsWith('/prove') ? 'prove' : null;
  return (
    <div className="h-full grid grid-cols-[72px_1fr] grid-rows-[56px_1fr]">
      <div className="col-span-2 flex items-center gap-4 px-4 border-b hairline bg-surface">
        <div className="font-semibold tracking-tight">The Gauntlet</div>
        <span className="text-muted text-[13px]">·</span>
        <span className="mono text-[13px]">check_rack_inlet</span>
        <span className="text-muted text-[13px]">·</span>
        <span className="text-[13px]">Stage: <b>{stage}</b></span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-muted">Night shift · Maya R.</span>
          <ModeBadge mode={state.mode} />
          <span className="text-[11px] text-muted">{state.source === 'api' ? 'backend' : 'fixtures'}</span>
          <button className="h-8 w-8 grid place-items-center rounded-md hover:bg-surface-2" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className="h-8 w-8 grid place-items-center rounded-md hover:bg-surface-2" onClick={() => setHelp(true)} aria-label="Keyboard shortcuts"><HelpCircle size={16} /></button>
        </div>
      </div>
      <nav className="border-r hairline bg-surface flex flex-col items-stretch py-2" aria-label="Primary">
        {nav.map(({ to, label, Icon, key }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cx('flex flex-col items-center gap-1 py-3 text-[11px] t', isActive ? 'text-accent' : 'text-muted hover:text-text')}>
            <Icon size={20} aria-hidden /><span>{label}</span><span className="kbd !text-[9px] !py-0">{key}</span>
          </NavLink>
        ))}
      </nav>
      <main className="overflow-auto p-6 min-w-0">{children}</main>
      {help && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50" onClick={() => setHelp(false)}>
          <div className="card p-5 w-[420px]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
            <div className="flex items-center justify-between mb-3"><b>Keyboard shortcuts</b><button onClick={() => setHelp(false)} aria-label="Close"><X size={16} /></button></div>
            <table className="w-full text-[13px]"><tbody>
              {[['1–5', 'Switch screens'], ['A', 'Accept the focused finding'], ['D', 'Dismiss the focused finding'], ['S', 'Sign off (Prove, when unblocked)'], ['U', 'Undo (10 s window)'], ['→', 'Continue to the next step'], ['H', 'Handoff'], ['Esc', 'Close'], ['Ctrl+Shift+D', 'Director panel']].map(([k, v]) => <tr key={k}><td className="py-1 w-32"><Kbd k={k} /></td><td className="text-muted">{v}</td></tr>)}
            </tbody></table>
          </div>
        </div>
      )}
      {director && <Director onClose={() => setDirector(false)} screen={screen} />}
      {!director && <button className="fixed bottom-3 right-3 text-[11px] text-muted hover:text-text" onClick={() => setDirector(true)}>Director <Kbd k="Ctrl+Shift+D" /></button>}
      <div className="sr-only" aria-live="polite">{ds.kind}</div>
    </div>
  );
}

function Director({ onClose, screen }: { onClose: () => void; screen: Screen | null }) {
  const { ds } = useStore();
  const [, force] = useState(0);
  const flags = ds.director.flags();
  const toggle = (f: DirectorFlag) => { ds.director.toggle(f, !flags[f]); force((n) => n + 1); };
  const speeds: (1 | 2 | 5)[] = [1, 2, 5];
  return (
    <aside className="fixed bottom-3 right-3 card p-4 w-[340px] z-40 shadow-[var(--shadow)]" role="dialog" aria-label="Director panel">
      <div className="flex items-center justify-between mb-2"><b className="text-[13px]">Director</b><button onClick={onClose} aria-label="Close"><X size={14} /></button></div>
      <div className="flex gap-2 mb-3">
        <Button variant="secondary" className="h-8 px-3 text-[12px]" disabled={!screen} onClick={() => screen && ds.director.restart(screen)}><Play size={13} /> Replay</Button>
        <Button variant="secondary" className="h-8 px-3 text-[12px]" disabled={!screen} onClick={() => screen && ds.director.jumpToEnd(screen)}><SkipForward size={13} /> Jump to end</Button>
        <Button variant="ghost" className="h-8 px-3 text-[12px]" onClick={() => location.reload()}><RotateCcw size={13} /> Reset</Button>
      </div>
      <div className="flex items-center gap-2 mb-3 text-[12px]">Speed {speeds.map((s) => <button key={s} className={cx('kbd', ds.director.speed() === s && '!text-accent !border-accent')} onClick={() => { ds.director.setSpeed(s); force((n) => n + 1); }}>{s}×</button>)}</div>
      <div className="grid gap-1.5 text-[12px]">
        {([['flaggedCard', 'Flagged rule-card statement (Read)'], ['blockedSignoff', 'Blocked sign-off: 1 open counterexample (Prove)'], ['nemotronOffline', 'Nemotron offline (Read shows cached)'], ['cached', 'Show Cached badge']] as [DirectorFlag, string][]).map(([f, l]) => (
          <label key={f} className="flex items-center gap-2"><input type="checkbox" checked={flags[f]} onChange={() => toggle(f)} /> {l}</label>
        ))}
      </div>
      <div className="text-[11px] text-muted mt-3">Toggles apply on the next Replay. Source: <span className="mono">?source={ds.kind}</span></div>
    </aside>
  );
}
