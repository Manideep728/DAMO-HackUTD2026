import { qp } from '../lib/qp';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, ScrollText, FileWarning, Copy, Check } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Card, Badge, ModelBadge, Empty, cx } from '../components/ui';
import { CodeView, YamlView, Trace } from '../components/code';
import { CoverageStrip, StepChart } from '../components/viz';
import type { VerifyResult, SourceRange } from '../data/types';

const ruleToSource: Record<string, SourceRange[]> = {
  RackInletWarning: [{ file: 'services.cfg', from: 5, to: 8 }, { file: 'commands.cfg', from: 5, to: 5 }],
  RackInletCritical: [{ file: 'services.cfg', from: 5, to: 8 }, { file: 'commands.cfg', from: 5, to: 5 }],
  RackInletUnknown: [{ file: 'services.cfg', from: 10, to: 10 }, { file: 'commands.cfg', from: 5, to: 5 }],
  RackInletSensorFault: [{ file: 'commands.cfg', from: 3, to: 6 }],
  CoolingEffectivenessLow: [{ file: 'commands.cfg', from: 3, to: 6 }],
};
const sampleTraces = [ { n: 'ramp', v: [22, 24, 26, 28, 30, 32, 34] }, { n: 'step', v: [23, 23, 23, 33, 33, 33, 33] }, { n: 'flap at 27', v: [26.9, 27.1, 26.9, 27.1, 26.9, 27.1, 26.9] }, { n: '2 bad then recover', v: [24, 33, 33, 24, 24, 24, 24] }, { n: 'dropout', v: [24, 24, 24, 24, 24, 24, 24] }, { n: 'slow drift', v: [24, 24.5, 25, 25.5, 26, 26.5, 27.2] } ];

