import { useState } from 'react';
import { ArrowRight, FlaskConical, Search, UserCheck, GitCompare, RotateCcw, BookmarkPlus, Building2, Loader2, Wrench } from 'lucide-react';
import { Badge, PageHeader, cx } from '../components/ui';
import { rf, SNAP, type Decision, type Flag, type Proposal, type Regression, type Report } from './api';
import { Artifact, CodeLines, Diff, Drawing, ReportView, SourceStrip, Tabs, useLive } from './parts';

type Step = 'idle' | 'tested' | 'flagged' | 'decided' | 'proposed' | 'passed' | 'saved' | 'site2' | 'site2fixed';
const ORDER: Step[] = ['idle', 'tested', 'flagged', 'decided', 'proposed', 'passed', 'saved', 'site2', 'site2fixed'];
const AUTHOR_KEY = 'retrofit.author';

interface Site2 { report: Report; flags: Flag[]; original: string; decision?: Decision; proposal?: Proposal; fixed?: Report }

function readAuthor() { try { return localStorage.getItem(AUTHOR_KEY) ?? ''; } catch { return ''; } }
function saveAuthor(a: string) { try { localStorage.setItem(AUTHOR_KEY, a); } catch { /* private mode */ } }
function offlineDecision(decision: Decision, author: string): Decision {
  return { ...decision, author, at: Date.now() / 1000 };
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function RetrofitPage() {
  const live = useLive();
  const [step, setStep] = useState<Step>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [author, setAuthor] = useState(readAuthor);
  const [original, setOriginal] = useState(SNAP.original);
  const [report, setReport] = useState<Report | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [passed, setPassed] = useState<Report | null>(null);
  const [regression, setRegression] = useState<Regression | null>(null);
  const [site2, setSite2] = useState<Site2 | null>(null);
  const at = (s: Step) => ORDER.indexOf(step) >= ORDER.indexOf(s);
  const who = author.trim();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const actions: Record<Exclude<Step, 'site2fixed'>, { label: string; hint: string; icon: React.ReactNode; go: () => Promise<void>; needsName?: boolean }> = {
    idle: {
      label: 'Run behavior tests', icon: <FlaskConical size={19} />, hint: 'Simulated leaks, loop readings, comm loss and requests go through the real adapter; an independent oracle judges.',
      go: async () => {
        if (live) {
          await rf.reset('retrofit-demo');
          const [orig, f] = await Promise.all([rf.original('h1'), rf.flag('h1')]);
          setOriginal(orig); setReport(f.report); setFlags(f.flags);
        } else { await pause(500); setReport(SNAP.flag.report); setFlags(SNAP.flag.flags); }
        setStep('tested');
      },
    },
    tested: { label: 'Trace the failure', icon: <Search size={19} />, hint: 'Find the config line and the drawing sentence that disagree. Quotes must be verbatim.', go: async () => { setStep('flagged'); } },
    flagged: {
      label: 'Confirm the physical association', icon: <UserCheck size={19} />, needsName: true, hint: 'Recorded with your name, the time, the source and its scope. Nothing changes without it.',
      go: async () => {
        saveAuthor(who);
        const d = live ? await rf.decide('h1', flags[0].zone, who) : offlineDecision(SNAP.decision, who);
        setDecision(d); setStep('decided');
      },
    },
    decided: {
      label: 'Generate the change', icon: <GitCompare size={19} />, hint: 'Applies the confirmed decision to the mapping. The diff is computed, not written by a model.',
      go: async () => { setProposal(live ? await rf.propose('h1') : SNAP.proposal); setStep('proposed'); },
    },
    proposed: {
      label: 'Re-run the same tests', icon: <RotateCcw size={19} />, hint: 'Same cases, same oracle, same held-out set.',
      go: async () => { setPassed(live ? await rf.test('h1', 'candidate') : SNAP.candidate_report); setStep('passed'); },
    },
    passed: {
      label: 'Save as a regression test', icon: <BookmarkPlus size={19} />, hint: 'Pins the engineer’s decision so a later firmware or config change cannot silently undo it.',
      go: async () => {
        if (live && decision) {
          const r = await rf.saveRegression('h1', decision.id, who || decision.author);
          setRegression(r); setPassed(await rf.test('h1', 'candidate'));
        } else { setRegression(SNAP.regression); setPassed(SNAP.candidate_with_regression); }
        setStep('saved');
      },
    },
    saved: {
      label: 'Run on a second site', icon: <Building2 size={19} />, hint: 'Hall H7: different names, mirrored layout, same integrator template. The saved regression runs as a template.',
      go: async () => {
        if (live) { const [o, f] = await Promise.all([rf.original('h2'), rf.flag('h2')]); setSite2({ report: f.report, flags: f.flags, original: o }); }
        else setSite2({ report: SNAP.h2_flag.report, flags: SNAP.h2_flag.flags, original: SNAP.h2_original });
        setStep('site2');
      },
    },
    site2: {
      label: 'Fix site 2 the same way', icon: <Wrench size={19} />, needsName: true, hint: 'Confirm H7’s own drawing, generate its change, re-run. Decisions stay scoped to their site.',
      go: async () => {
        if (!site2) return;
        saveAuthor(who);
        if (live) {
          const d = await rf.decide('h2', site2.flags[0].zone, who);
          const p = await rf.propose('h2');
          setSite2({ ...site2, decision: d, proposal: p, fixed: await rf.test('h2', 'candidate') });
        } else setSite2({ ...site2, decision: { ...SNAP.h2_decision, author: who }, proposal: SNAP.h2_proposal, fixed: SNAP.h2_candidate_report });
        setStep('site2fixed');
      },
    },
  };
  const next = step === 'site2fixed' ? null : actions[step];
  const flag = flags[0];
  const markLines = flag && at('flagged') ? [flag.line_no - 1, flag.line_no] : undefined;

  return (
    <div className="mx-auto w-full max-w-[1360px]">
      <PageHeader kicker="Retrofit · liquid-cooled row R3 · hall H1" title="A leak sensor mapped to the wrong rack"
        subtitle="The schema check passes. A behavior test fails. The engineer confirms from the drawing, the fix is tested, and the correction becomes a regression test that catches the same fault on the next site." />
      <Tabs />
      <SourceStrip status={live} />

      <div className="card p-4 mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" aria-live="polite">
        {next ? (
          <>
            <div className="grid gap-2 min-w-0">
              <div className="text-[14px] text-muted">{next.hint}</div>
              {next.needsName && (
                <label className="flex flex-wrap items-center gap-2 text-[14px]">
                  <span className="text-muted">Engineer</span>
                  <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" aria-label="Engineer name"
                    className="h-12 px-3 rounded-xl border border-border bg-surface text-[15px] min-w-[220px]" />
                  {!who && <span className="text-warning text-[13px]">A decision needs a name.</span>}
                </label>
              )}
            </div>
            <button data-testid="retrofit-next" onClick={() => run(next.go)} disabled={busy || (next.needsName && !who)}
              className="btn btn-primary h-14 px-6 rounded-xl text-[16px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 size={19} className="animate-spin" /> : next.icon}{next.label}<ArrowRight size={17} />
            </button>
          </>
        ) : (
          <>
            <div className="text-[15px]"><b>Done.</b> Both sites pass. Next: <a className="text-accent underline" href="#/modernize/retrofit/firmware">a CDU firmware change</a> revalidates the accepted package.</div>
            <button onClick={() => { setStep('idle'); setReport(null); setFlags([]); setDecision(null); setProposal(null); setPassed(null); setRegression(null); setSite2(null); }}
              className="h-12 px-4 rounded-xl border border-border hover:bg-surface-2 text-[15px] inline-flex items-center gap-2 t"><RotateCcw size={16} /> Start over</button>
          </>
        )}
        {error && <div role="alert" className="sm:col-span-2 text-[14px] text-critical">{error}</div>}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Artifact n={1} title="Original config" done={at('tested')} testid="artifact-config">
          <CodeLines title="sites/h1/config/original/mapping.yaml (integrator draft)" text={original} mark={markLines} />
        </Artifact>
        <Artifact n={2} title="Source drawing" done={at('flagged')} testid="artifact-drawing" empty="Appears when the failure is traced.">
          {at('flagged') && flag ? (
            <div className="grid gap-2">
              <Drawing text={SNAP.drawing} quote={flag.quote} />
              <p className="text-[14px]"><b>Mismatch:</b> <span className="mono">{flag.point}</span> is mapped to <b className="text-critical">{flag.mapped_location}</b> (line {flag.line_no}); the drawing puts zone {flag.zone} under <b className="text-ok">{flag.drawing_location}</b>. <span className="text-muted">Traced by {SNAP.flag.by}.</span></p>
            </div>
          ) : undefined}
        </Artifact>
        <Artifact n={3} title="Failed behavior test" done={at('tested')} testid="artifact-failed" empty="Run the behavior tests.">
          {report ? <ReportView report={report} /> : undefined}
        </Artifact>
        <Artifact n={4} title="Engineer decision" done={at('decided')} testid="artifact-decision" empty="Waiting for the engineer.">
          {decision ? (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px]">
              <dt className="text-muted">Decision</dt><dd><b>D-{decision.id} v{decision.version}</b> · {decision.decision}: zone {String(decision.scope.zone)} cable runs under <b>{decision.value}</b></dd>
              <dt className="text-muted">By</dt><dd data-testid="decision-author">{decision.author}</dd>
              <dt className="text-muted">At</dt><dd>{decision.at ? new Date(decision.at * 1000).toLocaleString() : 'recorded'}</dd>
              <dt className="text-muted">Source</dt><dd><span className="mono">{decision.source_doc}</span>: “{decision.source_quote}”</dd>
              <dt className="text-muted">Scope</dt><dd>site {String(decision.scope.site)} · {String(decision.scope.equipment)} · hall {String(decision.scope.hall)}</dd>
              <dt className="text-muted">Valid for</dt><dd>{decision.equipment_version} · depends on <span className="mono">{decision.depends_on.join(', ')}</span></dd>
            </dl>
          ) : at('flagged') && flag ? <p className="text-[14px]">Confirm that zone {flag.zone}’s leak cable physically runs under <b>{flag.drawing_location}</b> (drawing RD-H1-R3 note {flag.zone}). Your name goes on the record.</p> : undefined}
        </Artifact>
        <Artifact n={5} title="Config change" done={at('proposed')} testid="artifact-diff" empty="Generated after the decision.">
          {proposal ? (
            <div className="grid gap-2">
              <Diff diff={proposal.diff} />
              <ul className="text-[13px] text-muted grid gap-1">{proposal.changes.map((c) => <li key={c.after}><b className="text-text">Why:</b> {c.why}. <b className="text-text">Source:</b> {c.source}</li>)}</ul>
            </div>
          ) : undefined}
        </Artifact>
        <Artifact n={6} title="Passing regression test" done={at('saved')} testid="artifact-regression" empty="Re-run, then save the correction as a regression test.">
          {passed ? (
            <div className="grid gap-2">
              {regression && <p className="text-[14px]"><Badge tone="accent">R-{regression.id}</Badge> {regression.spec.summary}. Saved from decision D-{regression.decision_id}.</p>}
              <ReportView report={passed} highlight={(id) => id.startsWith('regression-') || id === 'leak-R3-01'} />
            </div>
          ) : undefined}
        </Artifact>
      </div>

      {site2 && (
        <section className="card mt-4 p-4 grid gap-3" data-testid="site2">
          <h3 className="text-[17px] font-semibold">Second site: hall H7, racks C-11/C-12 on CDU-07</h3>
          <p className="text-[14px] text-muted">Same integrator template, mirrored layout, different names. Saved regression R-{regression?.id ?? SNAP.regression.id} ran as a template over H7’s own drawing.</p>
          <div className={cx('grid gap-4', site2.fixed && 'lg:grid-cols-2')}>
            <div className="grid gap-2 min-w-0"><div className="text-[14px] font-medium">Before: {site2.report.passed}/{site2.report.total}</div><ReportView report={site2.report} /></div>
            {site2.fixed && site2.proposal && (
              <div className="grid gap-2 min-w-0">
                <div className="text-[14px] font-medium">After decision D-{site2.decision?.id} by {site2.decision?.author}: {site2.fixed.passed}/{site2.fixed.total}</div>
                <Diff diff={site2.proposal.diff} title="H7 mapping change" />
                <ul className="text-[13px] text-muted grid gap-1">{site2.proposal.changes.map((c) => <li key={c.after}><b className="text-text">Why:</b> {c.why}. <b className="text-text">Source:</b> {c.source}</li>)}</ul>
                <ReportView report={site2.fixed} />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
