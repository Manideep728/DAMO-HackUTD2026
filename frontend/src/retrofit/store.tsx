// Retrofit setup state. Saved in this browser only (clear site data to restart the demo). No credentials.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import raw from './snapshot.json?raw';

/** The committed snapshot of the backend's canonical retrofit run (python -m app.retrofit.export). SYNTHETIC. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const S: any = JSON.parse(raw);

export const STEPS = ['Connect sources', 'Map the site', 'Select the CDU', 'Plan installation', 'Review mappings', 'Commission & hand over'];

export interface St {
  step: number; done: boolean;
  // 1 connect
  connected: boolean;
  // 2 map
  mapped: boolean; location: string | null; surveyVerified: boolean;
  // 3 select
  compared: boolean; cdu: string | null;
  // 4 plan
  planned: boolean; mopApproved: boolean; changeAuth: boolean;
  // 5 mappings
  drafted: boolean; mappingReviewed: boolean;
  // 6 commission & hand over
  offlineRun: boolean; witnessed: boolean; fixApproved: boolean; retested: boolean; regression: boolean;
  firmware: 'none' | 'flagged' | 'rerun' | 'approved'; accepted: boolean;
}
export const st0: St = {
  step: 0, done: false, connected: false, mapped: false, location: null, surveyVerified: false, compared: false, cdu: null,
  planned: false, mopApproved: false, changeAuth: false, drafted: false, mappingReviewed: false,
  offlineRun: false, witnessed: false, fixApproved: false, retested: false, regression: false, firmware: 'none', accepted: false,
};
/** What completes each step (and unlocks the next one). */
export const stepDone = (s: St) => [
  s.connected,
  s.mapped && !!s.location && s.surveyVerified,
  !!s.cdu,
  s.mopApproved && s.changeAuth,
  s.mappingReviewed,
  s.done,
];

const KEY = 'damo-retrofit-v2';
const load = (): St => { try { const v = localStorage.getItem(KEY); return v ? { ...st0, ...JSON.parse(v) } : st0; } catch { return st0; } };
const C = createContext<{ st: St; set: (p: Partial<St>) => void } | null>(null);
export function RetrofitProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<St>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* storage unavailable: progress won't persist */ } }, [st]);
  return <C.Provider value={{ st, set: (p) => setSt((s) => ({ ...s, ...p })) }}>{children}</C.Provider>;
}
export function useRetrofit() { const c = useContext(C); if (!c) throw new Error('RetrofitProvider missing'); return c; }