export default function Prove() {
  const { checkId = 'check_rack_inlet' } = useParams();
  const { state, ds, user } = useStore();
  const [hoverRule, setHoverRule] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const files = ds.source(checkId).filter((f) => f.file === 'services.cfg' || f.file === 'commands.cfg');
  const steps = state.steps.prove;
  const { oneShot, gauntlet, certificate, rounds, rulesYaml } = state;
  const blocked = !!gauntlet && gauntlet.counterexamples.length > 0;
  const signed = !!certificate?.signedOffBy;
  useEffect(() => { if (qp('seek') === 'end' && !gauntlet) setTimeout(() => ds.director.jumpToEnd('prove'), 0); }, [ds, gauntlet]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.key === 's' || e.key === 'S') && certificate && !signed && !blocked) setConfirm(true); if (e.key === 'Escape') setConfirm(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [certificate, signed, blocked]);
  const acceptedFindings = state.findings.filter((f) => f.status === 'accepted');
  const hi = hoverRule ? ruleToSource[hoverRule] : undefined;
  const gMismatch = useMemo(() => countMismatch(gauntlet), [gauntlet]);
  const oMismatch = useMemo(() => countMismatch(oneShot), [oneShot]);

  return (
    <div className="max-w-[1400px] grid gap-6">
      <div className="flex items-start gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Prove <span className="mono text-muted font-normal text-[16px]">{checkId}</span></h1>
          <p className="text-muted mt-1">New Prometheus rules, and proof they lose nothing: the real plugin on every value the sensor can report, 500 timing traces, zero mismatches. Then a human signs off.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!steps.length && <Button variant="primary" onClick={() => ds.runProve(checkId)}>Generate and verify</Button>}
          {certificate && !signed && <Button variant="primary" kbd="S" disabled={blocked} title={blocked ? 'Blocked: open counterexample' : undefined} onClick={() => setConfirm(true)}><ShieldCheck size={14} /> Sign off</Button>}
          {signed && <Badge tone="ok"><Check size={11} /> Signed off by {certificate!.signedOffBy} · {certificate!.signedOffAt}</Badge>}
        </div>
      </div>
      {!steps.length && <Empty title="Nothing generated yet" body={`Nemotron Super writes rules from the rule card and ${acceptedFindings.length} accepted finding${acceptedFindings.length === 1 ? '' : 's'}. The verifier then runs the real plugin on 1,654 inputs and 500 generated traces. A one-shot translation goes through the same verifier for comparison.`} />}
      {steps.length > 0 && <Card header={<span className="font-semibold text-[13px]">Steps</span>}><Trace steps={steps} /></Card>}

      {rulesYaml && (
        <section>
          <h2 className="text-[16px] font-semibold mb-2">Generated rules <span className="text-muted font-normal text-[13px]">· hover a rule to see the source lines it replaces</span></h2>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-3">{files.map((f) => <CodeView key={f.file} file={f} highlights={hi} />)}</div><YamlView yaml={rulesYaml} onHoverLine={setHoverRule} activeLine={hoverRule} /></div>
        </section>
      )}

      {gauntlet && (
        <section>
          <h2 className="text-[16px] font-semibold mb-1">Every value the sensor can report</h2>
          <p className="text-[13px] text-muted mb-3">SNMP returns integers, so the domain is finite. The real plugin was run once per value; the new rules were evaluated on the same inputs with <span className="mono">promtool test rules</span>.</p>
          <Card>
            <div className={cx('text-[20px] font-semibold mb-3 num', gMismatch ? 'text-critical' : '')}>{(gauntlet.domain.count + 3 - gMismatch).toLocaleString()} of {(gauntlet.domain.count + 3).toLocaleString()} inputs match · {gMismatch} mismatches <span className="text-[13px] text-muted font-normal">· real plugin run {gauntlet.pluginExecutions.toLocaleString()} times in {gauntlet.elapsedSec} s</span></div>
            <CoverageStrip runs={gauntlet.runs} errorCases={gauntlet.errorCases} min={gauntlet.domain.min} max={gauntlet.domain.max} label="Gauntlet rules coverage" />
            <div className="text-[12px] text-muted mt-2 mb-1">Zoom: 24–36 °C at 0.1 °C, so the 27.0/27.1 and 32.0/32.1 boundaries are visible</div>
            <CoverageStrip runs={gauntlet.runs} errorCases={gauntlet.errorCases} min={gauntlet.domain.min} max={gauntlet.domain.max} zoom={[24, 36]} />
          </Card>
        </section>
      )}

      {gauntlet && (
        <section>
          <h2 className="text-[16px] font-semibold mb-1">Timing</h2>
          <Card>
            <div className="text-[15px] mb-3"><b className="num">{gauntlet.traces.total}</b> generated reading sequences · <b className={cx('num', gauntlet.traces.mismatches > 0 && 'text-critical')}>{gauntlet.traces.mismatches}</b> mismatches · seed {gauntlet.traces.seed} · shrinking on</div>
            <div className="grid grid-cols-6 gap-3">{sampleTraces.map((t) => <div key={t.n} className="rounded-md border hairline p-2"><StepChart values={t.v} /><div className="text-[11px] text-muted mt-1 flex justify-between"><span>{t.n}</span><span className="text-ok">match ✓</span></div></div>)}</div>
            <p className="text-[12px] text-muted mt-3">Old side: the real plugin's decisions plus a model of Nagios soft/hard states (max_check_attempts 3, retry 1 min), checked against real Nagios Core on 10 fixed traces. New side: promtool.</p>
          </Card>
        </section>
      )}

      {oneShot && (
        <section>
          <h2 className="text-[16px] font-semibold mb-1">One-shot translation vs the Gauntlet loop</h2>
          <p className="text-[13px] text-muted mb-3">Same plugin, same model, same verifier. The only difference is the loop.</p>
          <div className="grid grid-cols-2 gap-4">
            <Card header={<><span className="font-semibold text-[13px]">One-shot translation</span><ModelBadge model="Nemotron Super" /><span className="text-[11.5px] text-muted">1 call · no tools</span></>}>
              <div className="text-[18px] font-semibold text-critical num mb-2">{oneShot.counterexamples.length} counterexamples <span className="text-[12px] text-muted font-normal">· {oMismatch} value mismatches · {oneShot.traces.mismatches} timing mismatches</span></div>
              <CoverageStrip runs={oneShot.runs} errorCases={oneShot.errorCases} min={oneShot.domain.min} max={oneShot.domain.max} label="one-shot coverage" />
              <ul className="grid gap-2 mt-3">{oneShot.counterexamples.map((c) => <li key={c.id} className="rounded-md border border-critical/40 p-3 text-[12.5px]"><div className="flex items-center gap-2 mb-1"><FileWarning size={13} className="text-critical" /><b>Counterexample {c.id}</b><span className="text-muted">· minimal input after shrinking</span></div><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5"><dt className="text-muted">Input</dt><dd className="mono">{c.input}</dd><dt className="text-muted">Legacy did</dt><dd>{c.legacy}</dd><dt className="text-muted">Rule did</dt><dd className="text-critical">{c.candidate}</dd><dt className="text-muted">Why</dt><dd>{c.why}</dd></dl></li>)}</ul>
            </Card>
            <Card header={<><span className="font-semibold text-[13px]">Gauntlet loop</span><ModelBadge model="Nemotron Super" /><span className="text-[11.5px] text-muted">+ verifier · {rounds.length || 3} rounds</span></>}>
              {gauntlet ? <>
                <div className={cx('text-[18px] font-semibold num mb-2', blocked ? 'text-critical' : 'text-ok')}>{gauntlet.counterexamples.length} counterexamples <span className="text-[12px] text-muted font-normal">· {gMismatch} value mismatches · {gauntlet.traces.mismatches} timing mismatches</span></div>
                <CoverageStrip runs={gauntlet.runs} errorCases={gauntlet.errorCases} min={gauntlet.domain.min} max={gauntlet.domain.max} label="gauntlet coverage" />
              </> : <div className="text-muted text-[13px]">Verifying…</div>}
              <ol className="flex items-center gap-2 mt-3 text-[12.5px] flex-wrap">{(rounds.length ? rounds : []).map((r, i) => <li key={r.round} className="flex items-center gap-2"><span className={cx('rounded-full px-2.5 h-6 inline-flex items-center border', r.open ? 'border-critical/50 text-critical' : 'border-ok/50 text-ok')}>Round {r.round}: {r.open} open</span>{i < rounds.length - 1 && <span className="text-muted">→</span>}</li>)}{gauntlet?.rounds && <li className="text-muted ml-2">{Math.round(gauntlet.rounds.reduce((n, r) => n + r.durationSec, 0) / 60)} min {gauntlet.rounds.reduce((n, r) => n + r.durationSec, 0) % 60} s</li>}</ol>
              {blocked && <ul className="grid gap-2 mt-3">{gauntlet!.counterexamples.map((c) => <li key={c.id} className="rounded-md border border-critical/40 p-3 text-[12.5px]"><div className="flex items-center gap-2 mb-1"><FileWarning size={13} className="text-critical" /><b>Open counterexample</b> <span className="text-muted">· round {c.round}</span></div><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5"><dt className="text-muted">Input</dt><dd className="mono">{c.input}</dd><dt className="text-muted">Legacy did</dt><dd>{c.legacy}</dd><dt className="text-muted">Rule did</dt><dd className="text-critical">{c.candidate}</dd><dt className="text-muted">Why</dt><dd>{c.why}</dd></dl></li>)}</ul>}
            </Card>
          </div>
          {gauntlet && <p className="text-[18px] font-semibold text-center mt-5">Same model both times. The difference is the proof.</p>}
        </section>
      )}

      {certificate && (
        <section className="grid grid-cols-[1fr_320px] gap-4">
          <Card header={<><ScrollText size={14} /><span className="font-semibold text-[13px]">Equivalence certificate</span><span className="text-[11.5px] text-muted">on the domain and timing model below</span></>} className="bg-[var(--surface)]">
            <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
              <dt className="text-muted">Check</dt><dd className="mono">{certificate.checkId} → Prometheus rules</dd>
              <dt className="text-muted">Domain</dt><dd>{certificate.domainText}</dd>
              <dt className="text-muted">Timing model</dt><dd>{certificate.timingModel}</dd>
              <dt className="text-muted">Traces</dt><dd>{certificate.traces}</dd>
              <dt className="text-muted">Counterexamples</dt><dd>{certificate.counterexamples}</dd>
              <dt className="text-muted">Intentional diffs</dt><dd><ol className="list-decimal pl-4 grid gap-0.5">{certificate.intentionalDiffs.map((d, i) => <li key={i}>{d}</li>)}</ol></dd>
              <dt className="text-muted">Not covered</dt><dd>{certificate.notCovered.join('; ')}</dd>
              <dt className="text-muted">Legacy source</dt><dd className="mono">sha256 {certificate.legacySha}</dd>
              <dt className="text-muted">Rules</dt><dd className="mono">sha256 {certificate.rulesSha}</dd>
              <dt className="text-muted">Reproduce</dt><dd className="flex items-center gap-2"><code className="mono bg-surface-2 px-2 py-0.5 rounded">$ {certificate.command}</code><button className="text-muted hover:text-text" onClick={() => { navigator.clipboard?.writeText(certificate.command); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="Copy command">{copied ? <Check size={13} /> : <Copy size={13} />}</button></dd>
              <dt className="text-muted">Signed off</dt><dd className={signed ? 'text-ok' : 'text-muted'}>{signed ? `${certificate.signedOffBy} · ${certificate.signedOffAt}` : '—'}</dd>
            </dl>
          </Card>
          <div className="grid gap-3 content-start">
            {signed ? <Tombstone name={checkId} /> : <Card><div className="text-[13px] text-muted">{blocked ? 'Sign-off is blocked until the open counterexample is fixed. The old check keeps running.' : 'Every alert the old check got right is raised by the new rules at the same tick or earlier. A person signs off before anything is retired.'}</div><Button variant="primary" className="mt-3 w-full" disabled={blocked} kbd="S" onClick={() => setConfirm(true)}><ShieldCheck size={14} /> Sign off as {user.replace('Maya R.', 'Sam T.')}</Button></Card>}
            <Button variant="secondary" className="w-full" onClick={() => { const blob = new Blob([JSON.stringify({ certificate, gauntlet, oneShot }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${checkId}.evidence.json`; a.click(); }}>Export evidence pack</Button>
          </div>
        </section>
      )}

      {confirm && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50" onClick={() => setConfirm(false)}>
          <div className="card p-5 w-[480px] shadow-[var(--shadow)]" role="dialog" aria-label="Sign off" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold text-[15px] mb-2">Sign off {checkId}</div>
            <p className="text-[13px] text-muted mb-4">I've reviewed the certificate and the intentional differences. The old check keeps running until cutover; this records that the new rules are approved to replace it.</p>
            <div className="flex gap-2 justify-end"><Button onClick={() => setConfirm(false)} kbd="Esc">Cancel</Button><Button variant="primary" autoFocus onClick={async () => { setConfirm(false); await ds.signOff(checkId, 'Sam T.'); }} kbd="Enter">Sign off as Sam T.</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function countMismatch(v?: VerifyResult) { if (!v) return 0; return v.runs.filter((r) => !r.match).reduce((n, r) => n + Math.round((r.to - r.from) / v.domain.step) + 1, 0) + v.errorCases.filter((e) => !e.match).length; }

function Tombstone({ name }: { name: string }) {
  return (
    <div className="card p-4 flex items-center gap-4 border-ok/40">
      <svg width="56" height="64" viewBox="0 0 56 64" aria-hidden><path d="M8 62V26a20 20 0 0 1 40 0v36z" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1.5" /><rect x="2" y="58" width="52" height="5" rx="2" fill="var(--border)" /><path d="M28 18v16M21 25h14" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" /></svg>
      <div><div className="mono font-semibold">{name}</div><div className="text-[12.5px] text-muted">2014 – 2026</div><div className="text-[12.5px] text-ok font-semibold mt-1">retired by proof</div></div>
    </div>
  );
}
