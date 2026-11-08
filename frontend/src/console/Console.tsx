import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellRing, Check, X, Droplets, Wrench, ShieldCheck, ArrowRight, RotateCcw, Radio, WifiOff, Thermometer, Fan, Copy, ClipboardCheck, Sparkles, Loader2, HeartPulse, Pause, Play, CircleDot } from 'lucide-react';
import { cx } from '../components/ui';
import { useModern } from '../modern/store';
import { AgentRun } from '../modern/Live';
import { Num, Clock } from './motion';
import {
  racks, c2, inletTemp, clock, autoFeed, evidence, hypotheses, type FeedItem, type Stage, type Rack, type RackState,
  FAN_STOP, EARLY_WARN, THERMAL_CRIT, OLD_PAGE, STALE_FROM, AUTO_END, MS_PER_MIN,
} from './engine';

const ORDER: Stage[] = ['watching', 'warned', 'acked', 'investigated', 'dispatched', 'recovered', 'handed-off'];
const LABEL: Record<Stage, string> = { watching: 'Watching', warned: 'Detected', acked: 'Acknowledged', investigated: 'Investigated', dispatched: 'Fixed', recovered: 'Recovered', 'handed-off': 'Handed off' };

export default function Console() {
  const s = useModern();
  const [m, setM] = useState(0);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<Stage>('watching');
  const [stamps, setStamps] = useState<Partial<Record<Stage, number>>>({});
  const [offline, setOffline] = useState(false);
  const [fixedAt, setFixedAt] = useState<number | null>(null);
  const [manual, setManual] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const [liveAgent, setLiveAgent] = useState(false);
  const [checks, setChecks] = useState(0);
  const [target, setTarget] = useState(AUTO_END);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const add = useCallback((it: FeedItem) => setManual((v) => [...v, it]), []);
  const go = useCallback((st: Stage, at: number) => { setStage(st); setStamps((x) => ({ ...x, [st]: at })); }, []);

  useEffect(() => {
    if (!running) return;
    if (m >= target) { setRunning(false); return; }
    const id = window.setTimeout(() => setM((x) => Math.min(target, x + 0.25)), MS_PER_MIN / 4);
    return () => clearTimeout(id);
  }, [running, m, target]);
  useEffect(() => { if (stage === 'watching' && m >= EARLY_WARN) go('warned', EARLY_WARN); }, [m, stage, go]);
  useEffect(() => { const id = window.setTimeout(() => setRunning(true), 600); return () => { clearTimeout(id); timers.current.forEach(clearTimeout); }; }, []);

  const feed = useMemo(() => [...autoFeed.filter((f) => f.m <= m), ...manual].sort((a, b) => a.m - b.m), [m, manual]);
  const cur = c2(m, fixedAt);
  const resolved = stage === 'recovered' || stage === 'handed-off';
  const crit = m >= THERMAL_CRIT && !resolved;
  const warned = m >= EARLY_WARN;

  const rackState = (r: Rack): RackState => {
    if (r.id === 'R13' && m >= STALE_FROM) return 'stale';
    if (r.id === 'R12') { if (resolved) return 'recovered'; if (m >= THERMAL_CRIT) return 'critical'; if (m >= FAN_STOP) return 'warning'; }
    return 'ok';
  };

  // ---------- one primary action at a time
  const acknowledge = () => { add({ m, kind: 'human', text: 'Acknowledged by Maya R. (duty operator). Escalation timer stopped.', tone: 'ok' }); go('acked', m); };
  const investigate = () => {
    if (s.live?.nemotron_key) { setLiveAgent(true); return; }
    setBusy('investigate'); setAgentLog([]);
    const lines = ['query_telemetry(hpc-c2, 02:00–02:15)', 'lookup_asset(hpc-c2) → R12 · U16, HPC Ops', 'search_runbook("single fan failure") → §3', 'compare_baseline() → no recent config change', 'propose_hypotheses() → 2, one unresolved'];
    lines.forEach((l, i) => later(() => setAgentLog((v) => [...v, l]), 360 * (i + 1)));
    later(() => { setBusy(null); go('investigated', m); add({ m, kind: 'agent', text: 'Nemotron: fan 4 failure likely; sensor fault unresolved. Next task: technician replaces fan 4.' }); }, 360 * (lines.length + 1));
  };
  const dispatch = () => {
    add({ m, kind: 'human', text: 'Ana P. (technician) dispatched to R12 · U16 with WO-1042.' });
    setBusy('dispatch'); setTarget(58); setRunning(true);
    later(() => {
      setFixedAt(58); setM(58); setRunning(false); setBusy(null); go('dispatched', 58);
      add({ m: 58, kind: 'human', text: 'Ana P.: fan 4 replaced. Her note corrects an earlier "fan 3"; the original is kept. Work order closed.' });
      add({ m: 58, kind: 'recovery', text: 'Work order closed; the incident stays open until recovery is verified.', tone: 'warning' });
    }, 1600);
  };
  const verify = () => {
    setBusy('verify'); setChecks(0);
    [1, 2, 3].forEach((n) => later(() => { setChecks(n); setM(58 + n); }, 600 * n));
    later(() => { setBusy(null); go('recovered', 61); add({ m: 61, kind: 'recovery', text: 'Recovery verified: fresh Redfish readings, Health OK on 3 consecutive evaluations.', tone: 'ok' }); }, 600 * 3 + 250);
  };
  const handoff = () => { add({ m: 61, kind: 'human', text: 'Handoff accepted by Dev K. (incoming shift).', tone: 'ok' }); go('handed-off', 61); };
  const replay = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setM(0); setStage('watching'); setStamps({}); setFixedAt(null); setManual([]); setBusy(null); setAgentLog([]); setLiveAgent(false); setChecks(0); setTarget(AUTO_END); setRunning(true);
  };

  const primary = (() => {
    if (busy) return null;
    switch (stage) {
      case 'warned': return { label: 'Acknowledge', icon: <Check size={18} />, run: acknowledge, hint: 'Stops escalation and takes ownership.' };
      case 'acked': return offline ? { label: 'Investigation needs Nemotron', icon: <WifiOff size={18} />, run: () => undefined, disabled: true, hint: 'Alerts, paging and work orders kept running without it.' } : { label: 'Investigate with Nemotron', icon: <Sparkles size={18} />, run: investigate, hint: 'Read-only tools: telemetry, asset map, runbook, baseline.' };
      case 'investigated': return { label: 'Dispatch technician', icon: <Wrench size={18} />, run: dispatch, hint: 'Owner comes from the directory, not the model.' };
      case 'dispatched': return { label: 'Verify recovery', icon: <HeartPulse size={18} />, run: verify, hint: 'A closed ticket is not proof. Take fresh readings.' };
      case 'recovered': return { label: 'Hand off to day shift', icon: <ClipboardCheck size={18} />, run: handoff, hint: 'Risks, work done, owner and next action.' };
      default: return null;
    }
  })();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Enter' && primary && !primary.disabled && !(e.target as HTMLElement).closest('button,a,input,summary')) { e.preventDefault(); primary.run(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  return (
    <div className="mx-auto w-full max-w-[1360px] -mt-5">
      {/* Status ribbon */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-5">
        <span className="mono text-[38px] font-semibold tracking-[-0.04em] leading-none num"><Clock text={clock(m)} /></span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[14px] font-medium">
            {!warned ? <><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-60 animate-ping" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ok" /></span>Watching Hall 1</>
              : resolved ? <><Check size={16} className="text-ok" />INC-1042 resolved</>
                : <><span className={cx('h-2.5 w-2.5 rounded-full', crit ? 'bg-critical' : 'bg-warning')} />INC-1042 · {crit ? 'Critical' : 'Warning'} on Compute2</>}
          </div>
          <div className="text-[12.5px] text-faint">Night shift · scripted night, illustrative data</div>
        </div>
        {warned && (m >= OLD_PAGE
          ? <span key="lead" className="h-8 px-3 rounded-full bg-ok/12 text-ok text-[13px] font-semibold inline-flex items-center gap-1.5 pop-in">Warned 6 min before the old check</span>
          : <span key="silent" className="h-8 px-3 rounded-full bg-surface-2 text-muted text-[13px] font-medium inline-flex items-center gap-1.5 pop-in">Damo paged at 02:07 · old check still silent</span>)}
        <div className="ml-auto flex items-center gap-2">
          <Link to="/verify" className="h-9 px-3 rounded-lg border border-border hover:bg-surface-2 text-[13px] inline-flex items-center gap-2 t"><ShieldCheck size={15} className="text-ok" /> 6/6 alarm paths verified</Link>
          <button onClick={() => setOffline((v) => !v)} className={cx('h-9 px-3 rounded-lg border text-[13px] font-medium inline-flex items-center gap-2 t', offline ? 'border-warning/60 text-warning bg-warning/10' : 'border-border hover:bg-surface-2')} title="Alerting never depends on the model">
            <span className={cx('switch', offline ? 'bg-warning/70' : 'bg-ok')} data-on={!offline} aria-hidden /> Nemotron {offline ? 'offline' : 'online'}
          </button>
          {(stage === 'watching' || (stage === 'warned' && running)) && <button onClick={() => setRunning((v) => !v)} className="h-9 w-9 grid place-items-center rounded-lg border border-border hover:bg-surface-2 t" aria-label={running ? 'Pause' : 'Play'}>{running ? <Pause size={15} /> : <Play size={15} />}</button>}
          <button onClick={replay} className="h-9 w-9 grid place-items-center rounded-lg border border-border hover:bg-surface-2 t" aria-label="Replay" title="Replay the night"><RotateCcw size={15} /></button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-5 items-start">
        {/* Hall */}
        <section className="panel rounded-[18px] p-4 sm:p-5 order-2 lg:order-none">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-semibold text-[14px]">Hall 1</span>
            <span className="text-[12px] text-[var(--panel-muted)] hidden sm:inline">32 racks · inlet °C</span>
            <div className="ml-auto flex flex-wrap justify-end items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--panel-muted)]">
              <Legend c="var(--warning)" l="Warning" /><Legend c="var(--critical)" l="Critical" /><Legend hatch l="Stale" /><Legend c="var(--panel-accent)" l="Liquid" />
            </div>
          </div>
          <div className="relative grid gap-2">
            {running && <span key={Math.floor(m)} className="scan-line" aria-hidden />}
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {racks.filter((r) => r.row === row).map((r) => <RackTile key={r.id} r={r} m={m} state={rackState(r)} cpu={r.id === 'R12' && m >= FAN_STOP ? cur.temp : null} />)}
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-[var(--panel-border)]">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[13px] font-medium">Compute2 · R12 · U16</span>
              <span className="mono text-[12px] text-[var(--panel-muted)] ml-auto num inline-flex items-center gap-3">
                <span className={cx('inline-flex items-center gap-1 t', cur.temp > 80 && 'text-[var(--critical)]')}><Thermometer size={12} /><Num value={cur.temp} /> °C</span>
                <span className={cx('inline-flex items-center gap-1', cur.fan < 100 && 'text-[var(--warning)]')}><Fan size={12} className={cur.fan > 100 ? 'animate-spin [animation-duration:1.4s]' : ''} /><Num value={cur.fan} ms={700} /> rpm</span>
              </span>
            </div>
            <Chart m={m} fixedAt={fixedAt} />
          </div>
        </section>

        {/* The repeated use case: one incident, one next action */}
        <section className="grid gap-4 order-1 lg:order-none">
          {!warned ? <Quiet m={m} /> : (
            <div className={cx('card overflow-hidden pop-in', crit ? 'border-critical/50' : resolved ? 'border-ok/50' : 'border-warning/60')}>
              <div className="px-5 pt-5">
                <div className="flex items-center gap-2 mb-2 text-[12px]">
                  <span className={cx('sev px-2 h-[22px] inline-flex items-center rounded-md', crit ? 'bg-critical/15 text-critical' : resolved ? 'bg-ok/15 text-ok' : 'bg-warning/15 text-warning')}>{crit ? 'Critical' : resolved ? 'Resolved' : 'Warning'}</span>
                  <span className="mono text-muted">INC-1042</span><span className="text-faint">·</span><span className="text-muted">R12 · U16</span>
                  <span className="ml-auto text-muted">owner <span className="text-text">HPC Ops</span></span>
                </div>
                <h2 className="text-[22px] font-semibold tracking-[-0.02em] leading-snug">{m >= THERMAL_CRIT ? 'CPU overheating on Compute2' : 'Fan 4 stalled on Compute2'}</h2>
                <p className="text-[13.5px] text-muted mt-1">{resolved ? 'Fan 4 replaced and recovery verified with fresh readings.' : m >= THERMAL_CRIT ? 'Fan 4 stopped at 02:06. Damo paged at 02:07, before the heat. The BMC reports Critical now.' : 'Fan 4 reads 0 RPM. The CPU is still OK, so the old check sees nothing yet.'}</p>
              </div>

              <Steps stage={stage} stamps={stamps} />

              <div key={stage} className="px-5 pb-5 grid gap-3 stage-in">
                {stage === 'warned' && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                    <span className="text-muted mr-1">Paged</span><Chip bad className="chip-fail">Luis O. · 503</Chip><ArrowRight size={13} className="text-faint draw-in" style={{ animationDelay: '.75s' }} /><Chip good className="pop-in" style={{ animationDelay: '1s' }}>Priya N. · delivered</Chip><span className="text-faint ml-1 pop-in" style={{ animationDelay: '1.3s' }}>· WO-1042 opened</span>
                  </div>
                )}

                {(busy === 'investigate' || (stage === 'acked' && agentLog.length > 0)) && !liveAgent && (
                  <div className="rounded-xl panel p-3.5">
                    <div className="text-[12px] text-[var(--panel-muted)] mb-2 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin text-[var(--panel-accent)]" /> Nemotron is calling tools <span className="opacity-70">· scripted run</span></div>
                    <ol className="grid gap-1 mono text-[12px]">{agentLog.map((l) => <li key={l} className="flex gap-2 enter-row"><span className="text-[var(--panel-accent)]">›</span>{l}</li>)}</ol>
                  </div>
                )}
                {liveAgent && stage === 'acked' && <AgentRun job="investigate" title="Nemotron investigating" onDone={(e) => { if (e.type === 'done') { go('investigated', m); add({ m, kind: 'agent', text: 'Nemotron (live): investigation complete.' }); } else { setLiveAgent(false); investigate(); } }} />}

                {stage === 'investigated' && (
                  <div className="grid gap-2">
                    {hypotheses.map((h) => (
                      <div key={h.title} className="rounded-xl border hairline p-3.5">
                        <div className="flex items-center gap-2"><span className="font-medium text-[13.5px] flex-1">{h.title}</span><span className={cx('text-[11.5px] px-2 h-[20px] inline-flex items-center rounded-md border', h.confidence === 'Likely' ? 'border-warning/50 text-warning' : 'border-border text-muted')}>{h.confidence}</span></div>
                        <div className="text-[12.5px] text-muted mt-1">{h.note} <span className="mono text-faint">cites {h.cites}</span></div>
                      </div>
                    ))}
                    <details className="text-[12.5px]"><summary className="cursor-pointer text-muted hover:text-text">Evidence ({evidence.length})</summary>
                      <ul className="grid gap-1 mt-2">{evidence.map((e) => <li key={e.id} className="flex gap-2"><span className="mono text-faint w-5">{e.id}</span><span className="flex-1">{e.text}</span><span className="text-faint">{e.src}</span></li>)}</ul>
                    </details>
                  </div>
                )}

                {(stage === 'dispatched' || busy === 'verify') && (
                  <div className="rounded-xl border hairline p-3.5">
                    <div className="text-[12.5px] text-muted mb-2">WO-1042 closed by Ana P. at 02:58. The incident stays open until fresh readings pass.</div>
                    <div className="flex gap-2">{[1, 2, 3].map((n) => <span key={n} className={cx('flex-1 h-9 rounded-lg grid place-items-center text-[12.5px] mono border t', checks >= n ? 'border-ok/50 bg-ok/10 text-ok cell-in' : 'border-border text-faint')}>{checks >= n ? <span className="inline-flex items-center gap-1"><Check size={13} /> OK</span> : `reading ${n}`}</span>)}</div>
                  </div>
                )}

                {stage === 'recovered' && <div className="text-[13px] text-muted">Handoff packet ready: open risk (sensor fault not ruled out, watch 24 h), work done, owner HPC Ops, next action: fix the primary pager receiver.</div>}
                {stage === 'handed-off' && (
                  <div className="rounded-xl border border-ok/40 bg-ok/[0.06] p-3.5 text-[13px] grid gap-1 pop-in">
                    <div className="font-medium flex items-center gap-1.5"><ClipboardCheck size={14} className="text-ok" /> Accepted by Dev K., incoming shift</div>
                    <div className="text-muted">Open risk: sensor fault not ruled out, watch hpc-c2 for 24 h. Next: fix the primary pager receiver (503).</div>
                  </div>
                )}

                {primary && (
                  <div className="grid gap-1.5">
                    <button onClick={primary.run} disabled={primary.disabled} className="btn btn-primary h-12 rounded-xl text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                      {primary.icon}{primary.label}<span className="kbd !bg-transparent !text-inverse-ink !border-inverse-ink/25 opacity-70 ml-1">Enter</span>
                    </button>
                    <span className="text-[12px] text-faint text-center">{primary.hint}</span>
                  </div>
                )}
                {busy === 'dispatch' && <div className="h-12 rounded-xl border hairline grid place-items-center text-[13.5px] text-muted"><span className="inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Technician on site · fast-forwarding to 02:58</span></div>}
                {stage === 'handed-off' && <button onClick={replay} className="h-11 rounded-xl border hairline text-[14px] font-medium inline-flex items-center justify-center gap-2 hover:bg-surface-2 t"><RotateCcw size={15} /> Replay the night</button>}
              </div>
            </div>
          )}

          <Race m={Math.min(m, 16)} />
        </section>
      </div>

      <section className="mt-5 card">
        <div className="px-5 h-11 flex items-center gap-2 border-b hairline"><BellRing size={14} className="text-muted" /><span className="font-semibold text-[13px]">Event log</span><span className="text-[12px] text-faint ml-auto hidden sm:inline">rules, paging and work orders never call the model</span></div>
        <ol className="max-h-[220px] overflow-auto divide-y divide-[var(--border)]">
          {feed.length === 0 && <li className="px-5 py-3 text-[13px] text-muted">Watching. Readings are evaluated every minute.</li>}
          {[...feed].reverse().map((f, i) => (
            <li key={`${f.m}-${f.text.slice(0, 24)}`} className={cx('px-5 py-2.5 flex items-start gap-3 text-[13px]', i === 0 ? 'fresh-row' : '')}>
              <span className="mono text-[12px] text-faint w-11 shrink-0 pt-0.5">{clock(f.m)}</span>
              <FeedIcon k={f.kind} tone={f.tone} />
              <span className={cx('flex-1', f.tone === 'muted' && 'text-muted')}>{f.text}</span>
            </li>))}
        </ol>
      </section>
    </div>
  );
}

