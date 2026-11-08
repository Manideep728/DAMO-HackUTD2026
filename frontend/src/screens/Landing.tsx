import { Link } from 'react-router-dom';
import { ArrowRight, Check, X, Lock, FileSearch, Brain, FileCode2, FlaskConical, Rocket, Radio, BellRing, NotebookPen, Search, ClipboardCheck, WifiOff, UserCheck, ShieldCheck, Scale } from 'lucide-react';
import { REPO_URL } from '../modern/data';

const modernize = [
  { k: 'M1', t: 'Import real inputs', d: 'Pin the old check, inherited config, asset and owner map, and procedures. Missing and unsupported inputs are listed, not guessed.', I: FileSearch },
  { k: 'M2', t: 'Recover behavior and intent', d: 'States, missing-data rules, retries, recovery and recipients, each with a source. An operator confirms every deliberate change.', I: Brain },
  { k: 'M3', t: 'Generate a reviewable change', d: 'Nemotron writes the collector, rules and routing, and lists what is preserved versus intentionally changed.', I: FileCode2 },
  { k: 'M4', t: 'Test the whole alert path', d: 'Old and new run on identical scenarios: missed and extra alerts, severity, timing, recipient, recovery. Held-out cases stay sealed.', I: FlaskConical },
  { k: 'M5', t: 'Repair, review, release', d: 'Nemotron fixes failures; an engineer reviews; shadow operation and rollback are tested before a versioned release.', I: Rocket },
];
const operate = [
  { k: 'R1', t: 'Collect and evaluate', d: 'Stable asset IDs, units and freshness. Missing telemetry is never healthy. Rules and delivery run with the model offline.', I: Radio },
  { k: 'R2', t: 'Deliver and assign', d: 'Route by the owner and shift map. Delivery, failure, fallback and acknowledgement are recorded separately; unacknowledged incidents escalate.', I: BellRing },
  { k: 'R3', t: 'Preserve evidence', d: 'Original technician notes, occurrence and entry times, work-order state and correction history, never overwritten.', I: NotebookPen },
  { k: 'R4', t: 'Investigate and recommend', d: 'Cited hypotheses, stated uncertainty and a next task for the right role. It cannot invent owners, approve itself or touch infrastructure.', I: Search },
  { k: 'R5', t: 'Verify and hand off', d: 'Recovery needs fresh measurements. Handoffs carry risks, work done, owner and next action, and the incoming shift accepts them.', I: ClipboardCheck },
];
const principles = [
  { t: 'The model writes. Execution decides.', d: 'Every claim about the old check is confirmed by running it. Every new rule is judged by replayed scenarios, not by the model that wrote it.', I: Scale },
  { t: 'A person approves every change.', d: 'Operators confirm intent, engineers review diffs, the operations lead releases. Nemotron never approves its own work.', I: UserCheck },
  { t: 'Alerts survive a model outage.', d: 'Accepted rules and notification delivery are deterministic. Take Nemotron offline and pages still go out.', I: WifiOff },
  { t: 'Bounded evidence, stated plainly.', d: 'Passing cases proves behavior on those cases. The evidence pack says what was tested and what was not.', I: ShieldCheck },
];
const roles = [
  ['Monitoring / platform engineer', 'Runs the modernization and reviews the diff'],
  ['Operations lead', 'Confirms intent and approves the release'],
  ['Duty operator', 'Acknowledges and dispatches'],
  ['Technician', 'Records work against the work order'],
  ['Incoming shift', 'Accepts the handoff, explicitly'],
  ['Workload owner', 'Authorizes job actions separately'],
];

