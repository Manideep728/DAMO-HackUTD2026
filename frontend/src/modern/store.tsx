import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { decisions, opsScript } from './data';
import { api, type LiveStatus, type LiveReport } from './api';

export interface ModState {
  imported: boolean; recovered: boolean; decisions: Record<string, string | undefined>;
  generated: boolean; testRun: 0 | 1 | 2; repaired: boolean; reviewed: boolean; shadow: boolean; rollback: boolean; released: boolean;
}
export interface OpsState {
  step: number; playing: boolean; offline: boolean; alertWhileOffline: boolean;
  acked: string | null; investigated: boolean; noteShown: boolean; closeBlocked: boolean; woClosed: boolean;
  freshReading: string | null; recovered: boolean; handoffAccepted: string | null;
}
export interface Busy { key: string; log: string[] }

const mod0: ModState = { imported: false, recovered: false, decisions: {}, generated: false, testRun: 0, repaired: false, reviewed: false, shadow: false, rollback: false, released: false };
const ops0: OpsState = { step: 0, playing: false, offline: false, alertWhileOffline: false, acked: null, investigated: false, noteShown: false, closeBlocked: false, woClosed: false, freshReading: null, recovered: false, handoffAccepted: null };

export interface LiveData { reports: Record<string, LiveReport>; agentCandidate: { rules: string; alertmanager: string } | null; behaviors: { area: string; text: string; source: string }[]; questions: { question: string; critical: boolean }[]; hypotheses: unknown; opsState: Record<string, unknown> | null }
const live0: LiveData = { reports: {}, agentCandidate: null, behaviors: [], questions: [], hypotheses: null, opsState: null };

interface Ctx {
  mod: ModState; ops: OpsState; busy: Busy | null;
  live: LiveStatus | null; liveData: LiveData; setLive: (p: Partial<LiveData>) => void;
  setMod: (p: Partial<ModState>) => void; setOps: (p: Partial<OpsState>) => void;
  /** Run a scripted sequence: each line appears after `ms`, then `done` applies the result. */
  run: (key: string, lines: string[], done: () => void, ms?: number) => void;
  decide: (id: string, option: string) => void;
  criticalOpen: number; decisionsOpen: number;
  resetAll: () => void;
}
const C = createContext<Ctx | null>(null);

export function ModernProvider({ children }: { children: ReactNode }) {
  const [mod, setModS] = useState(mod0);
  const [ops, setOpsS] = useState(ops0);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [live, setLiveStatus] = useState<LiveStatus | null>(null);
  const [liveData, setLiveData] = useState<LiveData>(live0);
  const setLive = useCallback((p: Partial<LiveData>) => setLiveData((s) => ({ ...s, ...p })), []);
  useEffect(() => { api.status().then(setLiveStatus).catch(() => setLiveStatus(null)); }, []);
  const timers = useRef<number[]>([]);
  const setMod = useCallback((p: Partial<ModState>) => setModS((s) => ({ ...s, ...p })), []);
  const setOps = useCallback((p: Partial<OpsState>) => setOpsS((s) => ({ ...s, ...p })), []);
  const run = useCallback((key: string, lines: string[], done: () => void, ms = 650) => {
    setBusy({ key, log: [] });
    lines.forEach((l, i) => timers.current.push(window.setTimeout(() => setBusy((b) => (b && b.key === key ? { ...b, log: [...b.log, l] } : b)), ms * (i + 1))));
    timers.current.push(window.setTimeout(() => { done(); setBusy(null); }, ms * (lines.length + 1)));
  }, []);
  const decide = useCallback((id: string, option: string) => setModS((s) => ({ ...s, decisions: { ...s.decisions, [id]: option } })), []);
  const resetAll = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; setModS(mod0); setOpsS(ops0); setBusy(null); setLiveData(live0); }, []);

  // Ops scenario playback: reveal one event per tick until the script ends.
  useEffect(() => {
    if (!ops.playing || ops.step >= opsScript.length) return;
    const id = window.setTimeout(() => setOpsS((s) => {
      const step = s.step + 1;
      const alertNow = opsScript[step - 1]?.kind === 'alert';
      return { ...s, step, playing: step < opsScript.length, alertWhileOffline: s.alertWhileOffline || (alertNow && s.offline) };
    }), 1100);
    return () => clearTimeout(id);
  }, [ops.playing, ops.step]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const decisionsOpen = decisions.filter((d) => !mod.decisions[d.id]).length;
  const criticalOpen = decisions.filter((d) => d.critical && (!mod.decisions[d.id] || mod.decisions[d.id] === 'keep')).length;
  return <C.Provider value={{ mod, ops, busy, live, liveData, setLive, setMod, setOps, run, decide, criticalOpen, decisionsOpen, resetAll }}>{children}</C.Provider>;
}

export function useModern() { const c = useContext(C); if (!c) throw new Error('ModernProvider missing'); return c; }

/** Step completion for the M1–M5 stepper. */
export function modDone(m: ModState, d: { criticalOpen: number; decisionsOpen: number }) {
  return {
    m1: m.imported,
    m2: m.recovered && d.decisionsOpen === 0 && d.criticalOpen === 0,
    m3: m.generated,
    m4: m.testRun === 2,
    m5: m.released,
  };
}
