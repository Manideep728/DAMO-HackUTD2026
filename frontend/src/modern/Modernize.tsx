import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, X, Lock, FileCode2, AlertTriangle, CircleHelp, ShieldAlert, Loader2, Sparkles, Play, RotateCcw, GitCompare, Rocket, Eye, FlaskConical, Download } from 'lucide-react';
import { Button, Card, Badge, PageHeader, SectionHeader, Empty, ModelBadge, cx } from '../components/ui';
import { useModern, modDone } from './store';
import { api } from './api';
import { AgentRun, LiveReportView, LiveStrip } from './Live';
import { inputs, pluginSnippet, templateSnippet, assets, behaviors, decisions, preserved, changed, rulesV1, rulesV2, routesV1, routesV2, collectorSnippet, cases, decoy, heldOut, repairNotes, REPO, REPO_URL, type Verdict, type CaseResult } from './data';

const steps = [
  { n: 1, key: 'm1', path: 'import', label: 'Import' },
  { n: 2, key: 'm2', path: 'recover', label: 'Recover intent' },
  { n: 3, key: 'm3', path: 'generate', label: 'Generate' },
  { n: 4, key: 'm4', path: 'test', label: 'Test' },
  { n: 5, key: 'm5', path: 'release', label: 'Repair & release' },
] as const;

