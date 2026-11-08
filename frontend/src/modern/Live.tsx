import { useEffect, useRef, useState } from 'react';
import { Check, X, Lock, ShieldAlert, Terminal, Wrench, Loader2, AlertTriangle, Cpu, Radio } from 'lucide-react';
import { Badge, Card, cx } from '../components/ui';
import { api, type AgentEvent, type LiveReport } from './api';
import { useModern } from './store';

/** Small strip saying exactly what is live and what is scripted on this screen. */
export function LiveStrip({ need }: { need: ('tools' | 'plugin' | 'key')[] }) {
  const { live } = useModern();
  if (!live) return <div className="text-[12.5px] text-muted mb-6 flex items-center gap-2"><Radio size={13} /> Backend not reachable: this screen is the scripted demo.</div>;
  const items = { tools: ['promtool + amtool', live.tools.promtool && live.tools.amtool], plugin: ['TTU plugin execution', live.plugin_executable], key: ['Nemotron API', live.nemotron_key] } as const;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 text-[12.5px]">
      <span className="text-muted">Backend:</span>
      {need.map((n) => <Badge key={n} tone={items[n][1] ? 'ok' : 'warning'}>{items[n][1] ? <Check size={11} /> : <AlertTriangle size={11} />} {items[n][0]}{items[n][1] ? ' live' : ' unavailable'}</Badge>)}
    </div>
  );
}

/** Streams a Nemotron agent job: every tool call it makes, with timings. */
export function AgentRun({ job, seed, onDone, title }: { job: 'recover' | 'repair' | 'investigate'; seed?: string; onDone: (e: AgentEvent) => void; title: string }) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const done = useRef(false);
  useEffect(() => {
    const stop = api.agent(job, (e) => {
      setEvents((v) => [...v, e]);
      if ((e.type === 'done' || e.type === 'error') && !done.current) { done.current = true; onDone(e); }
    }, seed);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, seed]);
  const start = events.find((e) => e.type === 'start');
  const finished = events.some((e) => e.type === 'done' || e.type === 'error');
  const tools = events.filter((e) => e.type === 'tool').length;
  return (
    <Card className="mb-6" header={<>
      {finished ? <Check size={14} className="text-ok" /> : <Loader2 size={14} className="animate-spin text-accent" />}
      <span className="font-semibold text-[13px]">{title}</span>
      {start && <Badge tone={start.mode === 'live' ? 'ok' : 'warning'}>{start.mode === 'live' ? 'live' : `cached replay · recorded ${String(start.recorded_at)}`}</Badge>}
      {start?.model ? <Badge tone="accent"><Cpu size={11} /> {String(start.model)}</Badge> : null}
      <span className="ml-auto text-[12px] text-muted num">{tools} tool calls</span>
    </>}>
      <ol className="grid gap-2 max-h-[360px] overflow-auto">
        {events.filter((e) => e.type !== 'start' && e.type !== 'done').map((e, i) => (
          <li key={i} className="text-[12.5px] flex items-start gap-2.5">
            {e.type === 'tool' ? <Wrench size={13} className="text-accent shrink-0 mt-0.5" /> : e.type === 'error' ? <X size={13} className="text-critical shrink-0 mt-0.5" /> : <Terminal size={13} className="text-muted shrink-0 mt-0.5" />}
            <div className="min-w-0">
              {e.type === 'tool' ? <>
                <div><span className="mono font-medium">{String(e.name)}</span><span className="mono text-muted"> {String(e.args)}</span><span className="text-faint num"> · model {String(e.model_ms)} ms · tool {String(e.tool_ms)} ms</span></div>
                <div className="mono text-[11.5px] text-muted break-all">→ {String(e.result)}</div>
              </> : <span className={cx(e.type === 'error' ? 'text-critical' : 'text-muted')}>{String(e.text)}</span>}
            </div>
          </li>))}
        {!finished && <li className="text-[12px] text-faint">waiting for Nemotron…</li>}
      </ol>
    </Card>
  );
}

const DIMS = [['missedExtra', 'Missed / extra'], ['severity', 'Severity'], ['timing', 'Timing'], ['recipient', 'Recipient'], ['recovery', 'Recovery']] as const;

