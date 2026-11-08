import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Play, Pause, RotateCcw, Check, X, Radio, Bell, Wrench, Copy, Sparkles, WifiOff, ArrowRight, Lock, History, ShieldCheck, ClipboardCheck, Thermometer, AlertTriangle, CircleDot } from 'lucide-react';
import { Button, Card, Badge, PageHeader, SectionHeader, Empty, StatusPill, ModelBadge, cx } from '../components/ui';
import { useModern } from './store';
import { api } from './api';
import { AgentRun, LiveStrip } from './Live';

interface LiveEvent { t: string; minute: number; kind: string; text: string; status?: string; severity?: string; model_used?: boolean }
interface LiveOps { events: LiveEvent[]; incidents: Record<string, { deliveries: { to: string; via: string; ok: boolean; at: string }[]; acked: { by: string; at: string } | null; escalate_at: string; status?: string }>; work_orders: Record<string, { id: string; state: string; events: number; github: string | null }>; recovery: { runs: { evaluation: number; state: string; ms: number; how: string }[]; verified: boolean; at: string } | null; handoff_accepted: { by: string; at: string } | null }
import { assets, opsScript, opsAcceptance, techNote, evidence, hypotheses, nextTask, type Freshness } from './data';

const tabs = [
  { to: '/operate', label: 'Alerts & delivery', tag: 'R1–R2', end: true },
  { to: '/operate/investigate', label: 'Evidence & investigation', tag: 'R3–R4' },
  { to: '/operate/handoff', label: 'Verify & hand off', tag: 'R5' },
];

function useDerived() {
  const s = useModern(); const o = s.ops; const st = o.step;
  const L = s.liveData.opsState as LiveOps | null;
  if (L) {
    const inc = L.incidents['hpc-c2']; const wo = L.work_orders['hpc-c2'];
    const failed = !!inc?.deliveries.some((x) => !x.ok); const dedupe = L.events.some((e) => e.kind === 'dedupe');
    return {
      s, o, L, inc, woLive: wo,
      early: true, hot: true, fired: true, primaryFailed: failed, fallback: failed, wo: !!wo, deduped: dedupe, ended: true,
      accept: { a1: o.alertWhileOffline, a2: failed, a3: o.investigated, a4: dedupe, a5: o.closeBlocked } as Record<string, boolean>,
      incident: L.recovery?.verified && wo?.state === 'closed' ? 'Recovery verified' : inc?.acked ? 'Acknowledged' : 'Open · unacknowledged',
    };
  }
  return {
    s, o, L: null as LiveOps | null, inc: undefined as LiveOps['incidents'][string] | undefined, woLive: undefined as LiveOps['work_orders'][string] | undefined,
    early: st >= 2, hot: st >= 3, fired: st >= 5, primaryFailed: st >= 6, fallback: st >= 7, wo: st >= 8, deduped: st >= 9, ended: st >= opsScript.length,
    accept: { a1: o.alertWhileOffline, a2: st >= 7, a3: o.investigated, a4: st >= 9, a5: o.closeBlocked } as Record<string, boolean>,
    incident: o.recovered ? 'Recovery verified' : o.acked ? 'Acknowledged' : st >= 5 ? 'Open · unacknowledged' : 'No incident',
  };
}

function Tabs() {
  return (
    <nav className="mb-10 flex flex-wrap gap-2" aria-label="Operations">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('rounded-xl border px-4 py-2.5 t', isActive ? 'border-text bg-surface' : 'border-border hover:border-border-strong hover:bg-surface')}>
          {({ isActive }) => <span className="flex items-baseline gap-2"><span className="mono text-[10.5px] text-faint">{t.tag}</span><span className={cx('text-[13px] font-medium', isActive ? 'text-text' : 'text-muted')}>{t.label}</span></span>}
        </NavLink>
      ))}
    </nav>
  );
}

function Page({ children }: { children: ReactNode }) { return <div className="mx-auto w-full max-w-[1320px]"><Tabs />{children}</div>; }

function Acceptance() {
  const { accept } = useDerived();
  const n = Object.values(accept).filter(Boolean).length;
  return (
    <Card header={<><ClipboardCheck size={14} className="text-muted" /><span className="font-semibold text-[13px]">Acceptance cases</span><span className="text-[12px] text-muted ml-auto num">{n}/5 shown</span></>}>
      <ul className="grid gap-2.5 text-[13px]">{opsAcceptance.map((a) => <li key={a.id} className="flex items-start gap-2.5">{accept[a.id] ? <Check size={15} className="text-ok shrink-0 mt-0.5" strokeWidth={2.5} /> : <CircleDot size={15} className="text-faint shrink-0 mt-0.5" />}<span className={accept[a.id] ? '' : 'text-muted'}>{a.text}</span></li>)}</ul>
    </Card>
  );
}