export default function Landing() {
  return (
    <div className="min-h-full bg-bg text-text">
      <header className="sticky top-0 z-20 border-b hairline bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto max-w-[1200px] px-5 h-16 flex items-center gap-8">
          <Link to="/" className="h-12 flex items-center" aria-label="Damo, home"><img src="/brand/damo-logo.png" alt="Damo" className="brand-light h-[34px] w-auto" /><img src="/brand/damo-logo-light.png" alt="Damo" className="brand-dark h-[34px] w-auto" /></Link>
          <nav className="hidden md:flex items-center gap-6 text-[14px] text-muted">
            <a href="#modernize" className="hover:text-text t inline-flex items-center h-12 px-2">Modernize</a><a href="#operate" className="hover:text-text t inline-flex items-center h-12 px-2">Operate</a><a href="#trust" className="hover:text-text t inline-flex items-center h-12 px-2">Trust</a><a href="#who" className="inline-flex items-center h-12 px-1 hover:text-text t">Who it's for</a>
          </nav>
          <Link to="/modernize/import" className="ml-auto btn btn-primary h-12 px-4 rounded-lg inline-flex items-center gap-2 text-[14px] font-medium">Open the demo <ArrowRight size={15} /></Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1200px] px-5 pt-20 pb-16 md:pt-28">
        <p className="label mb-6">Damo · for data center monitoring and operations teams</p>
        <h1 className="text-[44px] md:text-[64px] font-semibold tracking-[-0.03em] leading-[1.04] max-w-[900px]">Retire the monitoring you inherited, without missing a page.</h1>
        <p className="text-[17px] md:text-[19px] text-muted mt-6 max-w-[680px] leading-relaxed">Damo reads your old Nagios checks, recovers what they really do, writes the replacement and proves it on the whole alert path. Then it runs the alerts, the investigation and the shift handoff.</p>
        <div className="flex flex-wrap gap-3 mt-9">
          <Link to="/modernize/import" className="btn btn-primary h-12 px-5 rounded-lg inline-flex items-center gap-2 text-[14.5px] font-medium">See modernization <ArrowRight size={16} /></Link>
          <Link to="/" className="btn h-12 px-5 rounded-lg inline-flex items-center gap-2 text-[14.5px] font-medium border hairline bg-surface hover:bg-surface-2">See operations</Link>
        </div>
        <Preview />
      </section>

      <section className="border-y hairline bg-surface">
        <div className="mx-auto max-w-[1200px] px-5 py-6 flex flex-wrap items-center gap-x-10 gap-y-3 text-[14px] text-muted">
          <span className="label">Works with what you run</span>
          {['Nagios Core plugins', 'Redfish / BMC', 'Prometheus', 'Alertmanager', 'NVIDIA Nemotron'].map((x) => <span key={x} className="font-medium text-text/80">{x}</span>)}
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-5 py-24">
        <div className="max-w-[720px] mb-12"><h2 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.025em] leading-tight">Nobody here wrote the checks that page you at 3 AM.</h2><p className="text-[16px] text-muted mt-4 leading-relaxed">Static checks outlive the people who tuned them. Their limits encode upstream constraints nobody wrote down, their recipients point at mailboxes nobody reads, and the context lives in engineers' heads.</p></div>
        <div className="grid md:grid-cols-3 gap-px border-t-[1.5px] border-text bg-border">
          {[
            ['Intent is undocumented', 'Limits often reflect upstream constraints, like cabinet and power budgets, that live in someone\'s memory, not the config.'],
            ['Pages go nowhere', 'Inherited templates ship with placeholder contacts. In the public TTU Redfish check, every alert goes to nagios@localhost.'],
            ['Handoffs drop context', 'Shift handoffs need explicit risks, owners and next actions, or the incoming team starts from zero.'],
          ].map(([t, d], i) => <div key={t} className="bg-bg p-7"><div className="mono text-[12px] text-faint mb-4">0{i + 1}</div><div className="font-semibold text-[16px] mb-2">{t}</div><p className="text-[14px] text-muted leading-relaxed">{d}</p></div>)}
        </div>
      </section>

      <Flow id="modernize" kicker="Workflow 1 · Modernize" title="From inherited check to tested, reversible release." sub="For the monitoring or platform engineer, approved by the operations lead. Output: a versioned monitoring update with test evidence and rollback." items={modernize} cta={{ to: '/modernize/import', label: 'Walk through M1–M5' }} />
      <Flow id="operate" kicker="Workflow 2 · Operate" title="Run the alerts, the investigation and the handoff." sub="For the duty operator, technician and incoming shift. Platform and workload owners authorize job actions separately." items={operate} cta={{ to: '/operate', label: 'Play the night shift' }} />

      <section id="trust" className="border-t hairline">
        <div className="mx-auto max-w-[1200px] px-5 py-24">
          <h2 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.025em] leading-tight max-w-[720px] mb-12">Built for the people who get blamed when a page is missed.</h2>
          <div className="grid md:grid-cols-2 gap-x-10 border-t-[1.5px] border-text">{principles.map(({ t, d }, i) => (
            <div key={t} className="py-7 border-b hairline grid grid-cols-[40px_1fr] gap-x-3"><span className="mono text-[12px] text-faint pt-1">0{i + 1}</span><div><div className="font-semibold text-[17px] tracking-[-0.01em] mb-2">{t}</div><p className="text-[14px] text-muted leading-relaxed">{d}</p></div></div>))}
          </div>
        </div>
      </section>

      <section id="who" className="border-t hairline bg-surface">
        <div className="mx-auto max-w-[1200px] px-5 py-24 grid lg:grid-cols-[1fr_1.4fr] gap-12">
          <div><h2 className="text-[32px] font-semibold tracking-[-0.025em] leading-tight">Every role keeps its own decision.</h2><p className="text-[15px] text-muted mt-4 leading-relaxed">Ownership comes from your owner and shift map, never from the model.</p></div>
          <div className="grid sm:grid-cols-2 gap-px border-t-[1.5px] border-text bg-border">{roles.map(([r, d]) => <div key={r} className="bg-bg p-5"><div className="font-medium text-[14.5px]">{r}</div><div className="text-[14px] text-muted mt-1">{d}</div></div>)}</div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-5 py-24 text-center">
        <img src="/brand/damo-mark.png" alt="" className="brand-light mx-auto h-12 w-auto mb-6" /><img src="/brand/damo-mark-light.png" alt="" className="brand-dark mx-auto h-12 w-auto mb-6" />
        <h2 className="text-[34px] md:text-[44px] font-semibold tracking-[-0.028em] leading-tight">Bring one real check.<br /><span className="text-muted">Leave with a tested replacement.</span></h2>
        <div className="flex flex-wrap justify-center gap-3 mt-9">
          <Link to="/modernize/import" className="btn btn-primary h-12 px-5 rounded-lg inline-flex items-center gap-2 text-[14.5px] font-medium">Start the demo <ArrowRight size={16} /></Link>
        </div>
      </section>

      <footer className="border-t hairline">
        <div className="mx-auto max-w-[1200px] px-5 py-8 flex flex-wrap gap-x-8 gap-y-2 text-[12.5px] text-faint">
          <span>Damo · HackUTD 2026</span>
          <span>Demo baseline: <a className="underline-offset-2 hover:underline hover:text-muted" href={REPO_URL} target="_blank" rel="noreferrer">TTU Nagios–Redfish integration</a> (BSD-3-Clause). Asset map, owners and scenario data are illustrative.</span>
        </div>
      </footer>
    </div>
  );
}

