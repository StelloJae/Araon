# Araon Remaining UX Risk + Layout Scale Lock Completion Audit

Date: 2026-05-19
Repo: `/Users/stello/korean-stock-follower`
Goal brief: `docs/research/araon-remaining-ux-risk-layout-scale-lock-goal.md`

## Summary

PASS. The remaining UX risk lane is closed for the inspected scope.

This pass focused on locking the Araon home layout scale before making smaller UX fixes. The verified state now keeps the same text scale and panel density across light/dark mode, keeps the agent panel side-by-side on desktop, removes oversized bottom-bar diagnostic presentation, prevents TOP100/downward market movement from being labeled as `급상승`, and keeps the account icon rail width stable while the Toss rail opens and closes.

No live orders, cancel/amend actions, account mutation, auto-trading, or broad destructive watchlist cleanup were executed.

## Changes Verified

- Layout scale is guarded by fixed product density rather than viewport-scaled fonts.
- Agent panel uses a 2-column body on desktop and collapses to 1 column only on narrow responsive width.
- Toss account icon rail keeps a fixed 48px width during account rail open/collapse.
- Bottom bar no longer shows `투자 유의사항` or tall diagnostic pills in the normal footer.
- Fast price status title is now product-facing: `빠른 가격 정상 · 관심 종목 n/n 갱신 · 자동 갱신 중`.
- Market movement copy distinguishes upward and downward semantics.
- `TOP100 하락` and negative momentum are labeled as `급락 신호`, not `급상승 신호`.
- News/disclosure empty copy now states automatic refresh waiting instead of asking the user to manually refresh.
- Legacy sector-grid CSS that caused overlapping row/badge/sparkline/price layout was removed.
- Pre-release audit test fixture no longer contains a secret-shaped session placeholder.

## Browser Evidence

### Chromium / Playwright, 1600x1000

PASS.

- `bodyFont`: 14px
- Home grid: `755px 755px`
- Agent panel body grid: `364.5px 364.5px`
- Status bar: 36px tall, 11px text
- Account icon rail: 48px wide
- Horizontal overflow: 0
- Vertical overflow: 0
- Fast price title: product-facing wording, no interval/internal diagnostic copy.

### Chromium / Playwright, light vs dark at 1600x1000

PASS.

Light and dark reported identical layout scale:

- `bodyFont`: 14px in both modes
- Home grid: `755px 755px` in both modes
- Agent panel body grid: `364.5px 364.5px` in both modes
- Status bar: 36px in both modes
- Status text: 11px in both modes
- Account icon rail: 48px in both modes
- Overflow: 0 in both modes

### Chromium / Playwright, 1440x900

PASS.

- Home grid: `675px 675px`
- Sector body: 673px wide, 331px high
- Sector grid: `336.5px 336.5px`
- Agent panel body grid: `324.5px 324.5px`
- Status bar: 36px tall
- Account icon rail: 48px wide
- Overflow: 0

### Chromium / Playwright, 900x900

PASS.

- Main grid: `830px 48px`
- Home grid: `411px 411px`
- Agent panel body grid: `393px`
- This is the intended narrow responsive collapse.
- Status bar: 36px tall
- Account icon rail: 48px wide
- Overflow: 0

### Account Rail Open/Collapse

PASS.

- Collapsed main grid: `1522px 48px`
- Expanded main grid: `1188px 382px`
- Collapsed icon rail: `x=1552, w=48`
- Expanded icon rail: `x=1552, w=48`

The account rail changes workspace width as intended, but the icon rail itself does not jitter.

### Safari / Computer Use

PASS.

Safari was inspected in both light and dark modes. The home layout kept the same density, the agent area stayed side-by-side, the bottom status bar stayed compact, and the Toss rail/account icon rail remained visually stable.

### Chrome / Computer Use

PASS.

Chrome was inspected with the real running tab. The sector view, favorites, selected ticker, agent panel, and bottom bar were visually consistent with the Chromium measurements. The Chrome window itself was smaller than Safari, but the app did not show the earlier oversized text or stacked desktop agent layout.