const fresh: Record<Freshness, [string, string]> = { fresh: ['Fresh', 'text-ok'], stale: ['Stale · not healthy', 'text-warning'], missing: ['Missing · not healthy', 'text-critical'] };

// ---------------------------------------------------------------- R1–R2
export function OpsAlerts() {
  const d = useDerived(); const { s, o } = d; const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const toolsLive = !!s.live && s.live.tools.promtool && s.live.tools.amtool;
  const playLive = async () => {
    setErr(null);
    try {
      await api.ops('model', { offline: o.offline });
      const st = await api.ops('play');
      s.setLive({ opsState: st }); s.setOps({ alertWhileOffline: o.offline, step: opsScript.length });
    } catch (e) { setErr(String(e)); s.setOps({ playing: true }); }
  };
  const shown = d.L ? [] : opsScript.slice(0, o.step);
  const rows = assets.map((a) => {
    const crit = a.id === 'hpc-c2' && d.hot && !o.recovered;
    const f: Freshness = a.id === 'hpc-c3' && d.hot ? 'stale' : 'fresh';
    return { a, crit, f, reading: crit ? 91 : a.id === 'hpc-c1' ? 58 : 61, ts: d.hot ? (a.id === 'hpc-c3' ? '02:04:00' : `02:1${Math.min(o.step, 5)}:00`) : '02:09:00' };
  });
  return (
    <Page>
      <PageHeader kicker="Operate · R1–R2" title="Collect, evaluate, deliver"
        subtitle="Deterministic rules evaluate telemetry with stable asset IDs, units and freshness. Delivery, failure, fallback and human acknowledgement are recorded separately. None of it needs the model."
        meta={<><Badge tone={o.offline ? 'warning' : 'ok'}>{o.offline ? <><WifiOff size={11} /> Nemotron offline</> : <><Radio size={11} /> Nemotron online</>}</Badge><Badge>ttu-redfish-temperature v1.0.0</Badge><span className="text-[12.5px] text-muted mono">sim clock {shown.at(-1)?.t ?? '02:09:00'}</span></>}
        actions={<>
          <Button onClick={() => s.setOps({ offline: !o.offline })}>{o.offline ? <><Radio size={15} /> Bring model back</> : <><WifiOff size={15} /> Take Nemotron offline</>}</Button>
          {d.ended ? <Button onClick={() => { s.setLive({ opsState: null }); api.ops('reset').catch(() => undefined); s.setOps({ step: 0, playing: false, acked: null, alertWhileOffline: false }); }}><RotateCcw size={15} /> Replay</Button>
            : <Button variant="primary" onClick={() => (toolsLive && !o.step ? playLive() : s.setOps({ playing: !o.playing }))}>{o.playing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> {o.step ? 'Resume night' : 'Play the night'}</>}</Button>}
        </>} />

      <LiveStrip need={['tools', 'plugin']} />
      {err && <div className="card px-5 py-3 mb-6 text-[13px] border-warning/50">Live engine failed, playing the scripted night instead: {err}</div>}
      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-6 items-start">
        <div className="grid gap-6 min-w-0">
          <section>
            <SectionHeader title="Assets" subtitle="Missing or stale telemetry is never shown as healthy." />
            <div className="card overflow-x-auto">
              <table className="w-full text-[13px]"><thead className="text-left border-b hairline"><tr>{['Asset', 'Rack', 'Thermal health', 'Reading', 'Last sample', 'Freshness'].map((h) => <th key={h} className="th px-4 h-11 whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>{rows.map(({ a, crit, f, reading, ts }) => (
                  <tr key={a.id} className={cx('border-b hairline last:border-0', crit && 'bg-critical/[0.06]')}>
                    <td className="px-4 py-3"><div className="mono font-medium">{a.id}</div><div className="text-[12px] text-faint">{a.host} · {a.owner}</div></td>
                    <td className="px-4 text-muted whitespace-nowrap">{a.rack}</td>
                    <td className="px-4">{f === 'stale' ? <StatusPill kind="untrusted" word="Unverified" size="sm" /> : crit ? <StatusPill kind="critical" size="sm" /> : <StatusPill kind="ok" size="sm" />}</td>
                    <td className="px-4 mono whitespace-nowrap">{f === 'stale' ? '—' : `${reading} °C`}<span className="text-faint text-[11px] ml-1">CPU1</span></td>
                    <td className="px-4 mono text-muted">{ts}</td>
                    <td className={cx('px-4 text-[12.5px] whitespace-nowrap', fresh[f][1])}>{fresh[f][0]}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <SectionHeader title="Event log" subtitle="Rules, delivery and work orders, in order. Nothing here is written by the model." />
            {d.L ? <ol className="card divide-y divide-[var(--border)]">{d.L.events.map((e, i) => (
                <li key={i} className="px-5 py-3 flex items-start gap-3 text-[13px]">
                  <span className="mono text-[12px] text-faint w-[64px] shrink-0 pt-0.5">{e.t}</span>
                  <EventIcon k={e.kind} tone={e.status === 'failed' || e.severity === 'critical' ? 'critical' : e.status === 'delivered' ? 'ok' : undefined} />
                  <span className="flex-1">{e.text}{e.model_used === false && <span className="text-faint"> · no model</span>}</span>
                </li>))}
              </ol>
            : !shown.length ? <Empty icon={Play} title="The night hasn't started" body="Play the scripted night: a critical thermal reading on Compute2, a failed page, a fallback, a duplicate event. Try taking Nemotron offline first." action={<Button variant="primary" onClick={() => s.setOps({ playing: true })}><Play size={15} /> Play the night</Button>} />
              : <ol className="card divide-y divide-[var(--border)]">{shown.map((e, i) => (
                <li key={i} className="px-5 py-3 flex items-start gap-3 text-[13px]">
                  <span className="mono text-[12px] text-faint w-[64px] shrink-0 pt-0.5">{e.t}</span>
                  <EventIcon k={e.kind} tone={e.tone} />
                  <span className={cx('flex-1', e.tone === 'muted' && 'text-muted')}>{e.text}</span>
                </li>))}
              </ol>}
          </section>
        </div>

        <div className="grid gap-4 lg:sticky lg:top-0">
          <Card header={<><Bell size={14} className="text-muted" /><span className="font-semibold text-[13px]">Incident</span><span className={cx('text-[12px] ml-auto', d.fired && !o.acked ? 'text-critical' : 'text-muted')}>{d.incident}</span></>}>
            {!d.fired ? <p className="text-[13px] text-muted">No active incident.</p> : <>
              <div className="flex items-center gap-2 mb-3"><StatusPill kind="critical" size="sm" /><span className="font-semibold">ThermalHealthCritical · hpc-c2</span></div>
              <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[13px]">
                <dt className="text-muted">Delivery</dt><dd>{d.inc ? d.inc.deliveries.map((x, i) => <div key={i} className={x.ok ? 'text-ok' : 'text-critical'}>{x.to} via {x.via}: {x.ok ? 'delivered' : 'failed (503)'} · {x.at}</div>) : <>{d.primaryFailed ? <span className="text-critical">Luis O. failed (503)</span> : 'sending…'}{d.fallback && <><br /><span className="text-ok">Priya N. delivered (fallback)</span></>}</>}</dd>
                <dt className="text-muted">Acknowledged</dt><dd>{o.acked ? <span className="text-ok">{o.acked}</span> : <span className="text-warning">Not yet · escalates to HPC Ops lead at 02:23</span>}</dd>
                <dt className="text-muted">Work order</dt><dd>{d.wo ? <>WO-1042 · {o.woClosed ? 'closed by technician' : 'open'}{d.deduped && <span className="text-muted"> · 2 events, 1 work order</span>}</> : '—'}</dd>
                <dt className="text-muted">Evaluated by</dt><dd>Prometheus rules{o.alertWhileOffline && <span className="text-ok"> · fired while Nemotron was offline</span>}</dd>
              </dl>
              <div className="flex gap-2 mt-4">
                {!o.acked && <Button variant="primary" onClick={async () => { if (d.L) { s.setLive({ opsState: await api.ops('ack', { asset_id: 'hpc-c2', by: 'Maya R. (duty operator)' }) }); } s.setOps({ acked: 'Maya R. (duty operator) · 02:16' }); }}><Check size={15} /> Acknowledge</Button>}
                {o.acked && <Button variant="primary" onClick={() => nav('/operate/investigate')}>Investigate <ArrowRight size={15} /></Button>}
              </div>
            </>}
          </Card>
          <Acceptance />
        </div>
      </div>
    </Page>
  );
}

function EventIcon({ k, tone }: { k: string; tone?: string }) {
  const I = { telemetry: Thermometer, alert: Bell, delivery: Radio, dedupe: Copy, workorder: Wrench, note: History, escalation: AlertTriangle, info: CircleDot }[k] ?? CircleDot;
  return <I size={15} className={cx('shrink-0 mt-0.5', tone === 'critical' ? 'text-critical' : tone === 'ok' ? 'text-ok' : 'text-muted')} aria-hidden />;
}

// ---------------------------------------------------------------- R3–R4
export function OpsInvestigate() {
  const d = useDerived(); const { s, o } = d; const nav = useNavigate();
  const [agentOn, setAgentOn] = useState(false);
  if (!d.wo) return <Page><PageHeader kicker="Operate · R3–R4" title="Preserve evidence, investigate" /><Empty icon={Wrench} title="No incident yet" body="Play the night on the Alerts screen first. The work order and evidence appear once an alert fires." action={<Button variant="primary" onClick={() => nav('/operate')}>Go to alerts</Button>} /></Page>;
  const scriptedInvestigate = () => s.run('r4', ['query_telemetry hpc-c2 thermal, fans (02:00–02:45)', 'lookup_asset hpc-c2 → R12 · U16, HPC Ops, Research Computing', 'read_logbook WO-1042 (original note + correction)', 'search_runbook "single fan failure"', '2 hypotheses · 1 unresolved · next task for Technician'], () => s.setOps({ investigated: true, noteShown: true }), 550);
  const investigate = async () => { if (s.live) { await api.ops('model', { offline: o.offline }).catch(() => undefined); setAgentOn(true); } else scriptedInvestigate(); };
  return (
    <Page>
      <PageHeader kicker="Operate · R3–R4" title="Preserve evidence, investigate"
        subtitle="Original technician notes, timestamps and corrections are kept as written. Nemotron returns cited hypotheses and uncertainty, and suggests a next task for the responsible role. It cannot assign owners, approve itself or change infrastructure."
        meta={<><Badge>WO-1042</Badge><Badge tone="warning">hpc-c2 · R12 · U16</Badge>{o.investigated && <ModelBadge model="Nemotron Nano" />}</>}
        actions={o.investigated ? <Button variant="primary" onClick={() => nav('/operate/handoff')}>Verify recovery <ArrowRight size={15} /></Button> : <Button variant="primary" disabled={o.offline || !!s.busy} title={o.offline ? 'Nemotron is offline' : undefined} onClick={investigate}><Sparkles size={15} /> Investigate with Nemotron</Button>} />
      {o.offline && <div className="card px-5 py-3.5 mb-6 flex items-center gap-3 text-[13.5px] border-warning/50"><WifiOff size={16} className="text-warning" />Nemotron is offline. Investigation waits; alerting, delivery and work orders keep running.</div>}
      {agentOn && !o.investigated && <AgentRun job="investigate" title="Nemotron investigating" onDone={(e) => {
        if (e.type === 'done') { s.setLive({ hypotheses: e.hypotheses }); s.setOps({ investigated: true, noteShown: true }); }
        else { setAgentOn(false); scriptedInvestigate(); }
      }} />}
      {s.busy?.key === 'r4' && <Card className="mb-6" header={<span className="font-semibold text-[13px]">Investigating</span>}><ol className="grid gap-1.5">{s.busy.log.map((l, i) => <li key={i} className="flex gap-2 text-[12.5px] mono"><Check size={14} className="text-ok shrink-0" />{l}</li>)}</ol></Card>}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="grid gap-6">
          <section>
            <SectionHeader title="Technician log" subtitle="Occurrence time and entry time are kept apart. Corrections never overwrite the original." />
            <Card>
              <div className="flex items-center gap-2 text-[12.5px] text-muted mb-2"><Wrench size={14} />{techNote.author}<span className="ml-auto mono">occurred {techNote.occurred} · entered {techNote.entered}</span></div>
              <div className="text-[11.5px] text-faint mb-1">original, as written</div><p className="text-[14px]">{techNote.text}</p>
              <div className="mt-3 pl-3 border-l-2 border-accent"><div className="text-[12px] text-muted mono mb-1">correction {techNote.correction.at}</div><p className="text-[14px]">{techNote.correction.text}</p></div>
              <div className="text-[12px] text-faint mt-3 flex items-center gap-1.5"><History size={12} /> 2 versions kept · category suggested: Cooling / fan (Nemotron, unconfirmed)</div>
            </Card>
          </section>
          <section>
            <SectionHeader title="Evidence" subtitle="Telemetry, asset map, logbook and runbook, each with its source." />
            <div className="card divide-y divide-[var(--border)]">{evidence.map((e) => (
              <div key={e.id} className="px-5 py-3 flex items-start gap-3 text-[13px]"><span className="mono text-[11.5px] text-faint w-6 shrink-0 pt-0.5">{e.id}</span><span className="flex-1">{e.label}</span><Badge>{e.source}</Badge></div>))}
            </div>
          </section>
        </div>
        <div className="grid gap-6 lg:sticky lg:top-0">
          <section>
            <SectionHeader title="Hypotheses" subtitle="Conflicting notes and sensors mean verify, not 'sensor proven broken'." />
            {!o.investigated ? <Empty icon={Sparkles} title="Not investigated yet" body="Nemotron Nano queries telemetry, the asset map, the logbook and runbooks, and cites everything it says." />
              : <div className="grid gap-3">{hypotheses.map((h) => (
                <div key={h.id} className="card p-5">
                  <div className="flex items-start gap-2 mb-2"><span className="font-semibold text-[14.5px] flex-1">{h.title}</span><Badge tone={h.confidence === 'Likely' ? 'warning' : 'neutral'}>{h.confidence}</Badge></div>
                  <p className="text-[13px] text-muted mb-2.5">{h.against}</p>
                  <div className="flex flex-wrap gap-1.5 items-center text-[12px] text-faint">Cites {h.cites.map((c) => <span key={c} className="mono text-muted">{c}</span>)}</div>
                </div>))}
                <div className="card p-5 border-accent/40">
                  <div className="text-[12px] text-muted mb-1">Suggested next task · for {nextTask.role}</div>
                  <div className="font-semibold text-[14.5px] mb-1">{nextTask.task}</div>
                  <div className="text-[13px] text-muted">Owner from shift map: {nextTask.owner}</div>
                  <div className="text-[12.5px] mt-3 flex items-start gap-2 text-warning"><Lock size={14} className="shrink-0 mt-0.5" />{nextTask.needsApproval}</div>
                </div>
              </div>}
          </section>
          <Acceptance />
        </div>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- R5
export function OpsHandoff() {
  const d = useDerived(); const { s, o } = d; const nav = useNavigate();
  const [verifying, setVerifying] = useState(false);
  if (!d.wo) return <Page><PageHeader kicker="Operate · R5" title="Verify recovery, hand off" /><Empty icon={ShieldCheck} title="Nothing to verify yet" body="Play the night on the Alerts screen first." action={<Button variant="primary" onClick={() => nav('/operate')}>Go to alerts</Button>} /></Page>;
  const scriptedFresh = () => s.run('r5', ['GET /redfish/v1/Chassis/{first}/Thermal on 10.9.1.2', 'CPU1 Temp Health OK · 64 °C · sample 03:02:10 (12 s old)', 'Recovery check: Health OK on 3 consecutive 1-min evaluations ✓'], () => s.setOps({ freshReading: '03:02:10', recovered: true }), 600);
  const fresh = async () => {
    if (!d.L) return scriptedFresh();
    setVerifying(true);
    try { const st = await api.ops("verify", { asset_id: "hpc-c2" }) as unknown as LiveOps; s.setLive({ opsState: st as never }); if (st.recovery?.verified) s.setOps({ freshReading: st.recovery.at, recovered: true }); else scriptedFresh(); }
    catch { scriptedFresh(); } finally { setVerifying(false); }
  };
  return (
    <Page>
      <PageHeader kicker="Operate · R5" title="Verify recovery, hand off"
        subtitle="Recovery is verified only by a fresh measurement and a passing recovery check, never by closing a ticket. The incoming shift accepts the handoff explicitly."
        meta={<Badge tone={o.recovered ? 'ok' : 'warning'}>{o.recovered ? 'Recovery verified' : 'Incident open'}</Badge>} />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
        <div className="grid gap-4">
          <Card header={<><Wrench size={14} className="text-muted" /><span className="font-semibold text-[13px]">Work order WO-1042</span><span className="text-[12px] text-muted ml-auto">{o.woClosed ? 'closed by technician' : 'open'}</span></>}>
            <p className="text-[13.5px] mb-3">Fan 4 replaced on Compute2 (R12 · U16) by Ana P. at 02:58.</p>
            {!o.woClosed ? <Button onClick={async () => { if (d.L) s.setLive({ opsState: await api.ops('close', { asset_id: 'hpc-c2' }) }); s.setOps({ woClosed: true, closeBlocked: true }); }}><Check size={15} /> Close work order</Button>
              : <div className={cx('rounded-lg border p-3.5 text-[13px] flex items-start gap-2.5', o.recovered ? 'border-ok/40' : 'border-warning/50')}>{o.recovered ? <Check size={15} className="text-ok shrink-0 mt-0.5" /> : <AlertTriangle size={15} className="text-warning shrink-0 mt-0.5" />}<span>{o.recovered ? 'Incident closed: work order closed and recovery verified.' : 'Work order closed, but the incident stays open: no fresh measurement or recovery check yet.'}</span></div>}
          </Card>
          <Card header={<><Thermometer size={14} className="text-muted" /><span className="font-semibold text-[13px]">Recovery verification</span></>}>
            <ul className="grid gap-2 text-[13px] mb-4">
              <Req ok={!!o.freshReading}>Fresh Redfish measurement (under 5 min old)</Req>
              <Req ok={o.recovered}>Thermal Health OK on 3 consecutive evaluations</Req>
              <Req ok={o.woClosed}>Work order closed by technician</Req>
            </ul>
            {d.L?.recovery && <ol className="grid gap-1.5 mb-3">{d.L.recovery.runs.map((r) => <li key={r.evaluation} className="flex gap-2 text-[12.5px] mono"><Check size={14} className={r.state === 'OK' ? 'text-ok shrink-0' : 'text-critical shrink-0'} />evaluation {r.evaluation}: check_temperature.sh → {r.state} {r.how === 'executed' ? `(${r.ms} ms, executed)` : '(modelled)'}</li>)}</ol>}
            {verifying && <div className="text-[12.5px] text-muted mb-3">Running check_temperature.sh against the BMC…</div>}
            {s.busy?.key === 'r5' && <ol className="grid gap-1.5 mb-3">{s.busy.log.map((l, i) => <li key={i} className="flex gap-2 text-[12.5px] mono"><Check size={14} className="text-ok shrink-0" />{l}</li>)}</ol>}
            {!o.recovered && <Button variant="primary" disabled={!!s.busy} onClick={fresh}><Thermometer size={15} /> Take fresh reading</Button>}
          </Card>
          <Acceptance />
        </div>
        <Card header={<><ClipboardCheck size={14} className="text-muted" /><span className="font-semibold text-[13px]">Shift handoff · Nov 8, night → day</span></>}>
          <dl className="grid gap-4 text-[13.5px]">
            <HandoffItem label="Unresolved risks">{o.recovered ? 'Sensor-fault hypothesis (h2) not ruled out: watch hpc-c2 thermal for 24 h. Compute3 telemetry is stale since 02:04 and is not counted as healthy.' : 'hpc-c2 still unverified. Compute3 telemetry stale since 02:04.'}</HandoffItem>
            <HandoffItem label="Work completed">Page to Luis O. failed, fallback to Priya N. delivered (02:13). Acknowledged by Maya R. (02:16). Fan 4 replaced by Ana P. (02:58).{o.recovered && ' Recovery verified 03:02.'}</HandoffItem>
            <HandoffItem label="Owner">HPC Ops · Luis O. (day primary)</HandoffItem>
            <HandoffItem label="Next action">{o.recovered ? 'Fix the primary pager receiver (503). Check Compute3 BMC reachability.' : 'Verify recovery on hpc-c2 before closing the incident.'}</HandoffItem>
          </dl>
          <div className="mt-5 pt-4 border-t hairline">
            {o.handoffAccepted ? <Badge tone="ok"><Check size={11} /> Accepted by {o.handoffAccepted}</Badge>
              : <Button variant="primary" onClick={() => s.setOps({ handoffAccepted: 'Dev K. (incoming shift) · 07:01' })}><Check size={15} /> Accept handoff as Dev K.</Button>}
          </div>
        </Card>
      </div>
    </Page>
  );
}

function Req({ ok, children }: { ok: boolean; children: ReactNode }) { return <li className="flex items-start gap-2.5">{ok ? <Check size={15} className="text-ok shrink-0 mt-0.5" strokeWidth={2.5} /> : <X size={15} className="text-faint shrink-0 mt-0.5" />}<span className={ok ? '' : 'text-muted'}>{children}</span></li>; }
function HandoffItem({ label, children }: { label: string; children: ReactNode }) { return <div><dt className="text-[12px] text-muted mb-1">{label}</dt><dd>{children}</dd></div>; }
