// Required first-run workflow: integrate the liquid-cooling retrofit for hall H1 row 3 before the operations dashboard opens.
import { ArrowRight, Check, Lock } from 'lucide-react';
import { Button, cx } from '../components/ui';
import { useModern } from '../modern/store';
import { STEPS, stepDone, useRetrofit } from './store';
import { DocsProvider } from './DocViewer';
import Connect from './steps/Connect';
import MapSite from './steps/MapSite';
import SelectCdu from './steps/SelectCdu';
import PlanInstall from './steps/PlanInstall';
import Mappings from './steps/Mappings';
import Commission from './steps/Commission';

const SCREENS = [Connect, MapSite, SelectCdu, PlanInstall, Mappings, Commission];

export default function Setup() {
  const { st, set } = useRetrofit();
  const busy = !!useModern().busy;
  const done = stepDone(st);
  const open = (i: number) => i === 0 || done.slice(0, i).every(Boolean);
  const Screen = SCREENS[st.step] ?? Connect;
  const last = st.step === STEPS.length - 1;
  return (
    <DocsProvider>
      <div className="max-w-[1320px] mx-auto">
        <nav className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-8" aria-label="Setup steps">{STEPS.map((s, i) => (
          <button key={s} disabled={!open(i)} onClick={() => set({ step: i })}
            className={cx('h-12 rounded-xl border px-3 flex items-center gap-2 text-left text-[13.5px] t min-w-0', st.step === i ? 'border-text bg-surface-2 font-semibold' : 'border-border hover:border-border-strong', !open(i) && 'opacity-50')}>
            <span className={cx('h-6 w-6 rounded-full grid place-items-center text-[12px] shrink-0', done[i] ? 'bg-ok/15 text-ok' : 'bg-surface-3')}>{done[i] ? <Check size={13} /> : open(i) ? i + 1 : <Lock size={11} />}</span>
            <span className="truncate">{s}</span>
          </button>))}
        </nav>
        <div key={st.step} className="enter"><div><Screen /></div></div>
        {!last && <div className="mt-8 pt-5 border-t hairline flex items-center gap-3">
          <span className="text-[13px] text-muted">{done[st.step] ? 'Step complete.' : 'Finish this step to continue.'}</span>
          <Button variant="primary" className="ml-auto" disabled={!done[st.step] || busy} onClick={() => { set({ step: st.step + 1 }); window.scrollTo({ top: 0 }); }}>
            Next: {STEPS[st.step + 1]} <ArrowRight size={15} />
          </Button>
        </div>}
      </div>
    </DocsProvider>
  );
}