function Quiet({ m }: { m: number }) {
  const rows = [
    { id: 'hpc-c1', host: 'Compute1', t: 58 + Math.sin(m) * 0.8, fan: 9420, fresh: true },
    { id: 'hpc-c2', host: 'Compute2', t: c2(m, null).temp, fan: c2(m, null).fan, fresh: true },
    { id: 'hpc-c3', host: 'Compute3', t: 60 + Math.cos(m) * 0.6, fan: 9380, fresh: m < STALE_FROM },
  ];
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1"><span className="font-semibold text-[16px]">All quiet</span><span className="text-[12px] text-faint ml-auto">readings every minute</span></div>
      <p className="text-[13px] text-muted mb-4">Deterministic rules evaluate every reading. Nemotron is only called when something needs a person.</p>
      <div className="grid gap-2">{rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 rounded-xl border hairline px-3.5 py-2.5 text-[13px]">
          <span className={cx('h-2 w-2 rounded-full', r.fresh ? (r.fan < 100 ? 'bg-warning' : 'bg-ok') : 'bg-faint')} />
          <span className="font-medium w-[86px]">{r.host}</span>
          <span className="mono num text-muted">{r.fresh ? `${r.t.toFixed(0)} °C` : '— °C'}</span>
          <span className={cx('mono num', r.fresh && r.fan < 100 ? 'text-warning' : 'text-muted')}>{r.fresh ? `${Math.round(r.fan)} rpm` : '— rpm'}</span>
          <span className={cx('ml-auto text-[12px]', r.fresh ? 'text-faint' : 'text-warning')}>{r.fresh ? 'fresh' : 'stale, not healthy'}</span>
        </div>))}
      </div>
    </div>
  );
}