/** The real harness result: the old plugin + Nagios model vs promtool + amtool, per case and dimension. */
export function LiveReportView({ r }: { r: LiveReport }) {
  const fails = r.cases.filter((c) => !c.pass).length;
  const executed = r.plugin.filter((p) => p.how === 'executed').length;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <Badge tone="ok"><Check size={11} /> Live run</Badge>
        <Badge tone={fails ? 'critical' : 'ok'}>{r.cases.length - fails}/{r.cases.length} visible cases</Badge>
        <Badge tone={r.held_out.some((h) => !h.pass) ? 'critical' : 'ok'}>{r.held_out.filter((h) => h.pass).length}/{r.held_out.length} held-out</Badge>
        <span className="text-muted">old: {executed ? `TTU plugin executed on ${executed} BMC responses` : 'plugin modelled (jq not installed)'} + Nagios scheduling from templates.cfg ({String(r.legacy_config.max_check_attempts)} attempts, {String(r.legacy_config.retry_interval)} min retry) · new: promtool + amtool · {r.elapsed_s} s</span>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left border-b hairline"><tr><th className="th pl-5 pr-3 h-11">Case</th><th className="th px-3">Old check (Nagios + plugin)</th><th className="th px-3">Candidate (promtool)</th>{DIMS.map(([, l]) => <th key={l} className="th px-3 text-center whitespace-nowrap">{l}</th>)}</tr></thead>
          <tbody>{r.cases.map((c) => (
            <tr key={c.id} className="border-b hairline last:border-0 align-top">
              <td className="pl-5 pr-3 py-3.5"><div className="font-medium">{c.name}</div><div className="text-[12px] text-faint mt-0.5 max-w-[240px]">{c.scenario}</div>{c.notes.map((n) => <div key={n} className={cx('text-[12px] mt-1', c.pass ? 'text-ok' : 'text-critical')}>{n}</div>)}</td>
              <td className="px-3 py-3.5 text-legacy text-[12px] mono">{c.legacy.map((l) => <div key={l}>{l}</div>)}</td>
              <td className="px-3 py-3.5 text-[12px] mono">{c.candidate.slice(0, 4).map((l) => <div key={l}>{l}</div>)}{c.candidate.length > 4 && <div className="text-faint">+{c.candidate.length - 4} more</div>}</td>
              {DIMS.map(([k]) => <td key={k} className="px-3 py-3.5 text-center">{c.result[k] === 'pass' ? <Check size={15} className="inline text-ok" strokeWidth={2.5} /> : <X size={15} className="inline text-critical" strokeWidth={2.5} />}</td>)}
            </tr>))}
          </tbody>
        </table>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Card header={<><Lock size={14} className="text-muted" /><span className="font-semibold text-[13px]">Held-out cases</span><span className="text-[12px] text-muted ml-auto">sealed</span></>}>
          <ul className="grid gap-2 text-[13px]">{r.held_out.map((h) => <li key={h.id} className="flex items-center gap-2">{h.pass ? <Check size={15} className="text-ok" /> : <X size={15} className="text-critical" />}{h.name}</li>)}</ul>
          <p className="text-[12px] text-faint mt-3">Only pass/fail leaves the harness; the repair agent sees a count.</p>
        </Card>
        <Card header={<><ShieldAlert size={14} className="text-muted" /><span className="font-semibold text-[13px]">Harness sanity</span></>}>
          <ul className="grid gap-2 text-[13px]">{r.sanity.map((s) => <li key={s.name} className="flex gap-2">{s.rejected ? <Check size={15} className="text-ok shrink-0 mt-0.5" /> : <X size={15} className="text-critical shrink-0 mt-0.5" />}<span>{s.name}: <b>{s.rejected ? 'rejected' : 'NOT rejected'}</b> <span className="text-muted">({s.failed_cases.length} cases)</span></span></li>)}</ul>
        </Card>
        <Card header={<><Terminal size={14} className="text-muted" /><span className="font-semibold text-[13px]">Plugin executions</span></>}>
          <ul className="grid gap-1.5 text-[12px] mono">{r.plugin.map((p) => <li key={p.bmc_health}><span className="text-muted">{p.bmc_health}</span> → <b>{p.state}</b> <span className="text-faint">{p.how === 'executed' ? `${p.ms} ms` : 'modelled'}</span></li>)}</ul>
          <p className="text-[12px] text-faint mt-3">Old notifications go to {r.legacy_recipient} (contacts.cfg).</p>
        </Card>
      </div>
    </div>
  );
}
