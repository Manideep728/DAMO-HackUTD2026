// Starts bar widths at 0 and flips to the real value just after mount, so `.seg-fill` animates them in.
import { useEffect, useState } from 'react';

export function useGrow(delay = 60) {
  const [g, setG] = useState(false);
  useEffect(() => { const t = setTimeout(() => setG(true), delay); return () => clearTimeout(t); }, [delay]);
  return g;
}

/** True when the viewer asked for less motion (SMIL animations are not covered by the CSS media query). */
export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
