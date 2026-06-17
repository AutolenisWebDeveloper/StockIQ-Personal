# StockIQ Personal — Frontend Design Direction

**Companion to:** `StockIQ-Personal-Build-Spec.md` §8 (Frontend) and the `stockiq-dev` skill. This is the design brief the Phase 4 build derives every color and type decision from. Produced by applying the `frontend-design` skill to the spec.

---

## 0. Brief lock

- **Subject:** a private, single-operator **equity-research decision terminal** whose hero is the per-ticker Decision Report.
- **Audience:** one expert (senior finance/operator). No onboarding, no marketing, no hand-holding. He reads fast and acts on money.
- **The page's single job (Stock Detail):** deliver the buy / hold / sell / wait / reduce call with **every number's provenance legible at a glance.**
- **The one risk, justified:** go **calm and light** in a category that defaults to dark, aggressive "trader" UIs. This is an **EOD deep-reading research tool**, not a live scalping tape — long sessions reading filings and reports reward a high-legibility, low-noise surface. A dark "after-hours" theme is provided as a derived token set, not the hero.

## 1. Anti-default check (what this is deliberately *not*)

AI design clusters around three looks; the financial category drags hard toward two of them. Explicitly avoided:
- **Not** dark-canvas + single acid-green glow accent (the generic fintech terminal).
- **Not** cream + high-contrast serif + terracotta (wrong register — editorial, not instrument).
- **Broadsheet density is used only where earned** — the ranked watchlist genuinely *is* a ledger — and differentiated from newspaper-default by the provenance system and confined color.

---

## 2. Token system

### Color — discipline is the point
Color is reserved for **two semantic axes only**: market **direction** and the **system/you**. Everything else is ink on paper. Confidence is encoded as *material* (line treatment), never as a fourth hue — this is what keeps a data-dense screen calm and makes the meaningful colors mean something.

| Token | Hex | Role |
|---|---|---|
| `paper` | `#F5F6F7` | App background (cool measured paper, not cream) |
| `surface` | `#FFFFFF` | Cards, tables, readout header |
| `ink` | `#16191D` | Primary text + numbers |
| `slate` | `#5B636C` | Labels, captions, provenance text, neutral/flat direction |
| `rule` | `#E2E5E8` | Hairlines, dividers, table grid |
| `up` | `#0E7C66` | Bullish / positive only (verdigris — instrument green, not neon) |
| `down` | `#B23A2E` | Bearish / negative only (controlled oxide, not alarm-red) |
| `accent` | `#1B43C8` | System: focus rings, links, active nav, the decision-call chrome (cobalt) |

Green/red are for **the market**; cobalt is for **the system and you**; nothing else gets a hue. If a screen looks colorful, it's wrong.

### Type — a deliberate non-default trio
| Role | Face | Use |
|---|---|---|
| Display | **Space Grotesk** (500 / 700) | The verdict, section heads, tracked-uppercase eyebrows. Technical character, used with restraint. |
| Body / UI | **IBM Plex Sans** (400 / 500 / 600) | Prose, controls, narrative report sections. Quiet workhorse. |
| Data / Mono | **IBM Plex Mono** (400 / 500) | **All** tickers, numbers, prices, provenance captions. Tabular figures by default — columns align, scanning is fast. |

Rule: **every quantitative value renders in Plex Mono with tabular figures.** Numbers are the product; they get the engineered face. (Plex Sans + Plex Mono share a superfamily, so the data/body relationship is cohesive; Space Grotesk supplies the personality on top.) Inter is deliberately avoided as the personality face — it is the default everyone reaches for.

**Scale (dense):** provenance/caption 11 · eyebrow 11 (uppercase, +0.08em) · body 13 · data cell 13 · subhead 16 · section head 20 (Space Grotesk) · big metric 28 (mono) · **verdict readout 44 (Space Grotesk 700)**.

### Layout concept
**Instrument panel, decision-first.** Stock Detail opens with a sticky **readout header** (the Decision Dashboard *is* the hero, per spec "lead with the dashboard"). Below it, the report is a single calm reading column (~880px) with a sticky left **section index**. The watchlist Dashboard is a full-bleed **ranked ledger**. App shell = narrow left nav rail with a cobalt active marker.

