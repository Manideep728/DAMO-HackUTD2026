import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Cpu, Loader2, ShieldCheck, Download, ClipboardCheck, UserX, FlaskConical, Check, X, TriangleAlert, GitCompare, RefreshCw, PackageCheck } from 'lucide-react';
import { Badge, PageHeader, cx } from '../components/ui';
import { ensurePackage, rf, SNAP, type Firmware, type Handover, type Pkg, type Readiness, type Evaluation } from './api';
import { Diff, ReportView, SourceStrip, Tabs, useLive } from './parts';

const AUTHOR_KEY = 'retrofit.author';
function readAuthor() { try { return localStorage.getItem(AUTHOR_KEY) ?? ''; } catch { return ''; } }

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1 text-label min-w-[220px]">
      <span className="font-medium">Engineer name</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Required for the decision record" aria-label="Engineer name" className="h-11 px-3 rounded-control border border-border bg-surface text-body" />
    </label>
  );
}

function Primary({ onClick, busy, disabled, icon, children, testid }: { onClick: () => void; busy: boolean; disabled?: boolean; icon: React.ReactNode; children: React.ReactNode; testid?: string }) {
  return (
    <button data-testid={testid} onClick={onClick} disabled={busy || disabled} className="btn btn-primary h-12 px-5 rounded-control text-body font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
      {busy ? <Loader2 size={19} className="animate-spin" /> : icon}{children}<ArrowRight size={17} />
    </button>
  );
}

export function FirmwarePage() {
  const live = useLive();
  const [author, setAuthor] = useState(readAuthor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fw, setFw] = useState<Firmware | null>(null);
  const [approved, setApproved] = useState<Pkg | null>(null);
  const who = author.trim();
  const go = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const apply = () => go(async () => {
    if (live) { await ensurePackage(who || 'J. Chen'); setFw(await rf.firmware('h1', '2.4.0')); } else setFw(SNAP.firmware);
    setApproved(null);
  });
  const approve = () => go(async () => {
    if (!fw) return;
    setApproved(live ? (await rf.approve('h1', fw.approval.id, who)).package : { ...SNAP.firmware_approved.package, accepted_by: who });
  });
  const pkgVersion = fw?.accepted_package?.version ?? SNAP.package_v1.version;
  return (
    <div className="mx-auto w-full max-w-[1360px]">
      <PageHeader kicker="Modernize · Liquid cooling · Change control" title="Revalidate firmware 2.4.0"
        meta={<><Badge tone="accent">CDU-1</Badge><Badge>Accepted package v{pkgVersion}</Badge></>}
        subtitle="Analyze the vendor point-list change, rerun only the affected behavior tests and keep the accepted package unchanged until an engineer approves the result." />
      <Tabs />
      <SourceStrip status={live} />
      {!fw && <div className="card p-5 mb-6">
        <div className="grid sm:grid-cols-3 gap-4 mb-5">
          <Summary icon={PackageCheck} label="Accepted package" value={`v${SNAP.package_v1.version} · firmware 2.3.0`} />
          <Summary icon={RefreshCw} label="Incoming version" value="CDU-1 firmware 2.4.0" />
          <Summary icon={GitCompare} label="Declared changes" value="State enum + leak point names" />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t hairline pt-4"><p className="grow text-body text-muted">This analyzes compatibility; it does not update a physical CDU.</p><Primary testid="fw-apply" onClick={apply} busy={busy} icon={<Cpu size={19} />}>Analyze firmware 2.4.0</Primary></div>
      </div>}
      {fw && <div className="card p-5 mb-6 flex flex-wrap items-center gap-4">
        {fw && !approved && <><div className="grow grid gap-2"><span className="text-[14px]">Approval requested. Accepted package stays <b data-testid="fw-pkg">v{pkgVersion}</b> until approved.</span><NameField value={author} onChange={setAuthor} /></div><Primary testid="fw-approve" onClick={approve} busy={busy} disabled={!who} icon={<ShieldCheck size={19} />}>Approve the update</Primary></>}
        {approved && <span className="text-[15px]" data-testid="fw-approved"><Check size={16} className="inline text-ok" /> Approved by <b>{approved.accepted_by}</b>. Accepted package is now <b>v{approved.version}</b> (mapping {approved.mapping_sha}); decision D-{fw?.flagged_decisions[0]} revalidated for fw 2.4.0.</span>}
        {error && <div role="alert" className="w-full text-[14px] text-critical">{error}</div>}
      </div>}
      {fw && (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="card p-4 grid gap-3 content-start">
            <h3 className="text-section font-semibold">Impact summary</h3>
            <ul className="grid gap-1.5 text-[14px]">{fw.point_changes.map((c) => (
              <li key={c.point}><span className="mono">{c.point}</span> (register {c.register}): {c.change}{c.before && c.after && <span className="text-muted"> · {Object.entries(c.before).map(([k, v]) => `${k}=${v}`).join(', ')} → {Object.entries(c.after).map(([k, v]) => `${k}=${v}`).join(', ')}</span>}</li>
            ))}</ul>
            <div className="text-[14px]"><b>Mapping lines affected:</b> <span className="mono text-[13px]">{fw.affected_lines.join(' · ')}</span></div>
            <div className="text-[14px]"><b>Decisions flagged for revalidation:</b> {fw.flagged_decisions.map((d) => <Badge key={d} tone="warning">D-{d}</Badge>)}</div>
            <div className="text-[14px]"><b>Tests rerun (affected only):</b> <span className="mono text-[13px]">{fw.affected_tests.join(', ')}</span></div>
          </section>
          <section className="card p-4 grid gap-2 content-start">
            <h3 className="text-[16px] font-semibold">Old mapping on the new firmware: {fw.before.passed}/{fw.before.total}</h3>
            <ReportView report={fw.before} />
          </section>
          <section className="card p-4 grid gap-2 content-start">
            <h3 className="text-[16px] font-semibold">Proposed update</h3>
            <Diff diff={fw.proposal.diff} title="mapping.yaml (accepted → candidate)" />
            <ul className="text-[13px] text-muted grid gap-1">{fw.proposal.changes.map((c, i) => <li key={i}><b className="text-text">Why:</b> {c.why}</li>)}</ul>
          </section>
          <section className="card p-4 grid gap-2 content-start">
            <h3 className="text-[16px] font-semibold">Updated mapping: {fw.after.passed}/{fw.after.total}</h3>
            <p className="text-[13px] text-muted">The engineer’s zone-2 correction survives the renamed point: the regression is keyed to the physical cable, not the point name.</p>
            <ReportView report={fw.after} highlight={(id) => id.startsWith('regression-')} />
          </section>
        </div>
      )}
    </div>
  );
}

