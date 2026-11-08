import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Lock, Play, Sparkles, Rocket, Loader2, ArrowRight, ShieldAlert, GitCompare, Droplets, FileCode2 } from 'lucide-react';
import { cx } from '../components/ui';
import { cases, heldOut, type CaseResult } from '../modern/data';
import { useModern } from '../modern/store';
import { api, type LiveReport } from '../modern/api';
import { Num } from './motion';

type Phase = 'idle' | 'testing1' | 'failed' | 'repairing' | 'testing2' | 'passed' | 'released';
const DIMS: [Exclude<keyof CaseResult, 'note'>, string][] = [['missedExtra', 'Missed / extra'], ['severity', 'Severity'], ['timing', 'Timing'], ['recipient', 'Recipient'], ['recovery', 'Recovery']];
const TOTAL = cases.length * DIMS.length;

const repairLines = [
  'run_tests() → 5 of 6 visible cases failing, 3 held-out failing',
  'read failures: pages at +0 min, before the 4 × 1 min debounce',
  'read failures: routed to admins; owner map says hpc-ops-primary',
  'read failures: fan early warning missing (approved change d6)',
  'write_candidate(rules: for: 3m, FanStalledEarlyWarning; routes: owner matchers)',
  'promtool check rules ✓ · amtool check-config ✓',
];

