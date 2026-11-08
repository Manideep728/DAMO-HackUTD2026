// Work order page: the issue, Nemotron's initial diagnosis, and the retrofit and logbook context behind it.
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Cpu, Droplets, NotebookPen, Sparkles, Wrench, X } from 'lucide-react';
import { Badge, Card, ModelBadge, PageHeader } from '../components/ui';
import { S } from '../retrofit/store';
import { doc } from '../retrofit/docs';
import { DocLink, DocsProvider } from '../retrofit/DocViewer';
import { DiffView } from '../retrofit/parts';
import { GPU, KAT, NEXT_TEST, UNKNOWN, evidence, hypotheses, toolCalls } from './engine';

// Logbook rows that touch the liquid row: context for the investigation, never the cause by itself.
const logRows = doc('logbook').text.split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('date,'))
  .map((l) => { const m = l.match(/^([^,]+),([^,]+),([^,]+),"?(.*?)"?$/); return m ? { date: m[1], author: m[2], asset: m[3], note: m[4] } : null; })
  .filter((r): r is { date: string; author: string; asset: string; note: string } => !!r && /R3|CDU-1|V-R3/.test(r.asset));

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex gap-3 py-1.5 border-b hairline last:border-0 text-[14px]"><span className="w-44 shrink-0 text-muted">{k}</span><span className="min-w-0">{v}</span></div>;

