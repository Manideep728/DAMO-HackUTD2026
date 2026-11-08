import { useEffect, useState } from 'react';
import { ArrowRight, Cpu, Loader2, ShieldCheck, Download, ClipboardCheck, UserX, FlaskConical, Check, X, TriangleAlert } from 'lucide-react';
import { Badge, PageHeader, cx } from '../components/ui';
import { ensurePackage, rf, SNAP, type Firmware, type Handover, type Pkg, type Readiness, type Evaluation } from './api';
import { Diff, ReportView, SourceStrip, Tabs, useLive } from './parts';

const AUTHOR_KEY = 'retrofit.author';
function readAuthor() { try { return localStorage.getItem(AUTHOR_KEY) ?? ''; } catch { return ''; } }

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-[14px]">
      <span className="text-muted">Engineer</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Your name" aria-label="Engineer name" className="h-12 px-3 rounded-xl border border-border bg-surface text-[15px] min-w-[220px]" />
    </label>
  );
}

function Primary({ onClick, busy, disabled, icon, children, testid }: { onClick: () => void; busy: boolean; disabled?: boolean; icon: React.ReactNode; children: React.ReactNode; testid?: string }) {
  return (
    <button data-testid={testid} onClick={onClick} disabled={busy || disabled} className="btn btn-primary h-14 px-6 rounded-xl text-[16px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
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
      <PageHeader kicker="Retrofit · change revalidation" title="CDU-1 firmware 2.3.0 → 2.4.0"
        subtitle="The vendor changed what a state value means and renamed the leak points. Affected mappings and decisions are flagged, only the affected tests rerun, and the accepted package does not change until an engineer approves." />
      <Tabs />
      <SourceStrip status={live} />
      <div className="card p-4 mb-5 flex flex-wrap items-center gap-3">
        {!fw && <><span className="text-[14px] text-muted grow">Load the 2.4.0 point list against the accepted package v{SNAP.package_v1.version}.</span><Primary testid="fw-apply" onClick={apply} busy={busy} icon={<Cpu size={19} />}>Apply firmware 2.4.0</Primary></>}
        {fw && !approved && <><div className="grow grid gap-2"><span className="text-[14px]">Approval requested. Accepted package stays <b data-testid="fw-pkg">v{pkgVersion}</b> until approved.</span><NameField value={author} onChange={setAuthor} /></div><Primary testid="fw-approve" onClick={approve} busy={busy} disabled={!who} icon={<ShieldCheck size={19} />}>Approve the update</Primary></>}
        {approved && <span className="text-[15px]" data-testid="fw-approved"><Check size={16} className="inline text-ok" /> Approved by <b>{approved.accepted_by}</b>. Accepted package is now <b>v{approved.version}</b> (mapping {approved.mapping_sha}); decision D-{fw?.flagged_decisions[0]} revalidated for fw 2.4.0.</span>}
        {error && <div role="alert" className="w-full text-[14px] text-critical">{error}</div>}
      </div>
      {fw && (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="card p-4 grid gap-3 content-start">
            <h3 className="text-[16px] font-semibold">What changed in the point list</h3>
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
      <PageHeader kicker="Retrofit · readiness" title="What software proved, and what only the field can"
        subtitle="Simulated tests never certify plumbing, sensor placement or cooling capacity. Field checks close only with a witnessed result and a name." />
      <Tabs />
      <SourceStrip status={live} />
      {error && <div role="alert" className="text-[14px] text-critical mb-3">{error}</div>}
      {live && !handover && <div className="card p-4 mb-4 flex flex-wrap items-center gap-3"><span className="grow text-[14px] text-muted">No accepted package on the live backend yet.</span><NameField value={author} onChange={setAuthor} /><Primary onClick={prepare} busy={busy} icon={<ClipboardCheck size={19} />}>Accept the fixed package</Primary></div>}
      {ready && (
        <div className="grid md:grid-cols-3 gap-4 mb-4" data-testid="readiness">
          <section className="card p-4 grid gap-2 content-start">
            <h3 className="text-[16px] font-semibold flex items-center gap-2"><FlaskConical size={17} className="text-ok" /> Software tests passed</h3>
            <div className="text-[30px] font-semibold num">{ready.software.passed}/{ready.software.total}</div>
            <p className="text-[13px] text-muted">{ready.software.note}</p>
          </section>
          <section className="card p-4 grid gap-2 content-start">
            <h3 className="text-[16px] font-semibold flex items-center gap-2"><TriangleAlert size={17} className="text-warning" /> Field checks still required</h3>
            <div className="text-[30px] font-semibold num" data-testid="field-open">{ready.field.open}</div>
            <ul className="text-[14px] grid gap-1">{ready.field.checks.map((c) => <li key={c.id} className={cx(c.status === 'pass' && 'text-ok')}>{c.status === 'pass' ? <Check size={13} className="inline" /> : <X size={13} className="inline text-faint" />} {c.id} {c.what}{c.witnessed_by && <span className="text-muted"> · witnessed by {c.witnessed_by}</span>}</li>)}</ul>
            {open.length > 0 && (
              <div className="grid gap-2 border-t hairline pt-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <select aria-label="Field check" value={check} onChange={(e) => setCheck(e.target.value)} className="h-12 px-2 rounded-xl border border-border bg-surface text-[14px]">{open.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}</select>
                  <NameField value={author} onChange={setAuthor} />
                </div>
                <button onClick={witness} disabled={busy || !who} className="h-12 rounded-xl border border-border-strong hover:bg-surface-2 text-[15px] font-medium disabled:opacity-50 t">Record witnessed pass</button>
              </div>
            )}
            <p className="text-[13px] text-muted">{ready.field.note}</p>
          </section>
          <section className="card p-4 grid gap-2 content-start">
            <h3 className="text-[16px] font-semibold flex items-center gap-2"><UserX size={17} className="text-critical" /> Ownership unresolved</h3>
            <div className="text-[30px] font-semibold num">{ready.ownership.unresolved.length}</div>
            <ul className="text-[14px] grid gap-1">{ready.ownership.unresolved.map((o) => <li key={o}>{o}</li>)}</ul>
          </section>
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
      <PageHeader kicker="Retrofit · evaluation" title="Same scenarios, threshold-only baseline vs Damo"
        subtitle="Synthetic scenarios with known truth. Numbers come from python -m app.retrofit.evaluate; nothing here is a field measurement." />
      <Tabs />
      <SourceStrip status={live} />
      {ev ? <EvalTables ev={ev} /> : <p className="text-[14px] text-muted">Loading…</p>}
    </div>
  );
}

function EvalTables({ ev }: { ev: Evaluation }) {
  const m = ev.monitoring;
  const fmt = (v: number | null) => v === null ? '—' : String(v);
  return (
    <div className="grid gap-4">
      <section className="card p-4 grid gap-3 min-w-0" data-testid="eval-monitoring">
        <h3 className="text-[16px] font-semibold">Monitoring</h3>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">{m.arms.map((a) => <li key={a.id} className={cx(!a.run && 'text-warning')}>{a.label}{a.run ? '' : ` · not run: ${a.why}`}</li>)}</ul>
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