### Signature
**Confidence-as-material + the Decision Verdict readout.** Two intertwined moves that are born from the Truth & Data Rules and cannot be pasted onto a generic dashboard:
1. Every number's trustworthiness is legible from its **baseline treatment** (below).
2. The hero **dual-rating verdict** shows short-term and long-term calls that *can disagree*, with confidence as a /10 instrument gauge.

---

## 3. The Confidence & Provenance System (the signature — spec it precisely)

Per spec §7.5 every number carries Source · Date · Confidence. The UI encodes confidence in the **underline material** of the value, plus a mono micro-caption — no extra color.

```
High        187.40      solid 1px underline (ink)        EDGAR · 05-12 · High
Medium      $214 PT     dashed underline (slate)         yfinance · 06-16 · Med
Low         IV 38%      dotted underline (slate)         yfinance · 06-16 · Low
Unavailable [UNAVAILABLE] hatched empty slot, slate text — never a number
```

- **Verified fact / estimate / guidance / assumption / personal analysis** get distinct quiet glyphs in the eyebrow (✓ fact · ◇ estimate · ⌂ guidance · ⚙ assumption · ✎ analysis) — structural, monochrome, true to content.
- **`UNAVAILABLE`** renders the spec's exact string `UNAVAILABLE — not verified from accessible sources.` in slate inside a faint hatched slot. It is shown, never hidden — honesty is the brand.
- Hover/focus on any value reveals the full provenance line. The micro-caption is always present on hero numbers; on dense tables it lives in the tooltip + a column-level confidence key.

This system *is* the brand. Spend the boldness here; keep everything else disciplined.

---

## 4. Key surfaces (ASCII wireframes)

