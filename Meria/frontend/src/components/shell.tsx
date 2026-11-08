import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Sun, Moon, HelpCircle, X, Play, SkipForward, RotateCcw } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Badge, Kbd, ModeBadge, cx } from './ui';
import type { Screen, DirectorFlag } from '../data/types';

const nav: { to: string; match: string; label: string; tag: string }[] = [
  { to: '/modernize/import', match: '/modernize', label: 'Modernize', tag: 'M1–M5' },
  { to: '/operate', match: '/operate', label: 'Operate', tag: 'R1–R5' },
];
const keyRoutes: Record<string, string> = { '1': '/modernize/import', '2': '/modernize/recover', '3': '/modernize/generate', '4': '/modernize/test', '5': '/modernize/release', '6': '/operate', '7': '/operate/investigate', '8': '/operate/handoff' };

export function Shell({ children }: { children: ReactNode }) {
  const { state } = useStore();
  const nav$ = useNavigate();
  const loc = useLocation();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => { try { return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark'; } catch { return 'dark'; } });
  const [help, setHelp] = useState(false);
  const [director, setDirector] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('theme', theme); } catch { /* storage unavailable */ } }, [theme]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); setDirector((v) => !v); return; }
      if (e.key === '?') { setHelp((v) => !v); return; }
      if (e.key === 'Escape') { setHelp(false); setDirector(false); return; }
      if (e.key === 'h' || e.key === 'H') { nav$('/operate/handoff'); return; }
      if (keyRoutes[e.key]) nav$(keyRoutes[e.key]);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [nav$]);
  const screen: Screen | null = loc.pathname.startsWith('/read') ? 'read' : loc.pathname.startsWith('/find') ? 'find' : loc.pathname.startsWith('/prove') ? 'prove' : null;
  const legacy = screen !== null || loc.pathname.startsWith('/checks') || loc.pathname.startsWith('/handoff');
  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 h-[60px] flex items-center gap-6 px-5 lg:px-8 border-b hairline bg-surface z-10">
        <NavLink to="/" className="flex items-center gap-2.5 shrink-0" aria-label="The Gauntlet, home">
          <Logo />
          <span className="font-semibold tracking-[-0.02em] text-[15px] whitespace-nowrap hidden sm:inline">The Gauntlet</span>
        </NavLink>
        <nav className="flex items-center gap-1 min-w-0 overflow-x-auto" aria-label="Workflows">
          {nav.map(({ to, match, label, tag }) => {
            const active = loc.pathname.startsWith(match);
            return (
              <NavLink key={to} to={to} className={cx('tab h-9 px-3 inline-flex items-center gap-2 rounded-lg text-[13.5px] font-medium whitespace-nowrap t', active ? 'active text-text' : 'text-muted hover:text-text hover:bg-surface-2')}>
                {label}<span className="mono text-[10.5px] text-faint hidden md:inline">{tag}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {legacy ? <ModeBadge mode={state.mode} /> : <Badge title="Scripted demo on illustrative data. Legacy facts come from the public TTU repo.">Scripted demo</Badge>}
          <button className="h-9 w-9 grid place-items-center rounded-lg text-muted hover:text-text hover:bg-surface-2 t" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className="h-9 w-9 grid place-items-center rounded-lg text-muted hover:text-text hover:bg-surface-2 t" onClick={() => setHelp(true)} aria-label="Keyboard shortcuts"><HelpCircle size={16} /></button>
          <span className="h-8 w-8 ml-1 hidden sm:grid place-items-center rounded-full bg-surface-3 text-[11.5px] font-semibold" title="Maya R. · night shift">MR</span>
        </div>
      </header>
      <main className="flex-1 overflow-auto min-w-0"><div key={loc.pathname} className="enter px-5 lg:px-8 pt-10 pb-24">{children}</div></main>
      {help && (
        <div className="overlay fixed inset-0 bg-black/50 grid place-items-center z-50" onClick={() => setHelp(false)}>
          <div className="card p-6 w-[440px] shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
            <div className="flex items-center justify-between mb-4"><span className="font-semibold text-[15px]">Keyboard shortcuts</span><button className="text-muted hover:text-text" onClick={() => setHelp(false)} aria-label="Close"><X size={16} /></button></div>
            <table className="w-full text-[13px]"><tbody>
              {[['1–5', 'Modernize steps M1–M5'], ['6–8', 'Operate: alerts, investigate, hand off'], ['H', 'Handoff'], ['?', 'This panel'], ['Esc', 'Close']].map(([k, v]) => <tr key={k}><td className="py-1.5 w-32"><Kbd k={k} /></td><td className="text-muted">{v}</td></tr>)}
            </tbody></table>
          </div>
        </div>
      )}
      {director && <Director onClose={() => setDirector(false)} screen={screen} />}
      {!director && legacy && <button className="fixed bottom-4 right-4 text-[12px] text-muted hover:text-text px-3 h-8 inline-flex items-center gap-2 rounded-lg bg-surface border hairline t" onClick={() => setDirector(true)}>Director <Kbd k="Ctrl+Shift+D" /></button>}
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
    <aside className="fixed bottom-4 right-4 card p-4 w-[340px] z-40 shadow-[var(--shadow)]" role="dialog" aria-label="Director panel">
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

function Logo() {
  return (
    <span className="h-7 w-7 grid place-items-center rounded-lg bg-inverse text-inverse-ink">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.5l8 3.2v6.1c0 4.8-3.3 8.6-8 10.2-4.7-1.6-8-5.4-8-10.2V5.7z" /><path d="M8.5 12l2.5 2.5 4.5-5" />
      </svg>
    </span>
  );
}
