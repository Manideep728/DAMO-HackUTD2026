// Step 6: offline tests, witnessed commissioning, the approved correction, regression, firmware revalidation, acceptance and handover.
// Plays itself from saved state (a reload resumes); the engineer clicks twice: approve the fix, then accept and hand over.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Download, FlaskConical, Loader2, UserCheck, WifiOff, X } from 'lucide-react';
import { Badge, Button, Card, PageHeader, cx } from '../../components/ui';
import { AgentPanel, DiffView, Pass, WorkSplit, download } from '../parts';
import { DocLink } from '../DocViewer';
import { DOCS } from '../docs';
import { S, useRetrofit } from '../store';
import Wires from '../viz/c-wires';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Case = any;
const EXPECT: Record<string, [string, string, string]> = {
  'leak-R3-01': ['Name R3-01 · close V-R3-01 · notify Facilities', 'drawingB', 'zone 2'],
  'leak-R3-02': ['Name R3-02 · close V-R3-02 · notify Facilities', 'drawingB', 'zone 3'],
  loops: ['Primary and secondary readings stay apart', 'topology', 'TCS-1'],
  'running-vs-available': ['Only standby counts as backup', 'requirements', 'Leak at a rack'],
  'comm-loss': ['Stale after 30 s; good after 2 samples', 'requirements', 'stale'],
  'setpoint-request': ['Reject requests outside 30–35 °C', 'requirements', 'Remote setpoint'],
};
const DIAG = [
  'Read failing case leak-R3-01 and the FC-2 witness record',
  '[[mapping|location: R3-02]] line 27 maps leak_zone_2 to R3-02',
  '[[drawingA|zone 2]] (design, 2026-09-12) puts zone 2 under R3-02',
  '[[drawingB|zone 2]] (as-built, 2026-10-21) puts zone 2 under R3-01 Rack A',
  '[[logbook|re-routed]] J. Chen re-routed the leak cables on 2026-10-21',
  'Diagnosis: the draft followed the design revision; the cable moved at installation',
  'Proposed one-line fix: leak_zone_2 → R3-01 (valve V-R3-01 follows from the valves map)',
];
const FW = [
  'Read [[manual24|leak_detect_z2]]: leak_zone_1..3 renamed leak_detect_z1..3, same registers 10001–10003',
  'run_state enum changed: standby moved 2 → 4; new 2 = running_degraded',
  'Old map on fw 2.4.0: running_degraded counted as backup ✗ running-vs-available fails (5/6)',
  'Re-mapped: leak_detect_z1..3, running_degraded → degraded (never backup)',
  'D-1 still holds: zone 2 register unchanged, rebased onto leak_detect_z2',
  'Reran affected tests on fw 2.4.0: 6/6',
];