/** Two lanes, one fault: when each monitor reaches a person. */
function Race({ m }: { m: number }) {
  const W = 16, x = (v: number) => `${(v / W) * 100}%`;
  return (
    <div className="card p-5">
      <div className="flex items-center mb-4"><span className="text-[13px] font-semibold">Same fault, two monitors</span><span className="ml-auto mono text-[12px] text-faint">02:00 → 02:16</span></div>
      {[{ name: 'Damo', at: EARLY_WARN, who: 'pages the owner', color: 'bg-ok', text: 'text-ok' }, { name: 'Old Nagios check', at: OLD_PAGE, who: 'pages nagios@localhost', color: 'bg-legacy', text: 'text-legacy' }].map((lane) => (
        <div key={lane.name} className="mb-4 last:mb-0">
          <div className="flex items-baseline gap-2 mb-1.5 text-[12.5px]"><span className={cx('font-medium', lane.text)}>{lane.name}</span><span className="text-faint">{m >= lane.at ? `${clock(lane.at)} · ${lane.who}` : 'waiting…'}</span></div>
          <div className="relative h-2 rounded-full bg-surface-2">
            <div className={cx('absolute inset-y-0 left-0 rounded-full t', lane.color, m >= lane.at ? 'opacity-70' : 'opacity-25')} style={{ width: x(Math.min(m, lane.at)) }} />
            <span className="absolute -top-1 h-4 w-[2px] bg-text/30" style={{ left: x(FAN_STOP) }} title="fan stopped" />
            {m >= lane.at && <span className={cx('absolute -top-[5px] h-[18px] w-[18px] -ml-[9px] rounded-full border-2 border-[var(--surface)] pop-in', lane.color)} style={{ left: x(lane.at) }} />}
          </div>
        </div>
      ))}
      <div className="text-[12px] text-faint mt-3">{m >= OLD_PAGE ? <><span className="text-text font-medium">6 minutes</span> between the two pages. The tick marks 02:06, when fan 4 stopped.</> : 'The tick marks 02:06, when fan 4 stopped.'}</div>
    </div>
  );
}

