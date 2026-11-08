import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowDown, ArrowRight, ClipboardCheck, Cpu, ExternalLink, FileDiff, FileSearch, FlaskConical, FolderInput, GitCompare,
  History, KeyRound, ListChecks, Moon, Network, PackageCheck, RefreshCcw, Repeat, Scale, ScanSearch, Sun, Target, Wrench, type LucideIcon,
} from 'lucide-react';
import { REPO_URL } from '../modern/data';
import { cx } from '../components/ui';
import { Stage } from './landing/motion';
import { at, landingCss } from './landing/anim';
import { ArtifactStrip, ContextChain, DocConflict, GpuMismatch, HeroRow } from './landing/graphics';

type Step = { t: string; d: string; I: LucideIcon };

const modernizeSteps: Step[] = [
  { I: FolderInput, t: 'Bring the evidence together', d: 'Import floor plans, cooling schematics, equipment inventories, vendor manuals, BMS point lists and maintenance notes. Connect supported document sources. See what is current, what is missing and where each fact came from.' },
  { I: Network, t: 'Resolve the site and equipment decisions', d: 'Review which racks connect to which cooling loops, sensors and power feeds. Compare candidate CDUs, the units that transfer heat between cooling loops, against documented requirements. Record the engineer’s selection, installation constraints and maintenance plan.' },
  { I: FileDiff, t: 'Review the software change', d: 'Inspect the proposed point mappings, units, alarm rules and recipients beside the original configuration. Every deliberate change has a reason and a source. Unknown connections stay open for inspection.' },
  { I: FlaskConical, t: 'Test the expected behavior', d: 'Replay approved scenarios against the candidate configuration. Does a leak signal identify the correct rack? Does missing data become unknown? Does the right person receive the alert? Offline tests stay separate from live readings and witnessed field checks.' },
  { I: PackageCheck, t: 'Hand over an accepted record', d: 'Package the approved map, configuration diff, tests, procedures and unresolved items. The next engineer can see what was accepted and why, rather than reconstructing it from scratch.' },
];

const gpuSteps: Step[] = [
  { I: Target, t: 'Check a computation, not just a temperature', d: 'Run an approved known-answer test or controlled replay. Pin the inputs, software, hardware identity and comparison method so the result can be reproduced. Tests run within the permissions and scheduling limits set by the workload owner.' },
  { I: History, t: 'Preserve the mismatch', d: 'Record expected and observed output, test version, timestamps and affected GPU. A mismatch opens a correctness investigation. It does not automatically prove that the GPU hardware is defective.' },
  { I: ScanSearch, t: 'Gather the context that explains the machine', d: 'Bring together available driver and firmware versions, diagnostics, recent configuration changes, repair notes and workload details. Use the accepted site map to find its rack, power and cooling dependencies when relevant. Investigate software and numerical behavior as well as hardware.' },
  { I: GitCompare, t: 'Narrow the cause with approved tests', d: 'Recommend a controlled repeat, a reference comparison or a targeted diagnostic. Show the evidence for each hypothesis and what remains unknown. Draining a machine, stopping a job or running disruptive diagnostics requires the authorized operator.' },
  { I: Repeat, t: 'Verify the repair and carry the lesson forward', d: 'Compare the machine’s relevant settings before and after service. Rerun the appropriate checks, retain the results and record the decision to return it to service. Turn confirmed findings into reviewed regression tests and procedures.' },
];

const principles: Step[] = [
  { I: FileSearch, t: 'Evidence before conclusions', d: 'Generated mappings and explanations link to their inputs. Unknowns and conflicting records remain visible.' },
  { I: Scale, t: 'Independent checks', d: 'Expected behavior comes from approved requirements or a controlled reference, not from the same model that wrote the candidate.' },
  { I: KeyRound, t: 'Explicit authority', d: 'Engineers approve integration changes. Workload owners authorize job actions. Site safety controls remain independent.' },
  { I: ListChecks, t: 'A bounded result', d: 'A passed test establishes what happened under that test. Damo does not claim complete fault coverage or certify a physical retrofit.' },
  { I: RefreshCcw, t: 'Reviewed improvement', d: 'Confirmed incidents can become regression tests and updated procedures. The agent does not rewrite production policy or approve its own conclusions.' },
];

