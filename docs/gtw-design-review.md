# GLOBAL THERMONUCLEAR WAR: visual and layout review

The polar scope is the right centerpiece. The most useful changes are to make its labels readable, give commands a dependable place, and distinguish planning, live crisis, and the aftermath of an exchange. Keep the blue/red force coding, amber alerts, square controls, and the project's VT220 font. Use the hero's near-black surfaces and restrained phosphor light as the visual reference.

This is an implementation handoff for Claude. The CSS and JSX below are recommended changes to `src/app/game/gtw/GlobalThermonuclearWar.tsx` and `src/app/game/gtw/gtw.css`, not applied changes. Keep the engine, projection, coordinates, action handlers, timing, and confirmation rules. All new state described here is presentation state. No additional art assets are proposed: thin SVG lines and CSS borders will improve this screen more than a bitmap bezel or another texture.

Reviewed: all six supplied screenshots, the full component and GTW stylesheet, `src/app/game/game.css`, and `public/art/hero-desktop.jpg`. Also checked the existing board coordinate system and site IDs to make the annotation recommendations specific.

| Screenshot | Visible finding | Recommendations |
| --- | --- | --- |
| [Desktop strategy](desktop-1-strategy.png) | The scope has roughly 184 px of unused space on each side. Northeast labels merge, and NEWS is below the visible panel. | P1.2, P2.1, P2.2 |
| [Desktop exchange](desktop-2-exchange.png) | Tracks cross crowded labels. The incoming rows give target, ETA, and verification similar emphasis. CRISIS is amber despite its red class. | P1.2, P2.2, P2.4 |
| [Desktop late exchange](desktop-3-exchange-late.png) | Strategy has resumed at DEFCON 1. Residual yellow disks and a red log carry almost all the evidence of the exchange. | P2.5 |
| [Phone strategy](phone-1-strategy.png) | The panel heading disappears, END QUARTER is cut off, and map type is microscopic. | P1.1, P1.2, P1.3 |
| [Phone exchange](phone-2-exchange.png) | The map dominates the upper screen; action buttons are about 19 px tall and RESPONSE is below the panel's visible area. | P1.1, P2.2 |
| [Phone late exchange](phone-3-exchange-late.png) | The same constrained panel returns after the exchange, with no prominent aftermath summary. | P1.1, P2.5 |

These are separate captured runs. The desktop's five detonations and phone's six are not a visual defect to reconcile.

## P1.1: Fix the phone's scrolling and control sizes first

**Cause:** `.gtw-main` retains `flex: 1; min-height: 0` inside a viewport-height flex layout on phones. Its two grid rows compete for the height left after the header and log. The panel then scrolls inside that small remainder, and its children can shrink. A full-page capture of the outer viewport does not expose all of this inner scroller.

**Change:** use a bounded three-row desktop layout, but one natural document flow inside the existing `.gtw` scroll surface at widths of 900 px and below. Move the layout breakpoint from 760 px to 900 px so a narrow tablet does not keep a nearly full desktop command column. Replace the current layout declarations with:

```css
.gtw {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) 120px;
  gap: 8px;
  padding: max(12px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right))
    max(12px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
  overflow: hidden;
}
.gtw-main {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 12px;
}
.gtw-board { min-width: 0; min-height: 0; }
.gtw-panel { min-width: 0; min-height: 0; }
.gtw-log {
  min-height: 0;
  overflow: auto;
  padding-top: 8px;
}
.gtw-log > * { flex: 0 0 auto; }
.gtw-modal {
  position: fixed;
  inset: 0;
  z-index: 10;
  overflow-y: auto;
}
.gtw-modal > div { max-height: calc(100dvh - 32px); overflow-y: auto; }

@media (max-width: 1100px) and (min-width: 901px) {
  .gtw-main { grid-template-columns: minmax(0, 1fr) 292px; }
}
@media (max-width: 900px) {
  .gtw {
    display: block;
    overflow-x: hidden;
    overflow-y: auto;
    padding-inline: max(12px, env(safe-area-inset-left))
      max(12px, env(safe-area-inset-right));
    scroll-padding-top: calc(var(--gtw-header-height, 160px)
      + env(safe-area-inset-top, 0px) + 8px);
  }
  .gtw-main {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: auto;
    margin-top: 8px;
  }
  .gtw-board {
    flex: none;
    width: 100%;
    height: auto;
    aspect-ratio: 1;
  }
  .gtw[data-phase="crisis"] .gtw-board {
    height: min(calc(100vw - 24px), 34dvh);
    aspect-ratio: auto;
  }
  .gtw-panel {
    flex: none;
    min-height: auto;
    overflow: visible;
  }
  .gtw-panel > * { flex-shrink: 0; }
  .gtw-panel-body { overflow: visible; }
  .gtw-log { margin-top: 10px; overflow: visible; }
  .gtw button, .gtw summary { min-height: 44px; }
  .gtw-row-btns .gtw-btn { min-height: 44px; padding: 8px; }
}
```

Add `data-phase={s.phase}` to the root `.gtw`. The existing absolute positioning and inset still fill `.wg`; `.gtw` itself becomes the phone scroll surface. Do not add a body scroller under the fixed `.wg`. The modal's fixed positioning keeps the existing confirmation and loss dialogs visible even when a phone user opens them from far down the page.