### Dashboard — ranked ledger
```
┌ STOCKIQ ───────────────────────────────────────────── as of 06-16 22:04 ET ┐
│ rail │  WATCHLIST · 142 names · ranked by conviction          SPY ▲ QQQ ▲ DIA ▼ │
│      │ ─────────────────────────────────────────────────────────────────────── │
│ ▣ Dash│ TICKER  CONV  BAND        ST   LT   FAIR VAL    Δ EST   EARN   FLAGS     │
│ ◫ Scrn│ NVDA   ▟ 86  VeryBull    Buy  Buy   312 ─med   ▲up     7d!    —         │
│ ◰ Oppt│ MSFT   ▙ 71  Bullish     Hold Buy   441 ─med   ▲up     —      —         │
│ ◱ Port│ INTC   ▖ 38  Bearish     Wait Redu  29  ─med   ▼down   —      debt,marg │
│ ◳ Jrnl│ ...                                                                      │
│ ◴ Thes│ ─────────────────────────────────────────────────────────────────────── │
│ ◷ Alrt│ RECENT CHANGES                          WHAT CHANGED TODAY (AI)          │
│ ⚙ Set │ • TSLA insider cluster buy  06-15       3 filings · 2 band moves · 1 …   │
└──────┴───────────────────────────────────────────────────────────────────────┘
```
Density is earned (it's a ranked ledger). Color appears only on direction (▲/▼) and band; confidence rides the underline on FAIR VAL. "as of" timestamp top-right, always.

### Stock Detail — Decision Report hero
```
┌ NVDA  NVIDIA Corp ──────────────────────────────────── as of 06-16 22:04 ET ┐
│  187.40  ─high          SHORT-TERM        LONG-TERM        CONFIDENCE         │
│  ▲ +1.2% EDGAR·EOD      ┌─────────┐       ┌─────────┐      ┌───────────┐      │
│                         │  WAIT   │       │  BUY    │      │  7 / 10   ◔ │     │
│  BEST ACTION TODAY      │ pullbk  │       │  core   │      └───────────┘      │
│  → Wait for pullback;   └─────────┘       └─────────┘    earnings risk: HIGH  │
│    start a half core position after earnings (7d).                            │
│ ───────────────────────────────────────────────────────────────────────────  │
│ [Decision Report] Overview  Fundamentals  Earnings  Analysts  Ownership  …    │
│ ┌ index ┐  ┌──────────────────────────────────────────────────────────────┐  │
│ │ Dash  │  │ DECISION DASHBOARD                                            │  │
│ │ Bottom│  │ Fair value 312 ─med   Bull 360 / Base 312 / Bear 240 ─med     │  │
│ │ Short │  │ Exp move 1w ±6% ┄low  1m ±11% ┄low   12-mo +18% ─med          │  │
│ │ Long  │  │ Options signal: UNAVAILABLE ▦   Institutions: ▲ accum (45d lag)│  │
│ │ Earn  │  └──────────────────────────────────────────────────────────────┘  │
│ │ ...   │  ▌Bottom line — plain English, 2–3 reasons …                        │
│ └───────┘                                                                      │
└───────────────────────────────────────────────────────────────────────────────┘
```
The dual-rating verdict (which can disagree) + the /10 gauge is the memorable block. Every number wears its underline; `UNAVAILABLE` shows as a hatched slot, not a blank.

---

## 5. Motion — restraint, meaning-only

EOD tool: near-zero ambient motion (extra motion reads AI-generated). Animate **only state changes that carry meaning**:
- A thesis assumption flipping `holding → at_risk/broken` pulses the row border `oxide` once.
- A conviction band crossing animates the /10 gauge needle to its new position.
- No count-ups, no parallax, no decorative reveals. `prefers-reduced-motion` fully respected.

---

## 6. Interface copy rules (from the skill's writing guidance)

- **Name controls by the action they take.** The verdict reads `Wait for pullback`, not `Recommendation: Neutral`. The button that sets a stop says `Set stop $172`.
- **Confidence reads as an instrument:** `Confidence 7 / 10`, `earnings risk: HIGH`.
- **Empty states are invitations:** an empty watchlist says `Add a ticker to begin tracking.` — not "No data."
- **`UNAVAILABLE` is canonical**, never softened: `UNAVAILABLE — not verified from accessible sources.`
- **Timestamps are everywhere**, mono + slate: `as of 06-16 22:04 ET`. Lag is stated inline: `Institutions ▲ accum (45-day lag)`.
- Active voice, sentence case, no filler. A label labels; a number is sourced; nothing does double duty.

---

## 7. Tailwind mapping (build-ready)

```ts
// tailwind.config.ts — theme.extend
colors: {
  paper:'#F5F6F7', surface:'#FFFFFF', ink:'#16191D', slate:'#5B636C',
  rule:'#E2E5E8', up:'#0E7C66', down:'#B23A2E', accent:'#1B43C8',
},
fontFamily: {
  display:['"Space Grotesk"','sans-serif'],
  sans:['"IBM Plex Sans"','sans-serif'],
  mono:['"IBM Plex Mono"','ui-monospace','monospace'],
},
fontSize: { prov:['11px',{lineHeight:'14px'}], eyebrow:['11px',{letterSpacing:'0.08em'}],
  data:['13px','18px'], verdict:['44px','46px'], metric:['28px','30px'] },
```
```css
/* provenance underline system — confidence as material */
.prov-high { border-bottom:1px solid theme(colors.ink); }
.prov-med  { border-bottom:1px dashed theme(colors.slate); }
.prov-low  { border-bottom:1px dotted theme(colors.slate); }
.prov-na   { color:theme(colors.slate); background:repeating-linear-gradient(45deg,#0000 0 5px,#E2E5E8 5px 6px); }
/* every numeric value */
.num { font-family:theme(fontFamily.mono); font-variant-numeric:tabular-nums; }
```

## 8. Dark "after-hours" theme (derived tokens)
Same system, inverted surface — offered for the operator who wants it; not the default.
`paper #0E1014 · surface #16191D · ink #E7EAED · slate #8A929B · rule #262B31` · `up`/`down`/`accent` unchanged (they already read on dark). Provenance underlines use `slate`; hatch uses `#262B31`.

## 9. Quality floor (non-negotiable, unannounced)
Responsive to mobile (the ledger collapses to stacked cards, provenance moves into a tap-reveal); visible cobalt keyboard focus on every control; `prefers-reduced-motion` honored; numbers never clip — tabular alignment preserved at every breakpoint.
