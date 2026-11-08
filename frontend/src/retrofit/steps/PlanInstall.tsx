// Step 4: what the installation touches, what must stay online, the maintenance window, and two human approvals.
import { useCallback, useMemo } from 'react';
import { Check, Download, ExternalLink } from 'lucide-react';
import { Badge, Button, Card, PageHeader, SectionHeader, cx } from '../../components/ui';
import { useRetrofit } from '../store';
import { AgentPanel, WorkSplit, download } from '../parts';
import { DocLink } from '../DocViewer';
import { DependencyDiagram, WindowTimeline } from '../viz/b-plan';
import { WINDOW } from '../viz/b-window';

const LINES = [
  'read [[floorplan|mains run under row 3]]: CHW-LOOP mains run under row 3',
  'read [[topology|V-FW-1,valve]]: CHW-LOOP → V-FW-1 → CDU-1 → TCS-1 → R3-01, R3-02',
  'read [[bms|PUMP-A]]: CRAH-1..4 and PUMP-A/B on CHW-LOOP keep rows R1 and R2 cooled',
  'read [[electrical|single feed]]: PNL-CDU feeds both CDU-1 pumps',
  'read [[requirements|at least 200 L/min]]: flow ≥ 200 L/min before the racks load',
  'drew the isolation boundary around V-FW-1, CDU-1 and TCS-1',
  'drafted method of procedure MOP-H1-R3-01: 7 steps, 3 hold points, rollback',
  'chiller headroom with CDU-1 load added: not verified ✗',
  'PNL-CDU has a single feed from SWGR-A: both CDU pumps share it ✗',
];

export default function PlanInstall() {
  const { st, set } = useRetrofit();
  const onDone = useCallback(() => set({ planned: true }), [set]);
  const cdu = st.cdu ?? 'KX-140';
  const mop = useMemo(() => [
    `MOP-H1-R3-01  Install CDU-1 (${cdu}) at ${st.location ?? 'L-A'}, hall H1 row 3. Draft prepared by Nemotron for review.`,
    'Window: Sat 01:00-05:00. Rows R1, R2, CRAH-1..4 and the CHW plant stay in service throughout.', '',
    ...WINDOW.map((t, i) => `${i + 1}. ${t.hold ? `[${t.hold}] ` : ''}${t.name}  (${t.owner})${t.abort ? `  ABORT: ${t.abort}` : ''}`), '',
    'Rollback: close V-FW-1, drain the branch. CRAHs unaffected.',
    'Open risks: chiller headroom with CDU-1 not verified (H1); PNL-CDU single feed from SWGR-A.',
  ].join('\n'), [cdu, st.location]);

  return (
    <div>
      <PageHeader kicker="Step 4 of 6" title="Plan installation"
        subtitle="What's affected, what must stay online, and how to back out."
        meta={<><Badge>CDU-1 · {cdu}</Badge><Badge>Sat 01:00–05:00</Badge></>} />
      <AgentPanel k="s4" title="Nemotron planning the installation" lines={LINES} ran={st.planned} onDone={onDone} />

      {st.planned && <div className="stage-in">
        <WorkSplit decided={st.mopApproved && st.changeAuth}
          did={<>Traced what CDU-1 connects to, drew the isolation boundary, drafted MOP-H1-R3-01 with 3 hold points and a rollback, and flagged 2 risks.</>}
          need={<>Approve the plan: procedure (R. Alvarez) and site change authorization (Maya R.) in one sign-off.</>} />

        <Card className="mb-6" header={<>
          <span className="font-semibold text-[14px]">What stays online</span>
          <a href="#/preflight?site=retrofit&focus=CDU-1" className="ml-auto inline-flex items-center gap-1 h-10 text-[13px] text-accent hover:underline">Open in Preflight for the full what-if <ExternalLink size={13} /></a>
        </>}>
          <DependencyDiagram />
          <div className="flex flex-wrap gap-2 mt-4 text-[12px]">
            <DocLink id="topology" mark="V-FW-1,valve" /><DocLink id="bms" mark="PUMP-A" /><DocLink id="electrical" mark="Loss of SWGR-A" /><DocLink id="floorplan" mark="mains run under row 3" />
          </div>
        </Card>

        <Card className="mb-6" header={<><span className="font-semibold text-[14px]">Maintenance window</span><span className="text-[13px] text-muted hidden sm:inline">MOP-H1-R3-01 draft</span>
          <Button variant="ghost" className="ml-auto" onClick={() => download('MOP-H1-R3-01.txt', mop)}><Download size={14} /> Download</Button></>}>
          <WindowTimeline />
        </Card>

        <SectionHeader title="Approvals" subtitle="People sign; Nemotron only prepared the draft." />
        <div className="grid md:grid-cols-2 gap-3">
          <Gate done={st.mopApproved} title="Method of procedure MOP-H1-R3-01" body="7 steps, 3 hold points, rollback. Hold point H1 requires chiller headroom confirmed before any valve moves."
            action="Approve plan & continue" signed="Approved by R. Alvarez (facility engineer)" onClick={() => set({ mopApproved: true, changeAuth: true, step: st.step + 1 })} />
          <Gate done={st.changeAuth} disabled title="Site change authorization CHG-2026-1107" body="Authorizes the Sat 01:00–05:00 window against the approved procedure."
            action="Signed with the plan approval" signed="Recorded by Maya R. (operations lead)" onClick={() => set({ changeAuth: true })} />
        </div>
        <p className="text-[12px] text-faint mt-3">Disruption-risk plan, not a guarantee of uninterrupted operation.</p>
      </div>}
    </div>
  );
}

function Gate({ done, disabled, title, body, action, signed, onClick }: { done: boolean; disabled?: boolean; title: string; body: string; action: string; signed: string; onClick: () => void }) {
  return (
    <div className={cx('card p-4 min-w-0 flex flex-col gap-2 t', done ? 'border-ok/50' : disabled ? 'opacity-60' : 'border-warning/50')}>
      <div className="font-semibold text-[14px]">{title}</div>
      <p className="text-[13px] text-muted">{body}</p>
      <div className="mt-auto pt-1">{done
        ? <span className="inline-flex items-center gap-1.5 text-[13px] text-ok font-medium pop-in"><Check size={15} /> {signed}</span>
        : <Button variant="primary" disabled={disabled} onClick={onClick} title={disabled ? 'Approve the procedure first' : undefined}>{action}</Button>}
      </div>
    </div>
  );
}