Move the existing crisis `.gtw-speed` group into the header as specified in P2.3. It stays accessible while the page scrolls. At 390 x 844, the crisis scope will be about 287 px in diameter, with some horizontal breathing room inside its frame. Strategy retains a full-width square scope. The first two incoming rows should fit near the initial view; the other rows, response controls, and log are reached by ordinary vertical scrolling. Do not try to fit the map and all four 44 px action rows into a fixed 844 px canvas.

The strategy END QUARTER button belongs in a separate panel footer after the purchases, not inside a shrinking list. Keep it in normal flow on phones. For landscape screens at 900 px or less, and for enlarged text, the same single scroller must remain usable. Measure the sticky header with a `ResizeObserver` and set `--gtw-header-height` to its actual height so keyboard-focused controls can scroll below it.

## P1.2: Separate map symbols from labels and resolve the two dense clusters

**Cause:** every visible label uses `<text x={1.8} y={0.7}>` inside the site's translated group. That guarantees collisions where sites are close. At `BOARD = 200`, a roughly 726 px desktop scope makes the current 2.6-unit type about 9.4 CSS px. The phone's 3.2-unit override becomes only about 5.7 CSS px on its 356 px scope. Increasing that SVG font size alone makes the collisions worse.

**Change in `BigBoard`:** keep every marker at its projected location. Remove the inline site `<text>` block and render labels in a separate HTML annotation layer over the existing SVG. Use a second, pixel-coordinate SVG for leader lines. Label placement must use the rendered scope diameter, not the rectangular board's full width.

Observe an absolutely inset, borderless `.gtw-board-surface` inside `.gtw-board`; put the existing map SVG and annotation layers in that surface. Add `className="gtw-map-svg"` to the existing map SVG and replace the broad `.gtw-board svg` sizing selector with `.gtw-map-svg`, so it does not enlarge legend icons. For its measured inner width `W` and height `H`, calculate:

```tsx
const diameter = Math.min(W, H)
const scale = diameter / BOARD
const ox = (W - diameter) / 2
const oy = (H - diameter) / 2
const screenPoint = (x: Site) => {
  const p = project(x.lon, x.lat)
  return { x: ox + p.x * scale, y: oy + p.y * scale }
}
```

Render a laid-out label as follows. `left`, `top`, and `leaderPoints` come from the placement rules below; the text is measured in CSS pixels. Keep annotation layers `aria-hidden`, since accessible site controls carry the full names.

```tsx
<svg className="gtw-label-leaders" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
  {labels.map((l) => (
    <polyline key={l.id} points={l.leaderPoints} className={l.sideClass} />
  ))}
</svg>
<div className="gtw-label-layer" aria-hidden="true">
  {labels.map((l) => (
    <span key={l.id} className={`gtw-site-label ${l.sideClass}`}
      style={{ left: l.left, top: l.top }}>
      {l.text}
    </span>
  ))}
</div>
```

```css
.gtw-board-surface { position: absolute; inset: 0; }
.gtw-map-svg { display: block; width: 100%; height: 100%; }
.gtw-label-leaders, .gtw-label-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.gtw-site-label {
  position: absolute;
  padding: 1px 3px;
  font: inherit;
  font-size: 12px;
  line-height: 14px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: var(--gtw-mine);
  background: #020611;
  text-shadow: none;
}
.gtw-site-label.theirs { color: var(--gtw-them); }
.gtw-label-leaders polyline {
  fill: none;
  stroke: var(--gtw-mine);
  stroke-width: 1;
  opacity: 0.65;
}
.gtw-label-leaders .theirs { stroke: var(--gtw-them); }
```

Use these **specific desktop placement seeds**. Positions refer to the existing 200 x 200 projection. Convert them with `ox + x * scale`, `oy + y * scale`; the row gaps below are screen pixels. A seed is the upper-left of a label, except the explicitly right-aligned Barents label.

| Sites | Label seed and order | Purpose |
| --- | --- | --- |
| `us-bos`, `us-nyc`, `us-phl`, `us-was` | One Atlantic column starting at `(82, 145)`, 20 CSS px between rows, in this order. | Separate BOSTON, NEW YORK, PHILADELPHIA, WASHINGTON without moving city dots. Boston appears in this cluster even though the current population cutoff omits it. |
| `su-tat`, `su-mos`, `su-koz`, `su-len` | One column starting at `(158, 92)`, 20 CSS px between rows, in this order. | Separate TATISHCHEVO, MOSCOW, KOZELSK, LENINGRAD while preserving their geographic anchors. |
| `su-ssbn1` | Right edge at `(121, 94)`, with its label extending left. | Pull SSBN BARENTS SEA out of the Moscow/launcher labels. |

Draw a 1 px leader from each symbol to a short elbow, then to the nearest edge of its label. Route each cluster's leaders in the same vertical order as its labels. Keep a 4 px gap between the line ending and text. These anchors are starting positions for the following deterministic placement pass, not permission to overlap another label.

Implement these rules in a view-only `layoutSiteLabels` helper in the component file:

1. Measure text using the already loaded VT220 font after `document.fonts.ready`. Reserve the measured width plus 6 px padding and a 16 px height. Also reserve 8 x 8 px rectangles around map symbols and the rail rectangles from P2.1.
2. Place the selected launcher, keyboard-focused/hovered site, and selected track's target first. Then place the two cluster columns, other live silos/subs, remaining capitals, and remaining large cities. Dead-site labels are last. Tie-break with `site.id`, not array insertion order.
3. For non-cluster labels, try these offsets from the marker, in order: right `(8, -8)`, left `(-width - 8, -8)`, above `(-width / 2, -24)`, below `(-width / 2, 8)`. If necessary try the same candidates shifted vertically by -20, +20, -40, +40 px. Allow text in the board's unused margins when the rails are absent. Keep all rectangles 8 px inside the board and 4 px apart.
4. A collision moves or suppresses the lower-priority label, never its symbol. Keep selected/focused information in the inspector if no label position fits. Do not push labels outside the frame or reduce their font size to force a fit.
5. At scope diameters below 480 px, show only the selected launcher and focused/selected target labels, at most two. At 480 to 599 px, prioritize capitals, launchers, and selection. Enable the full cluster columns at 600 px and above, including the shorter desktop scope when crisis controls are present. All site names remain available through the site index below.
6. Keep placement stable during a crisis. Recompute on size, font readiness, selection/focus, built/alive state, or label text changes. Do not repack for every moving missile head. Do not memoize on `[s]` alone: the engine mutates that same object.

Keep missile counts out of idle map labels. Show them in the selected launcher's label and the force/selection readouts. This removes long strings such as `MALMSTROM AFB 10` from the general map while retaining ammunition where it is actionable.

**Touch and keyboard fallback:** add a native `<details className="gtw-site-index">` with a 44 px `SITES` summary in the panel body. Inside, group real buttons under `YOUR LAUNCHERS`, `ENEMY TARGETS`, and `OTHER SITES`. Use the existing `canSelect`/`canTarget` eligibility and call the existing `clickSite(x)` for the first two groups. Include all built cities for inspection, including the currently unlabeled ones. For inspection-only entries, update a new `inspectedSiteId` presentation state without firing. Put the selected site's full name, side, kind, and existing population/ammunition value in the inspector. An enemy target button must say `FIRE AT {x.name}` when a launcher is selected, so its existing crisis action is explicit.

Keep map hit regions modest rather than creating overlapping 44 px circles over the Northeast. Set the visible map hit radius to `Math.max(2.6, 8 / scale)` projection units; the 44 px site-list buttons provide the reliable alternative. No hover-only label is required to play.

## P1.3: Give text a readable core and stop dimming essential information

**Cause:** text is small throughout; buy notes have opacity 0.55, instructions 0.6, and disabled buttons multiply the problem by setting opacity on the entire control. Glow spreads already thin glyphs. The illuminated coastline can compete with the site names.

**Change:** replace the corresponding declarations, keeping the inherited project font stack. The red and amber below match the existing terminal theme's defaults. Ownership remains relative to `s.player` in either faction.

```css
.gtw {
  --gtw-mine: var(--glyph, #6cb6ff);
  --gtw-them: var(--red, #ff5c5c);
  --gtw-amber: var(--amber, #ffb84d);
  --gtw-muted: #8ba9c6;
  --gtw-rule: rgba(108, 182, 255, 0.32);
  font-size: 16px;
  line-height: 1.4;
  text-shadow: 0 0 2px rgba(108, 182, 255, 0.25);
}
.gtw-dim, .gtw-btn small, .gtw-tracks small {
  opacity: 1;
  color: var(--gtw-muted);
  text-shadow: none;
}
.gtw-btn { min-height: 36px; }
.gtw-btn small, .gtw-hint, .gtw-news li {
  font-size: 14px;
  line-height: 1.4;
  opacity: 1;
}
.gtw-btn:disabled {
  opacity: 1;
  color: #8ba0b5;
  border-color: #35475a;
  background: #080e18;
  text-shadow: none;
  cursor: not-allowed;
}
.gtw-btn:disabled small { color: #8ba0b5; }
.gtw .crit, .gtw-crit, .gtw-defcon.crit {
  text-shadow: 0 0 2px rgba(255, 92, 92, 0.3);
}
.gtw-land {
  fill: rgba(32, 64, 105, 0.10);
  stroke: #4777a5;
  stroke-width: 0.8px;
  vector-effect: non-scaling-stroke;
  filter: none;
}
.gtw-grid {
  stroke: rgba(108, 182, 255, 0.12);
  stroke-width: 0.6px;
  vector-effect: non-scaling-stroke;
}
.gtw-rim {
  stroke: rgba(108, 182, 255, 0.45);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}
```

Keep ordinary panel text at 16 px and supporting copy at 14 px on phones too. Map annotations are the deliberate 12 px exception. Desktop buttons should be at least 36 px tall; touch controls are 44 px. Check contrast using the rendered core colors on their actual backgrounds, without counting glow as contrast. Aim for at least 4.5:1 for ordinary text and 3:1 for meaningful controls/graphics; faint geographic grid lines are decorative.