export default function Verify() {
  const s = useModern();
  const [phase, setPhase] = useState<Phase>('idle');
  const [filled, setFilled] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [reports, setReports] = useState<Record<number, LiveReport>>({});
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const toolsLive = !!s.live && s.live.tools.promtool && s.live.tools.amtool;

  const version = phase === 'testing2' || phase === 'passed' || phase === 'released' ? 2 : 1;
  const live = reports[version];
  const result = (ci: number): CaseResult | undefined => {
    if (live) { const r = live.cases[ci]; return r ? { ...r.result, note: r.notes[0] } : undefined; }
    return version === 2 ? cases[ci].v2 : cases[ci].v1;
  };
  const passes = cases.filter((_, i) => { const r = result(i); return r && DIMS.every(([k]) => r[k] === 'pass'); }).length;
  const rowsDone = Math.min(cases.length, Math.floor(filled / DIMS.length));
  const passingSoFar = cases.slice(0, rowsDone).filter((_, i) => { const r = result(i); return r && DIMS.every(([k]) => r[k] === 'pass'); }).length;

  const sweep = (next: Phase) => { setFilled(0); for (let i = 1; i <= TOTAL; i++) later(() => setFilled(i), 45 * i); later(() => setPhase(next), 45 * TOTAL + 250); };
  const runTests = async (v: 1 | 2) => {
    setPhase(v === 1 ? 'testing1' : 'testing2');
    if (toolsLive) {
      try { const r = await api.test(v === 2 && s.liveData.agentCandidate ? 'agent' : `v${v}`, v === 2 ? s.liveData.agentCandidate ?? undefined : undefined); if (r.valid) setReports((x) => ({ ...x, [v]: r })); } catch { /* fall back to scripted results, labelled */ }
    }
    sweep(v === 1 ? 'failed' : 'passed');
  };
  const repair = () => {
    setPhase('repairing'); setLog([]);
    repairLines.forEach((l, i) => later(() => setLog((v) => [...v, l]), 520 * (i + 1)));
    later(() => runTests(2), 520 * (repairLines.length + 1));
  };
  const reset = () => { timers.current.forEach(clearTimeout); timers.current = []; setPhase('idle'); setFilled(0); setLog([]); setReports({}); };

  const shown = (ci: number, di: number) => filled > ci * DIMS.length + di;
  const allShown = filled >= TOTAL;
  const done = phase === 'passed' || phase === 'released';

  return (
    <div className="mx-auto w-full max-w-[1360px] -mt-4">
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <div className="text-[14px] text-muted mb-1.5">Verify a change</div>
          <h1 className="page-title">Prove the alarm path still works</h1>
          <p className="text-[14.5px] text-muted mt-2 max-w-[640px]">Old and new run on the same scenarios. The expectations and held-out cases are fixed before the change is written, so the model can't grade its own work.</p>
        </div>
        <div className="ml-auto flex gap-2">
          {phase === 'idle' && <Primary onClick={() => runTests(1)} icon={<Play size={17} />}>Run the tests</Primary>}
          {phase === 'failed' && <Primary onClick={repair} icon={<Sparkles size={17} />}>Repair with Nemotron</Primary>}
          {phase === 'passed' && <Primary onClick={() => setPhase('released')} icon={<Rocket size={17} />}>Approve and release v1.0.0</Primary>}
          {(phase === 'testing1' || phase === 'testing2' || phase === 'repairing') && <div className="h-12 px-5 rounded-xl border hairline inline-flex items-center gap-2 text-[14px] text-muted"><Loader2 size={16} className="animate-spin" />{phase === 'repairing' ? 'Nemotron is repairing…' : 'Running…'}</div>}
          {phase !== 'idle' && <button onClick={reset} className="h-12 px-4 rounded-xl border hairline text-[14px] hover:bg-surface-2 t">Reset</button>}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-5 items-start">
        <section className="card overflow-hidden min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 border-b hairline">
            <span className="text-[14px] font-semibold">Change: replace the TTU temperature check with Prometheus rules</span>
            <span className="mono text-[12px] text-muted">candidate v{version}</span>
            <span className={cx('ml-auto text-[14px] font-semibold num t', phase === 'idle' ? 'text-faint' : !allShown ? 'text-muted' : passes === cases.length ? 'text-ok' : 'text-critical')}>
              {phase === 'idle' ? 'not run' : <><Num value={allShown ? passes : passingSoFar} ms={250} />/{cases.length} cases pass{!allShown && <span className="text-faint font-normal"> · {rowsDone}/{cases.length} run</span>}</>}
            </span>
          </div>
          <div className="h-[2px] bg-surface-2 overflow-hidden">{(phase === 'testing1' || phase === 'testing2') && <div className="h-full bg-text seg-fill" style={{ width: `${(filled / TOTAL) * 100}%` }} />}{phase === 'repairing' && <div className="h-full w-1/3 bg-accent indeterminate" />}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] min-w-[640px]">
              <thead className="text-left border-b hairline"><tr><th className="th pl-5 h-10">Scenario</th>{DIMS.map(([, l]) => <th key={l} className="th text-center px-2 whitespace-nowrap">{l}</th>)}</tr></thead>
              <tbody>{cases.map((c, ci) => {
                const r = result(ci);
                const rowDone = DIMS.every((_, di) => shown(ci, di));
                return (
                  <tr key={c.id} className="border-b hairline last:border-0">
                    <td className="pl-5 py-3"><div className="font-medium">{c.name}</div><div className={cx('text-[12px] mt-0.5', rowDone && r?.note ? (DIMS.every(([k]) => r[k] === 'pass') ? 'text-ok' : 'text-critical') : 'text-faint')}>{rowDone && r?.note ? r.note : c.scenario}</div></td>
                    {DIMS.map(([k], di) => (
                      <td key={k} className="px-2 py-3 text-center">
                        <span className={cx('cell inline-grid place-items-center h-8 w-8 rounded-lg', !shown(ci, di) ? 'bg-surface-2' : r?.[k] === 'pass' ? 'bg-ok/15 text-ok cell-in' : 'bg-critical/15 text-critical cell-in')}>
                          {shown(ci, di) && (r?.[k] === 'pass' ? <Check size={16} strokeWidth={2.75} /> : <X size={16} strokeWidth={2.75} />)}
                        </span>
                      </td>))}
                  </tr>);
              })}</tbody>
            </table>
          </div>
          <div className="grid sm:grid-cols-2 border-t hairline">
            <div className="px-5 py-4 sm:border-r hairline">
              <div className="text-[12px] text-muted mb-2 flex items-center gap-1.5"><Lock size={12} /> Held-out, sealed from the agent</div>
              <div className="flex flex-wrap gap-1.5">{heldOut.map((h) => { const v = live ? live.held_out.find((x) => x.name === h.name)?.pass : (version === 2 ? h.v2 : h.v1) === 'pass'; return <span key={h.id} className={cx('h-7 px-2.5 rounded-lg text-[12px] inline-flex items-center gap-1 border', !allShown || phase === 'idle' ? 'border-border text-faint' : v ? 'border-ok/40 text-ok' : 'border-critical/40 text-critical')}>{allShown && phase !== 'idle' ? (v ? <Check size={12} /> : <X size={12} />) : <Lock size={11} />}{h.name}</span>; })}</div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[12px] text-muted mb-2 flex items-center gap-1.5"><ShieldAlert size={12} /> The suite must reject bad candidates</div>
              <div className="flex flex-wrap gap-1.5">{['Wrong recipient', 'Alert on everything'].map((n) => <span key={n} className={cx('h-7 px-2.5 rounded-lg text-[12px] inline-flex items-center gap-1 border', allShown && phase !== 'idle' ? 'border-ok/40 text-ok' : 'border-border text-faint')}>{allShown && phase !== 'idle' && <Check size={12} />}{n} rejected</span>)}</div>
            </div>
          </div>
          <div className="px-5 py-2.5 border-t hairline text-[12px] text-faint">{live ? `Live run: promtool + amtool, plugin ${live.plugin.some((p) => p.how === 'executed') ? 'executed' : 'modelled'} · ${live.elapsed_s} s` : 'Scripted results matching the harness unit test. Install the tools to run it live.'}</div>
        </section>

        <aside className="grid gap-4 min-w-0">
          {(phase === 'repairing' || log.length > 0) && (
            <div className="panel rounded-[16px] p-5">
              <div className="flex items-center gap-2 mb-3 text-[14px]">{phase === 'repairing' ? <Loader2 size={14} className="animate-spin text-[var(--panel-accent)]" /> : <Check size={14} className="text-[var(--panel-ok)]" />}<span className="font-semibold">Nemotron repair loop</span><span className="text-[var(--panel-muted)] text-[12px]">· scripted run</span></div>
              <ol className="grid gap-1.5 mono text-[12px]">{log.map((l) => <li key={l} className="flex gap-2 enter-row"><span className="text-[var(--panel-accent)]">›</span><span className="text-[var(--panel-text)]">{l}</span></li>)}</ol>
            </div>
          )}
          <div className="card">
            <div className="px-5 h-11 flex items-center gap-2 border-b hairline text-[14px] font-semibold"><GitCompare size={14} className="text-muted" /> What changed in v2</div>
            <pre className="m-0 p-4 text-[12px] leading-[1.7] overflow-x-auto">
{done || phase === 'testing2' ? <>{[
  ['ok', '+ for: 3m', '            # old check: 4 attempts × 1 min'],
  ['ok', '+ alert: FanStalledEarlyWarning', ''],
  ['ok', '+   expr: min(redfish_fan_rpm) == 0', ''],
  ['critical', '- receiver: admins', ''],
  ['ok', '+ receiver: hpc-ops-primary', '   # owner map'],
].map(([tone, code, note], i) => <span key={code} className="block type-in" style={{ animationDelay: `${i * 0.28}s` }}><span className={tone === 'ok' ? 'text-ok' : 'text-critical'}>{code}</span><span className="text-faint">{note}</span></span>)}</> : <span className="text-faint whitespace-normal font-sans text-[14px]">Run the tests, then let Nemotron repair the failures. The diff appears here.</span>}
            </pre>
          </div>
          {phase === 'released' ? (
            <div className="card p-5 border-ok/50">
              <div className="flex items-center gap-2 font-semibold"><Rocket size={16} className="text-ok" /> Released ttu-redfish-temperature v1.0.0</div>
              <p className="text-[14px] text-muted mt-1">Approved by the operations lead, with test evidence and a rollback plan. The old check keeps running until cutover.</p>
              <div className="flex flex-wrap gap-2 mt-3"><Link to="/" className="btn btn-primary h-10 px-4 rounded-lg inline-flex items-center gap-2 text-[14px] font-medium">Back to the console <ArrowRight size={15} /></Link><Link to="/modernize/import" className="h-10 px-4 rounded-lg border hairline inline-flex items-center gap-2 text-[14px] hover:bg-surface-2 t"><FileCode2 size={15} /> Full walkthrough</Link></div>
            </div>
          ) : (
            <div className="card p-5">
              <div className="text-[14px] font-semibold mb-1">Why this matters</div>
              <p className="text-[14px] text-muted leading-relaxed">Every firmware update, remapped point or ownership change can silently drop an alarm. Damo reruns the alarm paths and blocks the change until they pass.</p>
              <div className="text-[12.5px] text-faint mt-3 flex items-center gap-1.5"><Droplets size={13} /> Next: the same check for a coolant unit's leak alarm.</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Primary({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button onClick={onClick} className="btn btn-primary h-12 px-5 rounded-xl text-[15px] font-semibold inline-flex items-center gap-2">{icon}{children}</button>;
}
