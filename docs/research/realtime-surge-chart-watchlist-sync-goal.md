# Realtime Surge, Chart Candle Progression, and Toss Watchlist Sync Goal

Date: 2026-05-15

This document is the authoritative execution brief for the next Araon lane after
`docs/research/toss-fast-quote-surge-lane-goal.md`.

The previous lane added a bounded Toss fast quote lane so `최근 급상승` can use
Toss-derived near-real-time price samples, not only KIS WebSocket ticks. This
lane verifies that behavior in a realistic market session, fixes chart candle
progression from real samples, and completes the Toss watchlist sync foundation
without crossing into live mutation unless the user gives a fresh explicit GO.

This is not a live-trading approval. It does not authorize placing, cancelling,
or amending real orders. It does not authorize live Toss account mutation or
live Toss watchlist mutation. All live mutation must remain locked until a
separate fresh user approval.

## 1. Product Intent

Araon should feel like a Toss-primary personal market terminal:

- `TOP100` shows Toss ranking data.
- `최근 급상승` reacts to meaningful short-window price momentum.
- Mini/full charts progress from real price samples.
- `즐겨찾기` means Toss watchlist when Toss login/session is available.
- Local favorites are fallback/cache, not the primary user concept.
- KIS remains optional `실시간 추적`, used for low-latency companion ticks only.
- Agent surfaces may observe events and prepare previews, but live execution
  remains locked.

## 2. Scope

This goal covers three workstreams.

### 2.1 Realtime Surge Calibration

Verify and harden `최근 급상승` after the Toss fast quote lane:

- Observe runtime during a real or realistic market window.
- Confirm `toss-fast-quote` prices reach the recent surge momentum path.
- Confirm `ws-integrated` KIS ticks still work as another valid source.
- Confirm normal `rest` quote refresh does not trigger realtime momentum.
- Confirm the user threshold is respected:
  - threshold `3%` must block `0.x%`, `1.x%`, and `2.x%` alerts.
  - only user-meaningful threshold crossing should create toast/alert.
- Confirm ranking movement and price momentum are not silently conflated.
- Confirm noisy raw update messages such as `KIS WS tick 가격 업데이트 감지`
  do not appear.

Output should include a compact calibration note with:

- market phase,
- observed source mix,
- candidate count,
- accepted/deduped fast quote counts,
- recent surge count,
- alert count,
- any false positive or false negative suspicion.

### 2.2 Chart Candle Progression

Fix or confirm chart behavior from real samples:

- Mini chart should update current visible price and current candle from real
  `toss-fast-quote` or `ws-integrated` samples.
- Full chart should also update the currently forming candle when the selected
  ticker receives real samples.
- Candle progression must not require a full page refresh.
- Do not generate fake historical candles.
- Do not fill non-trading gaps with synthetic movement.
- Keep the mini chart focused on the current trading day by default.
- If there is no market data during overnight/no-trading periods, hide or skip
  long empty gaps rather than drawing fake candles.
- Sparkline updates may use real samples only.
- If a sample only changes current price but not OHLC bucket state, the chart
  should update the price marker without inventing a new candle.

The key question to answer in code:

> Does the `price-update` event update only visible price, or does it also feed
> the local candle/current-bucket store that mini/full charts render?

### 2.3 Toss Watchlist Sync Foundation

Move `즐겨찾기` toward Toss watchlist as primary truth:

- Preserve the normalized `/watchlist` read model.
- Preserve Toss watchlist read-only behavior through sanitized routes.
- Preserve local favorites as fallback/cache.
- Star/unstar in Araon should become a product-aware sync intent:
  - Toss-supported product -> intended Toss watchlist add/remove.
  - Toss unavailable/no session -> local-only or sync-pending state.
  - Toss-only product must not go through six-digit/KIS-only routes.
  - unsupported product must show honest unavailable/pending state.