## P2.1: Put useful telemetry in the desktop space beside the circle

**Change:** preserve `viewBox="0 0 200 200"` and `preserveAspectRatio="xMidYMid meet"`. Do not stretch the map to the rectangular board or enlarge it until the rim is cropped. Use the existing side margins for two sparse HTML readouts:

- Left: `POLAR SCOPE`, `NORTH POLE / 10N RIM`, a small shape legend, then `SELECTED` with the selected launcher or track details.
- Right: `FORCES` with the existing `gtw-forces` values, followed by the existing enemy estimate. In crisis, lead with INTERCEPTORS and SATELLITE PASSES.

Use the same inner-board measurement from P1.2. Let `gutter = (W - diameter) / 2`; enable side rails only when `gutter >= 168` and viewport width exceeds 900 px. This tests actual available space, including short and ultrawide windows, rather than guessing from viewport width alone.

```tsx
// Within BigBoard's .gtw-board-surface, after the map/label layers:
{railMode && (
  <>
    <aside className="gtw-board-rail gtw-board-rail-left"
      style={{ width: gutter - 24 }}>
      {legendAndSelection}
    </aside>
    <aside className="gtw-board-rail gtw-board-rail-right"
      style={{ width: gutter - 24 }}>
      {forcesReadout}
    </aside>
  </>
)}
```

```css
.gtw-board-rail {
  position: absolute;
  top: 16px;
  bottom: 16px;
  overflow: auto;
  z-index: 2;
  font-size: 14px;
  line-height: 1.45;
  text-shadow: none;
}
.gtw-board-rail-left { left: 12px; }
.gtw-board-rail-right { right: 12px; }
.gtw-board-rail h4 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: normal;
  letter-spacing: 0.08em;
  color: var(--gtw-muted);
}
.gtw-board-rail .gtw-forces { gap: 6px 8px; }
.gtw-board-rail .gtw-forces dt { overflow-wrap: anywhere; }
.gtw-board-rail .gtw-forces dd { align-self: start; }
```

Extract `ForcesReadout` and `SelectionReadout` presentation components from the existing markup. Report `railMode` from the board measurement to the parent only when that boolean changes. In rail mode, render those components in the board slots. Otherwise render the same components in panel `<details>` sections after its primary tasks, with selection information first and expanded. Do not mount duplicate readouts and hide one with opacity. Reserve the rail rectangles in the label placement pass.

At the supplied desktop width, this uses the side margins, leaves the circle centered, and frees the panel for purchases/news or live incoming tracks. At intermediate sizes it returns to a map plus a command panel.

## P2.2: Make the command panel's hierarchy follow the current decision

**Change the JSX structure of `.gtw-panel`:** replace the strategy/crisis fragments with explicit header, body, and footer wrappers. Preserve each existing action callback, `disabled` expression, confirmation modal, and `data-testid`.

```text
aside.gtw-panel
  div.gtw-panel-head
    Strategy: STRATEGIC COMMAND, side name, BUDGET value
    Crisis: INCOMING count, interceptor and satellite counts
  div.gtw-panel-body
    Strategy: latest NEWS item, six purchases, additional NEWS details
    Crisis: complete ETA-sorted incoming list, RESPONSE and selection text
    Both: SITES index; selection/forces fallback when rails are absent
  div.gtw-panel-footer
    Strategy: END QUARTER, first-strike hint
    Crisis: existing FULL RESPONSE button and existing confirmation flow
```

The timestamp/phase and speed controls live in the global bar, so they stay visible while this body scrolls. In strategy, give the latest news item a single bordered section above the purchases; retain the other four items in `<details><summary>NEWS ARCHIVE</summary>…</details>`. The initial empty-news state can omit the section. Move the force table into the rails/fallback described above.

```css
.gtw-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  overflow: hidden;
}
.gtw-panel-head, .gtw-panel-footer {
  flex: 0 0 auto;
  padding: 12px;
  background: #050b15;
}
.gtw-panel-head { border-bottom: 1px solid var(--gtw-rule); }
.gtw-panel-footer { border-top: 1px solid var(--gtw-rule); }
.gtw-panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.gtw-panel-body > * { flex-shrink: 0; }
.gtw-panel h3 { margin: 0; font-size: 18px; line-height: 1.3; }
.gtw-panel h4 { margin: 0; font-size: 14px; color: var(--gtw-muted); }
.gtw-panel h3.gtw-crit { color: var(--gtw-them); }
.gtw-budget { display: flex; align-items: baseline; justify-content: space-between; }
.gtw-budget b { font-size: 28px; font-weight: normal; }
.gtw-buys { gap: 6px; }
.gtw-buys > .gtw-btn {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 8px;
  padding: 8px 10px;
}
.gtw-buys small { grid-column: 1 / -1; }
.gtw-buy-cost { color: var(--gtw-amber); white-space: nowrap; }
.gtw-panel-footer .gtw-btn { width: 100%; min-height: 40px; }
.gtw-panel-footer .gtw-hint { margin-top: 8px; }

@media (max-width: 900px) {
  .gtw-panel, .gtw-panel-body { overflow: visible; }
  .gtw-panel-body { flex: none; min-height: auto; }
  .gtw-panel-footer .gtw-btn { min-height: 44px; }
}
```

