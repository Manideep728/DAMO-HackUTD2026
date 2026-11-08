import { useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Smoothly follow a changing number (critically damped), so readings glide instead of jumping. */
export function useTween(target: number, ms = 450) {
  const [v, setV] = useState(target);
  const from = useRef(target), start = useRef(0), raf = useRef(0);
  useEffect(() => {
    if (reduced()) { setV(target); return; }
    from.current = v; start.current = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (t: number) => {
      const k = Math.min(1, (t - start.current) / ms), e = 1 - Math.pow(1 - k, 3);
      setV(from.current + (target - from.current) * e);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);
  return v;
}

export function Num({ value, digits = 0, ms }: { value: number; digits?: number; ms?: number }) {
  const v = useTween(value, ms);
  return <>{v.toFixed(digits)}</>;
}

/** HH:MM with a blinking colon. */
export function Clock({ text }: { text: string }) {
  const [h, mm] = text.split(':');
  return <>{h}<span className="clock-colon">:</span>{mm}</>;
}
