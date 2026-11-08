import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bell, BellRing, Check, X, Wrench, ShieldCheck, ArrowRight, RotateCcw, Radio, WifiOff, Thermometer, Fan, Copy, ClipboardCheck, Sparkles, Loader2, HeartPulse, Pause, Play, CircleDot, Zap, Snowflake, ChevronRight, FastForward } from 'lucide-react';
import { cx } from '../components/ui';
import { useModern } from '../modern/store';
import { AgentRun } from '../modern/Live';
import { pf } from '../preflight/api';
import { Num, Clock } from './motion';
import LowFlow from './LowFlow';
import {
  racks, c2, inletTemp, clock, autoFeed, evidence, hypotheses, type FeedItem, type Stage, type Rack, type RackState,
  FAN_STOP, EARLY_WARN, THERMAL_CRIT, OLD_PAGE, STALE_FROM, AUTO_END, MS_PER_MIN, HALL, INCIDENT_RACK, STALE_RACK, FALLBACK_FEEDS,
} from './engine';

const ORDER: Stage[] = ['watching', 'warned', 'acked', 'investigated', 'dispatched', 'recovered', 'handed-off'];
const LABEL: Record<Stage, string> = { watching: 'Watching', warned: 'Detected', acked: 'Acknowledged', investigated: 'Investigated', dispatched: 'Fixed', recovered: 'Recovered', 'handed-off': 'Handed off' };
type Feeds = Record<string, { power: string[]; cooling: string[] }>;
const preflightLink = (id: string) => `/preflight?focus=${encodeURIComponent(id)}`;