In each buy button replace the plain text plus parenthesized cost with `<span>{b.label}</span><span className="gtw-buy-cost">{b.cost} CR</span><small>{b.note}</small>`. Label the header `BUDGET / CREDITS` so `CR` is defined. Preserve the actual notes and costs from `BUY_ITEMS`.

**Incoming rows:** keep ETA sorting, but remove `.slice(0, 12)` and the non-interactive `+N MORE` replacement. All incoming tracks must be reachable in the panel scroller or phone page. Restructure `TrackRow` into a list item containing a real summary button, then the existing two action buttons. Remove `onClick` from the `<li>`.

```tsx
<li className={selected ? 'sel' : undefined} data-track={k.id} data-verify={k.verify}>
  <button type="button" className="gtw-track-summary"
    aria-pressed={selected} onClick={onSelect}>
    <span className="gtw-track-id">T{String(k.id).padStart(2, '0')}</span>
    <span className="gtw-track-target">{tg.name}</span>
    <strong className="gtw-track-eta">{Math.max(0, Math.ceil(t))} MIN</strong>
    <span className="gtw-track-status" data-status={k.verify}>{status}</span>
  </button>
  <div className="gtw-row-btns">{/* existing VERIFY and INTERCEPT buttons */}</div>
  <small className="gtw-track-reason">{/* visible disabled-action reason, when needed */}</small>
</li>
```

When an action button is used, explicitly call `onSelect()` before its existing `onVerify()` or `onIntercept()` callback to preserve the useful selection behavior previously supplied by event bubbling. Leave the existing eligibility tests intact. Show concise text for the current reason instead of relying on `title`: `INTERCEPT AT 10 MIN` using `INTERCEPT_RANGE`, `NO INTERCEPTORS`, `NO SATELLITE PASSES`, or the current verification/engagement status. Do not claim that UNVERIFIED means a confirmed warhead.

```css
.gtw-tracks { gap: 8px; }
.gtw-tracks li {
  display: block;
  padding: 8px;
  border: 1px solid var(--gtw-rule);
  border-left: 2px solid var(--gtw-them);
  cursor: default;
}
.gtw-tracks li.sel { border-color: var(--gtw-amber); background: #10131a; }
.gtw-track-summary {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 2px 8px;
  padding: 0 0 6px;
  color: inherit;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
}
.gtw-track-id { font-size: 14px; color: var(--gtw-muted); }
.gtw-track-target { overflow-wrap: anywhere; }
.gtw-track-eta { font-size: 18px; font-weight: normal; color: var(--gtw-them); }
.gtw-tracks li[data-verify="ghost"] { border-left-color: var(--gtw-muted); }
.gtw-tracks li[data-verify="ghost"] .gtw-track-eta { color: var(--gtw-muted); }
.gtw-track-status { grid-column: 2 / -1; font-size: 14px; }
.gtw-track-status[data-status="none"],
.gtw-track-status[data-status="pending"] { color: var(--gtw-amber); }
.gtw-track-status[data-status="ghost"] { color: var(--gtw-muted); }
.gtw-row-btns { gap: 6px; }
.gtw-row-btns .gtw-btn { min-height: 36px; font-size: 14px; padding: 6px; }
.gtw-tracks .gtw-track-reason { display: block; margin-top: 4px; text-align: left; }
@media (max-width: 900px) {
  .gtw-row-btns .gtw-btn { min-height: 44px; padding: 8px; }
}
```

Use the same `T01`-style ID for a selected map track label and its inspector. Give a selected track amber brackets while retaining its ownership color. This makes list-to-map selection visible without relying on the current small change in stroke thickness.

## P2.3: Make the status bar a deliberate two-tier instrument strip

**Cause:** a single wrapping flex row makes all values peers. On the phone, date, DEFCON, populations, and SAVE & EXIT wrap into accidental groups. The tension strip introduces green and has no numerical value.

**JSX structure:** keep the title text, but group identity separately from instrument values. Use `<dl>` pairs so each number has a visible label. Existing values and population denominators remain unchanged.

```text
header.gtw-bar
  div.gtw-identity
    span.gtw-title: GLOBAL THERMONUCLEAR WAR
    span.gtw-context: dateLabel(s), phase label
  button.gtw-btn.gtw-exit: SAVE & EXIT
  dl.gtw-metrics
    div.gtw-metric-defcon: DEFCON / s.defcon
    div.gtw-metric-tension: TENSION / rounded percentage + strip
    div.gtw-metric-detonations: DETONATIONS / s.detonations + threshold
    div.gtw-metric-pop: own adjective + POP / current + starting population
    div.gtw-metric-pop.gtw-them: enemy adjective + POP / current population
  div.gtw-speed: existing pause and speed buttons, crisis only
```

The context label is `STRATEGY` or `CRISIS T+{Math.floor(s.t)} MIN`; use `CRISIS PAUSED / T+{Math.floor(s.t)} MIN` when paused and `GAME OVER` for phase `over`. Display active speed with `aria-pressed` as well as `.on`. Keep the existing `.gtw-defcon`/`.crit` condition and `<b>` value inside that metric's `<dd>`, and keep the existing `.gtw-tension` wrapper inside its value. Preserve the existing cumulative-detonation color condition as well.

