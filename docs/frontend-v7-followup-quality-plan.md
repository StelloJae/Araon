# Araon v7 Follow-Up Quality Plan

Status: implemented and verified
Last updated: 2026-05-14
Scope: frontend-first quality pass after the v7 home layout implementation.
Primary references: current running Araon app, `docs/design.md`, `docs/frontend-v7-final-gap-plan.md`, direct Toss web observation, and real browser visual QA.

## Goal

Finish the remaining visual, data, and interaction regressions in the v7 Araon home screen without changing the locked information architecture.

The target is not a new redesign. The target is a stable Araon product surface:

- same v7 home 50:50 information architecture
- same Araon light/dark design tokens
- same API contracts unless a minimal adapter is required
- no synthetic financial data
- no raw Toss/KIS/session/account/order values in UI, console, logs, docs, screenshots, diff, or stdout

## Non-Negotiables

- Keep the existing Araon React/Vite structure.
- Keep `docs/design.md` as the visual source of truth.
- Preserve user and unrelated dirty work in the current worktree.
- Verify with the real browser. Code inspection and tests are not enough.
- Do not replace missing TOP100 data with local watchlist, favorites, stale rows, or popularity ranking while labeling it as official rise/fall TOP100.
- Do not introduce fake candle, fake tick, fake sparkline, or fake account data.
- Do not execute Toss/KIS order or account mutations.

## Known Issues To Fix

### 1. Dark Mode Bottom Status Bar

Problem:

- In dark mode, the bottom market/status bar can remain white or visually detached.
- Some tape elements can be vertically misaligned.

Required:

- Use theme tokens for status bar background, border, text, hover highlight, and item pills.
- Keep the status bar visible on all primary screens.
- Keep items vertically centered.
- Preserve the scrolling tape behavior.
- On hover, pause the tape and highlight the hovered item.

Acceptance:

- Light and dark mode both render the bottom bar correctly.
- No white status bar remains in dark mode.
- At 1920x1080, 1600x1000, 1440x900, and about 900px width, the bar is visible, aligned, and does not cover content.

### 2. TOP100 Rise/Fall Data Regression

Problem:

- The Home TOP100 board must show `상승 TOP100` and `하락 TOP100`.
- It previously worked, but can now show only `랭킹 데이터를 기다리는 중`.
- A previous fallback changed the board to popularity ranking, which is not acceptable for this surface.

Required:

- Trace why the rise/fall provider data is not reaching the Home board.
- Compare the previous working provider path against the current path.
- Restore real rise/fall rows when the provider returns them.
- Keep rise/fall board structure even when data is unavailable.
- If unavailable, show a truthful state and reason.
- Never show `토스 실시간 인기 TOP100` as a replacement for this Home rise/fall board.
- Row click must update the selected ticker and mini chart.

Acceptance:

- When provider data exists, Home shows real rise/fall rows.
- When provider data does not exist, Home shows an honest unavailable/waiting state, not a popularity fallback.
- Tests cover unsupported provider behavior and the no-popularity-fallback rule.
- Browser QA confirms the visible Home board contains rise/fall structure.

### 3. Mini Chart Expand Button State

Problem:

- The mini chart expand button can be highlighted in gold by default.
- Agent expand button behaves better: quiet by default, highlighted on hover.

Required:

- Make the chart expand button a quiet icon button by default.
- Use hover/focus/active states only for emphasis.
- Match the agent expand button rule unless chart-specific affordance is needed.
- Do not use a large `전체 차트` text button in the mini chart header.

Acceptance:

- Chart expand button is not highlighted by default.
- Hover/focus state is visible.
- Button reads as an expand control, not a primary CTA.

### 4. Favorites Sparkline Persistence

Problem:

- Favorites row sparklines can look permanently flat, especially after market close.

Required:

- Find the actual sparkline input source used by favorites rows.
- Keep pre-market, regular, and after-hours tick or minute points for the current trading day.
- Preserve lightweight sparkline points for at least 24 hours.
- After market close, continue rendering the latest collected day points instead of flattening the line.
- When the next pre-market session starts, begin a new trading-day sparkline set.
- If no real points exist, show an honest empty/collecting state.
- Do not invent line movement.
- Do not permanently store raw tick frames without separate approval.

Preferred source order:

1. Existing local candle/tick/sparkline store, if available.
2. KIS WS tick-derived lightweight points, if already normalized.
3. Toss quote refresh snapshots, if already available and safe.
4. Frontend-only in-memory/local lightweight point cache, only if it does not fake data and does not expose raw payloads.