function Stepper() {
  const s = useModern();
  const done = modDone(s.mod, s);
  return (
    <nav aria-label="Modernization steps" className="mb-10 grid grid-cols-5 gap-2">
      {steps.map((st) => (
        <NavLink key={st.key} to={`/modernize/${st.path}`} className={({ isActive }) => cx('group rounded-xl border px-3 py-2.5 t', isActive ? 'border-text bg-surface' : 'border-border hover:border-border-strong hover:bg-surface')}>
          {({ isActive }) => (
            <div className="flex items-center gap-2.5 min-w-0">
              {done[st.key] ? <span className="h-5 w-5 shrink-0 grid place-items-center rounded-full bg-ok/15 text-ok"><Check size={12} strokeWidth={3} /></span>
                : <span className={cx('h-5 w-5 shrink-0 grid place-items-center rounded-full border mono text-[12px]', isActive ? 'border-text text-text' : 'border-border-strong text-faint')}>{st.n}</span>}
              <span className="min-w-0"><span className="block mono text-[12px] text-faint">M{st.n}</span><span className={cx('block text-[14px] font-medium leading-tight', isActive ? 'text-text' : 'text-muted group-hover:text-text')}>{st.label}</span></span>
            </div>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Page({ children }: { children: ReactNode }) { return <div className="mx-auto w-full max-w-[1320px]"><Stepper />{children}</div>; }

function RunLog({ k, title }: { k: string; title: string }) {
  const { busy } = useModern();
  if (!busy || busy.key !== k) return null;
  return (
    <Card className="mb-6" header={<><Loader2 size={14} className="animate-spin text-accent" /><span className="font-semibold text-[14px]">{title}</span></>}>
      <ol className="grid gap-1.5 text-[14px]">{busy.log.map((l, i) => <li key={i} className="flex items-start gap-2"><Check size={14} className="text-ok mt-0.5 shrink-0" /><span className="mono text-[12.5px]">{l}</span></li>)}</ol>
    </Card>
  );
}

function Code({ title, code, tone }: { title: string; code: string; tone?: 'old' | 'new' }) {
  return (
    <div className="rounded-xl border hairline overflow-hidden bg-surface">
      <div className="px-4 h-9 flex items-center gap-2 text-[12px] text-muted border-b hairline mono"><FileCode2 size={13} />{title}{tone && <span className={cx('ml-auto text-[12px] font-sans', tone === 'old' ? 'text-legacy' : 'text-accent')}>{tone === 'old' ? 'legacy' : 'generated'}</span>}</div>
      <pre className="overflow-auto text-[12.5px] leading-[1.6] p-4 m-0 max-h-[360px]"><code>{code}</code></pre>
    </div>
  );
}

const next = (to: string, label: string, nav: (p: string) => void, disabled?: boolean, title?: string) => <Button variant="primary" disabled={disabled} title={title} onClick={() => nav(to)}>{label} <ArrowRight size={15} /></Button>;

// ---------------------------------------------------------------- M1
export function M1Import() {
  const s = useModern(); const nav = useNavigate();
  const counts = { pinned: inputs.filter((i) => i.status === 'pinned').length, gaps: inputs.filter((i) => i.status !== 'pinned').length };
  const start = () => s.run('m1', [`git clone ${REPO} · pinned master`, 'redfishplugins/check_temperature.sh · check_bmc.sh', 'objects/commands.cfg · templates.cfg · hosts.cfg · contacts.cfg', 'assets.csv (3 assets) · runbooks/high-cpu-temperature.md', 'cross-reference commands ↔ scripts ↔ templates', '4 inputs missing or unsupported · 1 security flag'], () => s.setMod({ imported: true }), 450);
  return (
    <Page>
      <PageHeader kicker="Modernize · M1" title="Import the real inputs"
        subtitle="Pin the old check, the inherited Nagios configuration, the asset and owner map, and the procedures. Anything referenced but not supplied is shown, not guessed."
        actions={s.mod.imported ? next('/modernize/recover', 'Recover behavior', nav) : <Button variant="primary" disabled={!!s.busy} onClick={start}><Download size={15} /> Import TTU Redfish check</Button>} />
      <RunLog k="m1" title="Importing" />
      {!s.mod.imported && !s.busy && <Empty icon={Download} title="Nothing imported yet" body={`Baseline: the public TTU Nagios–Redfish temperature check (${REPO}). It maps BMC health and returns Unknown when the temperature feed is lost. It does not set a Celsius threshold.`} action={<Button variant="primary" onClick={start}><Download size={15} /> Import TTU Redfish check</Button>} />}
      {s.mod.imported && <>
        <div className="flex flex-wrap gap-2 mb-4 text-[14px]"><Badge tone="ok"><Check size={11} /> {counts.pinned} pinned</Badge><Badge tone="warning"><AlertTriangle size={11} /> {counts.gaps} missing, unsupported or flagged</Badge><a className="text-[12.5px] text-muted hover:text-text underline-offset-2 hover:underline ml-auto inline-flex items-center min-h-12" href={REPO_URL} target="_blank" rel="noreferrer">{REPO} ↗</a></div>
        <div className="card overflow-x-auto mb-8">
          <table className="w-full text-[14px]">
            <thead className="text-left border-b hairline"><tr>{['Input', 'Type', 'Status', 'Source', 'What we know'].map((h) => <th key={h} className="th px-4 h-11 whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{inputs.map((i) => (
              <tr key={i.id} className="border-b hairline last:border-0 align-top">
                <td className="px-4 py-3 mono text-[12.5px] whitespace-nowrap">{i.name}{i.demo && <span className="ml-2"><Badge>demo data</Badge></span>}</td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">{i.kind}</td>
                <td className="px-4 py-3"><StatusTag s={i.status} /></td>
                <td className="px-4 py-3 text-muted text-[12.5px] whitespace-nowrap">{i.source}</td>
                <td className="px-4 py-3 text-muted max-w-[420px]">{i.note}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
        <div className="grid lg:grid-cols-2 gap-4 mb-8">
          <Code title="redfishplugins/check_temperature.sh (excerpt)" code={pluginSnippet} tone="old" />
          <Code title="objects/templates.cfg (excerpt)" code={templateSnippet} tone="old" />
        </div>
        <SectionHeader title="Asset and owner map" subtitle="Stable asset IDs replace bare IP addresses. Demo data for this site." />
        <div className="card overflow-x-auto">
          <table className="w-full text-[14px]"><thead className="text-left border-b hairline"><tr>{['Asset ID', 'Host', 'BMC', 'Rack', 'Owner', 'On-call primary', 'Fallback', 'Workload owner'].map((h) => <th key={h} className="th px-4 h-11 whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{assets.map((a) => <tr key={a.id} className="border-b hairline last:border-0"><td className="px-4 py-3 mono">{a.id}</td><td className="px-4">{a.host}</td><td className="px-4 mono text-muted">{a.bmc}</td><td className="px-4 text-muted">{a.rack}</td><td className="px-4">{a.owner}</td><td className="px-4">{a.primary}</td><td className="px-4 text-muted">{a.fallback}</td><td className="px-4 text-muted">{a.workload}</td></tr>)}</tbody>
          </table>
        </div>
      </>}
    </Page>
  );
}

function StatusTag({ s }: { s: string }) {
  const m: Record<string, [string, ReactNode, string]> = { pinned: ['Pinned', <Lock size={11} />, 'ok'], missing: ['Missing', <CircleHelp size={11} />, 'warning'], unsupported: ['Unsupported', <X size={11} />, 'warning'], flag: ['Security flag', <ShieldAlert size={11} />, 'critical'] };
  const [w, i, t] = m[s];
  return <Badge tone={t as 'ok'}>{i} {w}</Badge>;
}

// ---------------------------------------------------------------- M2
export function M2Recover() {
  const s = useModern(); const nav = useNavigate();
  const [agentOn, setAgentOn] = useState(false);
  const scripted = () => s.run('m2', ['Nemotron Super · read_file check_temperature.sh', 'run_plugin against Redfish mock: Health=OK → exit 0 ✓', 'run_plugin: Health=Critical → exit 2 ✓ · empty Thermal → exit 3 ✓', 'read_file templates.cfg · contacts.cfg', '7 behaviors recorded with sources · 6 questions for the operator'], () => s.setMod({ recovered: true }));
  const start = () => (s.live ? setAgentOn(true) : scripted());
  const liveBehaviors = s.liveData.behaviors;
  const blocked = s.criticalOpen > 0;
  return (
    <Page>
      <PageHeader kicker="Modernize · M2" title="Recover behavior and intent"
        subtitle="Every state, missing-data rule, retry, recovery and recipient is recorded with its source. An operator confirms each deliberate change; an unresolved critical policy blocks acceptance."
        meta={s.mod.recovered ? <><ModelBadge model="Nemotron Super" /><Badge tone={s.decisionsOpen ? 'warning' : 'ok'}>{decisions.length - s.decisionsOpen}/{decisions.length} decisions confirmed</Badge>{blocked && <Badge tone="critical"><Lock size={11} /> Acceptance blocked</Badge>}</> : undefined}
        actions={!s.mod.imported ? next('/modernize/import', 'Import first', nav) : s.mod.recovered ? next('/modernize/generate', 'Generate change', nav, s.decisionsOpen > 0 || blocked, blocked ? 'Resolve the critical policy first' : 'Confirm every decision first') : <Button variant="primary" disabled={!!s.busy} onClick={start}><Sparkles size={15} /> Recover with Nemotron</Button>} />
      <LiveStrip need={['key', 'plugin']} />
      <RunLog k="m2" title="Recovering behavior" />
      {agentOn && <AgentRun job="recover" title="Nemotron recovering behavior" onDone={(e) => {
        if (e.type === 'done') { s.setLive({ behaviors: (e.behaviors as never[]) ?? [], questions: (e.questions as never[]) ?? [] }); s.setMod({ recovered: true }); }
        else { setAgentOn(false); scripted(); }
      }} />}
      {!s.mod.recovered && !s.busy && !agentOn && <Empty icon={Sparkles} title={s.mod.imported ? 'Behavior not recovered yet' : 'Import the inputs first'} body="Nemotron Super reads the plugin and templates, then the real plugin runs against a Redfish mock to confirm each reading. Nothing is taken on trust." action={s.mod.imported ? <Button variant="primary" onClick={start}><Sparkles size={15} /> Recover with Nemotron</Button> : <Button onClick={() => nav('/modernize/import')}>Go to M1</Button>} />}
      {s.mod.recovered && <div className="grid lg:grid-cols-[1fr_1fr] gap-6 items-start">
        <section>
          <SectionHeader title="Recorded behavior" subtitle={liveBehaviors.length ? 'Recorded by Nemotron in this run, each with its source.' : 'Each line is backed by a source and, where it can run, by executing the plugin.'} />
          <div className="card divide-y divide-[var(--border)]">{(liveBehaviors.length ? liveBehaviors.map((b, i) => ({ ...b, id: `l${i}` })) : behaviors).map((b) => (
            <div key={b.id} className="px-5 py-4">
              <div className="flex items-center gap-2 mb-1.5"><span className="text-[12px] font-medium text-muted">{b.area}</span><span className="ml-auto mono text-[12px] text-faint">{b.source}</span></div>
              <p className="text-[14px] leading-relaxed">{b.text}</p>
            </div>))}
          </div>
        </section>
        <section className="lg:sticky lg:top-0">
          <SectionHeader title="Operator decisions" subtitle="Preserve or deliberately change. Answers become test expectations." />
          <div className="grid gap-3">{decisions.map((d) => {
            const v = s.mod.decisions[d.id]; const stillBlocking = d.critical && (!v || v === 'keep');
            return (
              <div key={d.id} className={cx('card p-5', stillBlocking && 'border-critical/50')}>
                <div className="flex items-start gap-2 mb-1"><span className="font-semibold text-[14px] flex-1">{d.title}</span>{d.critical && <Badge tone={stillBlocking ? 'critical' : 'ok'}>{stillBlocking ? 'Critical · blocks acceptance' : 'Critical · resolved'}</Badge>}</div>
                <p className="text-[14px] text-muted mb-3">{d.detail}</p>
                <div className="grid gap-2">{d.options.map((o) => (
                  <button key={o.id} onClick={() => s.decide(d.id, o.id)} className={cx('text-left rounded-lg border px-3 py-2.5 text-[14px] flex items-center gap-2.5 t', v === o.id ? 'border-text bg-surface-2' : 'border-border hover:border-border-strong')}>
                    <span className={cx('h-4 w-4 rounded-full border grid place-items-center shrink-0', v === o.id ? 'border-text' : 'border-border-strong')}>{v === o.id && <span className="h-2 w-2 rounded-full bg-text" />}</span>
                    <span className="flex-1">{o.label}</span>
                    <span className={cx('text-[12px]', o.kind === 'change' ? 'text-accent' : 'text-muted')}>{o.kind === 'change' ? 'deliberate change' : 'preserve'}</span>
                    {o.id === d.recommended && <span className="text-[12px] text-faint">recommended</span>}
                  </button>))}
                </div>
                {v && <div className="text-[12px] text-faint mt-2.5">Confirmed by Maya R. (operations lead) · source, owner and test recorded</div>}
              </div>);
          })}</div>
        </section>
      </div>}
    </Page>
  );
}

// ---------------------------------------------------------------- M3
export function M3Generate() {
  const s = useModern(); const nav = useNavigate();
  const ready = s.mod.recovered && s.decisionsOpen === 0 && s.criticalOpen === 0;
  const start = () => s.run('m3', ['Nemotron Super · write collector config from assets.csv', 'write Prometheus rules from 7 behaviors + 5 decisions', 'write Alertmanager routes', 'promtool check rules ✓ · amtool check-config ✓', 'candidate v1 ready for testing'], () => s.setMod({ generated: true }));
  const v = s.mod.repaired ? 2 : 1;
  return (
    <Page>
      <PageHeader kicker="Modernize · M3" title="Generate a reviewable change"
        subtitle="Nemotron writes the collector, rules and routing, and lists exactly what is preserved and what is intentionally changed."
        meta={s.mod.generated ? <><ModelBadge model="Nemotron Super" /><Badge>candidate v{v}</Badge></> : undefined}
        actions={s.mod.generated ? next('/modernize/test', 'Test the alert path', nav) : <Button variant="primary" disabled={!ready || !!s.busy} title={ready ? undefined : 'Finish M2 first'} onClick={start}><Sparkles size={15} /> Generate candidate</Button>} />
      <RunLog k="m3" title="Generating" />
      {!s.mod.generated && !s.busy && <Empty icon={FileCode2} title={ready ? 'No candidate yet' : 'Confirm M2 decisions first'} body="The candidate is built only from recorded behavior and confirmed decisions, so every line can be traced back." action={ready ? <Button variant="primary" onClick={start}><Sparkles size={15} /> Generate candidate</Button> : <Button onClick={() => nav('/modernize/recover')}>Go to M2</Button>} />}
      {s.mod.generated && <>
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <Card header={<><Check size={14} className="text-ok" /><span className="font-semibold text-[14px]">Preserved</span><span className="text-[12px] text-muted ml-auto">{preserved.length}</span></>}><ul className="grid gap-2 text-[14px]">{preserved.map((p) => <li key={p} className="flex gap-2"><span className="text-faint">–</span>{p}</li>)}</ul></Card>
          <Card header={<><GitCompare size={14} className="text-accent" /><span className="font-semibold text-[14px]">Intentionally changed</span><span className="text-[12px] text-muted ml-auto">{changed.length}</span></>}><ul className="grid gap-2 text-[14px]">{changed.map((p) => <li key={p} className="flex gap-2"><span className="text-faint">–</span>{p}</li>)}</ul></Card>
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Code title={`rules/ttu-redfish-temperature.yml · v${v}`} code={v === 2 ? rulesV2 : rulesV1} tone="new" />
          <div className="grid gap-4"><Code title={`alertmanager/routes.yml · v${v}`} code={v === 2 ? routesV2 : routesV1} tone="new" /><Code title="gauntlet-redfish-collector.yaml" code={collectorSnippet} tone="new" /></div>
        </div>
      </>}
    </Page>
  );
}

// ---------------------------------------------------------------- M4
const dims: [Exclude<keyof CaseResult, 'note'>, string][] = [['missedExtra', 'Missed / extra'], ['severity', 'Severity'], ['timing', 'Timing'], ['recipient', 'Recipient'], ['recovery', 'Recovery']];
const V = ({ v }: { v: Verdict }) => v === 'pass' ? <span className="inline-flex text-ok" aria-label="pass"><Check size={15} strokeWidth={2.5} /></span> : <span className="inline-flex text-critical" aria-label="fail"><X size={15} strokeWidth={2.5} /></span>;

export function M4Test() {
  const s = useModern(); const nav = useNavigate();
  const run = s.mod.testRun; const ver = s.mod.repaired ? 2 : 1;
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const toolsLive = !!s.live && s.live.tools.promtool && s.live.tools.amtool;
  const scripted = () => s.run('m4', ['Replay 6 scenarios through Nagios Core + check_temperature.sh (old)', `Replay the same scenarios through Prometheus + Alertmanager (candidate v${ver})`, 'Compare alerts, severity, timing, recipient, recovery', 'Mutation checks: wrong-recipient mutant, alert-on-everything decoy', 'Held-out cases (sealed, run last)'], () => s.setMod({ testRun: ver as 1 | 2 }), 600);
  const start = async () => {
    if (!toolsLive) return scripted();
    setTesting(true); setLiveErr(null);
    try {
      const cand = ver === 2 ? s.liveData.agentCandidate : null;
      const r = await api.test(cand ? 'agent' : `v${ver}`, cand ?? undefined);
      if (!r.valid) throw new Error(`promtool check failed: ${r.promtool_check}`);
      s.setLive({ reports: { ...s.liveData.reports, [ver]: r } }); s.setMod({ testRun: ver as 1 | 2 });
    } catch (e) { setLiveErr(String(e)); scripted(); } finally { setTesting(false); }
  };
  const liveReport = run ? s.liveData.reports[run] : undefined;
  const rows = cases.map((c) => ({ c, r: run === 2 ? c.v2 : c.v1 }));
  const fails = run ? rows.filter(({ r }) => dims.some(([k]) => r[k] === 'fail')).length : 0;
  const hFails = run ? heldOut.filter((h) => (run === 2 ? h.v2 : h.v1) === 'fail').length : 0;
  return (
    <Page>
      <PageHeader kicker="Modernize · M4" title="Test the whole alert path"
        subtitle="Old and new run on identical scenarios. The fixed expectations and the held-out cases sit outside the agent's control."
        meta={run ? <><Badge>candidate v{run}</Badge><Badge tone={fails ? 'critical' : 'ok'}>{6 - fails}/6 acceptance cases</Badge><Badge tone={hFails ? 'critical' : 'ok'}>{3 - hFails}/3 held-out</Badge></> : undefined}
        actions={!s.mod.generated ? next('/modernize/generate', 'Generate first', nav) : run === ver ? next('/modernize/release', run === 2 ? 'Review and release' : 'Repair failures', nav) : <Button variant="primary" disabled={!!s.busy || testing} onClick={start}>{testing ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run tests on v{ver}</Button>} />
      <LiveStrip need={['tools', 'plugin']} />
      {testing && <Card className="mb-6" header={<><Loader2 size={14} className="animate-spin text-accent" /><span className="font-semibold text-[14px]">Running the real harness</span></>}><p className="text-[14px] text-muted">Old: TTU plugin against the Redfish mock + Nagios scheduling. New: promtool test rules + amtool routing. Then the wrong-recipient mutant, the decoy, and the sealed held-out cases.</p></Card>}
      {liveErr && <div className="card px-5 py-3 mb-6 text-[14px] border-warning/50 flex gap-2"><AlertTriangle size={15} className="text-warning shrink-0 mt-0.5" />Live run failed, showing the scripted result instead: {liveErr}</div>}
      <RunLog k="m4" title="Testing" />
      {!run && !s.busy && <Empty icon={FlaskConical} title={s.mod.generated ? 'No test run yet' : 'Generate a candidate first'} body="Acceptance cases: normal, sustained Critical, brief spike, missing temperature feed, recovery, and a correct alert sent to the wrong recipient." action={s.mod.generated ? <Button variant="primary" onClick={start}><Play size={15} /> Run tests on v{ver}</Button> : undefined} />}
      {liveReport && <LiveReportView r={liveReport} />}
      {run > 0 && !liveReport && <>
        <div className="text-[12.5px] text-muted mb-3">Scripted result (the live harness needs promtool and amtool).</div>
        <div className="card overflow-x-auto mb-6">
          <table className="w-full text-[14px]">
            <thead className="text-left border-b hairline"><tr><th className="th pl-5 pr-3 h-11">Case</th><th className="th px-3">Old check (Nagios)</th><th className="th px-3">Expected</th>{dims.map(([, l]) => <th key={l} className="th px-3 text-center whitespace-nowrap">{l}</th>)}</tr></thead>
            <tbody>{rows.map(({ c, r }) => (
              <tr key={c.id} className="border-b hairline last:border-0 align-top">
                <td className="pl-5 pr-3 py-3.5"><div className="font-medium">{c.name}</div><div className="text-[12px] text-faint mt-0.5 max-w-[260px]">{c.scenario}</div>{r.note && <div className="text-[12px] text-critical mt-1">{r.note}</div>}</td>
                <td className="px-3 py-3.5 text-legacy text-[12.5px]">{c.legacy}</td>
                <td className="px-3 py-3.5 text-[12.5px]">{c.expected}</td>
                {dims.map(([k]) => <td key={k} className="px-3 py-3.5 text-center"><V v={r[k]} /></td>)}
              </tr>))}
            </tbody>
          </table>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <Card header={<><Lock size={14} className="text-muted" /><span className="font-semibold text-[14px]">Held-out cases</span><span className="text-[12px] text-muted ml-auto">sealed</span></>}>
            <ul className="grid gap-2 text-[14px]">{heldOut.map((h) => <li key={h.id} className="flex items-center gap-2"><V v={run === 2 ? h.v2 : h.v1} />{h.name}</li>)}</ul>
            <p className="text-[12px] text-faint mt-3">Expectations are fixed and hashed before generation. The agent sees pass/fail counts only, never the cases.</p>
          </Card>
          <Card header={<><ShieldAlert size={14} className="text-muted" /><span className="font-semibold text-[14px]">Harness sanity</span></>}>
            <ul className="grid gap-2 text-[14px]"><li className="flex gap-2"><Check size={15} className="text-ok shrink-0 mt-0.5" /><span>Wrong-recipient mutant <b>failed</b> as required</span></li><li className="flex gap-2"><Check size={15} className="text-ok shrink-0 mt-0.5" /><span>{decoy.name} <b>failed</b></span></li></ul>
            <p className="text-[12px] text-faint mt-3">{decoy.result}</p>
          </Card>
          <Card header={<><Eye size={14} className="text-muted" /><span className="font-semibold text-[14px]">Verdict</span></>}>
            {fails || hFails ? <><div className="text-[15px] font-semibold text-critical mb-1">{fails} case{fails === 1 ? '' : 's'} and {hFails} held-out failing</div><p className="text-[14px] text-muted">Not releasable. Nemotron inspects the failures in M5.</p></>
              : <><div className="text-[15px] font-semibold text-ok mb-1">All cases pass</div><p className="text-[14px] text-muted">Bounded evidence on these scenarios, not universal equivalence. Engineer review, shadow and rollback come next.</p></>}
          </Card>
        </div>
      </>}
    </Page>
  );
}

// ---------------------------------------------------------------- M5
export function M5Release() {
  const s = useModern(); const nav = useNavigate(); const m = s.mod;
  const [repairOn, setRepairOn] = useState(false);
  const scriptedRepair = () => s.run('m5r', ['Nemotron Super · read failing cases (visible only)', 'diagnose: no for: clause vs 4 attempts × 1 min retry', 'diagnose: route ignores asset owner map (decision d1)', 'write candidate v2 · promtool ✓ · amtool ✓'], () => s.setMod({ repaired: true, testRun: 1 }));
  const repair = () => (s.live ? setRepairOn(true) : scriptedRepair());
  const shadow = () => s.run('m5s', ['Run v2 in shadow beside Nagios on 7 days of recorded Redfish data', 'Old: 3 notifications · New: 3 alerts · 0 unexplained diffs', '1 expected diff: recipient (decision d1)'], () => s.setMod({ shadow: true }));
  const rollback = () => s.run('m5b', ['Disable v2 rules · re-enable Nagios service "check temperature"', 'Inject Critical on Compute2 → Nagios notifies at +3 min ✓', 'Re-enable v2 · old check left running until cutover'], () => s.setMod({ rollback: true }));
  const release = () => s.run('m5x', ['Tag ttu-redfish-temperature v1.0.0', 'Bundle: rules, routes, collector, test evidence, rollback plan', 'Approved by Maya R. (operations lead)'], () => s.setMod({ released: true }), 500);
  if (m.testRun === 0) return <Page><PageHeader kicker="Modernize · M5" title="Repair, review, release" /><Empty icon={Rocket} title="Run the tests first" body="Repair works from test failures, and release needs passing results, engineer review, a shadow run and a tested rollback." action={<Button onClick={() => nav('/modernize/test')}>Go to M4</Button>} /></Page>;
  const passing = m.testRun === 2;
  return (
    <Page>
      <PageHeader kicker="Modernize · M5" title="Repair, review, release"
        subtitle="Nemotron inspects failures and revises the candidate. An engineer reviews the diff and results, then shadow operation and rollback are tested before release."
        meta={m.released ? <Badge tone="ok"><Check size={11} /> v1.0.0 released</Badge> : undefined} />
      <LiveStrip need={['key', 'tools']} />
      {repairOn && !m.repaired && <AgentRun job="repair" seed="v1" title="Nemotron repairing the candidate" onDone={(e) => {
        const cand = e.candidate as { rules: string; alertmanager: string } | null;
        if (e.type === 'done' && cand) { s.setLive({ agentCandidate: cand }); s.setMod({ repaired: true, testRun: 1 }); }
        else { setRepairOn(false); scriptedRepair(); }
      }} />}
      <RunLog k="m5r" title="Repairing" /><RunLog k="m5s" title="Shadow operation" /><RunLog k="m5b" title="Rollback test" /><RunLog k="m5x" title="Releasing" />
      <ol className="grid gap-4">
        <Gate n={1} title="Inspect failures and revise" done={m.repaired} body={m.repaired ? 'Candidate v2 written from the visible failures only. Held-out cases stayed sealed.' : 'v1 failed 5 of 6 acceptance cases and all 3 held-out cases.'}
          action={!m.repaired && <Button variant="primary" disabled={!!s.busy} onClick={repair}><Sparkles size={15} /> Repair with Nemotron</Button>}>
          <div className="grid md:grid-cols-2 gap-3 mt-4">{repairNotes.map((r) => <div key={r.failure} className="rounded-lg border hairline p-4 text-[14px]"><div className="text-critical font-medium mb-1">{r.failure}</div><div className="text-muted mb-1">{r.diagnosis}</div><div><span className="text-faint">Fix:</span> {r.fix}</div></div>)}</div>
        </Gate>
        <Gate n={2} title="Re-test v2" done={passing} locked={!m.repaired} body={passing ? '6/6 acceptance cases, 3/3 held-out; the wrong-recipient mutant and the alert-everything decoy were rejected.' : 'Run the same suite again on v2.'}
          action={m.repaired && !passing && <Button variant="primary" onClick={() => nav('/modernize/test')}><Play size={15} /> Open tests</Button>} />
        <Gate n={3} title="Engineer review" done={m.reviewed} locked={!passing} body="Review the diff from v1 and the evidence. Approval is a person, never the agent."
          action={passing && !m.reviewed && <Button variant="primary" onClick={() => s.setMod({ reviewed: true })}><Check size={15} /> Approve as Sam T. (engineer)</Button>}>
          {passing && <div className="grid lg:grid-cols-2 gap-3 mt-4"><Code title="rules · v1 → v2" code={'  - alert: ThermalHealthCritical\n    expr: max by (asset_id) (redfish_thermal_health) == 2\n+   for: 3m                             # 4 attempts × 1 min retry\n    labels: { severity: critical }'} tone="new" /><Code title="routes · v1 → v2" code={'- receiver: admins\n+ receiver: oncall-fallback\n+ routes:\n+ - matchers: [ owner="HPC Ops" ]\n+   receiver: hpc-ops-primary'} tone="new" /></div>}
        </Gate>
        <Gate n={4} title="Shadow operation" done={m.shadow} locked={!m.reviewed} body={m.shadow ? 'v2 ran beside Nagios on 7 days of recorded data: 0 unexplained differences, 1 expected recipient change.' : 'Run v2 beside the old check without paging anyone.'}
          action={m.reviewed && !m.shadow && <Button variant="primary" disabled={!!s.busy} onClick={shadow}><Eye size={15} /> Run shadow</Button>} />
        <Gate n={5} title="Rollback test" done={m.rollback} locked={!m.shadow} body={m.rollback ? 'Switched back to Nagios and proved an injected Critical still pages. Rollback takes one config change.' : 'Prove we can go back before going forward.'}
          action={m.shadow && !m.rollback && <Button variant="primary" disabled={!!s.busy} onClick={rollback}><RotateCcw size={15} /> Test rollback</Button>} />
        <Gate n={6} title="Release" done={m.released} locked={!m.rollback} body={m.released ? 'ttu-redfish-temperature v1.0.0 · rules, routes, collector, evidence pack, rollback plan. The old check keeps running until cutover.' : 'The operations lead approves a versioned update with test evidence and rollback.'}
          action={m.rollback && !m.released && <Button variant="primary" disabled={!!s.busy} onClick={release}><Rocket size={15} /> Approve and release as Maya R.</Button>} />
      </ol>
      <p className="text-[14px] text-muted mt-6 flex items-start gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5 text-warning" />Passing cases is bounded evidence on the stated scenarios, not universal equivalence. The evidence pack says what is not covered.</p>
      {m.released && <div className="mt-6 flex gap-2"><Button variant="primary" onClick={() => nav('/')}>Operate the new alerts <ArrowRight size={15} /></Button></div>}
    </Page>
  );
}

function Gate({ n, title, body, done, locked, action, children }: { n: number; title: string; body: string; done: boolean; locked?: boolean; action?: ReactNode; children?: ReactNode }) {
  return (
    <li className={cx('card p-5', locked && 'opacity-55')}>
      <div className="flex items-start gap-4">
        {done ? <span className="h-7 w-7 shrink-0 grid place-items-center rounded-full bg-ok/15 text-ok"><Check size={14} strokeWidth={3} /></span>
          : <span className="h-7 w-7 shrink-0 grid place-items-center rounded-full border border-border-strong mono text-[12px] text-muted">{locked ? <Lock size={12} /> : n}</span>}
        <div className="flex-1 min-w-0"><div className="font-semibold text-[15px]">{title}</div><p className="text-[14px] text-muted mt-0.5">{body}</p></div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </li>
  );
}
