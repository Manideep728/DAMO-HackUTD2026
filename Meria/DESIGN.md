# DESIGN.md: The Gauntlet (Meria)

Written with the method from [xiaopu-ai/web-design](https://github.com/xiaopu-ai/web-design): set the design rules first, then write the code. Tokens live in `frontend/src/index.css`, and every component reads its colours from those variables.

## 1. Visual theme and atmosphere

**Style:** Dark control room × editorial polish. **Scene:** App UI / dashboard, not a landing page.
**Keywords:** calm, precise, legible, trustworthy, quietly premium.
**Feel:** an instrument panel in a dim operations room. Depth comes from layered surfaces and soft light, never from decoration.
**Interaction tier:** L2. Staggered entrance on each route, a pointer spotlight on cards, an animated nav indicator and lifted primary buttons. No scroll-jacking and no WebGL: operators need the data, not a show.

## 2. Colour palette and roles

| Token | Dark | Light | Role |
|---|---|---|---|
| `--bg` | `#090C11` | `#F4F6F9` | App background, with two ambient glows and a 22 px dot grid |
| `--surface` / `-2` / `-3` | `#10151C` / `#171D26` / `#1E2631` | `#FFF` / `#F0F3F7` / `#E6EBF1` | Cards → nested → pressed |
| `--border` / `--border-strong` | `#232B36` / `#334050` | `#DCE2E9` / `#C3CCD7` | Hairlines / hover |
| `--text` / `--text-muted` / `--text-faint` | `#EDF1F6` / `#94A0B0` / `#5F6B7B` | `#121821` / `#556172` / `#8A95A4` | Three-level text hierarchy |
| `--accent` (+ `-2`, `-soft`, `-glow`) | `#4CC2FF` | `#0A6EBD` | **New guard**: primary actions, focus, the active nav item |
| `--legacy` | `#7D8794` | `#7D8794` | **Old guard** (Nagios), always grey |
| `--ok` `--watch` `--warning` `--critical` `--untrusted` | unchanged from the domain spec | | Status only, always with a word and an icon |

Rules: accent means the new guard and grey means the old guard; never swap them. Status colours never decorate. The ambient glow lives only on the page background, never inside data.

## 3. Typography

Google Fonts: `Inter 400–700` and `JetBrains Mono 400–600` (loaded in `index.html`, with system fallbacks).

| Role | Size / weight | Notes |
|---|---|---|
| Page title (`.page-title`) | 28 / 650, -0.022em | A subtle vertical text gradient; the check ID beside it stays mono and muted |
| Eyebrow (`.eyebrow`) | 11 / 600, +0.12em, uppercase | Accent colour, one per page at most |
| Section h2 | 16–18 / 600 | |
| Body | 14 / 400, line-height 1.5 | |
| Table header and stat label (`.th`) | 11 / 600, +0.06em, uppercase | `--text-faint` |
| Readings, IDs, code | JetBrains Mono, tabular-nums | |

## 4. Components

- **Button:** radius 8, height 40. *Primary* has an accent gradient, an inner highlight and a soft glow; on hover it lifts 1 px and the glow grows; when pressed it scales to 0.98. *Secondary* uses `surface-2` with a hairline that turns strong on hover. Disabled is 45% opacity with a not-allowed cursor. Focus is a 2 px accent ring.
- **Card:** `surface`, a 1 px hairline, radius 12, an inset top highlight. On hover the border turns strong and a 420 px accent spotlight follows the pointer (pointer devices only).
- **Top bar:** 60 px, translucent `--topbar` with a 12 px backdrop blur, the shield logo, the check chip and a live stage dot. Secondary items hide below `md`/`lg`.
- **Nav rail:** 76 px. The active item gets a soft accent tile behind its icon and a 3 px glowing bar on the left edge.
- **Stat tile:** a card with a `.th` label and a 26 px tabular number tinted by meaning.
- **Table:** an uppercase faint header on `surface-2`, a row-hover tint, and an accent inset bar on the current row.
- **Overlays:** the backdrop fades in with a 6 px blur, and the dialog pops in from 6 px below.

## 5. Layout

4 px grid. Page padding is 24 px, or 32 px at `lg` and up. Content width: Checks 1400, Read and Prove 1400, Find 1500, Handoff 900. Gaps of 12–24 px between cards.

## 6. Depth and elevation

Level 0 is the background. Level 1 is a card (inset highlight plus a 1–2 px shadow). Level 2 is an overlay or the Director panel (`--shadow`: 12/32 plus 2/6). Only overlays float.

## 7. Animation and interaction

- Route entrance: each screen's direct children rise 8 px and fade in over 450 ms, staggered 50 ms apart and capped at 250 ms.
- Card spotlight: CSS variables `--mx`/`--my` are set from a single rAF-throttled `pointermove` listener in `Shell`.
- Live stage dot: a 2.4 s expanding ring.
- `prefers-reduced-motion: reduce` turns off every transition and animation.

## 8. Do's and don'ts

Do:
1. Take every colour from a token, with zero hard-coded hex in components.
2. Pair every status colour with a word and an icon.
3. Use tabular numbers wherever values change.
4. Keep keyboard focus visible on every interactive element.

Don't:
1. Don't use gradients or glow on data marks (charts, floor map, coverage strip).
2. Don't put `filter: blur()` on anything that moves, or a backdrop blur above 14 px.
3. Don't use the accent for legacy or Nagios output.
4. Don't use emoji, neon, or more than one eyebrow per page.
5. Don't add scroll-jacking, a custom cursor or WebGL: this is an operator tool.
6. Don't let an animation delay content by more than 300 ms.

## 9. Responsive behaviour

Desktop-first (operators use 1440+ screens and projectors). Below `md` the top bar keeps only the logo, the mode badge and the controls. Stat tiles go from 6 columns to 3 to 2. Tables scroll horizontally inside their card. The page itself never scrolls sideways at 390 px.
