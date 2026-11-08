import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Check, Droplets, Network, Radio, ShieldCheck } from 'lucide-react';
import { REPO_URL } from '../modern/data';

const jobs = [
  { n: '01', icon: Activity, title: 'Modernize the integration', body: 'Import inherited controls, recover intent, generate a reviewable change and prove it against fixed expectations.', to: '/modernize', action: 'Choose a project' },
  { n: '02', icon: Network, title: 'Rehearse the facility change', body: 'Use the accepted equipment graph to expose shared dependencies, service impact and safer plans before work begins.', to: '/preflight', action: 'Open Preflight' },
  { n: '03', icon: Radio, title: 'Operate with accepted context', body: 'Detect with deterministic rules, scope the incident through the reviewed map and preserve owner actions through handoff.', to: '/', action: 'Open Operate' },
] as const;

const cooling = [
  ['Equipment model', 'One graph connects facility water, CDU-1, rack coolant, valves, leak zones and GPU racks.'],
  ['Mapping correction', 'A syntactically valid wrong-rack mapping fails an independent behavior test.'],
  ['Change control', 'Firmware 2.4.0 invalidates only affected decisions and reruns only affected tests.'],
  ['Readiness', 'Software evidence stays separate from witnessed field checks and unresolved ownership.'],
] as const;