Acceptance:

- Favorites sparkline is not flat when real same-day points exist.
- After market close, same-day sparkline remains visible.
- After 24 hours with no new real data, the UI does not fake movement.
- Tests cover cache expiry or point retention if implemented in code.

### 5. Favorites Scrollbar Hidden

Problem:

- The favorites panel scrollbar can make the compact UI look noisy.

Required:

- Keep favorites list scrollable.
- Hide the visual scrollbar.
- Preserve wheel, trackpad, keyboard, and focus behavior.

Acceptance:

- Favorites list scrolls.
- Scrollbar is visually hidden in Chromium/Safari/Firefox-compatible CSS where possible.
- No layout shift from scrollbar appearance.

### 6. Chart Resize And Excess Blank Space

Problem:

- Mini chart can leave a large blank area below the actual chart.
- Full chart and mini chart can scroll internally.

Required:

- Chart container must resize to the panel size.
- Mini chart and full chart must not create internal scrollbars.
- Home screen should avoid page-level scroll in normal desktop sizes.
- Chart should update size after panel expansion/collapse and account rail collapse.
- The chart should fill the available chart surface without covering controls.

Acceptance:

- At 1920x1080, 1600x1000, 1440x900, and about 900px width, mini chart has no excessive bottom blank.
- Full chart fits the viewport/workspace without internal scroll.
- Browser QA confirms resize after expansion and collapse.

### 7. Trading Session Gaps In Charts

Problem:

- Charts can show long empty gaps after the market is closed or across non-trading periods.
- Mini chart should focus on the current trading day.

Required:

- Mini chart default scope: today/current trading day.
- Remove or compress non-trading empty time ranges where the charting layer supports it.
- Full chart should also avoid misleading long blank gaps.
- Use only stored candle/tick data.
- Do not synthesize missing candles to fill gaps.

Acceptance:

- Mini chart does not show a long empty post-close segment.
- Full chart does not waste visible space on non-trading blanks.
- Empty data remains honest instead of filled with fake candles.

### 8. Full Chart Controls And Advanced Chart Path

Problem:

- Full chart still needs a more advanced TradingView-like experience.
- Interval/range selection should not be dropdown-only.
- Warning/debug copy should not be visible in the main chart experience.

Required:

- Remove user-facing warning/debug text from the primary full chart view.
- Investigate the safest path to a TradingView Advanced Chart-like experience.
- If actual Advanced Chart integration is blocked by licensing, external script, datafeed, or packaging constraints, document the blocker and implement the closest safe fallback.
- Provide interval/range button groups similar to trading terminals.
- Example intervals: `1분`, `3분`, `5분`, `15분`, `60분`, `일`, `주`, `월`.
- Example ranges: `1일`, `5일`, `1개월`, `3개월`, `6개월`, `1년`, `전체`.
- Full chart transition should feel like the mini chart panel expanding into the workspace, not normal page navigation.

Acceptance:

- No prominent technical warning in normal full chart view.
- Interval/range controls are button groups.
- Expand/collapse transition feels spatially connected to the home chart panel.
- Any Advanced Chart blocker is documented with evidence and a fallback decision.

Investigation note:

- TradingView Advanced Charts is not the same as the public `tv.js` embed. The
  official quick-start says Advanced Charts access is distributed through a
  private TradingView GitHub repository after approval, and the library is not
  redistributable in public repositories:
  https://www.tradingview.com/charting-library-docs/latest/quick-start/
- The official data connection docs say Advanced Charts does not provide market
  data; Araon would need to connect its own data source through a Datafeed API
  or UDF adapter:
  https://www.tradingview.com/charting-library-docs/latest/connecting_data/
- Current fallback decision: keep Araon's local candle renderer as the primary
  full-chart path for KRX symbols, remove user-facing technical warning text,
  and provide terminal-style interval/range button groups. A true Advanced
  Charts integration should be a separate milestone after access, packaging,
  and a no-secret/no-synthetic-data datafeed contract are approved.

### 9. Agent Panel Clarity

Problem:

- The agent panel is not yet intuitive enough for the user.

Required:

- Make the default agent panel easy to understand at a glance.
- The user should immediately know:
  - whether live execution is locked
  - whether only preview/order-intent is allowed
  - what event or signal the agent is watching
  - why a candidate exists
  - whether approval is required
  - whether there is an error/kill/unavailable state
- Reduce internal implementation terms such as `Agent input queue` from primary UI.
- Keep detail available in Agent Detail, but simplify the home panel.

Color rule:

- Active/live/working: green success state.
- Preview/pending/loading/approve required/locked: yellow caution state.
- Kill/unavailable/error: red danger state.

Acceptance:

- Home agent panel is understandable without knowing backend internals.
- Agent Detail expands like a workspace panel, not like a modal or separate page.
- Safety lock state is visually obvious.

### 10. Legacy Copy And Dead UI Cleanup

Problem:

- Some old labels and UI pieces may still reflect the previous KIS/watchlist model.

Required:

- Remove or rewrite stale visible labels such as old `추적중` usage when it conflicts with the Toss-first/current backend meaning.
- Check search, watchlist/favorites, KIS realtime badges, chart controls, settings, and agent surfaces.
- Remove dead UI only when clearly superseded by the v7 structure.
- Do not delete unrelated legacy backend code as part of this frontend quality pass.

Acceptance:

- No visible old-shell/debug/prototype labels remain in the main flow.
- Any remaining legacy wording has a current product meaning.

## Implementation Order

1. Inspect current `git status` and preserve unrelated dirty work.
2. Open the running app in the browser and capture the current visible failures.
3. Fix TOP100 data regression first, because it is both data and UI critical.
4. Fix bottom status bar theme and alignment.
5. Fix chart button, resize, no-scroll, no-gap, and full-chart controls.
6. Fix favorites scrollbar and sparkline retention.
7. Simplify the agent panel.
8. Clean stale labels/dead visible UI.
9. Run tests and real browser visual QA.

## Verification Checklist

Run or justify any skipped check:

- `npm test` or focused tests for changed areas
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- real browser visual QA
- light mode QA
- dark mode QA
- 1920x1080, 1600x1000, 1440x900, and about 900px responsive QA
- TOP100 rise/fall data or honest unavailable state QA
- bottom status bar theme/alignment QA
- mini chart and full chart no-internal-scroll QA
- chart expand/collapse QA
- agent expand/collapse QA
- favorites hidden-scrollbar but scrollable QA
- favorites sparkline real-point or honest-empty QA
- console/UI/logs do not expose raw Toss/KIS/session/account/order values

## Completion Standard

This plan is complete only when:

- all known issues above are fixed or documented with a precise blocker,
- visual QA confirms the user-facing behavior in the real app,
- required tests/build checks pass,
- no synthetic financial data is introduced,
- no secret/raw-provider value is exposed,
- remaining risks are explicit and small.

## Completion Evidence

Completed on 2026-05-14.

Implemented:

- Restored Home `상승 TOP100` / `하락 TOP100` real provider path for Toss overview ranking after the KIS-specific fetch window closes.
- Fixed dark-mode bottom status bar color and vertical alignment.
- Made mini/full chart surfaces resize to their containers without internal scroll.
- Trimmed leading/trailing non-trading placeholder candle gaps instead of synthesizing candles.
- Replaced full-chart interval/range dropdown-only controls with terminal-style button groups.
- Kept chart expand button quiet by default and aligned with the agent expand affordance.
- Hid favorites scrollbar while preserving scroll behavior.
- Preserved same-day real sparkline points across pre-market, regular, and after-hours updates without storing raw tick frames.
- Simplified home agent wording around observation, preview, approval, and live-execution lock.
- Reworded stale KIS/watchlist copy in the main flow so it matches the Toss-first + optional KIS realtime rail model.

Advanced chart blocker:

- True TradingView Advanced Charts integration is not included in this pass.
- Reason: TradingView Advanced Charts access is approval/private-repository based, is not a public drop-in replacement for the embed widget, and still requires Araon to provide its own Datafeed API or UDF-compatible market data.
- Current fallback: Araon's local candle renderer remains the safe KRX chart path, with no user-facing technical warning and with button-based interval/range controls.

Verification run:

- `npm test`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass.
- `git diff --check`: pass.
- Real browser visual QA: pass on 1920x1080, 1600x1000, 1440x900, and about 900px responsive width.
- Light/dark QA: pass.
- TOP100 QA: Home shows real rise/fall rows when provider data exists, and keeps honest unavailable state when it does not.
- Chart QA: mini/full chart no internal scroll, no long post-close blank gap in the visible range, expand/collapse surfaces remain usable.
- Favorites QA: hidden scrollbar remains scrollable, sparkline uses retained real points or honest empty state.
- Agent/account rail QA: expansion/collapse and safety state remain visible without raw Toss/KIS/session/account/order payloads.

Remaining risk:

- TradingView Advanced Charts remains a separate product milestone that needs library access, packaging review, and an explicit no-secret/no-synthetic-data datafeed contract.