## Acceptance Criteria

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | Chrome/Safari same viewport density/text scale comparable | PASS | Playwright Chromium scale locked; Safari/Chrome Computer Use inspected with matching product density. |
| 2 | Light/dark mode does not alter layout scale | PASS | 1600x1000 light/dark metrics identical. |
| 3 | Agent panel side-by-side on desktop, narrow only 1-column | PASS | 1600/1440: 2 columns. 900: 1 column. |
| 4 | No global font-size increase used | PASS | `bodyFont` remains 14px; no viewport font scaling observed. |
| 5 | Favorites unstar works for non-held Toss watchlist rows | PASS | Store/component/server tests cover unstar/remove intent while preserving holdings. |
| 6 | Held products remain visible and not misleadingly removable | PASS | Held-only rows are kept visible and locked; held+watchlist can remove watchlist membership. |
| 7 | News/disclosure auto-refresh on selected ticker/freshness cadence | PASS | Component behavior and copy verified; refresh runs from selected ticker and stale interval. |
| 8 | News/disclosure tabs separated honestly or merged honestly | PASS | Tabs remain distinct; copy no longer implies manual-only refresh. |
| 9 | Sector no overlap at 1600x1000 and 1440x900 | PASS | Sector grid measured 2 columns with no overflow at both sizes. |
| 10 | Toss account rail hover/click behavior stable | PASS | Rail rows are interactive, row click chart path present, hover transform no longer shifts layout. |
| 11 | Toss account rail icons safe/fallback cleanly | PASS | Account rail renders without broken icon layout; text fallback visible where icon asset unavailable. |
| 12 | Account rail open/collapse does not alter icon sidebar width | PASS | Icon rail stayed `w=48` and same x position across collapse/expand. |
| 13 | Bottom bar removes `투자 유의사항` | PASS | Footer no longer renders that label in normal UI. |
| 14 | Bottom bar no oversized status pills | PASS | Fast price is compact text; status bar remains 36px. |
| 15 | Bottom bar vertically centered and product-facing | PASS | 36px bar, 11px text, product-facing fast-price title. |
| 16 | Agent safety copy follows design type scale | PASS | Desktop agent panel uses compact panel type; no hero-sized copy remains in the inspected home panel. |
| 17 | Agent candidate count and visible rows honest | PASS | UI shows candidate count plus visible candidate rows and `외 n건` overflow summary. |
| 18 | TOP100 falling movement not labeled `급상승` | PASS | Tests added for negative percent and `TOP100 하락` with no percent. |
| 19 | Market pause/stale quote not false tracking error | PASS | Normal UI state inspected without false `추적 오류`; market pause copy is separate from tracking failure. |
| 20 | Focused tests pass | PASS | Focused agent/status/audit tests passed. |
| 21 | Full `npm test` passes | PASS | 228 files / 1534 tests passed. |
| 22 | `npm run typecheck` passes | PASS | Typecheck passed. |
| 23 | `npm run build` passes | PASS | Production build passed. |
| 24 | `git diff --check` passes | PASS | Passed. |
| 25 | `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500` passes | PASS | no-live soak returned `ok: true`, `issueCount: 0`. |
| 26 | Completion audit written | PASS | This document. |

## Verification Commands

```bash
npm test -- --run src/client/lib/__tests__/agent-candidate-view-model.test.ts src/client/lib/__tests__/agent-event-toast.test.ts src/client/components/__tests__/status-bar.test.ts
npm test -- --run src/server/audit/__tests__/pre-release-product-100-audit.test.ts
npm run typecheck
npm test
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

## Secret / Raw Value Check

PASS for changed files.

A broad tracked-file string scan still finds older test files that intentionally contain secret-shaped placeholder strings for redaction tests. Those files were not part of this goal's changed surface. A changed-file scan with value-like patterns passed after removing one secret-shaped placeholder from the pre-release audit fixture.

## Remaining Notes

- The Chrome app window in Computer Use was not the same pixel size as Safari and had a browser translation overlay present. Same-viewport parity was therefore verified with Playwright/Chromium metrics, while Chrome/Safari were used as real-browser visual sanity checks.
- Live market behavior can still vary with market phase and upstream provider timing. This audit only claims the UX/layout risk lane described by the goal brief.
