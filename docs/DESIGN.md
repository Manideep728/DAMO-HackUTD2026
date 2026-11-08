# DESIGN.md: The Gauntlet (Meria)

Written with the method from [xiaopu-ai/web-design](https://github.com/xiaopu-ai/web-design): set the design rules first, then write the code. Tokens live in `frontend/src/index.css`, and every component reads its colours from those variables.

## 1. Visual theme

**Style:** a precision instrument. Neutral graphite, crisp type, generous space, nothing decorative.
**Feel:** a well-made tool you trust at 3 AM: calm, legible, quietly confident.
**Interaction tier:** L1. A short fade on each route, plus hover, focus and press states. No glows, gradients, blur, spotlights or WebGL.

## 2. Colour

| Token | Dark | Light | Role |
|---|---|---|---|
| `--bg` | `#09090B` | `#FAFAFA` | App background (flat) |
| `--surface` / `-2` / `-3` | `#111114` / `#18181C` / `#222228` | `#FFF` / `#F4F4F5` / `#E9E9EC` | Card → nested → pressed |
| `--border` / `-strong` | `#25252B` / `#36363F` | `#E4E4E7` / `#D0D0D6` | Hairlines / hover |
| `--text` / `-muted` / `-faint` | `#F4F4F5` / `#A1A1AA` / `#6B6B74` | `#09090B` / `#5B5B66` / `#8E8E99` | Three-level text hierarchy |
| `--inverse` / `-ink` | text colour / bg colour | | Primary buttons and the logo tile |
| `--accent` | `#4DA3FF` | `#0B6BDE` | **New guard**: new rules, focus ring, model badges, the selected finding |
| `--legacy` | `#7D8794` | `#7D8794` | **Old guard** (Nagios), always grey |
| `--ok` `--watch` `--warning` `--critical` `--untrusted` | domain spec | | Status only, always with a word and an icon |

The primary action is monochrome (`--inverse`), so the accent stays meaningful: blue always means "the new guard".

## 3. Typography

Google Fonts: **Geist** 400–700 for the UI and **Geist Mono** 400–600 for code, IDs and readings, with system fallbacks.

| Role | Spec |
|---|---|
| Page title `.page-title` | 30 / 600, -0.03em |
| Kicker `.kicker` | 13 / 500, muted ("Step 2 of 3") |
| Section title `.section-title` | 17 / 600, -0.015em |
| Body | 14 / 400, line-height 1.55; subtitles 14.5 |
| Table header `.th` | 12 / 500, muted, sentence case |
| Severity `.sev` | 11 / 600, uppercase (the only uppercase) |

## 4. Components

- **Top bar:** 60 px on `surface`. Logo tile, then the workflow tabs: Overview │ ① Read ② Find ③ Prove │ Handoff. Each step shows its number, or a green check once done. The active tab gets a 2 px underline. On the right: the mode badge, theme, help, and the user's initials.
- **PageHeader:** kicker, title, a meta row (check chip, mode and model badges, counts), subtitle, and actions on the right. Used on every screen.
- **SectionHeader:** a title, a one-line subtitle and an optional right slot.
- **Button:** height 36, radius 8, weight 500. *Primary* is `inverse` fill; *secondary* is `surface` with a hairline; press scales to 0.98.
- **Card:** `surface`, a 1 px hairline, radius 14, header 48 px, padding 20.
- **Empty state:** a centred card with an icon tile, title, one paragraph and the primary action, so the next step is always one click away.
- **Overview steps:** three joined panels (1 px gaps on a border background) with an icon, number, title, description and "Decided by".
- **Finding card:** selected = accent border plus a 1 px accent ring.

## 5. Layout

4 px grid. Page padding is 40 px top, 96 px bottom, and 20–32 px on the sides. Every screen is centred: 1320 px max (Handoff 900). Find is two columns (findings | sticky map and evidence); Read is two columns (source | sticky rule card).

## 6. Elevation

Flat in dark mode; a 1 px shadow on cards in light mode. Only overlays and the Director panel float (`--shadow`).

## 7. Motion

Route entrance: direct children rise 4 px and fade in, 40 ms apart, capped at 160 ms. Dialogs pop in from 6 px below. `prefers-reduced-motion` turns everything off.

## 8. Do's and don'ts

Do: take every colour from a token · pair status colour with a word and an icon · use tabular numbers · keep focus visible · give every empty state its action.

Don't:
1. Don't use gradients, glows, gradient text, blur or decorative backgrounds.
2. Don't use the accent for primary buttons or for legacy output.
3. Don't use uppercase labels, apart from severity words.
4. Don't add stat-tile rows or other template filler.
5. Don't use emoji, a custom cursor or scroll-jacking.
6. Don't let animation delay content by more than 200 ms.

## 9. Responsive

Desktop-first. Below `sm` the brand name and initials hide, and the workflow tabs scroll sideways. PageHeader actions wrap under the title, the Overview steps stack, the two-column screens stack, and tables scroll inside their card. The page never scrolls sideways at 390 px.
