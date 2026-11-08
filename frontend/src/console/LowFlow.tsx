/**
 * The low-flow incident on liquid row R3. Every fact (readings, alarms, scope, who recovered when, when the incident may
 * close) comes from the backend monitor (`/api/retrofit/monitor/*`) or its recorded snapshot; this screen only keeps
 * the operator's own actions: per-owner acknowledge, action and recovery, closing, and the lesson.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Droplets, Eye, FastForward, Gauge, HeartPulse, Lock, Play, RotateCcw, Thermometer, TriangleAlert, Wrench, BookmarkPlus, CircleCheck } from 'lucide-react';
import { Badge, cx } from '../components/ui';
import { rf, SNAP, type MonitorRun, type Minute, type Owner } from '../retrofit/api';
import { useLive } from '../retrofit/parts';
import { Clock } from './motion';

const VARIANTS: [string, string][] = [['lowflow', 'Low flow'], ['partial', 'Partial recovery'], ['stale', 'Stale telemetry'], ['colo', 'Colocation view'], ['healthy', 'Checkpoint dip']];
const MS_PER_MIN = 260;
type OwnerState = { ack: number | null; action: number | null };
const preflight = (id: string) => `/preflight?site=retrofit&focus=${encodeURIComponent(id)}`;

function Spark({ mins, upto, get, lo, hi, limit, label }: { mins: Minute[]; upto: number; get: (m: Minute) => number | null; lo: number; hi: number; limit?: number; label: string }) {
  const W = 260, H = 54;
  const x = (t: number) => (t / (mins.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const pts = mins.filter((m) => m.t <= upto && get(m) !== null).map((m) => `${x(m.t).toFixed(1)},${y(get(m) as number).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[54px]" role="img" aria-label={label}>
      {limit !== undefined && <line x1={0} x2={W} y1={y(limit)} y2={y(limit)} stroke="var(--warning)" strokeDasharray="4 4" strokeWidth={1} />}
      <polyline points={pts} fill="none" stroke="var(--panel-liquid)" strokeWidth={2} />
    </svg>
  );
}

export default function LowFlow() {
  const live = useLive();
  const [variant, setVariant] = useState('lowflow');
  const [run, setRun] = useState<MonitorRun | null>(null);
  const [m, setM] = useState(0);
  const [target, setTarget] = useState(0);
  const [owners, setOwners] = useState<OwnerState[]>([{ ack: null, action: null }, { ack: null, action: null }]);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const [lesson, setLesson] = useState('Flow switch and run state said OK while the strainer clogged; alarm on flow, not state.');
  const [lessonSaved, setLessonSaved] = useState('');

  useEffect(() => {
    if (live === undefined) return;
    let on = true;
    const load = live ? rf.monitor(variant).catch(() => SNAP.monitor[variant]) : Promise.resolve(SNAP.monitor[variant]);
    load.then((r) => {
      if (!on) return;
      setRun(r); setM(0); setOwners([{ ack: null, action: null }, { ack: null, action: null }]); setClosedAt(null); setLessonSaved('');
      setTarget(r.incident ? Math.min(r.minutes.length - 1, r.incident.opened_at + 2) : 45);
    });
    return () => { on = false; };
  }, [variant, live]);
  useEffect(() => {
    if (m >= target) return;
    const id = window.setTimeout(() => setM((x) => Math.min(target, x + 1)), MS_PER_MIN);
    return () => clearTimeout(id);
  }, [m, target]);

  const inc = run?.incident ?? null;
  const cur = run?.minutes[m];
  const opened = inc !== null && m >= inc.opened_at;
  const canClose = !!inc && inc.closable_at !== null && m >= inc.closable_at && closedAt === null;
  const alarmsNow = useMemo(() => run?.alarms.filter((a) => a.t <= m) ?? [], [run, m]);
  if (!run || !cur) return <div className="text-[14px] text-muted">Loading the liquid row…</div>;
  const ctx = run.context;
  const minFlow = ctx.limits.min_secondary_flow_lpm, hiTemp = ctx.limits.secondary_supply_c[1];
  const act = (i: number, k: keyof OwnerState) => setOwners((o) => o.map((x, j) => j === i ? { ...x, [k]: m } : x));
  const bothActed = owners.every((o, i) => o.action !== null || (inc?.owners[i]?.visible === false));
  const ownerRecovered = (o: Owner) => o.recovered_at !== null && m >= o.recovered_at;

  return (
    <div className="grid gap-4" data-testid="lowflow">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono text-[28px] font-semibold tracking-[-0.04em] num"><Clock text={run.minutes[m].clock} /></span>
        <span className="text-[13px] text-faint mr-2">Hall {ctx.hall} · liquid row · synthetic telemetry · context from {ctx.from}</span>
        <div className="flex flex-wrap gap-1.5 ml-auto" role="tablist" aria-label="Scenario variant">
          {VARIANTS.map(([v, label]) => (
            <button key={v} role="tab" aria-selected={variant === v} onClick={() => setVariant(v)}
              className={cx('h-12 px-3 rounded-xl border text-[14px] t', variant === v ? 'border-text bg-surface font-semibold' : 'border-border text-muted hover:bg-surface-2')}>{label}</button>
          ))}
          <button onClick={() => { setM(0); setTarget(inc ? Math.min(run.minutes.length - 1, inc.opened_at + 2) : 45); setOwners([{ ack: null, action: null }, { ack: null, action: null }]); setClosedAt(null); }}
            className="h-12 w-12 grid place-items-center rounded-xl border border-border hover:bg-surface-2 t" aria-label="Replay"><RotateCcw size={17} /></button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4 items-start">
        <section aria-label="Incident">
          {run.kind === 'none' || !inc || !opened ? (
            <div className="card p-5 grid gap-2">
              <div className="text-[18px] font-semibold flex items-center gap-2"><CircleCheck size={19} className="text-ok" /> {run.kind === 'none' ? 'No incident' : 'Watching the liquid row'}</div>
              <p className="text-[14px] text-muted">{run.kind === 'none' ? run.note : `${ctx.cdu} running, flow ${cur.cdu.flow_lpm ?? '—'} L/min (minimum ${minFlow}). Rules run on fresh data only.`}</p>
              {m < target || run.kind === 'none' ? null : <button onClick={() => setTarget(run.minutes.length - 1)} className="h-12 rounded-xl border border-border hover:bg-surface-2 text-[15px] inline-flex items-center justify-center gap-2 t"><Play size={16} /> Keep watching</button>}
            </div>
          ) : run.kind === 'visibility' ? (
            <div className="card overflow-hidden border-2 border-warning" data-testid="visibility-card">
              <div className="px-5 py-2.5 bg-warning text-white text-[14px] font-semibold uppercase tracking-wide flex items-center gap-2"><Eye size={16} /> Missing visibility</div>
              <div className="p-5 grid gap-3">
                <h2 className="text-[22px] font-semibold leading-tight">{inc.title}</h2>
                <p className="text-[15px]">{inc.wording}</p>
                <p className="text-[14px] text-muted">Owner: {inc.owners[0].team} ({inc.owners[0].role}). Closes on {inc.closing_evidence}.</p>
              </div>
            </div>
          ) : (
            <div className={cx('card overflow-hidden border-2', closedAt !== null ? 'border-ok' : 'border-warning alarm-card-warn')} data-testid="lowflow-incident">
              <div className={cx('px-5 py-2.5 text-white text-[14px] font-semibold flex flex-wrap items-center gap-2', closedAt !== null ? 'bg-ok' : 'bg-warning')}>
                <span className="uppercase tracking-wide">{closedAt !== null ? 'Closed' : 'Cooling degradation suspected'}</span>
                <span className="opacity-90 font-normal">· opened {run.minutes[inc.opened_at].clock} by LowFlowWhileRunning, no model involved</span>
              </div>
              <div className="p-5 grid gap-3">
                <h2 className="text-[22px] font-semibold leading-tight">{inc.title}</h2>
                <p className="text-[15px]" data-testid="incident-wording">{inc.wording}</p>
                <div className="flex flex-wrap gap-2 items-center text-[14px]">
                  <span className="text-muted">Scope from the verified map:</span>
                  {inc.scope_racks.map((r) => <Link key={r} to={preflight(r)} className="h-12 px-3 rounded-xl border hairline bg-surface hover:bg-surface-2 inline-flex items-center gap-1 mono font-semibold t">{r}<ChevronRight size={14} className="text-faint" /></Link>)}
                  {inc.comparison_rack && <Badge>unaffected: {inc.comparison_rack}</Badge>}
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {inc.owners.map((o, i) => {
                    const st = owners[i];
                    const hidden = o.visible === false;
                    return (
                      <div key={o.team} className="rounded-xl border hairline p-3 grid gap-2" data-testid={`owner-${i}`}>
                        <div className="font-semibold text-[15px]">{o.team}</div>
                        <div className="text-[13px] text-muted -mt-1.5">{o.role}</div>
                        {hidden ? <div className="text-[14px] text-warning">Workload data not visible to the operator (colocation). Tenant confirms impact and recovery.</div> : <>
                          <div className="grid grid-cols-3 gap-1.5 text-[12.5px]">
                            {(['Ack', 'Action', 'Recovery'] as const).map((k) => {
                              const done = k === 'Ack' ? st.ack !== null : k === 'Action' ? st.action !== null : ownerRecovered(o);
                              return <span key={k} className={cx('h-9 rounded-lg grid place-items-center border', done ? 'border-ok/50 bg-ok/10 text-ok' : 'border-border text-muted')}>{done && <Check size={12} className="inline" />} {k}</span>;
                            })}
                          </div>
                          {st.ack === null ? <button onClick={() => act(i, 'ack')} className="btn btn-primary h-12 rounded-xl text-[15px] font-semibold inline-flex items-center justify-center gap-2"><Check size={17} /> Acknowledge</button>
                            : st.action === null ? <button onClick={() => act(i, 'action')} className="h-12 rounded-xl border border-border-strong hover:bg-surface-2 text-[15px] font-semibold inline-flex items-center justify-center gap-2 t"><Wrench size={16} /> {i === 0 ? 'Start loop checks (RB-LC-2)' : 'Assess workload impact'}</button>
                            : <div className="text-[13px] text-muted">{ownerRecovered(o) ? `Recovered at ${run.minutes[o.recovered_at as number].clock}, held ${ctx.window_min} min` : 'Waiting for recovery evidence'}</div>}
                        </>}
                      </div>
                    );
                  })}
                </div>
                {bothActed && m < run.minutes.length - 1 && closedAt === null && (
                  <button onClick={() => setTarget(run.minutes.length - 1)} disabled={m < target} className="h-12 rounded-xl border border-border hover:bg-surface-2 text-[15px] inline-flex items-center justify-center gap-2 t disabled:opacity-60"><FastForward size={16} /> {m < target ? 'Watching recovery…' : 'Watch recovery'}</button>
                )}
                <div className="rounded-xl border hairline p-3 text-[14px] grid gap-1.5">
                  <div className="font-semibold">To close</div>
                  <div className="text-muted">{inc.closing_evidence}.</div>
                  {closedAt !== null ? <div className="text-ok font-semibold" data-testid="closed">Closed at {run.minutes[closedAt].clock}.</div>
                    : <button data-testid="close-incident" onClick={() => setClosedAt(m)} disabled={!canClose} className="btn btn-primary h-12 rounded-xl text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">{canClose ? <><HeartPulse size={17} /> Close incident</> : <><Lock size={16} /> {inc.closable_at === null ? (m >= run.minutes.length - 1 ? `Cannot close: ${inc.status_at_end}` : 'Recovery not proven yet') : 'Recovery not held long enough yet'}</>}</button>}
                </div>
                {closedAt !== null && (
                  <div className="rounded-xl border border-ok/40 bg-ok/[0.06] p-3 grid gap-2" data-testid="lesson">
                    <label className="text-[14px] font-semibold" htmlFor="lesson">Lesson for the retrofit review</label>
                    <textarea id="lesson" value={lesson} onChange={(e) => setLesson(e.target.value)} rows={2} className="rounded-xl border border-border bg-surface p-2 text-[14px]" />
                    {lessonSaved ? <div className="text-[14px] text-ok">{lessonSaved}</div> : (
                      <button onClick={async () => {
                        if (live) { try { const r = await rf.lesson(lesson, 'Maya R.', 'INC-2207'); setLessonSaved(`Proposed regression R-${r.id} is pending review in Retrofit.`); return; } catch { /* fall through */ } }
                        setLessonSaved('Proposed regression saved for review (offline: not sent).');
                      }} className="h-12 rounded-xl border border-border-strong hover:bg-surface-2 text-[15px] font-semibold inline-flex items-center justify-center gap-2 t"><BookmarkPlus size={16} /> Propose as a regression test</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-3" aria-label="Readings">
          <div className="panel rounded-2xl p-4 grid gap-3">
            <div className="flex items-center gap-2 text-[14px]"><Droplets size={16} className="text-[var(--panel-liquid)]" /><b>{ctx.cdu}</b>
              <span className={cx('ml-1 px-2 py-0.5 rounded-md text-[12px] font-semibold', cur.cdu.quality === 'stale' ? 'bg-[var(--panel-3)] text-[var(--panel-muted)]' : 'bg-[var(--panel-ok)]/20 text-[var(--panel-ok)]')}>{cur.cdu.quality === 'stale' ? 'STALE' : (cur.cdu.state ?? '').toUpperCase()}</span>
              <span className="ml-auto mono text-[12px] text-[var(--panel-muted)]">source {cur.cdu.source_ts}</span></div>
            <div className="grid grid-cols-2 gap-3">
              <div><div className="text-[12px] text-[var(--panel-muted)] flex items-center gap-1"><Gauge size={12} /> Secondary flow</div>
                <div className={cx('mono text-[24px] font-semibold', cur.cdu.flow_lpm !== null && cur.cdu.flow_lpm < minFlow && 'text-[var(--warning)]')} data-testid="flow">{cur.cdu.flow_lpm ?? '—'}<span className="text-[13px] text-[var(--panel-muted)]"> L/min</span></div>
                <Spark mins={run.minutes} upto={m} get={(x) => x.cdu.flow_lpm} lo={120} hi={260} limit={minFlow} label="Flow" /></div>
              <div><div className="text-[12px] text-[var(--panel-muted)] flex items-center gap-1"><Thermometer size={12} /> Supply</div>
                <div className={cx('mono text-[24px] font-semibold', cur.cdu.supply_c !== null && cur.cdu.supply_c > hiTemp && 'text-[var(--warning)]')}>{cur.cdu.supply_c ?? '—'}<span className="text-[13px] text-[var(--panel-muted)]"> °C</span></div>
                <Spark mins={run.minutes} upto={m} get={(x) => x.cdu.supply_c} lo={30} hi={41} limit={hiTemp} label="Supply temperature" /></div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[13px]">
              {[...ctx.racks, inc?.comparison_rack ?? 'R1-05'].map((r) => (
                <div key={r} className={cx('rack rounded-xl p-2', ctx.racks.includes(r) && 'rack-liquid')}>
                  <div className="mono font-semibold">{r}{!ctx.racks.includes(r) && <span className="text-[11px] text-[var(--panel-muted)] font-normal"> air</span>}</div>
                  <div>GPU {cur.racks[r]?.gpu_c ?? '—'} °C</div>
                  <div className={cx(cur.racks[r]?.throttle_pct ? 'text-[var(--warning)]' : 'text-[var(--panel-muted)]')}>throttle {cur.racks[r]?.throttle_pct ?? 0}%</div>
                </div>
              ))}
            </div>
            <div className="text-[13px]">
              {cur.job ? <><div className="flex items-center gap-2"><span>Training job</span><span className={cx('mono font-semibold', cur.job.steps_per_s < 0.85 * cur.job.baseline && cur.job.phase === 'train' && 'text-[var(--warning)]')}>{cur.job.steps_per_s} steps/s</span><span className="text-[var(--panel-muted)]">baseline {cur.job.baseline} · {cur.job.phase} · heartbeat {cur.job.heartbeat_ok ? 'OK' : 'lost'}</span></div>
                <Spark mins={run.minutes} upto={m} get={(x) => x.job?.steps_per_s ?? null} lo={200} hi={1100} limit={850} label="Job progress" /></>
                : <div className="text-[var(--warning)] flex items-center gap-1.5"><TriangleAlert size={13} /> Workload data unavailable (colocation): facility-only view.</div>}
            </div>
          </div>
          {alarmsNow.length > 0 && <div className="card p-3 text-[13.5px] grid gap-1">{alarmsNow.map((a) => <div key={a.rule}><span className="mono">{a.clock}</span> <b>{a.rule}</b> · {a.detail} → {a.owner}</div>)}</div>}
          {inc?.evidence && opened && (
            <div className="card p-3 grid gap-2 text-[13.5px]">
              <div className="font-semibold">Evidence (source timestamps)</div>
              <ul className="grid gap-1">{inc.evidence.map((e) => <li key={e.id}><span className="mono text-faint">{e.ts}</span> {e.text} <span className="text-faint">· {e.source}</span></li>)}</ul>
              {inc.procedure && <><div className="font-semibold mt-1">{inc.procedure.id}</div><ol className="list-decimal pl-5 grid gap-0.5">{inc.procedure.steps.map((s) => <li key={s}>{s}</li>)}</ol></>}
              {inc.lead && <div className="rounded-lg bg-surface-2 p-2"><Badge tone="warning">{inc.lead.label}</Badge> {inc.lead.date} · {inc.lead.author}: “{inc.lead.note}”</div>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