function Legend({ c, l, hatch }: { c?: string; l: string; hatch?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cx('h-2.5 w-2.5 rounded-sm', hatch && 'hatch-panel')} style={c ? { background: c } : undefined} />{l}</span>;
}

function RackTile({ r, m, state, cpu }: { r: Rack; m: number; state: RackState; cpu: number | null }) {
  const t = inletTemp(r, m);
  const heat = Math.max(0, Math.min(1, (t - 23.3) / 1.0)); // only the warmest racks pick up a faint tint
  return (
    <div tabIndex={0} className={cx('rack relative rounded-lg px-2 py-2 outline-none', `rack-${state}`, r.liquid && 'rack-liquid')} style={state === 'ok' ? { ['--heat' as string]: `${Math.round(heat * 16)}%` } : undefined} aria-label={`Rack ${r.id}, ${state}`}>
      <div className="rack-tip panel rounded-lg px-2.5 py-1.5 text-[11.5px] leading-snug">
        <div className="font-semibold">{r.id}{r.liquid ? ' · liquid-cooled (CDU-1)' : ''}</div>
        <div className="text-[var(--panel-muted)]">{state === 'stale' ? 'Compute3: no sample since 02:04 · not healthy' : cpu !== null && state !== 'recovered' ? `Compute2 CPU ${cpu.toFixed(0)} °C · fan 4 stopped` : `Inlet ${t.toFixed(1)} °C · ${state === 'ok' ? 'OK' : state}`}</div>
        {r.assets && <div className="text-[var(--panel-muted)]">{r.assets.join(', ')}</div>}
      </div>
      <div className="flex items-center justify-between text-[10.5px] mono opacity-70"><span>{r.id}</span>{r.liquid ? <Droplets size={10} /> : r.assets ? <CircleDot size={10} /> : null}</div>
      {cpu !== null && state !== 'recovered'
        ? <div className="mono text-[15px] font-bold num mt-1 leading-none"><Num value={cpu} />°<span className="text-[9.5px] font-medium opacity-80 ml-0.5">CPU</span></div>
        : <div className="mono text-[15px] font-semibold num mt-1 leading-none">{state === 'stale' ? '—' : <Num value={t} digits={1} ms={600} />}</div>}
      {state === 'critical' && <span className="absolute -inset-[3px] rounded-[10px] border-2 border-[var(--critical)] ring-pulse pointer-events-none" />}
    </div>
  );
}