function Flow({ id, kicker, title, sub, items, cta }: { id: string; kicker: string; title: string; sub: string; items: { k: string; t: string; d: string; I: typeof Radio }[]; cta: { to: string; label: string } }) {
  return (
    <section id={id} className="border-t hairline">
      <div className="mx-auto max-w-[1200px] px-5 py-24">
        <div className="flex flex-wrap items-end gap-6 mb-12">
          <div className="max-w-[720px]"><p className="label mb-4">{kicker}</p><h2 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.025em] leading-tight">{title}</h2><p className="text-[15.5px] text-muted mt-4 leading-relaxed">{sub}</p></div>
          <Link to={cta.to} className="md:ml-auto btn h-12 px-4 rounded-lg inline-flex items-center gap-2 text-[14px] font-medium border hairline bg-surface hover:bg-surface-2">{cta.label} <ArrowRight size={15} /></Link>
        </div>
        <ol className="grid md:grid-cols-5 gap-px border-t-[1.5px] border-text bg-border">
          {items.map(({ k, t, d }) => (
            <li key={k} className="bg-bg p-6">
              <div className="mono text-[22px] font-medium mb-5 tracking-[-0.02em]">{k}</div>
              <div className="font-semibold text-[15px] tracking-[-0.01em] mb-2">{t}</div>
              <p className="text-[14px] text-muted leading-relaxed">{d}</p>
            </li>))}
        </ol>
      </div>
    </section>
  );
}

function Preview() {
  const rows: [string, string, boolean[]][] = [
    ['Normal', 'No alert', [true, true, true, true, true]],
    ['Sustained Critical', 'Critical at +3 min', [true, true, true, true, true]],
    ['Brief spike', 'No alert', [true, true, true, true, true]],
    ['Missing temperature feed', 'Unknown at +3 min', [true, true, true, true, true]],
    ['Recovery', 'Resolved notice', [true, true, true, true, true]],
    ['Correct alert, wrong recipient', 'Mutant must fail', [true, true, true, true, true]],
  ];
  return (
    <div className="mt-16 card overflow-hidden shadow-[var(--shadow)]">
      <div className="flex items-center gap-3 px-5 h-12 border-b hairline text-[14px]">
        <span className="font-semibold">M4 · Test the whole alert path</span>
        <span className="text-muted">ttu-redfish-temperature · candidate v2</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-ok"><Check size={14} /> 6/6 cases · 3/3 held-out</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px] min-w-[720px]">
          <thead className="text-left border-b hairline"><tr><th className="th pl-5 h-10">Case</th><th className="th">Expected</th>{['Missed / extra', 'Severity', 'Timing', 'Recipient', 'Recovery'].map((h) => <th key={h} className="th text-center">{h}</th>)}</tr></thead>
          <tbody>{rows.map(([c, e, v]) => <tr key={c} className="border-b hairline last:border-0"><td className="pl-5 py-3 font-medium">{c}</td><td className="text-muted">{e}</td>{v.map((x, i) => <td key={i} className="text-center">{x ? <Check size={15} className="inline text-ok" strokeWidth={2.5} /> : <X size={15} className="inline text-critical" />}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t hairline text-[12.5px] text-muted flex items-center gap-2"><Lock size={13} /> Expectations and held-out cases are fixed before generation and stay outside the agent's control.</div>
    </div>
  );
}