export default function Landing() {
  return (
    <div className="min-h-full bg-bg text-text">
      <header className="border-b hairline bg-bg">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 h-16 flex items-center gap-6">
          <Link to="/" className="h-12 flex items-center" aria-label="Damo, home"><Logo /></Link>
          <nav aria-label="Product" className="hidden sm:flex items-center gap-1 text-body text-muted"><a href="#product" className="h-10 px-3 inline-flex items-center hover:text-text t">Product</a><a href="#cooling" className="h-10 px-3 inline-flex items-center hover:text-text t">Liquid cooling</a><a href="#evidence" className="h-10 px-3 inline-flex items-center hover:text-text t">Evidence</a></nav>
          <Link to="/modernize" className="ml-auto btn btn-primary h-11 px-4 rounded-control inline-flex items-center gap-2 text-body font-medium">Open workspace <ArrowRight size={15} /></Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-[1200px] px-4 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28">
          <p className="kicker mb-4">Controls modernization for existing data centers</p>
          <h1 className="max-w-[960px] text-[44px] md:text-[64px] font-semibold tracking-[-0.04em] leading-[1.02]">Change the integration.<br/><span className="text-muted">Rehearse the facility. Operate the result.</span></h1>
          <p className="text-section text-muted mt-6 max-w-[720px] leading-relaxed">Damo turns inherited monitoring and new liquid-cooling equipment into tested, reviewable packages. The same accepted model then supports facility simulation and incident response.</p>
          <div className="flex flex-wrap gap-3 mt-8"><Link to="/modernize/retrofit" className="btn btn-primary h-12 px-5 rounded-control inline-flex items-center gap-2 text-body font-medium">See the cooling workflow <ArrowRight size={16}/></Link><Link to="/modernize" className="h-12 px-5 rounded-control border hairline bg-surface inline-flex items-center text-body font-medium hover:bg-surface-2 t">Browse projects</Link></div>
          <div className="mt-14 rounded-surface border hairline bg-surface overflow-hidden"><div className="grid md:grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch"><Signal title="Accepted package" body="Versioned mapping, rules, tests and rollback"/><ArrowRight className="hidden md:block self-center text-faint" size={18}/><Signal title="Shared equipment graph" body="The same facility context in Modernize and Preflight"/><ArrowRight className="hidden md:block self-center text-faint" size={18}/><Signal title="Bounded operations" body="Deterministic detection with reviewed incident context"/></div></div>
        </section>

        <section id="product" className="border-y hairline bg-surface"><div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-20"><div className="max-w-[720px] mb-10"><p className="kicker mb-3">One product, three jobs</p><h2 className="text-title font-semibold tracking-[-0.025em]">Every page answers a different operational question.</h2></div><div className="divide-y divide-[var(--border)] border-y hairline">{jobs.map(({ n, icon: Icon, title, body, to, action }) => <article key={n} className="grid md:grid-cols-[64px_240px_1fr_auto] gap-4 md:gap-6 items-center py-6"><span className="mono text-label text-faint">{n}</span><h3 className="text-section font-semibold flex items-center gap-3"><Icon size={18} className="text-muted"/>{title}</h3><p className="text-body text-muted max-w-prose">{body}</p><Link to={to} className="h-10 inline-flex items-center gap-2 font-medium text-body hover:text-accent t">{action}<ArrowRight size={15}/></Link></article>)}</div></div></section>

        <section id="cooling" className="mx-auto max-w-[1200px] px-4 sm:px-6 py-20 md:py-24"><div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-16"><div><p className="kicker mb-3">Liquid-cooling retrofit</p><h2 className="text-title font-semibold tracking-[-0.025em]">Start with the equipment, then earn the accepted package.</h2><p className="text-body text-muted mt-4 max-w-prose">The headline workflow follows CDU-1 and row R3 from topology through mapping, change control and witnessed readiness.</p><Link to="/modernize/retrofit" className="mt-6 h-11 inline-flex items-center gap-2 font-semibold text-body hover:text-accent t">Walk through the project <ArrowRight size={16}/></Link></div><ol className="border-t hairline">{cooling.map(([title, body], index) => <li key={title} className="grid grid-cols-[36px_1fr] gap-4 border-b hairline py-5"><span className="mono text-label text-faint">{String(index + 1).padStart(2, '0')}</span><div><h3 className="text-body font-semibold">{title}</h3><p className="text-body text-muted mt-1">{body}</p></div></li>)}</ol></div></section>

        <section id="evidence" className="border-y hairline bg-surface"><div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-20 grid lg:grid-cols-[1fr_1.2fr] gap-10"><div><p className="kicker mb-3">What is real</p><h2 className="text-title font-semibold tracking-[-0.025em]">Models propose. Execution and people decide.</h2></div><ul className="grid gap-4 text-body">{['Behavior tests run through the adapter and are judged by expectations outside the generated config.','Preflight computes impact and redundancy from a shared graph; it does not certify hydraulics or electrical protection.','Operators and engineers confirm intent, approve packages and witness physical checks.','Synthetic sites, estimates and unexecuted comparison arms are labeled explicitly.'].map((item) => <li key={item} className="flex items-start gap-3"><Check size={17} className="text-ok mt-1 shrink-0"/><span>{item}</span></li>)}</ul></div></section>

        <section className="mx-auto max-w-[1200px] px-4 sm:px-6 py-20 flex flex-wrap items-end gap-8"><div className="max-w-[720px]"><Droplets size={24} className="text-accent mb-5"/><h2 className="text-title font-semibold tracking-[-0.025em]">Inspect the cooling model, then follow the evidence.</h2><p className="text-body text-muted mt-3">The backend and frontend run locally; the recorded replay remains available when external services are offline.</p></div><Link to="/modernize/retrofit" className="lg:ml-auto btn btn-primary h-12 px-5 rounded-control inline-flex items-center gap-2 text-body font-medium">Start with CDU-1 <ArrowRight size={16}/></Link></section>
      </main>

      <footer className="border-t hairline"><div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-8 flex flex-wrap gap-x-8 gap-y-2 text-label text-faint"><span>Damo · HackUTD 2026</span><span>TTU baseline: <a className="underline hover:text-muted" href={REPO_URL} target="_blank" rel="noreferrer">Nagios–Redfish integration</a>. Facility and scenario data are synthetic.</span><Link to="/evidence/retrofit" className="hover:text-muted">Review evaluation evidence</Link></div></footer>
    </div>
  );
}

function Signal({ title, body }: { title: string; body: string }) { return <div className="p-5"><div className="flex items-center gap-2 text-body font-semibold"><ShieldCheck size={17} className="text-ok"/>{title}</div><p className="text-label text-muted mt-2">{body}</p></div>; }
function Logo() { return <><img src="/brand/damo-logo.png" alt="Damo" className="brand-light h-[30px] w-auto"/><img src="/brand/damo-logo-light.png" alt="Damo" className="brand-dark h-[30px] w-auto"/></>; }
