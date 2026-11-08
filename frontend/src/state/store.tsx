import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { DataSource, EngineEvent, Finding, RuleCard, ReplaySummary, VerifyResult, Certificate, Handoff, PlaybackStep, Screen, Mode } from '../data/types';
import { MockDataSource } from '../data/MockDataSource';
import { ApiDataSource } from '../data/ApiDataSource';
import { qp } from '../lib/qp';

export interface StepState extends PlaybackStep { status: 'running' | 'done' | 'error'; startedAt: number; }
export interface State {
  mode: Mode; source: 'mock' | 'api';
  steps: Record<Screen, StepState[]>;
  ruleCard?: RuleCard; replay?: ReplaySummary; findings: Finding[];
  rulesYaml?: string; oneShot?: VerifyResult; gauntlet?: VerifyResult; rounds: { round: number; open: number }[];
  certificate?: Certificate; handoff?: Handoff;
  done: Record<Screen, boolean>;
}
const initial: State = { mode: 'mock', source: 'mock', steps: { read: [], find: [], prove: [] }, findings: [], rounds: [], done: { read: false, find: false, prove: false } };

function reducer(s: State, e: EngineEvent | { type: 'source'; source: 'mock' | 'api' }): State {
  switch (e.type) {
    case 'source': return { ...s, source: e.source };
    case 'mode': return { ...s, mode: e.mode };
    case 'reset': {
      const steps = { ...s.steps, [e.screen]: [] };
      const done = { ...s.done, [e.screen]: false };
      if (e.screen === 'read') return { ...s, steps, done, ruleCard: undefined };
      if (e.screen === 'find') return { ...s, steps, done, replay: undefined, findings: [] };
      return { ...s, steps, done, rulesYaml: undefined, oneShot: undefined, gauntlet: undefined, rounds: [], certificate: undefined };
    }
    case 'step': {
      const list = s.steps[e.screen].slice();
      const i = list.findIndex((x) => x.id === e.step.id);
      const next: StepState = { ...e.step, status: e.status, startedAt: i >= 0 ? list[i].startedAt : Date.now() };
      if (i >= 0) list[i] = next; else list.push(next);
      const done = { ...s.done };
      if (e.screen === 'read' && e.step.id === 'x0' && e.status === 'done') done.read = true;
      if (e.screen === 'find' && e.step.id.startsWith('f-') && e.status === 'done') done.find = true;
      return { ...s, steps: { ...s.steps, [e.screen]: list }, done };
    }
    case 'ruleCard': return { ...s, ruleCard: e.data };
    case 'statementVerified': {
      if (!s.ruleCard) return s;
      const statements = s.ruleCard.statements.map((st) => (st.id === e.statementId ? { ...st, verification: e.verification } : st));
      return { ...s, ruleCard: { ...s.ruleCard, statements } };
    }
    case 'replay': return { ...s, replay: e.data };
    case 'finding': {
      const i = s.findings.findIndex((f) => f.id === e.data.id);
      const findings = s.findings.slice(); if (i >= 0) findings[i] = e.data; else findings.push(e.data);
      return { ...s, findings };
    }
    case 'rules': return { ...s, rulesYaml: e.yaml };
    case 'verify': return e.data.candidate === 'one-shot' ? { ...s, oneShot: e.data } : { ...s, gauntlet: e.data, done: { ...s.done, prove: true } };
    case 'round': { const rounds = s.rounds.filter((r) => r.round !== e.round).concat({ round: e.round, open: e.open }).sort((a, b) => a.round - b.round); return { ...s, rounds }; }
    case 'certificate': return { ...s, certificate: e.data };
    case 'handoff': return { ...s, handoff: e.data };
    default: return s;
  }
}

const Ctx = createContext<{ state: State; ds: DataSource; user: string } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const wantApi = qp('source') === 'api';
  const ds = useMemo<DataSource>(() => (wantApi ? new ApiDataSource() : new MockDataSource()), [wantApi]);
  const [state, dispatch] = useReducer(reducer, { ...initial, source: wantApi ? 'api' : 'mock' });
  const inited = useRef(false);
  useEffect(() => {
    const off = ds.subscribe(dispatch);
    if (!inited.current && ds instanceof ApiDataSource) { inited.current = true; ds.init().then(() => ds.refreshHandoff()).catch(() => dispatch({ type: 'step', screen: 'read', step: { id: 'err', label: 'Backend unreachable. Start it with `make dev`, or use ?source=mock.' }, status: 'error' })); }
    if (ds instanceof MockDataSource) dispatch({ type: 'handoff', data: ds.getHandoff() });
    return off;
  }, [ds]);
  return <Ctx.Provider value={{ state, ds, user: 'Maya R.' }}>{children}</Ctx.Provider>;
}
export function useStore() { const c = useContext(Ctx); if (!c) throw new Error('StoreProvider missing'); return c; }