const short = (n: string) => n.split(' · engine')[0];
const BEAT_MS = 1800;
/** After `ms`, run `fn` once while `when` holds. Cleared on unmount/re-run, so StrictMode's double effect never double-advances. */
function useAfter(when: boolean, fn: () => void, ms = BEAT_MS) {
  useEffect(() => {
    if (!when) return;
    const id = window.setTimeout(fn, ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when, ms]);
}
const Working = ({ children }: { children: ReactNode }) => <span className="inline-flex items-center gap-1.5 text-[13px] text-muted"><Loader2 size={14} className="animate-spin text-accent" />{children}</span>;
const Beat = ({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) => (
  <Card className="mb-6 pop-in" header={<><span className="font-semibold text-[14px]">{title}</span>{right && <span className="ml-auto flex items-center gap-2">{right}</span>}</>}>{children}</Card>
);
const Chip = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <span className={cx('inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[13px] font-semibold', ok ? 'bg-ok/15 text-ok' : 'bg-critical/15 text-critical chip-fail')}>{ok ? <Check size={14} /> : <X size={14} />}{children}</span>
);

function CaseTable({ r }: { r: Case }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="text-left border-b hairline"><tr>{['Case', 'Expected (source)', 'Observed', 'Result'].map((h) => <th key={h} className="th px-3 h-10">{h}</th>)}</tr></thead>
        <tbody>
          {r.cases.map((c: Case, i: number) => { const e = EXPECT[c.id]; return (
            <tr key={c.id} className={cx('border-b hairline align-top', !c.pass && 'bg-critical/5')}>
              <td className="px-3 py-2.5 font-medium cell-in" style={{ animationDelay: `${i * 60}ms` }}>{c.name}</td>
              <td className="px-3 py-2.5">{e ? <>{e[0]} <DocLink id={e[1]} mark={e[2]} /></> : c.description}</td>
              <td className={cx('px-3 py-2.5 mono text-[12px]', !c.pass && 'text-critical')}>{c.notes.map(short).join(' · ')}</td>
              <td className="px-3 py-2.5 cell-in" style={{ animationDelay: `${i * 60 + 200}ms` }}><Pass ok={c.pass} /></td>
            </tr>); })}
          {r.held_out.map((h: Case) => <tr key={h.id} className="border-b hairline last:border-0"><td className="px-3 py-2.5 font-medium">{h.name}</td><td className="px-3 py-2.5 text-muted" colSpan={2}>held out · sealed</td><td className="px-3 py-2.5"><Pass ok={h.pass} /></td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Alarm({ rack, ok }: { rack: string; ok: boolean }) {
  return (
    <div className="panel rounded-[14px] p-4 min-w-0">
      <div className={cx('rounded-lg px-3 py-2 font-semibold mono text-[14px] text-white', ok ? 'bg-[var(--ok)]' : 'bg-[var(--critical)] alarm-card')}>LEAK · {rack} · closing V-{rack} · notify Facilities</div>
      <div className="flex flex-wrap gap-1.5 mt-3">{['connection OK', 'heartbeat OK', 'schema valid'].map((t) => <span key={t} className="h-6 px-2 rounded-md text-[12px] inline-flex items-center gap-1 bg-[color-mix(in_srgb,var(--panel-ok)_20%,transparent)] text-[var(--panel-ok)]"><Check size={12} />{t}</span>)}</div>
      <div className="text-[12px] text-[var(--panel-muted)] mt-2">BMS alarm panel · H1.CDU-1.LEAK.Z2</div>
    </div>
  );
}
function Site({ fixed }: { fixed: boolean }) {
  return (
    <div className="panel rounded-[14px] p-4 min-w-0">
      <div className="grid grid-cols-3 gap-2">{['CDU-1', 'R3-01', 'R3-02'].map((r) => (
        <div key={r} className={cx('rack rounded-lg p-2 relative', r === 'R3-01' && 'rack-liquid')}>
          <div className="mono text-[13px] font-semibold">{r}</div>
          <div className="text-[12px] text-[var(--panel-muted)]">{r === 'R3-01' ? 'Rack A' : r === 'R3-02' ? 'Rack B' : 'cabinet'}</div>
          {r === 'R3-01' && <><span className="absolute right-2 top-2 h-3 w-3 rounded-full bg-[var(--panel-liquid)] animate-bounce" aria-hidden /><div className="mt-1 text-[12px] text-[var(--panel-liquid)]">wet drip tray</div></>}
        </div>))}
      </div>
      <div className="mt-3 text-[13px] flex items-center gap-1.5"><UserCheck size={14} className="text-[var(--panel-ok)]" /> R. Alvarez at <b className="mono">R3-01</b> · FC-2 wet test zone 2 {fixed && <span className="text-[var(--panel-ok)] font-semibold">· PASS</span>}</div>
    </div>
  );
}

export default function Commission() {
  const { st, set } = useRetrofit();
  const nav = useNavigate();
  const [diag, setDiag] = useState(st.fixApproved);
  const [rerun, setRerun] = useState(st.retested);
  const fw = st.firmware;
  const v2 = fw === 'approved';
  const pkg = v2 ? S.firmware_approved.package : S.package_v1;
  const checks = S.readiness.field.checks.map((c: Case) => c.id === 'FC-2' && st.retested ? { ...c, status: 'witnessed', witnessed_by: 'R. Alvarez' } : c);
  // Each beat advances one flag, gated on the one before it.
  useAfter(!st.offlineRun, () => set({ offlineRun: true }), 1200);
  useAfter(st.offlineRun && !st.witnessed, () => set({ witnessed: true }));
  useAfter(st.fixApproved && !rerun, () => setRerun(true), 1500);
  useAfter(rerun && !st.retested, () => set({ retested: true }));
  useAfter(st.retested && !st.regression, () => set({ regression: true }));
  useAfter(fw === 'rerun', () => set({ firmware: 'approved' }));
  const diagDone = useCallback(() => setDiag(true), []);
  const fwDone = useCallback(() => set({ firmware: 'rerun' }), [set]);
  const accept = () => { set({ accepted: true, done: true }); nav('/'); };
  const handoverMd = () => [
    `# Handover package: hall H1 row 3, package v${pkg.version} (SYNTHETIC)`, '',
    `Software accepted by Maya R. · not deployed · field checks open. Mapping sha \`${pkg.mapping_sha}\`.`,
    `Selected CDU: ${st.cdu ?? 'n/a'} · location ${st.location ?? 'n/a'}.`,
    `Behavior tests ${S.candidate_with_regression.passed}/${S.candidate_with_regression.total} (expectations \`${S.candidate_with_regression.expectations_sha}\`). Regression R-1: zone 2 leak cable under R3-01.`, '',
    '## Configuration diff', '', '```diff', v2 ? S.handover.diff : S.proposal.diff, '```', '',
    '## Decisions', '', `- D-1 v1 by ${S.decision.author}: zone 2 → ${S.decision.value} ("${S.decision.source_quote}")`, '',
    '## Field checks (witnessed on site only)', '', ...checks.map((c: Case) => `- ${c.id} ${c.what}: ${c.witnessed_by ? `witnessed by ${c.witnessed_by}` : 'required (Facilities)'}`), '',
    '## Owners unresolved', '', ...S.readiness.ownership.unresolved.map((o: string) => `- ${o}`), '',
    '## Deploy', '', ...S.handover.deploy.map((d: string, i: number) => `${i + 1}. ${d}`), '',
    '## Rollback', '', ...S.handover.rollback.map((d: string, i: number) => `${i + 1}. ${d}`), '',
    '## Operator procedures', '', ...S.handover.procedures.map((d: string) => `- ${d}`), '',
    '## Source documents', '', ...DOCS.map((d) => `- ${d.file} (${d.version})`), '',
  ].join('\n');

  return (
    <div>
      <PageHeader kicker="Step 6 of 6" title="Commission & hand over"
        subtitle="Offline tests, a witnessed wet test, and a correction the engineer approves. Software acceptance is not deployment, and neither closes a field check." />
      <WorkSplit decided={st.accepted}
        did={<>Ran the offline suite, compared the failing case with the drawings and logbook, proposed the one-line fix, and re-mapped for firmware 2.4.0.</>}
        need={<>Approve the correction (J. Chen), then accept and hand over the software package (Maya R.). R. Alvarez witnesses field checks on site.</>} />

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <div className="card p-4"><div className="font-semibold text-[14px] flex items-center gap-1.5"><FlaskConical size={15} /> Run offline tests</div><p className="text-[13px] text-muted mt-1 mb-3">Simulated CDU-1 + adapter · 8 cases</p>
          {st.offlineRun ? <Badge tone="ok"><Check size={11} /> ran</Badge> : <Working>running…</Working>}</div>
        <div className="card p-4 opacity-70"><div className="font-semibold text-[14px] flex items-center gap-1.5"><WifiOff size={15} /> Check live readings</div><p className="text-[13px] text-muted mt-1 mb-3">not connected · no site gateway configured</p><Button disabled>Check live readings</Button></div>
        <div className="card p-4"><div className="font-semibold text-[14px] flex items-center gap-1.5"><UserCheck size={15} /> Witnessed commissioning</div><p className="text-[13px] text-muted mt-1 mb-3">FC-2 wet test zone 2 · technician R. Alvarez</p>
          {st.witnessed ? <Badge tone="ok"><Check size={11} /> recorded</Badge> : st.offlineRun ? <Working>recording wet test…</Working> : <span className="text-[13px] text-muted">after offline tests</span>}</div>
      </div>

      {st.offlineRun && <Beat title="Offline tests · integrator draft" right={<><Chip ok>schema VALID</Chip><Chip ok={false}>behavior {S.flag.report.passed}/{S.flag.report.total}</Chip></>}>
        <CaseTable r={S.flag.report} />
      </Beat>}

      {st.witnessed && <Beat title="Witnessed wet test FC-2: connected is not correct">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] gap-3 items-center">
          <Site fixed={false} />
          <div className="grid place-items-center text-critical text-[28px] font-bold" aria-hidden>≠</div>
          <Alarm rack="R3-02" ok={false} />
        </div>
        <p className="mt-3 text-[14px] font-semibold text-critical flex items-center gap-1.5"><X size={15} /> Technician is at R3-01. Alarm names R3-02.</p>
      </Beat>}

      {st.witnessed && <AgentPanel k="s6diag" title="Nemotron diagnosing the mismatch" lines={DIAG} ran={diag} onDone={diagDone} />}

      {st.witnessed && diag && <Beat title="Proposed correction" right={st.fixApproved ? <Badge tone="ok"><Check size={11} /> D-1 v1 · {S.decision.author}</Badge> : undefined}>
        <DiffView diff={S.proposal.diff} />
        <p className="text-[13px] text-muted mt-3">Source: {S.proposal.changes[0].source}</p>
        {st.fixApproved
          ? <p className="text-[13px] mt-2 flex items-center gap-1.5"><Check size={14} className="text-ok" /> {S.proposal.changes[0].why}</p>
          : <Button variant="primary" className="mt-3" onClick={() => set({ fixApproved: true })}><UserCheck size={15} /> Approve corrected mapping as J. Chen</Button>}
      </Beat>}

      {st.fixApproved && <Beat title="Retest">
        <div className="mb-4"><Wires fixed={rerun} rows="leak" /></div>
        {!rerun ? <Working>rerunning offline tests on the corrected mapping…</Working> : <>
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl border border-critical/40 p-3"><div className="text-[12px] text-muted">original · {S.flag.report.mapping_sha}</div><Pass ok={false} label={`${S.flag.report.passed}/${S.flag.report.total} FAIL`} /></div>
            <div className="rounded-xl border border-ok/40 p-3 pop-in"><div className="text-[12px] text-muted">candidate · {S.candidate_report.mapping_sha}</div><Pass ok label={`${S.candidate_report.passed}/${S.candidate_report.total} PASS`} /></div>
          </div>
          <p className="text-[12px] text-faint mb-3 mono">same expectations {S.candidate_report.expectations_sha}</p>
          {st.retested ? <div className="grid lg:grid-cols-2 gap-3 pop-in"><Site fixed /><Alarm rack="R3-01" ok /></div>
            : <Working>R. Alvarez re-witnessing FC-2 at R3-01…</Working>}
        </>}
      </Beat>}

      {st.retested && <Beat title="Regression test">
        {st.regression ? <div className="text-[14px] grid gap-1.5 pop-in">
          <div className="flex items-center gap-2"><Pass ok label={`${S.candidate_with_regression.passed}/${S.candidate_with_regression.total}`} /> R-1: {S.regression.spec.summary}</div>
          <div className="text-[13px] text-muted">Site H7 reuses R-1: it caught a wrong rack there too (zone {S.h2_flag.flags[0].zone} mapped {S.h2_flag.flags[0].mapped_location}, drawing says {S.h2_flag.flags[0].drawing_location}).</div>
        </div> : <Working>saving the correction as regression test R-1…</Working>}
      </Beat>}

      {st.regression && fw === 'none' && <div className="mb-6 flex items-center gap-3 text-[13px] text-muted">
        <Button onClick={() => set({ firmware: 'flagged' })}>Show a later firmware change</Button> Optional: how DAMO revalidates D-1 when the CDU moves to firmware 2.4.0.
      </div>}

      {st.regression && fw !== 'none' && <Beat title="Later change: CDU firmware 2.4.0" right={<Badge tone={v2 ? 'ok' : 'warning'}>{v2 ? 'v2 approved by Maya R.' : 'D-1 needs revalidation'}</Badge>}>
        <>
          <ul className="grid gap-1 text-[13px] mono mb-3">{S.firmware.point_changes.map((p: Case) => <li key={p.point} className="enter-row">{p.register} {p.point}: {p.change}</li>)}</ul>
          <div className="flex flex-wrap gap-1.5 mb-4">{S.readiness.software.tests.map((t: Case, i: number) => { const hit = S.firmware.affected_tests.some((a: string) => t.id.startsWith(a)) || t.id === 'leak-cabinet'; return (
            <span key={t.id} className={cx('h-7 px-2 rounded-md border text-[12px] inline-flex items-center cell-in', hit ? (fw === 'flagged' ? 'border-warning text-warning bg-warning/10' : 'border-ok text-ok bg-ok/10') : 'hairline text-muted')} style={{ animationDelay: `${i * 70}ms` }}>{t.name}</span>); })}</div>
          {fw === 'flagged' && <AgentPanel k="s6fw" title="Nemotron re-mapping for fw 2.4.0" lines={FW} ran={false} onDone={fwDone} />}
          {fw !== 'flagged' && <>
            <div className="flex gap-2 mb-3"><Pass ok={false} label={`before ${S.firmware.before.passed}/${S.firmware.before.total}`} /><Pass ok label={`after ${S.firmware.after.passed}/${S.firmware.after.total}`} /></div>
            <DiffView diff={S.firmware.proposal.diff} />
            <div className="mt-3">{v2 ? <span className="inline-flex items-center gap-1.5 text-[13px] text-ok font-semibold pop-in"><UserCheck size={14} /> v2 approved by Maya R. · package v{S.firmware_approved.package.version}</span> : <Working>sending v2 to Maya R. for approval…</Working>}</div>
          </>}
        </>
      </Beat>}

      {st.regression && <Beat title="Accept & hand over" right={st.accepted ? <Badge tone="warning">software accepted · not deployed · field checks open</Badge> : undefined}>
        <div className="grid md:grid-cols-3 gap-3 mb-4 text-[13px]">
          <div className="rounded-xl border hairline p-3"><div className="font-semibold mb-1">Software evidence</div>
            <div><Pass ok label={`${S.candidate_with_regression.passed}/${S.candidate_with_regression.total} behavior tests`} /></div>
            <div className="text-muted mt-1">R-1 regression · package v{pkg.version} · <span className="mono">{pkg.mapping_sha}</span></div></div>
          <div className="rounded-xl border hairline p-3"><div className="font-semibold mb-1">Field checks · owner Facilities</div>
            <ul className="grid gap-0.5">{checks.map((c: Case) => <li key={c.id} className={c.witnessed_by ? 'text-ok' : 'text-muted'}><span className="mono">{c.id}</span> {c.what} · {c.witnessed_by ? `witnessed by ${c.witnessed_by}` : 'required'}</li>)}</ul></div>
          <div className="rounded-xl border hairline p-3"><div className="font-semibold mb-1">Ownership · 2 unresolved</div>
            <ul className="grid gap-0.5 text-warning">{S.readiness.ownership.unresolved.map((o: string) => <li key={o}>{o}</li>)}</ul></div>
        </div>
        <div className="pop-in">
          <div className="text-[13px] grid gap-1 mb-3">
            <div>CDU <b className="mono">{st.cdu ?? 'KX-140'}</b> · location <b className="mono">{st.location ?? 'L-A'}</b> · zone 2 → R3-01 (D-1 v1, J. Chen)</div>
          </div>
          <DiffView diff={v2 ? S.handover.diff : S.proposal.diff} />
          <div className="flex flex-wrap gap-1.5 mt-3">{DOCS.map((d) => <DocLink key={d.id} id={d.id} />)}</div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button onClick={() => download('handover.md', handoverMd())}><Download size={14} /> Download handover.md</Button>
            <Button variant="primary" className="ml-auto" onClick={accept}><UserCheck size={15} /> Accept &amp; hand over to operations <ArrowRight size={15} /></Button>
          </div>
        </div>
      </Beat>}
    </div>
  );
}