const roles: Step[] = [
  { I: Wrench, t: 'Controls integrators', d: 'Reconcile site records, prepare integration changes and assemble test evidence.' },
  { I: ClipboardCheck, t: 'Commissioning engineers', d: 'Review acceptance criteria, witness physical checks and record exceptions.' },
  { I: Cpu, t: 'GPU and platform engineers', d: 'Investigate incorrect computations and verify machines after service.' },
  { I: Activity, t: 'Operations teams', d: 'Find the affected equipment, preserve work history and hand over a clear next action.' },
];

const reading = [
  { t: 'ByteBridge: Oakland colocation retrofit (1 MW, 32 racks, three CDUs, integrated into an existing BMS)', href: 'https://www.bytebt.com/project/retrofitting-colocation-facility-semiconductor-design-ai-infrastructure-company' },
  { t: 'Meta: How Meta keeps its AI hardware reliable', href: 'https://engineering.fb.com/2025/07/22/data-infrastructure/how-meta-keeps-its-ai-hardware-reliable/' },
  { t: 'ByteRobust (arXiv 2509.16293)', href: 'https://arxiv.org/html/2509.16293v3' },
];

/* HashRouter owns the URL hash, so in-page anchors scroll instead of navigating. */
function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  let smooth = true;
  try { smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* default */ }
  el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}
function Jump({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return <a href="#/about" className={className} onClick={(e: MouseEvent) => { e.preventDefault(); scrollTo(to); }}>{children}</a>;
}

const btnBase = 'btn h-12 px-5 rounded-lg inline-flex items-center justify-center gap-2 text-[14.5px] font-medium whitespace-nowrap';
const btnPrimary = cx(btnBase, 'btn-primary');
const btnSecondary = cx(btnBase, 'border hairline bg-surface hover:bg-surface-2 hover:border-border-strong t');
const wrap = 'mx-auto max-w-[1200px] px-4 sm:px-5';
const h2 = 'text-[30px] md:text-[40px] font-semibold tracking-[-0.035em] leading-[1.1]';

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => { try { return (localStorage.getItem('theme') as 'dark' | 'light') || 'light'; } catch { return 'light'; } });
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('theme', theme); } catch { /* storage unavailable */ } }, [theme]);
  return [theme, setTheme] as const;
}

function PrototypeBadge() {
  return <span className="inline-flex items-center h-6 px-2 rounded-md border border-warning/40 text-warning text-[12px] font-semibold whitespace-nowrap">Prototype / planned</span>;
}

