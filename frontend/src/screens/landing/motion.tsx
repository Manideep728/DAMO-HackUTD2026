import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../components/ui';

function prefersReduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

/** Plays its children's `lp-*` animations once, the first time it scrolls into view. */
export function Stage({ children, className, eager = false, id }: { children: ReactNode; className?: string; eager?: boolean; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(() => eager || typeof IntersectionObserver === 'undefined' || prefersReduced());
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return <div ref={ref} id={id} className={cx('lp-stage', seen && 'lp-play', className)}>{children}</div>;
}