```css
.gtw-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 16px;
  padding-bottom: 8px;
  letter-spacing: 0.03em;
}
.gtw-identity { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.gtw-title { font-size: 16px; letter-spacing: 0.08em; }
.gtw-context { font-size: 14px; }
.gtw-bar .gtw-exit { margin-left: 0; min-height: 36px; }
.gtw-metrics {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 100px 190px 180px minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px 16px;
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.gtw-metrics > div { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.gtw-metrics dt { font-size: 12px; color: var(--gtw-muted); }
.gtw-metrics dd { margin: 0; font-size: 16px; white-space: nowrap; }
.gtw-defcon b { font-size: 20px; font-weight: normal; }
.gtw-tension i { width: 64px; height: 6px; border-color: var(--gtw-muted); }
.gtw-tension u { background: var(--gtw-amber); }
.gtw[data-alert="critical"] .gtw-tension u { background: var(--gtw-them); }
.gtw-bar .gtw-speed { grid-column: 1 / -1; gap: 6px; }
.gtw-speed .gtw-btn { min-width: 44px; text-align: center; }
.gtw-speed .gtw-btn:first-child { min-width: 80px; }

@media (max-width: 1100px) {
  .gtw-metrics { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .gtw-metrics > div { grid-column: span 2; gap: 4px; }
  .gtw-metrics > .gtw-metric-pop { grid-column: span 3; }
}
@media (max-width: 900px) {
  .gtw-bar {
    position: sticky;
    top: env(safe-area-inset-top, 0px);
    z-index: 4;
    gap: 6px 8px;
    background: #050a14;
  }
  .gtw-identity { display: block; }
  .gtw-title { display: block; font-size: 12px; letter-spacing: 0.03em; }
  .gtw-context { display: block; margin-top: 2px; font-size: 12px; }
  .gtw-bar .gtw-exit { min-height: 44px; font-size: 12px; padding: 6px; }
  .gtw-metrics { gap: 6px 8px; }
  .gtw-metrics > div { flex-wrap: wrap; }
  .gtw-metrics dt { font-size: 12px; }
  .gtw-metrics dd { font-size: 14px; }
  .gtw-tension i { width: 32px; }
}
```

Set `data-alert={s.defcon <= 2 ? 'critical' : 'normal'}` on `.gtw`, reusing the existing critical DEFCON condition. In the tension metric show `Math.round(s.tension)` followed by `%`; make the visual strip `aria-hidden`. Give the row enough room to wrap its label/value at narrow widths rather than clipping numbers. The font sizes in this compact header are explicit exceptions to the panel text sizes in P1.3.

The full title fits as two short lines if necessary; do not shrink the entire status bar to preserve one-line branding. Keep the header's instrument order fixed across phases.

## P2.4: Make missile tracks read as moving vector traces

**Change in the SVG:** preserve `routePoints(s, k, pos.f)` and `posAt(s, k)`. Their geometry represents the traveled portion of the actual route. Draw a thin trail, a crisp head, and a larger selected reticle. Do not replace great-circle paths with decorative arches or show an already traveled line all the way to the destination.

Replace the broad `.gtw-track polyline` / `.gtw-track circle` rules with explicit parts. Add `data-verify={k.verify}` to each track group. All confidence styling must use `k.verify`; do not read the hidden `k.real` value for presentation.

```tsx
<g className={cls} data-verify={k.verify} onClick={() => onTrack(k)}>
  <polyline className="gtw-track-trail" points={routePoints(s, k, pos.f)} />
  <circle className="gtw-track-head" cx={head.x} cy={head.y} r={2.5 / scale} />
  <polyline className="gtw-track-hit" points={routePoints(s, k, pos.f)} />
  {/* For the selected track only, draw four amber corner brackets
      around a 14 x 14 CSS px box centered on head. */}
</g>
```

```css
.gtw-track { color: var(--gtw-mine); }
.gtw-track.theirs { color: var(--gtw-them); }
.gtw-track-trail {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.25px;
  stroke-linecap: butt;
  vector-effect: non-scaling-stroke;
  opacity: 0.75;
}
.gtw-track-head { fill: currentColor; stroke: none; filter: none; }
.gtw-track.theirs[data-verify="none"] .gtw-track-head,
.gtw-track.theirs[data-verify="pending"] .gtw-track-head {
  fill: #020611;
  stroke: currentColor;
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
}
.gtw-track.ghost { color: #8ba9c6; }
.gtw-track.ghost .gtw-track-trail { stroke-dasharray: 4 4; opacity: 0.6; }
.gtw-track.sel .gtw-track-trail { stroke-width: 2px; opacity: 1; }
.gtw-track-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 12px;
  vector-effect: non-scaling-stroke;
  pointer-events: stroke;
}
.gtw-track-reticle {
  fill: none;
  stroke: var(--gtw-amber);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}
```