function Chart({ m, fixedAt }: { m: number; fixedAt: number | null }) {
  const W = 640, H = 118, P = 6, maxM = Math.max(16, Math.ceil(m) + 1);
  const pts = Array.from({ length: Math.floor(m * 2) + 1 }, (_, i) => i / 2);
  const X = (x: number) => P + (x / maxM) * (W - 2 * P);
  const Yt = (v: number) => H - P - ((v - 50) / 50) * (H - 2 * P);
  const Yf = (v: number) => H - P - (v / 10000) * (H - 2 * P) * 0.85;
  const tl = pts.map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Yt(c2(x, fixedAt).temp).toFixed(1)}`).join('');
  const fl = pts.map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Yf(c2(x, fixedAt).fan).toFixed(1)}`).join('');
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[118px]" preserveAspectRatio="none" role="img" aria-label="CPU temperature and fan speed on Compute2">
          <line x1={P} x2={W - P} y1={Yt(85)} y2={Yt(85)} stroke="var(--panel-border)" strokeDasharray="2 4" />
          {m >= EARLY_WARN && <line x1={X(EARLY_WARN)} x2={X(EARLY_WARN)} y1={0} y2={H} stroke="var(--panel-ok)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          {m >= OLD_PAGE && <line x1={X(OLD_PAGE)} x2={X(OLD_PAGE)} y1={0} y2={H} stroke="var(--panel-muted)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          <path d={`${tl}L${X(pts[pts.length - 1]).toFixed(1)} ${H}L${X(0)} ${H}Z`} fill="var(--critical)" opacity="0.08" />
          <path d={fl} fill="none" stroke="var(--panel-accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          <path d={tl} fill="none" stroke="var(--critical)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        </svg>
        <Head x={X(pts[pts.length - 1]) / W} y={Yt(c2(pts[pts.length - 1], fixedAt).temp) / H} color="var(--critical)" />
        <Head x={X(pts[pts.length - 1]) / W} y={Yf(c2(pts[pts.length - 1], fixedAt).fan) / H} color="var(--panel-accent)" />
        {m >= EARLY_WARN && <span className="absolute top-0 whitespace-nowrap text-[10.5px] mono text-[var(--panel-ok)] bg-[var(--panel)] px-1 -translate-x-1/2 pop-in" style={{ left: `${(X(EARLY_WARN) / W) * 100}%` }}>Damo 02:07</span>}
        {m >= OLD_PAGE && <span className="absolute bottom-0 whitespace-nowrap text-[10.5px] mono text-[var(--panel-muted)] bg-[var(--panel)] px-1 -translate-x-1/2 pop-in" style={{ left: `${(X(OLD_PAGE) / W) * 100}%` }}>old check 02:13</span>}
      </div>
      <div className="flex gap-4 text-[11.5px] text-[var(--panel-muted)] mt-1.5"><span className="inline-flex items-center gap-1.5"><span className="w-3 h-[2px] bg-[var(--critical)]" />CPU1 °C</span><span className="inline-flex items-center gap-1.5"><span className="w-3 h-[2px] bg-[var(--panel-accent)]" />fan 4 rpm</span><span className="ml-auto mono">02:00 → {clock(maxM)}</span></div>
    </div>
  );
}