export default function Landing() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="min-h-full bg-bg text-text overflow-x-clip">
      <style>{landingCss}</style>

      <header className="sticky top-0 z-30 border-b hairline bg-bg/90 backdrop-blur-sm">
        <div className={cx(wrap, 'h-16 flex items-center gap-2 md:gap-6')}>
          <Jump to="top" className="h-12 flex items-center shrink-0" ><span className="sr-only">Damo, back to top</span>
            <img src="/brand/damo-logo.png" alt="" className="brand-light h-[30px] w-auto" /><img src="/brand/damo-logo-light.png" alt="" className="brand-dark h-[30px] w-auto" />
          </Jump>
          <nav className="hidden md:flex items-center gap-1 text-[14px] text-muted" aria-label="Page sections">
            {[['modernize', 'Modernize'], ['gpu', 'GPU reliability'], ['trust', 'Trust'], ['who', 'Who it’s for']].map(([id, label]) => (
              <Jump key={id} to={id} className="inline-flex items-center h-12 px-3 rounded-lg hover:text-text hover:bg-surface-2 t">{label}</Jump>
            ))}
          </nav>
          <button type="button" className="ml-auto h-12 w-12 grid place-items-center rounded-xl text-muted hover:text-text hover:bg-surface-2 t shrink-0" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link to="/setup" className={cx(btnPrimary, '!px-4 !text-[14px] shrink-0')}>Open the demo <ArrowRight size={15} aria-hidden /></Link>
        </div>
      </header>

      <main id="top" className="scroll-mt-20">
        {/* Hero */}
        <section className={cx(wrap, 'pt-14 pb-20 md:pt-24 md:pb-24 grid lg:grid-cols-[1.02fr_1fr] gap-12 lg:gap-14 items-center')}>
          <div className="enter"><div>
            <p className="kicker !text-[14px] mb-5">For teams bringing AI workloads into existing data centers</p>
            <h1 className="text-[40px] sm:text-[52px] lg:text-[58px] font-semibold tracking-[-0.045em] leading-[1.02]">Make your existing data center <span className="whitespace-nowrap">AI-ready.</span></h1>
            <p className="text-[18px] md:text-[19px] text-text mt-6 leading-relaxed max-w-[600px]">Prepare the building software for liquid-cooled GPU racks. Then investigate the GPU errors that a normal health dashboard can miss.</p>
            <p className="text-[15.5px] text-muted mt-4 leading-relaxed max-w-[600px]">Damo brings site documents, equipment mappings and test evidence into one workflow, from the first retrofit review to the next hardware incident.</p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-8">
              <Link to="/setup" className={btnPrimary}>Explore modernization <ArrowRight size={16} aria-hidden /></Link>
              <Jump to="gpu" className={btnSecondary}>Explore GPU reliability <ArrowDown size={16} aria-hidden /></Jump>
            </div>
            <p className="text-[13px] text-muted mt-5 max-w-[560px] leading-relaxed">HackUTD prototype. Example scenarios are labeled; live integrations and checks are identified in the demo.</p>
          </div></div>
          <HeroRow />
        </section>

        {/* Set the scene */}
        <section id="scene" className="border-t hairline scroll-mt-16">
          <div className={cx(wrap, 'py-20 md:py-24')}>
            <div className="grid lg:grid-cols-[1fr_1.1fr] gap-10 lg:gap-16 mb-12">
              <h2 className={h2}>The GPUs arrive. The old building systems still have to work with them.</h2>
              <div className="grid gap-4 text-[15.5px] text-muted leading-relaxed">
                <p>A customer wants to add liquid-cooled GPU racks to an existing facility. The building management system, or BMS, already monitors cooling and power. But it does not automatically know how the new cooling units, sensors and racks fit together.</p>
                <p>The controls engineer opens a floor plan, a cooling schematic, a vendor manual and a spreadsheet of BMS points. One places sensor LD-2 at one rack. Another assigns it to a different rack. Before anyone trusts the alarms, someone has to resolve that disagreement, update the software and prove the response is correct.</p>
                <p>After the racks enter service, another problem appears: a GPU can stay online and still produce an incorrect result. The operations team now needs evidence about the computation itself, alongside the machine’s configuration and maintenance history.</p>
              </div>
            </div>
            <DocConflict />

            <div className="mt-16">
              <h3 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.025em] leading-tight mb-6">Two workflows. One retained record of what changed.</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <Jump to="modernize" className="card p-6 group hover:border-border-strong t block">
                  <div className="flex items-center gap-2 mb-3"><span className="mono text-[12px] text-faint">Workflow 1</span><span className="ml-auto text-muted group-hover:text-text t"><ArrowDown size={16} aria-hidden /></span></div>
                  <div className="text-[18px] font-semibold tracking-[-0.015em]">Modernize</div>
                  <p className="text-[14.5px] text-muted mt-1.5 leading-relaxed">Reconcile the site, review the integration and test the changes.</p>
                </Jump>
                <Jump to="gpu" className="card p-6 group hover:border-border-strong t block">
                  <div className="flex items-center gap-2 mb-3"><span className="mono text-[12px] text-faint">Workflow 2</span><PrototypeBadge /><span className="ml-auto text-muted group-hover:text-text t"><ArrowDown size={16} aria-hidden /></span></div>
                  <div className="text-[18px] font-semibold tracking-[-0.015em]">Monitor</div>
                  <p className="text-[14.5px] text-muted mt-1.5 leading-relaxed">Check selected GPU computations, investigate discrepancies and verify return to service.</p>
                </Jump>
              </div>
            </div>
          </div>
        </section>

        {/* Workflow 1 */}
        <section id="modernize" className="border-t hairline bg-surface scroll-mt-16">
          <div className={cx(wrap, 'py-20 md:py-24')}>
            <SectionHead kicker="Workflow 1 · Modernize" title="Turn scattered retrofit records into a tested integration."
              sub="For the controls engineer and commissioning team. Keep your existing BMS; make the software changes for the new equipment understandable, reviewable and repeatable."
              action={<Link to="/setup" className={btnSecondary}>Walk through modernization <ArrowRight size={16} aria-hidden /></Link>} />
            <Track steps={modernizeSteps} />

            <div className="mt-16 card !bg-bg p-5 md:p-7">
              <div className="grid lg:grid-cols-[1fr_1.3fr] gap-4 lg:gap-10 mb-6">
                <div>
                  <span className="inline-flex items-center h-6 px-2 rounded-md border hairline text-[12px] font-medium text-muted mb-3">Example scenario</span>
                  <h3 className="text-[20px] md:text-[22px] font-semibold tracking-[-0.02em] leading-tight">A connected sensor, mapped to the wrong rack</h3>
                </div>
                <p className="text-[15px] text-muted leading-relaxed lg:pt-9">The point is readable. The configuration is valid. The behavior test still fails: LD-2 is assigned to Rack B, while the reviewed drawing places it at Rack A. The engineer confirms the evidence, approves the correction and reruns the test.</p>
              </div>
              <ArtifactStrip />
              <p className="text-[13px] text-muted mt-5">Illustrative integration test. Passing this test does not replace physical commissioning.</p>
            </div>
          </div>
        </section>

        {/* Workflow 2 */}
        <section id="gpu" className="border-t hairline scroll-mt-16">
          <div className={cx(wrap, 'py-20 md:py-24')}>
            <SectionHead kicker={<>Workflow 2 · GPU reliability <PrototypeBadge /></>} title="A GPU can look healthy and still calculate the wrong answer."
              sub="Silent data corruption is an incorrect computation without an obvious crash or useful error signal. Temperature, utilization and availability help explain machine health, but they do not establish that a computation is correct."
              action={<Jump to="gpu-example" className={btnSecondary}>Explore a GPU correctness investigation <ArrowDown size={16} aria-hidden /></Jump>} />
            <p className="text-[15.5px] text-muted leading-relaxed max-w-[760px] -mt-6 mb-12">Damo’s monitoring focus is a bounded correctness-and-investigation workflow: compare selected GPU work against a trusted expectation, preserve the evidence when results disagree, and help the GPU team decide what to test next.</p>
            <Track steps={gpuSteps} />

            <div id="gpu-example" className="mt-16 scroll-mt-20 grid lg:grid-cols-[0.8fr_1.2fr] gap-8 lg:gap-12 items-start">
              <div className="lg:sticky lg:top-24">
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="inline-flex items-center h-6 px-2 rounded-md border hairline text-[12px] font-medium text-muted">Example scenario</span><PrototypeBadge />
                </div>
                <h3 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.025em] leading-tight">Healthy status, mismatched output</h3>
                <p className="text-[15px] text-muted leading-relaxed mt-4">GPU-07 is online and its basic health checks are normal. An approved deterministic test returns a result that differs from its reference. The incident view shows the mismatch, recent maintenance, current driver version and repeat-test evidence together. The operator can investigate the discrepancy without guessing from a red temperature chart.</p>
                <p className="text-[13px] text-muted mt-5">Illustrative correctness scenario. Coverage is limited to the checks performed.</p>
              </div>
              <GpuMismatch />
            </div>
          </div>
        </section>

        {/* Why together */}
        <section id="together" className="border-t hairline bg-surface scroll-mt-16">
          <div className={cx(wrap, 'py-20 md:py-24')}>
            <div className="grid lg:grid-cols-[1fr_1.1fr] gap-8 lg:gap-16 mb-12">
              <div><p className="kicker !text-[14px] mb-3">Why the workflows belong together</p><h2 className={h2}>Keep the context after the retrofit is finished.</h2></div>
              <div className="grid gap-4 text-[15.5px] text-muted leading-relaxed lg:pt-8">
                <p>Modernization establishes the equipment relationships, accepted configuration, owners and test history. Operations reuses that record when something goes wrong.</p>
                <p>An operator can start with a GPU and find its server, rack and relevant facility dependencies, then see the changes and work orders tied to those assets. That context helps investigation. The correctness test supplies the evidence that the computation disagreed.</p>
              </div>
            </div>
            <ContextChain />
          </div>
        </section>

        {/* Trust */}
        <section id="trust" className="border-t hairline scroll-mt-16">
          <div className={cx(wrap, 'py-20 md:py-24')}>
            <div className="max-w-[760px] mb-12">
              <h2 className={h2}>AI prepares and investigates. Engineers remain accountable.</h2>
              <p className="text-[15.5px] text-muted mt-4 leading-relaxed">Nemotron prepares candidate mappings and investigates evidence. Correctness checks are deterministic tests, and every approval belongs to a person.</p>
            </div>
            <Stage className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {principles.map(({ I, t, d }, i) => (
                <div key={t} className={cx('lp-rise card p-5', i === 4 && 'sm:col-span-2 lg:col-span-1')} style={at(i * 70)}>
                  <span className="h-10 w-10 rounded-lg border hairline grid place-items-center text-text mb-4"><I size={18} strokeWidth={1.75} aria-hidden /></span>
                  <div className="font-semibold text-[15.5px] tracking-[-0.01em] mb-1.5">{t}</div>
                  <p className="text-[14px] text-muted leading-relaxed">{d}</p>
                </div>
              ))}
            </Stage>
          </div>
        </section>

        {/* Who it's for */}
        <section id="who" className="border-t hairline bg-surface scroll-mt-16">
          <div className={cx(wrap, 'py-20 md:py-24')}>
            <h2 className={cx(h2, 'mb-10')}>Who it’s for</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden border hairline bg-border">
              {roles.map(({ I, t, d }) => (
                <div key={t} className="bg-bg p-6">
                  <I size={18} className="text-muted mb-4" strokeWidth={1.75} aria-hidden />
                  <div className="font-semibold text-[15.5px]">{t}</div>
                  <p className="text-[14px] text-muted mt-1.5 leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="border-t hairline">
          <div className={cx(wrap, 'py-20 md:py-28 text-center')}>
            <img src="/brand/damo-mark.png" alt="" className="brand-light mx-auto h-12 w-auto mb-6" /><img src="/brand/damo-mark-light.png" alt="" className="brand-dark mx-auto h-12 w-auto mb-6" />
            <h2 className="text-[32px] md:text-[46px] font-semibold tracking-[-0.04em] leading-[1.08]">Make the retrofit understandable.<br /><span className="text-muted">Make the checks repeatable.</span></h2>
            <p className="text-[16px] text-muted mt-5 max-w-[560px] mx-auto leading-relaxed">Start with the systems you already have. Bring the evidence forward as your data center takes on AI workloads.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 mt-9">
              <Link to="/setup" className={btnPrimary}>Open modernization <ArrowRight size={16} aria-hidden /></Link>
              <Jump to="gpu" className={btnSecondary}>Explore GPU reliability <ArrowDown size={16} aria-hidden /></Jump>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t hairline">
        <div className={cx(wrap, 'py-8 grid gap-4 text-[13px] text-muted')}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-text font-medium">Further reading</span><span className="text-faint">· context from the field, not Damo results</span>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 w-full">
              {reading.map((r) => <li key={r.href}><a href={r.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 min-h-12 sm:min-h-0 underline-offset-2 hover:underline hover:text-text">{r.t}<ExternalLink size={12} aria-hidden /></a></li>)}
            </ul>
          </div>
          <p className="leading-relaxed">
            Damo · HackUTD 2026. Prototype workflows and illustrative scenarios. The legacy-check demonstration uses the{' '}
            <a className="underline underline-offset-2 hover:text-text" href={REPO_URL} target="_blank" rel="noreferrer">TTU Nagios–Redfish integration</a> (BSD-3-Clause).
            Capabilities, supported inputs and test modes are shown in the application.{' '}
            <Link to="/modernize/import" className="underline underline-offset-2 hover:text-text">Open the legacy-check example</Link>.
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ kicker, title, sub, action }: { kicker: ReactNode; title: string; sub: string; action: ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end gap-6 mb-12">
      <div className="max-w-[760px]">
        <p className="kicker !text-[14px] mb-3 flex flex-wrap items-center gap-2">{kicker}</p>
        <h2 className={h2}>{title}</h2>
        <p className="text-[15.5px] text-muted mt-4 leading-relaxed">{sub}</p>
      </div>
      <div className="lg:ml-auto shrink-0">{action}</div>
    </div>
  );
}

/** Five-step track: horizontal rail on desktop, vertical rail on phones. */
function Track({ steps }: { steps: Step[] }) {
  return (
    <Stage>
      <ol className="grid lg:grid-cols-5 lg:gap-6">
        {steps.map(({ I, t, d }, i) => (
          <li key={t} className="lp-rise relative flex gap-4 pb-8 lg:pb-0 lg:block" style={at(i * 90)}>
            {i < steps.length - 1 && <span aria-hidden className="absolute bg-border left-[23px] top-12 bottom-0 w-px lg:left-[56px] lg:-right-[20px] lg:top-6 lg:bottom-auto lg:h-px lg:w-auto" />}
            <span className="relative z-[1] h-12 w-12 shrink-0 grid place-items-center rounded-full border hairline bg-surface text-text"><I size={18} strokeWidth={1.75} aria-hidden /></span>
            <div className="min-w-0 lg:mt-5">
              <div className="mono text-[12px] text-faint mb-1">{String(i + 1).padStart(2, '0')}</div>
              <h3 className="font-semibold text-[15.5px] tracking-[-0.01em] leading-snug mb-2">{t}</h3>
              <p className="text-[14px] text-muted leading-relaxed">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </Stage>
  );
}