function Summary({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return <div className="flex items-start gap-3"><span className="h-9 w-9 rounded-control bg-surface-2 grid place-items-center text-muted"><Icon size={17} /></span><div><div className="text-label text-muted">{label}</div><div className="text-body font-medium mt-1">{value}</div></div></div>;
}

function ReadinessMetric({ label, value, tone, testid }: { label: string; value: string; tone: 'ok' | 'warning' | 'critical'; testid?: string }) {
  const color = { ok: 'text-ok', warning: 'text-warning', critical: 'text-critical' }[tone];
  const [first, ...rest] = value.split(' ');
  return <div className="p-4"><div className="text-label text-muted">{label}</div><div className={cx('text-section font-semibold mt-1', color)}>{testid ? <><span data-testid={testid}>{first}</span>{rest.length ? ` ${rest.join(' ')}` : ''}</> : value}</div></div>;
}

export function HandoverPage() {
  const live = useLive();
  const [ready, setReady] = useState<Readiness | null>(SNAP.readiness);
  const [handover, setHandover] = useState<Handover | null>(SNAP.handover);
  const [author, setAuthor] = useState(readAuthor);
  const [check, setCheck] = useState('FC-2');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const who = author.trim();
  useEffect(() => {
    if (!live) return;
    rf.handover('h1').then((h) => { setHandover(h); setReady(h.readiness); }).catch(() => rf.readiness('h1').then(setReady).catch((e) => setError(e.message)));
  }, [live]);
  const prepare = async () => { setBusy(true); setError(''); try { await ensurePackage(who || 'J. Chen'); const h = await rf.handover('h1'); setHandover(h); setReady(h.readiness); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const witness = async () => {
    setBusy(true); setError('');
    try {
      if (live) { await rf.witness('h1', check, who, 'witnessed on site'); const h = await rf.handover('h1'); setHandover(h); setReady(h.readiness); }
      else if (ready) setReady({ ...ready, field: { ...ready.field, open: ready.field.checks.filter((c) => c.status !== 'pass' && c.id !== check).length, checks: ready.field.checks.map((c) => c.id === check ? { ...c, status: 'pass', witnessed_by: who } : c) } });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const md = () => {
    const url = URL.createObjectURL(new Blob([SNAP.handover_md], { type: 'text/markdown' }));
    const a = document.createElement('a'); a.href = url; a.download = 'handover-h1.md'; a.click(); URL.revokeObjectURL(url);
  };
  const open = ready?.field.checks.filter((c) => c.status !== 'pass') ?? [];
  return (
    <div className="mx-auto w-full max-w-[1360px]">
      <PageHeader kicker="Modernize · Liquid cooling · Readiness" title="Close the work software cannot"
        subtitle="Simulated tests never certify plumbing, sensor placement or cooling capacity. Field checks close only with a witnessed result and a name." />
      <Tabs />
      <SourceStrip status={live} />
      {error && <div role="alert" className="text-[14px] text-critical mb-3">{error}</div>}
      {live && !handover && <div className="card p-4 mb-4 flex flex-wrap items-center gap-3"><span className="grow text-[14px] text-muted">No accepted package on the live backend yet.</span><NameField value={author} onChange={setAuthor} /><Primary onClick={prepare} busy={busy} icon={<ClipboardCheck size={19} />}>Accept the fixed package</Primary></div>}
      {ready && (
        <div className="mb-6" data-testid="readiness">
          <div className="card mb-4 grid sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x hairline">
            <ReadinessMetric label="Overall" value={ready.ready ? 'Ready' : 'Blocked'} tone={ready.ready ? 'ok' : 'warning'} />
            <ReadinessMetric label="Software" value={`${ready.software.passed}/${ready.software.total} passed`} tone="ok" />
            <ReadinessMetric label="Field checks" value={`${ready.field.open} open`} tone="warning" testid="field-open" />
            <ReadinessMetric label="Ownership" value={`${ready.ownership.unresolved.length} unresolved`} tone="critical" />
          </div>
          <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
            <section className="card overflow-hidden">
              <header className="p-4 border-b hairline"><h3 className="text-section font-semibold flex items-center gap-2"><TriangleAlert size={18} className="text-warning" /> Field verification</h3><p className="text-label text-muted mt-1">A simulation never closes these checks.</p></header>
              <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-body"><thead><tr className="border-b hairline text-left"><th className="th p-3">Check</th><th className="th p-3">Status</th><th className="th p-3">Witness</th></tr></thead><tbody>{ready.field.checks.map((c) => <tr key={c.id} className="border-b hairline last:border-0"><td className="p-3"><span className="mono text-label mr-2">{c.id}</span>{c.what}</td><td className="p-3">{c.status === 'pass' ? <Badge tone="ok"><Check size={11}/>Passed</Badge> : <Badge>Required</Badge>}</td><td className="p-3 text-muted">{c.witnessed_by ?? '—'}</td></tr>)}</tbody></table></div>
              {open.length > 0 && <div className="p-4 border-t hairline grid sm:grid-cols-[160px_minmax(220px,1fr)_auto] items-end gap-3"><label className="grid gap-1 text-label"><span className="font-medium">Field check</span><select aria-label="Field check" value={check} onChange={(e) => setCheck(e.target.value)} className="h-11 px-2 rounded-control border border-border bg-surface text-body">{open.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}</select></label><NameField value={author} onChange={setAuthor} /><button onClick={witness} disabled={busy || !who} className="h-11 px-4 rounded-control border border-border-strong hover:bg-surface-2 text-body font-medium disabled:opacity-50 t">Record witnessed pass</button></div>}
            </section>
            <aside className="grid gap-4 content-start">
              <section className="card p-4"><h3 className="text-section font-semibold flex items-center gap-2"><UserX size={18} className="text-critical" /> Ownership</h3><ul className="mt-4 grid gap-3 text-body">{ready.ownership.unresolved.map((o) => <li key={o} className="border-b hairline pb-3 last:border-0 last:pb-0"><div>{o}</div><div className="text-label text-critical mt-1">Owner required before handover</div></li>)}</ul></section>
              <section className="card p-4"><h3 className="text-section font-semibold flex items-center gap-2"><FlaskConical size={18} className="text-ok" /> Software evidence</h3><p className="text-body mt-3">{ready.software.passed}/{ready.software.total} behavior tests passed.</p><p className="text-label text-muted mt-2">{ready.software.note}</p></section>
            </aside>
          </div>
        </div>
      )}
      {handover && (
        <section className="card p-4 grid gap-4" data-testid="handover">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-[17px] font-semibold grow">Handover package · site h1 · package v{handover.package.version}</h3>
            {live ? <a href="/api/retrofit/sites/h1/handover.md" download="handover-h1.md" className="h-12 px-4 rounded-xl border border-border hover:bg-surface-2 inline-flex items-center gap-2 text-[15px] t"><Download size={16} /> Download .md</a>
              : <button onClick={md} className="h-12 px-4 rounded-xl border border-border hover:bg-surface-2 inline-flex items-center gap-2 text-[15px] t"><Download size={16} /> Download .md</button>}
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="grid gap-2 content-start"><h4 className="font-semibold text-[15px]">Configuration diff</h4><Diff diff={handover.diff} title="original → accepted package" /></div>
            <div className="grid gap-2 content-start">
              <h4 className="font-semibold text-[15px]">Equipment map</h4>
              <table className="text-[14px] w-full"><thead><tr className="border-b hairline text-left"><th className="th py-1.5">Zone</th><th className="th">Location</th><th className="th">Valve</th><th className="th">Source</th></tr></thead>
                <tbody>{handover.equipment_map.leak_zones.map((z) => <tr key={z.zone} className="border-b hairline last:border-0"><td className="py-1.5">{z.zone}</td><td className="mono">{z.location}</td><td className="mono">{z.valve ?? '—'}</td><td className="text-muted">{z.source}</td></tr>)}</tbody></table>
              {handover.equipment_map.redundancy && <p className="text-[13px] text-muted">By independence: {Object.entries(handover.equipment_map.redundancy).map(([r, v]) => `${r} ${v.effective} (single points ${v.single_points.join(', ')})`).join('; ')}</p>}
              <div className="text-[14px]">Behavior tests {handover.tests.passed}/{handover.tests.total} · expectations <span className="mono">{handover.tests.expectations_sha}</span></div>
            </div>
            <List title="Open issues" items={handover.open_issues} />
            <List title="Updated operator procedures" items={handover.procedures} />
            <List title="Deploy" items={handover.deploy} ordered />
            <List title="Rollback" items={handover.rollback} ordered />
          </div>
        </section>
      )}
    </div>
  );
}

function List({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  const L = ordered ? 'ol' : 'ul';
  return <div className="grid gap-1.5 content-start"><h4 className="font-semibold text-[15px]">{title}</h4><L className={cx('text-[14px] grid gap-1 pl-5', ordered ? 'list-decimal' : 'list-disc')}>{items.map((i) => <li key={i}>{i}</li>)}</L></div>;
}

export function EvalPage() {
  const live = useLive();
  const [ev, setEv] = useState<Evaluation | null>(SNAP.evaluation ?? null);
  useEffect(() => {
    if (!live) return;
    rf.evaluation().then(setEv).catch(() => setEv(SNAP.evaluation ?? null));
  }, [live]);
  return (
    <div className="mx-auto w-full max-w-[1360px]">
      <Link to="/modernize/retrofit" className="mb-6 inline-flex h-10 items-center gap-2 text-label text-muted hover:text-text t"><ArrowLeft size={15}/>Back to liquid-cooling project</Link>
      <PageHeader kicker="Evidence · Synthetic evaluation" title="Threshold baseline versus accepted Damo package"
        meta={<><Badge>Synthetic scenarios</Badge><Badge>{live ? 'Live result' : 'Recorded result'}</Badge></>}
        subtitle="Known-truth monitoring scenarios run against both executed arms. Results below are generated by the deterministic evaluation engine; estimated or unexecuted values are labeled separately." />
      {ev ? <EvalTables ev={ev} /> : <div className="card p-6 text-body text-muted">Loading evaluation artifacts…</div>}
    </div>
  );
}

function EvalTables({ ev }: { ev: Evaluation }) {
  const m = ev.monitoring;
  const fmt = (v: number | null) => v === null ? '—' : String(v);
  const damo = m.rows.filter((r) => r.arm !== 'threshold');
  const misses = damo.reduce((n, r) => n + r.missed, 0);
  const falseRecovery = damo.reduce((n, r) => n + r.false_recovery, 0);
  return (
    <div className="grid gap-4">
      <section className="grid sm:grid-cols-3 gap-3" aria-label="Evaluation summary">
        <div className="card p-4"><div className="text-label text-muted">Scenarios</div><div className="text-subtitle font-semibold mt-1">{m.scenarios.length}</div></div>
        <div className="card p-4"><div className="text-label text-muted">Damo missed incidents</div><div className={cx('text-subtitle font-semibold mt-1', misses ? 'text-critical' : 'text-ok')}>{misses}</div></div>
        <div className="card p-4"><div className="text-label text-muted">Damo false recoveries</div><div className={cx('text-subtitle font-semibold mt-1', falseRecovery ? 'text-critical' : 'text-ok')}>{falseRecovery}</div></div>
      </section>
      <section className="card p-4 grid gap-3 min-w-0" data-testid="eval-monitoring">
        <h3 className="text-section font-semibold">Executed monitoring comparison</h3>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-label">{m.arms.filter((a) => a.run).map((a) => <li key={a.id}>{a.label}</li>)}</ul>
        <div className="overflow-x-auto"><table className="w-full text-[14px] min-w-[760px]">
          <thead><tr className="border-b hairline text-left">{['Scenario', 'Arm', 'Right racks', 'Missed', 'Unneeded escalations', 'Evidence-backed handoff', 'False recovery', 'Note'].map((h) => <th key={h} className="th py-2 pr-2">{h}</th>)}</tr></thead>
          <tbody>{m.rows.map((r) => (
            <tr key={r.scenario + r.arm} className="border-b hairline last:border-0 align-top">
              <td className="py-2 pr-2">{m.scenarios.find((s) => s.id === r.scenario)?.label ?? r.scenario}</td>
              <td className="pr-2 font-medium">{m.arms.find((a) => a.id === r.arm)?.label ?? r.arm}</td>
              <td className="pr-2">{r.affected_racks_correct === null ? '—' : r.affected_racks_correct ? <Check size={15} className="text-ok" /> : <X size={15} className="text-critical" />}</td>
              <td className={cx('pr-2 num', r.missed > 0 && 'text-critical font-semibold')}>{r.missed}</td>
              <td className={cx('pr-2 num', r.unnecessary > 0 && 'text-critical font-semibold')}>{r.unnecessary}</td>
              <td className="pr-2 num">{r.handoff_min === null ? 'none' : `${fmt(r.handoff_min)} min`}</td>
              <td className={cx('pr-2 num', r.false_recovery > 0 && 'text-critical font-semibold')}>{r.false_recovery}</td>
              <td className="text-muted text-[13px]">{r.note}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
      {m.arms.filter((a) => !a.run).map((a) => <aside key={a.id} className="rounded-control border border-warning/40 bg-warning/[0.06] p-4 text-body"><b>{a.label} was not run.</b> <span className="text-muted">{a.why}</span></aside>)}
      <section className="card p-4 grid gap-2" data-testid="eval-modernization">
        <h3 className="text-[16px] font-semibold">Modernization on the unseen second site ({ev.modernization.site})</h3>
        <p className="text-[13px] text-muted">Seeded defects scored against an answer key the pipeline never reads.</p>
        <ul className="text-[14px] grid gap-1">{ev.modernization.defects.map((d) => <li key={d.id}>{d.found ? <Check size={14} className="inline text-ok" /> : <X size={14} className="inline text-critical" />} {d.id} {d.kind} ({d.where}) · {d.found ? `found by ${d.by}` : 'missed'}</li>)}</ul>
        <div className="text-[14px]">False positives: {ev.modernization.false_positives.length ? ev.modernization.false_positives.join(', ') : 'none'} · engineer actions: {ev.modernization.engineer_actions}</div>
        <div className="text-[14px]">Engineer time: {ev.modernization.estimate.manual_min} min manual vs {ev.modernization.estimate.assisted_min} min assisted <Badge tone="warning">{ev.modernization.estimate.label}</Badge></div>
      </section>
    </div>
  );
}