function Steps({ stage, stamps }: { stage: Stage; stamps: Partial<Record<Stage, number>> }) {
  const list = ORDER.slice(1);
  const idx = ORDER.indexOf(stage);
  return (
    <ol className="grid grid-cols-6 gap-1.5 px-5 py-4">
      {list.map((st, i) => {
        const done = idx >= i + 1, now = idx === i + 1;
        return (
          <li key={st} className="min-w-0">
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden"><div className={cx('h-full rounded-full seg-fill', now ? 'bg-text' : 'bg-text/70')} style={{ width: done ? '100%' : '0%' }} /></div>
            <div className={cx('mt-1.5 text-[11px] truncate', now ? 'text-text font-medium' : done ? 'text-muted' : 'text-faint')}>{LABEL[st]}</div>
            <div className="text-[10.5px] mono text-faint h-3.5">{stamps[st] !== undefined ? clock(stamps[st] as number) : ''}</div>
          </li>
        );
      })}
    </ol>
  );
}

function Chip({ children, good, bad, className, style }: { children: React.ReactNode; good?: boolean; bad?: boolean; className?: string; style?: React.CSSProperties }) {
  return <span style={style} className={cx('inline-flex items-center gap-1 h-6 px-2 rounded-md text-[12px] border', good && 'border-ok/40 text-ok bg-ok/[0.06]', bad && 'border-critical/40 text-critical bg-critical/[0.06]', className)}>{good ? <Check size={12} /> : bad ? <X size={12} /> : null}{children}</span>;
}

function FeedIcon({ k, tone }: { k: FeedItem['kind']; tone?: FeedItem['tone'] }) {
  const I = { telemetry: Thermometer, alert: Bell, delivery: Radio, dedupe: Copy, workorder: Wrench, human: Check, agent: Sparkles, recovery: ShieldCheck }[k];
  return <I size={15} className={cx('shrink-0 mt-0.5', tone === 'critical' ? 'text-critical' : tone === 'ok' ? 'text-ok' : tone === 'warning' ? 'text-warning' : 'text-muted')} aria-hidden />;
}


/** Pulsing dot at the head of a live line (positioned in HTML so it stays round on a stretched SVG). */
function Head({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <span className="absolute pointer-events-none" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      <span className="absolute -left-[4px] -top-[4px] h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="absolute -left-[4px] -top-[4px] h-2 w-2 rounded-full animate-ping" style={{ background: color, opacity: 0.6 }} />
    </span>
  );
}