For the reticle, let `r = 7 / scale` and `arm = 3 / scale`; draw each corner as two perpendicular `arm`-length segments. Keep the head in its side color. CONFIRMED has a filled head, UNVERIFIED/VERIFYING a hollow head, and NOT CORROBORATED a gray broken trail. The text status in the row remains authoritative. No track label needs to blink.

Order the map layers explicitly: grid/land, track trails and hit paths, site symbols, track heads/reticles, blast outlines, label leaders, label text. For sites lying under a trail hit path, the site controls must retain pointer priority. Selected map-track information and the list give an alternative when trails overlap. If these parts are split into separate groups, bind `onTrack(k)` to both head and trail hit region.

## P2.5: Distinguish live crisis from the aftermath of an exchange

The late screenshots are **strategy**, despite DEFCON remaining at 1. Phase and readiness are different signals. Keep that distinction visible without changing the game state.

| State | Header and panel | Scope |
| --- | --- | --- |
| Strategy | Blue STRATEGY context, amber budget and END QUARTER, latest news visible. | Stable site labels; no sweeping alert animation. |
| Crisis | Red CRISIS context, visible T+ clock and pause/speed, incoming list first. | Moving ownership-colored traces; selected head and target emphasized. |
| Strategy after an exchange | STRATEGY context plus a small amber LAST EXCHANGE summary. DEFCON keeps its actual red value. | Static impact marks and updated population, without frozen explosion disks. |
| Over | Existing loss panel and WINNER: NONE. | Retain the final board behind the dialog. |

Add `.gtw-phase` to the phase text inside `.gtw-context`, then:

```css
.gtw-phase { color: var(--gtw-mine); }
.gtw[data-phase="crisis"] .gtw-phase { color: var(--gtw-them); }
.gtw[data-phase="crisis"] .gtw-panel-head {
  border-top: 2px solid var(--gtw-them);
}
.gtw[data-phase="strategy"] .gtw-panel-head {
  border-top: 2px solid var(--gtw-amber);
}
.gtw-after-action {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--gtw-rule);
  color: var(--gtw-amber);
  font-size: 14px;
}
```

**Detonations:** replace the filled `.gtw-blast` circle with a small luminous core and two open rings. The current fade is driven by `s.t`; when strategy returns, that clock stops, leaving recent disks visible. Render expanding effects only while `s.phase === 'crisis'`. Keep the current four-game-minute lifetime and derive all dimensions from `age = Math.max(0, Math.min(1, (s.t - b.t) / 4))`:

```tsx
// Within the existing blast mapping; radii here are projection units.
<g className={b.air ? 'gtw-blast air' : 'gtw-blast'}
  transform={`translate(${p.x} ${p.y})`} opacity={1 - age}>
  <circle className="gtw-blast-ring" r={(b.air ? 1 : 2) + age * (b.air ? 2 : 4)} />
  {!b.air && <circle className="gtw-blast-ring inner" r={0.8 + age * 3} />}
  {age < 0.15 && <circle className="gtw-blast-core" r={1.5 / scale} />}
</g>
```

```css
.gtw-blast { fill: none; stroke: none; color: var(--gtw-amber); pointer-events: none; }
.gtw-blast.air { fill: none; stroke: none; color: var(--gtw-mine); }
.gtw-blast-ring {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.25px;
  vector-effect: non-scaling-stroke;
}
.gtw-blast-ring.inner { opacity: 0.5; }
.gtw-blast-core { fill: #ffe3a8; stroke: none; }
.gtw-blast.air .gtw-blast-core { fill: var(--gtw-mine); }
.gtw-impact-mark {
  fill: none;
  stroke: var(--gtw-amber);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
  opacity: 0.7;
  pointer-events: none;
}
```

During strategy, use `s.blasts.filter((b) => !b.air)` for the **last exchange's** static impact marks. Deduplicate by location for drawing, and render a 10 CSS px open ring plus four short ticks, centered on the site. Preserve the city dot, its side color, and its current population. A struck city can still be alive; an impact mark must not imply destruction. Do not include air intercepts in the detonation summary.

If that filtered list is nonempty, add this below the strategy panel heading:

```tsx
<p className="gtw-after-action">
  LAST EXCHANGE: {s.blasts.filter((b) => !b.air).length} DETONATIONS.
  {' '}STRATEGIC COMMAND RESUMED.
</p>
```

The count uses every ground blast, including repeated hits; only the drawn location marks are deduplicated. The header's `s.detonations` remains the cumulative total. Keep the existing log's casualty details. This summary persists as a last-exchange record until the existing engine clears `s.blasts` on the next crisis, so it does not need a new timer or saved field.

## P3.1: Make selection and focus explicit without blinking every target

The existing `.gtw-site.target` animation blinks all eligible enemy markers once a launcher is selected. This competes with live tracks. Remove that animation and use a steady outline for eligible targets; reserve amber brackets for the selected launcher and inspected target.

```css
.gtw-site.target circle:not(.hit), .gtw-site.target path { animation: none; }
.gtw-site.sel { color: var(--gtw-mine); filter: none; }
.gtw-site.target circle:not(.hit), .gtw-site.target path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}
.gtw-site.dead { opacity: 0.65; }
.gtw button:focus-visible, .gtw summary:focus-visible {
  outline: 2px solid var(--gtw-amber);
  outline-offset: 3px;
}
.gtw-site-index summary { cursor: pointer; padding: 8px 0; }
.gtw-site-index button { width: 100%; min-height: 44px; margin-top: 6px; }
```