/** What feeds each rack, read from the same facility model Preflight simulates (falls back to the demo wiring). */
function useFeeds(): Feeds {
  const [feeds, setFeeds] = useState<Feeds>({});
  useEffect(() => {
    let live = true;
    pf.facility().then((f) => {
      const out: Feeds = {};
      for (const e of f.edges) {
        if (!racks.some((r) => r.id === e.consumer)) continue;
        const x = (out[e.consumer] ??= { power: [], cooling: [] });
        (e.resource === 'cooling' ? x.cooling : x.power).push(e.supplier);
      }
      if (live) setFeeds(out);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return feeds;
}
const feedsOf = (feeds: Feeds, id: string) => feeds[id] ?? (id.startsWith('R1') ? FALLBACK_FEEDS : { power: ['PDU-A2', 'PDU-B2'], cooling: ['CRAH-3', 'CRAH-4'] });

function FanStallNight() {
  const s = useModern();
  const feeds = useFeeds();
  const [m, setM] = useState(0);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<Stage>('watching');
  const [stamps, setStamps] = useState<Partial<Record<Stage, number>>>({});
  const [skipped, setSkipped] = useState(false);
  const [offline, setOffline] = useState(false);
  const [fixedAt, setFixedAt] = useState<number | null>(null);
  const [manual, setManual] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const [liveAgent, setLiveAgent] = useState(false);
  const [checks, setChecks] = useState(0);
  const [target, setTarget] = useState(AUTO_END);
  const [rack, setRack] = useState(INCIDENT_RACK);
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
  const inc = feedsOf(feeds, INCIDENT_RACK);

  const rackState = (r: Rack): RackState => {
    if (r.id === STALE_RACK && m >= STALE_FROM) return 'stale';
    if (r.id === INCIDENT_RACK) { if (resolved) return 'recovered'; if (m >= THERMAL_CRIT) return 'critical'; if (m >= FAN_STOP) return 'warning'; }
    return 'ok';
  };

  // ---------- one primary action at a time; the model is never a gate
  const acknowledge = () => { add({ m, kind: 'human', text: 'Acknowledged by Maya R. (duty operator). Escalation timer stopped.', tone: 'ok' }); go('acked', m); };
  const investigate = () => {
    if (s.live?.nemotron_key) { setLiveAgent(true); return; }
    setBusy('investigate'); setAgentLog([]);
    const lines = ['query_telemetry(hpc-c2, 02:00–02:15)', `lookup_asset(hpc-c2) → ${INCIDENT_RACK} · U16, HPC Ops`, `get_feeds(${INCIDENT_RACK}) → ${[...inc.power, ...inc.cooling].join(', ')} in service`, 'search_runbook("single fan failure") → §3', 'propose_hypotheses() → 2, one unresolved'];
    lines.forEach((l, i) => later(() => setAgentLog((v) => [...v, l]), 360 * (i + 1)));
    later(() => { setBusy(null); go('investigated', m); add({ m, kind: 'agent', text: 'Nemotron: fan 4 failure likely; sensor fault unresolved. Next task: technician replaces fan 4.' }); }, 360 * (lines.length + 1));
  };
  const dispatch = () => {
    if (stage === 'acked') { setSkipped(true); add({ m, kind: 'human', text: offline ? 'Investigation skipped: Nemotron offline. Dispatching from the directory.' : 'Investigation skipped by the operator.', tone: 'muted' }); }
    add({ m, kind: 'human', text: `Ana P. (technician) dispatched to ${INCIDENT_RACK} · U16 with WO-1042.` });
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
    setM(0); setStage('watching'); setStamps({}); setSkipped(false); setFixedAt(null); setManual([]); setBusy(null); setAgentLog([]); setLiveAgent(false); setChecks(0); setTarget(AUTO_END); setRack(INCIDENT_RACK); setRunning(true);
  };

  type Action = { label: string; icon: React.ReactNode; run: () => void; hint: string; alt?: { label: string; run: () => void } };
  const primary: Action | null = (() => {
    if (busy) return null;
    switch (stage) {
      case 'warned': return { label: 'Acknowledge', icon: <Check size={20} />, run: acknowledge, hint: 'Stops escalation and takes ownership.' };
      case 'acked': return offline
        ? { label: 'Dispatch technician', icon: <Wrench size={20} />, run: dispatch, hint: 'Owner and location come from the directory, not the model.' }
        : { label: 'Investigate with Nemotron', icon: <Sparkles size={20} />, run: investigate, hint: 'Optional. Read-only tools: telemetry, asset map, feeds, runbook.', alt: { label: 'Skip, dispatch now', run: dispatch } };
      case 'investigated': return { label: 'Dispatch technician', icon: <Wrench size={20} />, run: dispatch, hint: 'Owner and location come from the directory, not the model.' };
      case 'dispatched': return { label: 'Verify recovery', icon: <HeartPulse size={20} />, run: verify, hint: 'A closed ticket is not proof. Take fresh readings.' };
      case 'recovered': return { label: 'Hand off to day shift', icon: <ClipboardCheck size={20} />, run: handoff, hint: 'Risks, work done, owner and next action.' };
      default: return null;
    }
  })();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Enter' && primary && !(e.target as HTMLElement).closest('button,a,input,summary')) { e.preventDefault(); primary.run(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  return (
    <div className="mx-auto w-full max-w-[1360px] -mt-6">
      {/* Status ribbon: time, state, controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
        <span className="mono text-[32px] font-semibold tracking-[-0.04em] leading-none num"><Clock text={clock(m)} /></span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold flex items-center gap-2">
            {!warned ? <><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-60 animate-ping" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ok" /></span>Watching hall {HALL}</>
              : resolved ? <><Check size={16} className="text-ok" />INC-1042 resolved</> : <>Hall {HALL} · 1 active incident</>}
          </div>
          <div className="text-[12px] text-faint">Night shift · scripted night, illustrative readings</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/verify" className="h-12 px-3.5 rounded-xl border border-border hover:bg-surface-2 text-[14px] inline-flex items-center gap-2 t" title="Every alarm path was tested against the old check"><ShieldCheck size={16} className="text-ok" /> Alarm paths tested 6/6</Link>
          <button onClick={() => setOffline((v) => !v)} aria-pressed={!offline} className={cx('h-12 px-3.5 rounded-xl border text-[14px] font-medium inline-flex items-center gap-2 t', offline ? 'border-warning/60 text-warning bg-warning/10' : 'border-border hover:bg-surface-2')} title="Alerting never depends on the model">
            <span className={cx('switch', offline ? 'bg-warning/70' : 'bg-ok')} data-on={!offline} aria-hidden /> Nemotron {offline ? 'offline' : 'online'}
          </button>
          {(stage === 'watching' || (stage === 'warned' && running)) && <button onClick={() => setRunning((v) => !v)} className="h-12 w-12 grid place-items-center rounded-xl border border-border hover:bg-surface-2 t" aria-label={running ? 'Pause' : 'Play'}>{running ? <Pause size={17} /> : <Play size={17} />}</button>}
          <button onClick={replay} className="h-12 w-12 grid place-items-center rounded-xl border border-border hover:bg-surface-2 t" aria-label="Replay the night" title="Replay the night"><RotateCcw size={17} /></button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-5 items-start">
        {/* The alarm owns the top-left: title, next action and the race, never below the fold */}
        <section aria-label="Active incident" className="lg:col-start-1 lg:row-start-1">
          {!warned ? <Quiet m={m} /> : (
            <div className={cx('card overflow-hidden pop-in border-2', crit ? 'border-critical alarm-card' : resolved ? 'border-ok' : 'border-warning alarm-card-warn')}>
              <div className={cx('flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 sm:px-5 py-2.5 text-white text-[14px] font-semibold', crit ? 'bg-critical' : resolved ? 'bg-ok' : 'bg-warning')}>
                {!resolved && <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-70 animate-ping" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" /></span>}
                <span className="uppercase tracking-wide">{crit ? 'Critical alarm' : resolved ? 'Resolved' : 'Early warning'}</span>
                <RaceChip m={m} />
              </div>
              <div className="px-4 sm:px-5 pt-4 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[23px] font-semibold tracking-[-0.02em] leading-tight">{m >= THERMAL_CRIT ? 'CPU overheating on Compute2' : 'Fan 4 stalled on Compute2'}</h2>
                  <p className="text-[14px] text-muted mt-1 leading-snug">{resolved ? 'Fan 4 replaced and recovery verified with fresh readings.' : m >= THERMAL_CRIT ? 'Fan 4 stopped at 02:06. Damo paged HPC Ops at 02:07, before the heat.' : 'Fan 4 reads 0 RPM. The CPU is still OK, so the old check sees nothing yet.'}</p>
                </div>
                <Link to={preflightLink(INCIDENT_RACK)} className="shrink-0 h-12 px-3 rounded-xl border hairline bg-surface hover:bg-surface-2 inline-flex items-center gap-1.5 t" title="Open this rack in Preflight: what feeds it and what it feeds">
                  <span className="grid leading-tight text-left"><span className="mono text-[15px] font-semibold">{INCIDENT_RACK} · U16</span><span className="text-[12px] text-muted">INC-1042 · HPC Ops</span></span><ChevronRight size={16} className="text-faint" />
                </Link>
              </div>

              <Steps stage={stage} stamps={stamps} skipped={skipped} />

              {offline && !resolved && (
                <div className="mx-4 sm:mx-5 mb-3 rounded-xl border border-warning/50 bg-warning/10 px-3.5 py-2.5 text-[14px] flex items-start gap-2.5" role="status">
                  <WifiOff size={17} className="text-warning shrink-0 mt-0.5" />
                  <span><b>Nemotron offline.</b> Investigation is unavailable; paging, dispatch, verify and handoff all still work.</span>
                </div>
              )}

              <div className="px-4 sm:px-5 pb-4 grid gap-3">
                {primary && (
                  <div className="grid gap-1.5">
                    <div className={cx('grid gap-2', primary.alt && 'sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]')}>
                      <button onClick={primary.run} className="btn btn-primary h-14 rounded-xl text-[16px] font-semibold inline-flex items-center justify-center gap-2">
                        {primary.icon}{primary.label}<span className="kbd !bg-transparent !text-inverse-ink !border-inverse-ink/25 opacity-70 ml-1 hidden lg:inline-flex">Enter</span>
                      </button>
                      {primary.alt && <button onClick={primary.alt.run} className="h-14 rounded-xl border border-border-strong bg-surface hover:bg-surface-2 text-[15px] font-semibold inline-flex items-center justify-center gap-2 t"><FastForward size={17} />{primary.alt.label}</button>}
                    </div>
                    <span className="text-[14px] text-muted text-center">{primary.hint}</span>
                  </div>
                )}
                {busy === 'dispatch' && <div className="h-14 rounded-xl border hairline grid place-items-center text-[14px] text-muted"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Technician on site · fast-forwarding to 02:58</span></div>}
                {busy === 'verify' && <div className="h-14 rounded-xl border hairline grid place-items-center text-[14px] text-muted"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Taking fresh readings…</span></div>}
                {busy === 'investigate' && <div className="h-14 rounded-xl border hairline grid place-items-center text-[14px] text-muted"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Nemotron is investigating…</span></div>}

                <div key={stage} className="grid gap-3 stage-in">
                  {stage === 'warned' && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[14px]">
                      <span className="text-muted mr-1">Paged</span><Chip bad className="chip-fail">Luis O. · 503</Chip><ArrowRight size={14} className="text-faint draw-in" style={{ animationDelay: '.75s' }} /><Chip good className="pop-in" style={{ animationDelay: '1s' }}>Priya N. · delivered</Chip><span className="text-muted ml-1 pop-in" style={{ animationDelay: '1.3s' }}>· WO-1042 opened</span>
                    </div>
                  )}

                  {(busy === 'investigate' || (stage === 'acked' && agentLog.length > 0)) && !liveAgent && (
                    <div className="rounded-xl panel p-3.5">
                      <div className="text-[14px] text-[var(--panel-muted)] mb-2 flex items-center gap-1.5"><Sparkles size={14} className="text-[var(--panel-accent)]" /> Nemotron is calling tools <span className="opacity-70">· scripted run</span></div>
                      <ol className="grid gap-1 mono text-[14px]">{agentLog.map((l) => <li key={l} className="flex gap-2 enter-row"><span className="text-[var(--panel-accent)]">›</span>{l}</li>)}</ol>
                    </div>
                  )}
                  {liveAgent && stage === 'acked' && <AgentRun job="investigate" title="Nemotron investigating" onDone={(e) => { if (e.type === 'done') { go('investigated', m); add({ m, kind: 'agent', text: 'Nemotron (live): investigation complete.' }); } else { setLiveAgent(false); investigate(); } }} />}

                  {stage === 'investigated' && <Hypotheses />}

                  {(stage === 'dispatched' || busy === 'verify') && (
                    <div className="rounded-xl border hairline p-3.5">
                      <div className="text-[14px] text-muted mb-2">WO-1042 closed by Ana P. at 02:58. The incident stays open until fresh readings pass.</div>
                      <div className="flex gap-2">{[1, 2, 3].map((n) => <span key={n} className={cx('flex-1 h-11 rounded-lg grid place-items-center text-[14px] mono border t', checks >= n ? 'border-ok/50 bg-ok/10 text-ok cell-in' : 'border-border text-muted')}>{checks >= n ? <span className="inline-flex items-center gap-1"><Check size={14} /> OK</span> : `reading ${n}`}</span>)}</div>
                    </div>
                  )}

                  {stage === 'recovered' && <div className="text-[14px] text-muted">Handoff packet ready: open risk (sensor fault not ruled out, watch 24 h), work done, owner HPC Ops, next action: fix the primary pager receiver.</div>}
                  {stage === 'handed-off' && (
                    <>
                      <div className="rounded-xl border border-ok/40 bg-ok/[0.06] p-3.5 text-[14px] grid gap-1 pop-in">
                        <div className="font-semibold flex items-center gap-1.5"><ClipboardCheck size={16} className="text-ok" /> Accepted by Dev K., incoming shift</div>
                        <div className="text-muted">Open risk: sensor fault not ruled out, watch hpc-c2 for 24 h. Next: fix the primary pager receiver (503).</div>
                      </div>
                      <button onClick={replay} className="h-12 rounded-xl border hairline text-[15px] font-medium inline-flex items-center justify-center gap-2 hover:bg-surface-2 t"><RotateCcw size={16} /> Replay the night</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Hall H1: the same racks and feeds Preflight simulates */}
        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2"><Hall m={m} running={running} feeds={feeds} rackState={rackState} selected={rack} onSelect={setRack} cur={cur} fixedAt={fixedAt} /></div>
      <section className="card lg:col-start-1 lg:row-start-2" aria-label="Event log">
          <div className="px-5 h-12 flex items-center gap-2 border-b hairline"><BellRing size={16} className="text-muted" /><span className="font-semibold text-[14px]">Event log</span><span className="text-[12.5px] text-muted ml-auto hidden sm:inline">rules, paging and work orders never call the model</span></div>
          <ol className="max-h-[300px] overflow-auto divide-y divide-[var(--border)]">
            {feed.length === 0 && <li className="px-5 py-3 text-[14px] text-muted">Watching. Readings are evaluated every minute.</li>}
            {[...feed].reverse().map((f, i) => (
              <li key={`${f.m}-${f.text.slice(0, 24)}`} className={cx('px-5 py-2.5 flex items-start gap-3 text-[14px]', i === 0 ? 'fresh-row' : '')}>
                <span className="mono text-[14px] text-muted w-12 shrink-0 pt-0.5">{clock(f.m)}</span>
                <FeedIcon k={f.kind} tone={f.tone} />
                <span className={cx('flex-1', f.tone === 'muted' && 'text-muted')}>{f.text}</span>
              </li>))}
          </ol>
        </section>
      </div>

      <RaceHero m={m} />

    </div>
  );
}

/** The race in one line, inside the alarm header: who told a person first. */
function RaceChip({ m }: { m: number }) {
  const lead = m - EARLY_WARN;
  return (
    <span className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white text-[#161616] text-[14px] font-semibold whitespace-nowrap" aria-label="Damo versus the legacy Nagios check">
      <span className="h-2 w-2 rounded-full bg-ok" />Damo <span className="mono">02:07</span>
      <span className="opacity-40">·</span>
      <span className="h-2 w-2 rounded-full bg-legacy" />Nagios {m >= OLD_PAGE
        ? <><span className="mono">02:13</span><span className="text-ok font-bold">(+6 min)</span></>
        : <span className="mono text-muted font-medium">silent +{Math.floor(lead)}:{String(Math.round((lead % 1) * 60)).padStart(2, '0')}</span>}
    </span>
  );
}

function Hypotheses() {
  const [open, setOpen] = useState<string | null>(null);
  const ev = evidence.find((e) => e.id === open);
  return (
    <div className="grid gap-2">
      {hypotheses.map((h) => (
        <div key={h.title} className="rounded-xl border hairline p-3.5">
          <div className="flex items-center gap-2"><span className="font-semibold text-[14.5px] flex-1">{h.title}</span><span className={cx('text-[12.5px] font-semibold px-2 h-6 inline-flex items-center rounded-md border', h.confidence === 'Likely' ? 'border-warning/50 text-warning' : 'border-border text-muted')}>{h.confidence}</span></div>
          <div className="text-[14px] text-muted mt-1">{h.note}</div>
          <div className="flex flex-wrap gap-1.5 mt-2" aria-label="Evidence">
            {h.cites.map((id) => {
              const e = evidence.find((x) => x.id === id)!;
              return <button key={id} onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id} className={cx('h-12 px-3 rounded-lg border text-[14px] inline-flex items-center gap-1.5 t', open === id ? 'border-text bg-surface-2 font-medium' : 'border-border hover:bg-surface-2')}><span className="text-muted">{e.src}</span>{e.short}</button>;
            })}
          </div>
        </div>
      ))}
      {ev && <div className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[14px] pop-in"><span className="text-muted">{ev.src}: </span>{ev.text}</div>}
    </div>
  );
}

function Quiet({ m }: { m: number }) {
  const rows = [
    { id: 'hpc-c1', host: 'Compute1', where: `${INCIDENT_RACK} · U14`, t: 58 + Math.sin(m) * 0.8, fan: 9420, fresh: true },
    { id: 'hpc-c2', host: 'Compute2', where: `${INCIDENT_RACK} · U16`, t: c2(m, null).temp, fan: c2(m, null).fan, fresh: true },
    { id: 'hpc-c3', host: 'Compute3', where: `${STALE_RACK} · U02`, t: 60 + Math.cos(m) * 0.6, fan: 9380, fresh: m < STALE_FROM },
  ];
  const beats = [{ at: FAN_STOP, text: 'a fan stops' }, { at: EARLY_WARN, text: 'Damo pages the owner' }, { at: THERMAL_CRIT, text: 'the CPU overheats' }, { at: OLD_PAGE, text: 'the old Nagios check pages nobody' }];
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1"><span className="font-semibold text-[18px]">All quiet in hall {HALL}</span><span className="text-[12.5px] text-muted ml-auto">readings every minute</span></div>
      <p className="text-[14px] text-muted mb-3">Deterministic rules evaluate every reading. Nemotron is only called when something needs a person.</p>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14px] mb-4" aria-label="What happens tonight">
        <span className="text-muted">Tonight:</span>
        {beats.map((b, i) => <li key={b.text} className={cx('inline-flex items-center gap-1.5 t', m >= b.at ? 'text-text font-medium' : 'text-muted')}><span className="mono text-[12.5px]">{clock(b.at)}</span>{b.text}{i < beats.length - 1 && <ArrowRight size={13} className="text-faint" />}</li>)}
      </ol>
      <div className="grid gap-2">{rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 rounded-xl border hairline px-3.5 py-3 text-[14px]">
          <span className={cx('h-2.5 w-2.5 rounded-full', r.fresh ? (r.fan < 100 ? 'bg-warning' : 'bg-ok') : 'bg-faint')} />
          <span className="font-medium w-[86px]">{r.host}</span>
          <span className="mono text-[14px] text-muted w-[86px]">{r.where}</span>
          <span className="mono num text-muted">{r.fresh ? `${r.t.toFixed(0)} °C` : '— °C'}</span>
          <span className={cx('mono num hidden sm:inline', r.fresh && r.fan < 100 ? 'text-warning' : 'text-muted')}>{r.fresh ? `${Math.round(r.fan)} rpm` : '— rpm'}</span>
          <span className={cx('ml-auto text-[14px]', r.fresh ? 'text-muted' : 'text-warning font-medium')}>{r.fresh ? 'fresh' : 'stale, not healthy'}</span>
        </div>))}
      </div>
    </div>
  );
}

const STATE_WORD: Record<RackState, string> = { ok: 'OK', warning: 'Warning', critical: 'Critical', stale: 'Stale', recovered: 'Recovered' };
/** Short, whole words for the 60 px tiles: never truncated; the full word is in the label and the detail strip. */
const TILE_WORD: Record<RackState, string> = { ok: 'OK', warning: 'WARN', critical: 'HOT', stale: 'STALE', recovered: 'OK' };

function Hall({ m, running, feeds, rackState, selected, onSelect, cur, fixedAt }: {
  m: number; running: boolean; feeds: Feeds; rackState: (r: Rack) => RackState; selected: string; onSelect: (id: string) => void;
  cur: ReturnType<typeof c2>; fixedAt: number | null;
}) {
  const r = racks.find((x) => x.id === selected)!;
  const st = rackState(r);
  const f = feedsOf(feeds, r.id);
  return (
    <section className="panel rounded-[18px] p-4 sm:p-5" aria-label={`Hall ${HALL}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="font-semibold text-[15px] whitespace-nowrap">Hall {HALL}</span>
        <span className="text-[14px] text-[var(--panel-muted)] whitespace-nowrap">16 racks · same hall as Preflight</span>
      </div>
      <div className="relative grid gap-2">
        {running && <span key={Math.floor(m)} className="scan-line" aria-hidden />}
        {[1, 2].map((row) => (
          <div key={row} className="grid grid-cols-[34px_repeat(4,minmax(0,1fr))] sm:grid-cols-[34px_repeat(8,minmax(0,1fr))] gap-1.5 items-stretch">
            <span className="mono text-[12px] text-[var(--panel-muted)] self-center">R{row}</span>
            {racks.filter((x) => x.row === row).map((x) => <RackTile key={x.id} r={x} m={m} state={rackState(x)} selected={x.id === selected} onSelect={() => onSelect(x.id)} cpu={x.id === INCIDENT_RACK && m >= FAN_STOP ? cur.temp : null} />)}
          </div>
        ))}
      </div>
      <div className="mt-2 text-[12.5px] text-[var(--panel-muted)]">Tap a rack for what is in it and what feeds it. The number is inlet °C (CPU °C on the rack in trouble).</div>

      {/* The selected rack: contents, feeds, and whether this is a facility problem or a local one */}
      <div className="mt-4 pt-4 border-t border-[var(--panel-border)] grid gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="mono text-[17px] font-semibold">{r.id}</span>
          <span className={cx('text-[12.5px] font-semibold uppercase tracking-wide px-2 h-6 inline-flex items-center rounded-md', st === 'critical' ? 'bg-[var(--critical)] text-white' : st === 'warning' ? 'bg-[var(--warning)] text-[#161616]' : st === 'stale' ? 'bg-[var(--panel-3)] text-[var(--panel-text)]' : 'bg-[color-mix(in_srgb,var(--panel-ok)_25%,transparent)] text-[var(--panel-ok)]')}>{STATE_WORD[st]}</span>
          <span className="text-[14px] text-[var(--panel-muted)]">{r.assets ? r.assets.map((a) => ({ 'hpc-c1': 'Compute1 U14', 'hpc-c2': 'Compute2 U16', 'hpc-c3': 'Compute3 U02' }[a])).join(' · ') : `inlet ${inletTemp(r, m).toFixed(1)} °C`}</span>
          <Link to={preflightLink(r.id)} className="ml-auto h-12 px-3.5 rounded-xl bg-[var(--panel-3)] hover:bg-[var(--panel-border)] text-[14px] font-medium inline-flex items-center gap-1.5 t">Trace in Preflight <ChevronRight size={15} /></Link>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([['Power', Zap, f.power], ['Cooling', Snowflake, f.cooling]] as const).map(([label, I, ids]) => (
            <div key={label} className="rounded-xl bg-[var(--panel-2)] border border-[var(--panel-border)] p-2.5">
              <div className="text-[12.5px] text-[var(--panel-muted)] flex items-center gap-1.5 mb-1.5"><I size={13} /> {label} · all in service</div>
              <div className="flex flex-wrap gap-1.5">{ids.map((id) => <Link key={id} to={preflightLink(id)} className="h-12 px-3 rounded-lg border border-[var(--panel-border)] hover:bg-[var(--panel-3)] mono text-[14px] font-semibold inline-flex items-center gap-1.5 t"><span className="h-2 w-2 rounded-full bg-[var(--panel-ok)]" />{id}</Link>)}</div>
            </div>
          ))}
        </div>
        {r.id === INCIDENT_RACK && m >= FAN_STOP && <div className="text-[14px] text-[var(--panel-text)]">Power and cooling to {r.id} are healthy, so this is a <b>local fault</b> on one server, not a facility event.</div>}
        {r.id === INCIDENT_RACK && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[14px] font-medium">Compute2 · U16</span>
              <span className="mono text-[14px] text-[var(--panel-muted)] ml-auto num inline-flex items-center gap-3">
                <span className={cx('inline-flex items-center gap-1 t', cur.temp > 80 && 'text-[var(--critical)]')}><Thermometer size={13} /><Num value={cur.temp} /> °C</span>
                <span className={cx('inline-flex items-center gap-1', cur.fan < 100 && 'text-[var(--warning)]')}><Fan size={13} className={cur.fan > 100 ? 'animate-spin [animation-duration:1.4s]' : ''} /><Num value={cur.fan} ms={700} /> rpm</span>
              </span>
            </div>
            <Chart m={m} fixedAt={fixedAt} />
          </div>
        )}
        {r.id === STALE_RACK && m >= STALE_FROM && <div className="text-[14px] text-[var(--warning)]">Compute3 has sent no thermal sample since 02:04. Stale is never shown as healthy.</div>}
      </div>
    </section>
  );
}

function RackTile({ r, m, state, cpu, selected, onSelect }: { r: Rack; m: number; state: RackState; cpu: number | null; selected: boolean; onSelect: () => void }) {
  const t = inletTemp(r, m);
  const heat = Math.max(0, Math.min(1, (t - 23.3) / 1.0)); // only the warmest racks pick up a faint tint
  return (
    <button onClick={onSelect} aria-pressed={selected} className={cx('rack relative rounded-lg px-1.5 py-1.5 text-left min-h-[56px] outline-none', `rack-${state}`, selected && 'rack-selected')} style={state === 'ok' ? { ['--heat' as string]: `${Math.round(heat * 16)}%` } : undefined} aria-label={`Rack ${r.id}, ${STATE_WORD[state]}`}>
      <div className="rack-tip panel rounded-lg px-2.5 py-1.5 text-[12.5px] leading-snug whitespace-nowrap">
        <div className="font-semibold">{r.id}</div>
        <div className="text-[var(--panel-muted)]">{state === 'stale' ? 'Compute3: no sample since 02:04' : cpu !== null && state !== 'recovered' ? `Compute2 CPU ${cpu.toFixed(0)} °C · fan 4 stopped` : `Inlet ${t.toFixed(1)} °C · ${STATE_WORD[state]}`}</div>
      </div>
      <div className="flex items-center justify-between text-[12px] mono opacity-80"><span>{r.id.slice(3)}</span>{r.assets ? <CircleDot size={11} /> : null}</div>
      {cpu !== null && state !== 'recovered'
        ? <div className="mono text-[16px] font-bold num mt-0.5 leading-none"><Num value={cpu} />°</div>
        : <div className="mono text-[15px] font-semibold num mt-0.5 leading-none">{state === 'stale' ? '—' : <Num value={t} digits={1} ms={600} />}</div>}
      {state !== 'ok' && <div className="text-[12px] font-bold uppercase mt-0.5 leading-none whitespace-nowrap">{TILE_WORD[state]}</div>}
      {state === 'critical' && <span className="absolute -inset-[3px] rounded-[10px] border-2 border-[var(--critical)] ring-pulse pointer-events-none" />}
    </button>
  );
}

function Chart({ m, fixedAt }: { m: number; fixedAt: number | null }) {
  const W = 640, H = 110, P = 6, maxM = Math.max(16, Math.ceil(m) + 1);
  const pts = Array.from({ length: Math.floor(m * 2) + 1 }, (_, i) => i / 2);
  const X = (x: number) => P + (x / maxM) * (W - 2 * P);
  const Yt = (v: number) => H - P - ((v - 50) / 50) * (H - 2 * P);
  const Yf = (v: number) => H - P - (v / 10000) * (H - 2 * P) * 0.85;
  const tl = pts.map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Yt(c2(x, fixedAt).temp).toFixed(1)}`).join('');
  const fl = pts.map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Yf(c2(x, fixedAt).fan).toFixed(1)}`).join('');
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[110px]" preserveAspectRatio="none" role="img" aria-label="CPU temperature and fan speed on Compute2">
          <line x1={P} x2={W - P} y1={Yt(85)} y2={Yt(85)} stroke="var(--panel-border)" strokeDasharray="2 4" />
          {m >= EARLY_WARN && <line x1={X(EARLY_WARN)} x2={X(EARLY_WARN)} y1={0} y2={H} stroke="var(--panel-ok)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          {m >= OLD_PAGE && <line x1={X(OLD_PAGE)} x2={X(OLD_PAGE)} y1={0} y2={H} stroke="var(--panel-muted)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          <path d={`${tl}L${X(pts[pts.length - 1]).toFixed(1)} ${H}L${X(0)} ${H}Z`} fill="var(--critical)" opacity="0.08" />
          <path d={fl} fill="none" stroke="var(--panel-accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          <path d={tl} fill="none" stroke="var(--critical)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        </svg>
        <Head x={X(pts[pts.length - 1]) / W} y={Yt(c2(pts[pts.length - 1], fixedAt).temp) / H} color="var(--critical)" />
        <Head x={X(pts[pts.length - 1]) / W} y={Yf(c2(pts[pts.length - 1], fixedAt).fan) / H} color="var(--panel-accent)" />
        {m >= EARLY_WARN && <span className="absolute top-0 whitespace-nowrap text-[12px] mono text-[var(--panel-ok)] bg-[var(--panel)] px-1 -translate-x-1/2 pop-in" style={{ left: `${(X(EARLY_WARN) / W) * 100}%` }}>Damo 02:07</span>}
        {m >= OLD_PAGE && <span className="absolute bottom-0 whitespace-nowrap text-[12px] mono text-[var(--panel-muted)] bg-[var(--panel)] px-1 -translate-x-1/2 pop-in" style={{ left: `${(X(OLD_PAGE) / W) * 100}%` }}>Nagios 02:13</span>}
      </div>
      <div className="flex gap-4 text-[12.5px] text-[var(--panel-muted)] mt-1.5"><span className="inline-flex items-center gap-1.5"><span className="w-3 h-[2px] bg-[var(--critical)]" />CPU1 °C</span><span className="inline-flex items-center gap-1.5"><span className="w-3 h-[2px] bg-[var(--panel-accent)]" />fan 4 rpm</span><span className="ml-auto mono">02:00 → {clock(maxM)}</span></div>
    </div>
  );
}

function Steps({ stage, stamps, skipped }: { stage: Stage; stamps: Partial<Record<Stage, number>>; skipped: boolean }) {
  const list = ORDER.slice(1);
  const idx = ORDER.indexOf(stage);
  return (
    <ol className="grid grid-cols-3 sm:grid-cols-6 gap-x-1.5 gap-y-3 px-4 sm:px-5 py-4" aria-label="Incident progress">
      {list.map((st, i) => {
        const done = idx >= i + 1, now = idx === i + 1, skip = st === 'investigated' && skipped && done;
        return (
          <li key={st} className="min-w-0">
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden"><div className={cx('h-full rounded-full seg-fill', skip ? 'bg-border-strong' : now ? 'bg-text' : 'bg-text/70')} style={{ width: done ? '100%' : '0%' }} /></div>
            <div className={cx('mt-1.5 text-[12px] leading-tight whitespace-nowrap tracking-[-0.01em]', now ? 'text-text font-medium' : done ? 'text-muted' : 'text-faint')}>{now && <span className="sr-only">Current step: </span>}{LABEL[st]}</div>
            <div className="text-[12px] mono text-muted h-4">{skip ? 'skipped' : stamps[st] !== undefined ? clock(stamps[st] as number) : ''}</div>
          </li>
        );
      })}
    </ol>
  );
}

function Chip({ children, good, bad, className, style }: { children: React.ReactNode; good?: boolean; bad?: boolean; className?: string; style?: React.CSSProperties }) {
  return <span style={style} className={cx('inline-flex items-center gap-1 h-7 px-2 rounded-md text-[14px] border', good && 'border-ok/40 text-ok bg-ok/[0.06]', bad && 'border-critical/40 text-critical bg-critical/[0.06]', className)}>{good ? <Check size={13} /> : bad ? <X size={13} /> : null}{children}</span>;
}

function FeedIcon({ k, tone }: { k: FeedItem['kind']; tone?: FeedItem['tone'] }) {
  const I = { telemetry: Thermometer, alert: Bell, delivery: Radio, dedupe: Copy, workorder: Wrench, human: Check, agent: Sparkles, recovery: ShieldCheck }[k];
  return <I size={16} className={cx('shrink-0 mt-0.5', tone === 'critical' ? 'text-critical' : tone === 'ok' ? 'text-ok' : tone === 'warning' ? 'text-warning' : 'text-muted')} aria-hidden />;
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

/** The full comparison, for anyone who wants the detail behind the chip: who tells a person first. */
function RaceHero({ m }: { m: number }) {
  const W = 16, x = (v: number) => `${(Math.min(v, W) / W) * 100}%`;
  const silent = m >= EARLY_WARN && m < OLD_PAGE;
  const lanes = [
    { key: 'damo', name: 'Damo', sub: 'new rules + fan early warning', at: EARLY_WARN, who: 'paged HPC Ops (fallback delivered)', bar: 'bg-ok', dot: 'bg-ok', text: 'text-ok' },
    { key: 'nagios', name: 'Legacy Nagios check', sub: 'check_temperature.sh, unchanged', at: OLD_PAGE, who: 'paged nagios@localhost: nobody', bar: 'bg-legacy', dot: 'bg-legacy', text: 'text-legacy' },
  ];
  return (
    <section className="card px-5 py-4 mt-5 overflow-hidden" aria-label="Damo versus the legacy Nagios check">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-[16px] font-semibold">Same fault, two monitors: who tells a person first?</span>
        {m >= OLD_PAGE ? <span key="lead" className="pop-in h-9 px-3.5 rounded-full bg-ok text-white text-[14.5px] font-bold inline-flex items-center">Damo: 6 minutes earlier, to the right person</span>
          : silent ? <span key="silent" className="pop-in h-9 px-3.5 rounded-full bg-text text-bg text-[14px] font-semibold inline-flex items-center gap-1.5">Nagios still silent <span className="mono">+{Math.floor(m - EARLY_WARN)}:{String(Math.round(((m - EARLY_WARN) % 1) * 60)).padStart(2, '0')}</span></span>
            : <span className="text-[14px] text-muted">both watching the same Redfish readings</span>}
      </div>
      <div className="grid gap-2.5">
        {lanes.map((l) => (
          <div key={l.key} className="grid grid-cols-[150px_1fr] sm:grid-cols-[190px_1fr_300px] items-center gap-x-4 gap-y-1">
            <div><div className={cx('text-[15px] font-semibold leading-tight', l.text)}>{l.name}</div><div className="text-[12.5px] text-muted">{l.sub}</div></div>
            <div className="relative h-3 rounded-full bg-surface-2">
              <div className={cx('absolute inset-y-0 left-0 rounded-full t', l.bar, m >= l.at ? 'opacity-90' : 'opacity-30')} style={{ width: x(Math.min(m, l.at)) }} />
              <span className="absolute -top-1.5 h-6 w-[2px] bg-critical/70" style={{ left: x(FAN_STOP) }} title="fan stopped 02:06" />
              {m >= l.at && <span className={cx('absolute -top-[6px] h-6 w-6 -ml-3 rounded-full border-[3px] border-[var(--surface)] pop-in shadow', l.dot)} style={{ left: x(l.at) }} />}
            </div>
            <div className="col-span-2 sm:col-span-1 flex items-baseline gap-2.5 min-w-0">
              <span className={cx('mono text-[24px] font-bold leading-none num shrink-0', m >= l.at ? l.text : 'text-faint')}>{m >= l.at ? clock(l.at) : '--:--'}</span>
              <span className="text-[14px] text-muted">{m >= l.at ? l.who : 'waiting…'}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="text-[14px] text-muted mt-2.5 flex items-center gap-1.5"><span className="h-3 w-[2px] bg-critical/70 inline-block" /> 02:06, fan 4 stops. Both monitors read the same BMC; only Damo was taught to watch the fan.</div>
    </section>
  );
}

/** Two scenarios on hall H1: the original fan-stall night on air-cooled R1-03, and low flow on the liquid row R3. */
export default function Console() {
  const [params, setParams] = useSearchParams();
  const scenario = params.get('scenario') === 'lowflow' ? 'lowflow' : 'fan';
  const pick = (v: string) => setParams(v === 'fan' ? {} : { scenario: v }, { replace: true });
  return (
    <>
      <div className="mx-auto w-full max-w-[1360px] -mt-6 mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Scenario">
        {[['fan', 'Fan stall · R1-03 (air)'], ['lowflow', 'Low flow · R3 (liquid)']].map(([v, label]) => (
          <button key={v} role="tab" aria-selected={scenario === v} onClick={() => pick(v)} data-testid={`scenario-${v}`}
            className={cx('h-12 px-4 rounded-xl border text-[15px] t', scenario === v ? 'border-text bg-surface font-semibold' : 'border-border text-muted hover:bg-surface-2')}>{label}</button>
        ))}
      </div>
      {scenario === 'fan' ? <div className="mt-6"><FanStallNight /></div> : <div className="mx-auto w-full max-w-[1360px]"><LowFlow /></div>}
    </>
  );
}