- Implement or harden mutation route/client behind a disabled-by-default gate.
- Mock/fixture tests may call Toss watchlist add/remove code paths.
- Normal UI must not perform live Toss watchlist add/remove without fresh GO.
- UI copy should avoid legacy terms:
  - avoid `내 목록`
  - avoid `등록됨`
  - avoid `폴링`
  - avoid `KIS WS`
  - prefer `즐겨찾기`, `동기화 대기`, `Toss 동기화`, `실시간 추적`

Live mutation rule:

- Do not run live Toss watchlist add/remove during this goal.
- If a live smoke becomes the next useful step, stop and ask the user for a
  fresh explicit GO naming the exact product/action.

## 3. Current Evidence To Recheck

Recheck these before editing because the worktree is active.

### 3.1 Fast Quote Lane

- `src/server/toss/toss-fast-quote-lane.ts`
- `src/server/app.ts`
- `src/server/routes/runtime.ts`
- `src/server/routes/market.ts`
- `src/client/lib/realtime-momentum-feed.ts`
- `src/client/lib/api-client.ts`

Expected facts:

- `/runtime/data-health` exposes sanitized `tossFastQuoteLane`.
- Fast lane source is `toss-fast-quote`.
- Interval is `500ms`.
- Target cap is `40`, hard cap is `60`.
- Candidate set is bounded.
- Normal broad quote polling was not lowered to `500ms`.

### 3.2 Watchlist