export default function WorkOrder() {
  const { id = 'WO-1042' } = useParams();
  const pkg = S.firmware_approved?.package ?? S.package_v1;
  return (
    <DocsProvider>
      <div className="max-w-[1320px] mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 h-10 text-[14px] text-muted hover:text-text mb-2"><ArrowLeft size={15} /> Back to the console</Link>
        <PageHeader kicker="Work order" title={`${id} · Correctness mismatch on ${GPU.id}`}
          subtitle={`Opened 02:21 by Maya R. (duty operator) for the ${GPU.owner} team. The operator decides whether to drain the node; Damo never drains or stops anything.`}
          meta={<><Badge tone="critical">Severity 2</Badge><Badge tone="warning">Cause not yet established</Badge><Badge>Example scenario</Badge></>} />

        <div className="grid lg:grid-cols-2 gap-5 mb-5 items-start">
          <Card header={<><Cpu size={15} className="text-critical" /><span className="font-semibold text-[14px]">Initial issue</span></>}>
            <Row k="Affected" v={<span className="mono">{GPU.id} · {GPU.server} {GPU.u} · rack {GPU.rack}</span>} />
            <Row k="Owner" v={`${GPU.owner} (primary ${GPU.primary}, fallback ${GPU.fallback})`} />
            <Row k="Failed test" v={<span className="mono">{KAT.name} {KAT.version} · seed {KAT.seed}</span>} />
            <Row k="Pinned inputs" v={KAT.inputs} />
            <Row k="Comparison" v={<>{KAT.method} Tolerance {KAT.tolerance} ({KAT.tolBasis}).</>} />
            <Row k="Expected (reference)" v={<span className="mono text-ok">{KAT.refSum}</span>} />
            <Row k="Observed on GPU-07" v={<span className="mono text-critical">{KAT.obsSum} · max abs error {KAT.maxErr}</span>} />
            <Row k="Health" v={<span className="flex flex-wrap gap-1.5"><Badge tone="ok">temperature normal</Badge><Badge tone="ok">utilization normal</Badge><Badge tone="ok">online</Badge><Badge tone="ok">legacy checks green</Badge></span>} />
            <Row k="Schedule" v={KAT.schedule} />
            <p className="text-[12px] text-faint mt-2">One test catches only the faults it exercises.</p>
          </Card>

          <Card header={<><Sparkles size={15} className="text-accent" /><span className="font-semibold text-[14px]">Agent initial diagnosis</span><ModelBadge model="Nemotron Super" /><span className="ml-auto text-[12px] text-faint">read-only tools</span></>}>
            <ol className="grid gap-2 mb-4">{toolCalls.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] fresh-row" style={{ animationDelay: `${i * 60}ms` }}>
                <Wrench size={13} className="text-muted shrink-0 mt-1" />
                <div className="min-w-0"><span className="mono font-medium">{t.tool}</span><span className="mono text-faint">({t.args})</span><div className="text-muted">→ {t.result}</div></div>
              </li>))}
            </ol>
            <div className="text-[12px] font-medium text-muted mb-1.5">Ranked hypotheses</div>
            <ul className="grid gap-2 mb-4">{hypotheses.map((h) => (
              <li key={h.title} className="card px-3 py-2.5">
                <div className="flex items-center gap-2 text-[14px]"><span className="font-semibold">{h.title}</span>
                  <span className="ml-auto"><Badge tone={h.confidence === 'Most likely' ? 'critical' : h.confidence === 'Ruled out' ? 'ok' : h.confidence === 'Context' ? 'neutral' : 'warning'}>{h.confidence}</Badge></span></div>
                <p className="text-[13px] text-muted mt-1">{h.note}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">{h.cites.map((c) => { const e = evidence.find((x) => x.id === c); return e ? <span key={c} title={e.text} className="text-[12px] mono px-1.5 rounded border hairline text-faint">{e.short}</span> : null; })}</div>
              </li>))}
            </ul>
            <div className="text-[12px] font-medium text-muted mb-1">Still unknown</div>
            <ul className="text-[13px] grid gap-1 mb-3">{UNKNOWN.map((u) => <li key={u} className="flex gap-2"><X size={13} className="text-warning shrink-0 mt-1" />{u}</li>)}</ul>
            <div className="text-[12px] font-medium text-muted mb-1">Recommended next approved test</div>
            <p className="text-[14px]">{NEXT_TEST}</p>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <Card header={<><Droplets size={15} className="text-accent" /><span className="font-semibold text-[14px]">Retrofit context</span><span className="ml-auto text-[12px] text-faint">from the accepted modernization package</span></>}>
            <Row k="Cooling path" v={<>R3-01 (Rack A) is cooled by CDU-1 via secondary loop TCS-1 and isolation valve V-R3-01.</>} />
            <Row k="Accepted package" v={<span className="mono">v{pkg?.version ?? 1} · mapping {pkg?.mapping_sha ?? S.proposal.sha} · accepted by {pkg?.accepted_by ?? 'Maya R.'}</span>} />
            <Row k="Corrected mapping" v={<>Leak zone 2 (LD-2) now names R3-01, decision D-1 by {S.decision.author}. <DocLink id="drawingB" mark="zone 2" label="as-built drawing" /></>} />
            <Row k="Owners" v="Facilities: CDU-1, loops, valves, leak cables · IT (GPU platform): racks R3-01/R3-02 and workload" />
            <Row k="Open field checks" v={<span className="flex flex-wrap gap-1.5">{S.readiness.field.checks.map((c: { id: string; what: string }) => <span key={c.id} title={c.what} className="mono text-[12px] px-1.5 rounded border hairline text-warning">{c.id}</span>)}</span>} />
            <div className="mt-3"><div className="text-[12px] text-muted mb-1.5">Mapping change in the accepted package</div><DiffView diff={S.proposal.diff} /></div>
          </Card>

          <Card header={<><NotebookPen size={15} className="text-muted" /><span className="font-semibold text-[14px]">Logbook context</span><Badge>context, not cause</Badge><span className="ml-auto"><DocLink id="logbook" label="logbook.csv" /></span></>}>
            <table className="w-full text-[14px]"><thead className="text-left border-b hairline"><tr><th className="th pr-3 h-10">Date</th><th className="th pr-3">Author</th><th className="th pr-3">Asset</th><th className="th">Note</th></tr></thead>
              <tbody>{logRows.map((r) => <tr key={r.date + r.asset} className="border-b hairline last:border-0 align-top"><td className="pr-3 py-2.5 mono text-[13px] whitespace-nowrap">{r.date}</td><td className="pr-3 py-2.5 whitespace-nowrap">{r.author}</td><td className="pr-3 py-2.5 mono text-[13px]">{r.asset}</td><td className="py-2.5 text-muted">{r.note}</td></tr>)}</tbody>
            </table>
            <p className="text-[13px] text-muted mt-3 flex gap-2"><Check size={14} className="text-ok shrink-0 mt-0.5" />No driver, firmware or configuration change on {GPU.server} since 2026-11-01.</p>
          </Card>
        </div>
      </div>
    </DocsProvider>
  );
}