Render selection brackets outside the marker's ownership-color group so the selected launcher retains blue and its brackets are amber. Keep hit circles transparent. Add `<title>` to each site group with its full name and type as supplementary desktop information. The SITES buttons and track summary buttons supply keyboard access to the same actions, so the map's `role="img"` can remain a summarized graphic rather than containing inaccessible pretend buttons.

Honor both reduced-motion mechanisms already present in the project. These rules apply to any new transitions, and reduced motion should also render live blast rings at a fixed radius instead of expanding them:

```css
.wg-reduce .gtw-tension u { transition: none; }
.wg-reduce .gtw-blast-ring { r: 3px; }
.wg-reduce .gtw-blast-ring.inner, .wg-reduce .gtw-blast-core { display: none; }
@media (prefers-reduced-motion: reduce) {
  .gtw-tension u { transition: none; }
  .gtw-blast-ring { r: 3px; }
  .gtw-blast-ring.inner, .gtw-blast-core { display: none; }
}
```

Keep the actual missile positions and crisis clock updating; reduced decorative motion must not conceal tactical progress. Do not add screen shake, full-screen flashes, or a new animated sweep. `.gtw-sweep` currently paints nothing and can be removed from JSX and CSS.

## P3.2: Finish the console with a small legend and a disciplined log

Use the left desktop rail's legend to explain the existing circle/city, triangle/silo, and diamond/sub symbols. Use tiny inline SVG shapes, not Unicode substitutes that may be missing in VT220. Give each legend SVG `.gtw-key-symbol { width: 12px; height: 12px; fill: currentColor; vertical-align: middle; }`. Add a short blue line labeled `YOUR FORCES`, a red line labeled `OPPOSING FORCES`, and an amber bracket labeled `SELECTED / ALERT`. On smaller screens put this in native `<details className="gtw-legend"><summary>MAP KEY</summary>…</details>` in the panel body.

Give the bottom log an explicit `COMMAND LOG` heading and its own inner `.gtw-log-lines` region. Keep the latest five existing messages and the current `msg` behavior. Preserve `aria-live="polite"` on the lines, not the heading or rapidly changing T+ clock. Replace index-changing keys with stable append indices, such as `s.log.length - visibleLog.length + i`, so old lines are not remounted and re-announced after every log append.

```css
.gtw-log { gap: 4px; overflow: hidden; }
.gtw-log-heading {
  flex: none;
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.08em;
  color: var(--gtw-muted);
}
.gtw-log > .gtw-log-lines {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  font-size: 14px;
  line-height: 18px;
}
.gtw-log-lines > span { flex: none; overflow-wrap: anywhere; }
@media (max-width: 900px) {
  .gtw-log { overflow: visible; }
  .gtw-log > .gtw-log-lines { flex: none; overflow: visible; }
}
```

On desktop, scroll the inner lines to the newest entry only if the user was already at the bottom; never scroll the whole phone page on a new event. Keep critical log lines red and notices amber, with no additional glow. There is no need to add scanlines over the small text or reproduce physical labels, logos, or insignia from the film.

## Handoff and visual acceptance

Implement P1 before polishing effects. Consolidate these rules into the existing stylesheet rather than appending contradictory overrides. In particular, replace the old 760 px rules, broad track-circle/polyline styling, SVG site-text rules, and filled-blast rules. The snippets introduce named presentation helpers and wrappers; they are a coordinated specification, not a paste-in patch.

Review the same six states after implementation, plus a narrow desktop, a short landscape phone, the USSR player side, and enlarged text. Check these concrete outcomes:

- At 1440 x 900, the full circular rim is visible. Labels for Washington, New York, Philadelphia, Boston, Moscow, Leningrad, Kozelsk, and Tatishchevo are separate and linked to the correct symbols. The two side readouts fit without covering the circle.
- At 390 x 844, only the intended selection labels appear over the scope, all actions have 44 px touch targets, and a single vertical scroll reaches every purchase, END QUARTER, every track, RESPONSE, NEWS, and the log. No clipped yellow button edge serves as the only cue that commands exist below.
- During crisis, PAUSE and speed remain accessible, target names and ETAs are readable, selecting a list row identifies its map trace, and UNVERIFIED is visibly distinct from CONFIRMED without exposing hidden track truth.
- After the exchange, the screen identifies STRATEGY and LAST EXCHANGE while preserving the actual DEFCON. No expanding effect remains frozen. Damage marks do not label surviving cities as dead.
- With more than 12 incoming tracks, all rows remain accessible. With newly built silos/subs and long labels, the label resolver suppresses lower-priority text cleanly and the SITES index retains access.
- Keyboard focus is visible and not trapped behind the sticky header. Both reduced-motion paths remove decorative motion. US and USSR play retain blue for the player, red for the opponent, and amber for selection/alerts.

This review is based on the supplied captures and source inspection. The proposed layout has not been implemented or browser-tested in this task.