- `src/server/watchlist/araon-watchlist-service.ts`
- `src/server/routes/watchlist.ts`
- `src/server/toss/toss-watchlist-client.ts`
- `src/server/routes/toss-watchlist.ts`
- `src/client/stores/watchlist-store.ts`
- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/GlobalSearch.tsx`

Expected facts:

- Toss watchlist read model exists.
- Local fallback exists.
- Product identity separates Toss productCode and six-digit KRX ticker.
- Toss-only products should remain out of KIS eligibility.
- Watchlist add/remove mutation candidates may exist in tests, but live mutation
  must remain locked.

### 3.3 Chart

- `src/client/components/StockCandleChart.tsx`
- `src/client/components/TradingViewAdvancedChart.tsx`
- `src/client/App.tsx`
- `src/client/hooks/useSSE.ts`
- `src/client/lib/sparkline.ts`
- `src/server/price/`
- `src/server/chart/`

Expected facts:

- `price-update` events already update visible prices.
- Current-candle progression may still be incomplete.
- Stored candle data must remain real provider/server-derived data only.

## 4. Non-Negotiable Safety Boundaries

- No real order placement.
- No order cancel/amend.
- No account mutation.
- No live Toss watchlist mutation without fresh GO.
- No raw Toss session/cookie/storage/account/order/watchlist identifiers in
  UI, logs, docs, stdout, or git diff.
- No raw KIS app key, app secret, access token, approval key, account number, or
  raw WebSocket frame exposure.
- No synthetic financial data.
- No fake candles.
- No full-market 0.5s polling.
- Preserve dirty worktree and user changes.

## 5. Implementation Order

### Phase 0 - Audit

1. Check `git status --short`.
2. Read this document fully.
3. Recheck current runtime/API facts:
   - `/runtime/data-health`
   - `/watchlist`
   - current selected ticker route if present
   - recent surge settings/state
4. Recheck current UI by Browser/Computer Use if dev server is running.
5. Write a short current-state note in the working summary before changing code.

### Phase 1 - Realtime Surge Calibration

1. Add or update focused tests for:
   - `toss-fast-quote` accepted as momentum input.
   - normal `rest` rejected as momentum input.
   - threshold `3%` blocks under-threshold movement.
   - raw update toasts suppressed.
2. Add a lightweight local probe or report if current tools need one.
3. Observe runtime counters without triggering live mutation.
4. If market is closed, verify logic through deterministic tests and mark live
   sensitivity as pending market-window observation.

### Phase 2 - Chart Candle Progression

1. Trace `price-update` flow from SSE to chart state.
2. Identify whether mini/full charts consume:
   - stored candle arrays only,
   - live price marker only,
   - current bucket OHLC updates,
   - or a mixture.
3. Implement the minimal current-candle update path using real price samples.
4. Ensure no candle is created for invalid/no-price/no-time samples.
5. Ensure non-trading gaps are skipped/hidden rather than filled.
6. Add focused chart/candle tests.
7. Verify mini and full chart visually.

### Phase 3 - Toss Watchlist Sync Foundation

1. Reconfirm `/watchlist` normalized read model.
2. Reconfirm local favorites fallback semantics.
3. Make star/unstar product-aware:
   - Toss eligible and session ready -> sync intent.
   - no Toss session -> local fallback or sync pending.
   - Toss-only unsupported in current UI -> no six-digit route.
4. Harden disabled-by-default live mutation gate.
5. Add mocked tests for Toss add/remove route/client shape.
6. Add UI states for:
   - Toss synced
   - sync pending
   - sync unavailable
   - local only
7. Do not run live add/remove. Stop for user GO if needed.

### Phase 4 - Integrated Browser QA

Use real browser/Computer Use visual QA.

Required:

- Home loads without visible jank.
- TOP100 still refreshes.
- `최근 급상승` state is understandable.
- No under-threshold alert spam.
- No raw KIS/Toss update toast spam.
- Mini chart progresses or honestly shows no live samples.
- Full chart progresses or honestly shows no live samples.
- Favorites/watchlist state is clear.
- Search/add no longer leaks 400 Bad Request to the user.
- Bottom status bar remains visible and aligned.
- No raw secrets visible.

Viewports:

- 1600x1000
- 1440x900
- one narrower desktop/Electron-like width if feasible.

## 6. Verification

Run focused tests for changed areas first.

Required before completion:

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

For sensitive changes, run tracked-file secret grep. Interpret variable-name
matches carefully; raw secret-like values must not appear.

Suggested grep:

```bash
git grep -nE "(SESSION|UTK|LTK|FTK|approval_key|appkey|appsecret|access[_-]?token|Bearer)[[:space:]]*[:=][[:space:]]*['\"]?[A-Za-z0-9_./+=-]{24,}" -- src docs scripts AGENTS.md SECURITY.md .env.example || true
```

## 7. Completion Criteria

Complete only when all are true:

1. Realtime surge calibration has documented current behavior.
2. `toss-fast-quote` and `ws-integrated` are valid recent surge inputs.
3. Normal `rest` quote refresh is not a realtime surge input.
4. Threshold `3%` blocks under-threshold alerts.
5. Raw update toast noise remains blocked.
6. Mini chart current price/candle progression works from real samples, or a
   precise blocker is documented.
7. Full chart current price/candle progression works from real samples, or a
   precise blocker is documented.
8. No fake candle or fake movement is introduced.
9. Toss watchlist remains the primary intended `즐겨찾기` source.
10. Local favorites remain fallback/cache, not primary normal UI truth.
11. Star/unstar path is product-aware.
12. Toss-only products do not go through KIS/six-digit-only routes.
13. Live Toss watchlist mutation remains gated and was not executed.
14. Search/add failures are user-readable and do not expose raw 400 internals.
15. UI copy avoids legacy `내 목록`/`등록됨`/`폴링`/`KIS WS` in normal flows.
16. Required tests/typecheck/build/diff-check/no-live soak pass.
17. Browser/Computer Use QA passes on at least two desktop viewports.
18. No raw Toss/KIS/session/account/order/watchlist values are exposed.

## 8. Final Summary Shape

When closing this goal, report:

- what was observed in realtime surge,
- what chart progression path was fixed or blocked,
- what watchlist sync foundation changed,
- exact safety boundary for live Toss watchlist mutation,
- tests and browser QA results,
- remaining market-window observation if market was closed.
