import type { CSSProperties } from 'react';

// Landing-only motion. index.css is shared, so these keyframes live here, scoped by the `lp-` prefix.
// Every animated element's resting style is its END state, so with reduced motion (index.css kills
// all animations) or before JS runs, the graphic still reads correctly. The pre-play hiding rules only
// apply when motion is allowed.
export const landingCss = `
@keyframes lpDraw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes lpFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes lpRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes lpPop { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: none; } }
@keyframes lpGrowX { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes lpDimHard { from { opacity: 1; } to { opacity: .2; } }
@keyframes lpDimSoft { from { opacity: 1; } to { opacity: .5; } }
@keyframes lpBlip { 0% { opacity: 0; } 15% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
.lp-dim-hard { opacity: .2; }
.lp-dim-soft { opacity: .5; }
.lp-blip { opacity: 0; }
.lp-strike { transform-origin: left center; }
@media (prefers-reduced-motion: no-preference) {
  .lp-draw { stroke-dasharray: 1 1; }
  .lp-stage:not(.lp-play) .lp-draw { stroke-dashoffset: 1; }
  .lp-stage:not(.lp-play) :is(.lp-fade, .lp-rise, .lp-pop) { opacity: 0; }
  .lp-stage:not(.lp-play) .lp-grow { transform: scaleX(0); }
  .lp-stage:not(.lp-play) .lp-strike { transform: scaleX(0); }
  .lp-play .lp-draw { animation: lpDraw var(--d, .7s) cubic-bezier(.4,0,.2,1) var(--t, 0s) both; }
  .lp-play .lp-fade { animation: lpFade .35s ease var(--t, 0s) both; }
  .lp-play .lp-rise { animation: lpRise .5s cubic-bezier(.2,.7,.2,1) var(--t, 0s) both; }
  .lp-play .lp-pop { animation: lpPop .32s cubic-bezier(.2,.8,.2,1.2) var(--t, 0s) both; transform-box: fill-box; transform-origin: center; }
  .lp-play .lp-grow { animation: lpGrowX .5s cubic-bezier(.4,0,.2,1) var(--t, 0s) both; }
  .lp-play .lp-strike { animation: lpGrowX .3s ease var(--t, 0s) both; }
  .lp-play .lp-dim-hard { animation: lpDimHard .45s ease var(--t, 0s) both; }
  .lp-play .lp-dim-soft { animation: lpDimSoft .45s ease var(--t, 0s) both; }
  .lp-play .lp-blip { animation: lpBlip var(--d, 1.3s) ease var(--t, 0s) both; }
}
`;

/** Stagger helper: `style={at(300)}` sets the animation delay (and optional duration) in ms. */
export function at(ms: number, dur?: number): CSSProperties {
  return { '--t': `${ms}ms`, ...(dur ? { '--d': `${dur}ms` } : {}) } as CSSProperties;
}
