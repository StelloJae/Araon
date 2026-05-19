# Araon Product Identity / Quote Key / Chart Key Refactor Goal

Date: 2026-05-18
Status: Execution brief
Repo: `/Users/stello/korean-stock-follower`

This document is the authoritative execution brief for separating Araon's
product identity, quote key, chart key, and sparkline/history key model.

The immediate user-visible bug is that some favorite rows, for example
`298380` and `372320`, show a real price and percent change but no sparkline.
This is not a simple CSS problem. It is a data-identity problem: row price,
fast quote, chart candle, and sparkline history are currently routed through
overlapping but not fully equivalent keys.

## 0. Goal

Araon must represent every security with a stable product identity, then derive
provider-specific keys from that identity.

The result should be:

- Toss watchlist/holdings/search/TOP100 rows can be displayed without losing
  identity.
- KR eligible products can use Toss quote, Toss chart candles, local candle
  cache, and optional KIS realtime tracking without key mismatch.
- Toss-only or US products never get sent to KR-only/KIS-only routes.
- Favorites/holdings rows consistently show price, direction, percent change,
  and sparkline when real historical or live samples exist.
- Sparkline seed can come from Toss 1m candles when live price-history is empty.
- No synthetic financial data is introduced.

## 1. Current Evidence

### 1.1 Sparkline bug found on 2026-05-18

Observed UI:

- `298380` / ABL Bio showed price and negative percent change but no sparkline.
- `372320` / Curocell showed price and negative percent change but no sparkline.
- US products such as Tesla and AMD could show sparse sparklines after session
  price updates.

Runtime/API evidence:

- `/stocks/298380/price-history?range=1d` returned zero points.
- `/stocks/372320/price-history?range=1d` returned zero points.
- `/stocks/277810/price-history?range=1d` returned thousands of points.
- `/stocks/005930/price-history?range=1d` returned thousands of points.
- `/runtime/data-health` showed Toss fast quote lane running at 100ms, but the
  latest cycle had `acceptedCount=0` and `no_changed_prices`.
- Direct Toss c-chart probing for `A298380` and `A372320` returned 1m candle
  rows, so Toss historical seed is available for these KR products.

### 1.2 Why price can exist while sparkline is empty

Current UI path:

- `src/server/watchlist/araon-watchlist-service.ts`
  - Toss watchlist item maps `item.last` and `item.base` into row `last` and
    `changePct`.
  - This can make the row show price and percent immediately.
- `src/client/components/FavoritesBlock.tsx`
  - Watchlist-only rows derive `quoteKey = item.krTicker ?? item.productCode`.
  - Sparkline reads `selectSparklineHistory(state, quoteKey)`.
  - Sparkline renders only when `history.length >= 2`.
- `src/client/hooks/usePersistedPriceHistory.ts`
  - Hydrates from `/stocks/:ticker/price-history?range=1d`.
- `src/server/routes/stocks.ts`
  - `/stocks/:ticker/price-history` currently accepts only six-digit KR tickers.
- `src/server/price/price-history-recorder.ts`
  - Records only real `price-update` events.
  - Snapshots are ignored.
- `src/server/toss/toss-fast-quote-lane.ts`
  - Unchanged prices are deduped before `priceStore.setPrice`.
  - If a row has no existing history and the market is quiet, no new history
    point may be created for a long time.

Therefore:

- Watchlist payload price can make the row look hydrated.
- Sparkline can remain empty because no price-history points exist.
- The UI is honest, but the product experience is incomplete.

## 2. Non-Negotiable Safety Rules

1. Do not create fake price movement.
2. Do not create synthetic candles to fill gaps.
3. Do not permanently store raw ticks without explicit approval.
4. Do not expose raw Toss session/cookie/account/order/watchlist payloads.
5. Do not expose KIS app keys, app secrets, approval keys, access tokens, or raw
   WebSocket frames.
6. Do not perform actual order, cancel, amend, or account mutation.
7. Do not perform broad destructive Toss watchlist cleanup.
8. Preserve the existing dirty worktree. Do not revert user or prior-agent work.
9. KIS remains optional `실시간 추적`; it must not become the source of truth for
   account, watchlist, TOP100, chart history, or normal quote hydration.

## 3. Target Identity Model

Araon needs one canonical identity object and several derived keys.

### 3.1 Product Identity

`ProductIdentity` is the canonical product description.

Required fields:

| Field | Meaning |
|---|---|
| `productCode` | Toss canonical product code. KR examples are `A005930`; US/Toss-only products may be non-six-digit strings. |
| `krTicker` | Six-digit KRX ticker, or `null` when not a KR eligible product. |
| `symbol` | User-facing/search-facing symbol. For KR, usually six-digit; for non-KR, may be provider symbol or productCode. |
| `name` | Display name, sanitized and user-facing. |
| `market` | `KOSPI`, `KOSDAQ`, `US`, `TOSS_ONLY`, or `UNKNOWN`. |
| `currency` | `KRW`, `USD`, or `UNKNOWN`. |
| `tossEligible` | Can be handled by Toss product APIs. |
| `kisEligible` | Can be sent to KIS realtime tracking. Must require `krTicker !== null`. |
| `quoteEligible` | Can use Toss quote lane. |
| `chartEligible` | Has a known chart/candle route. KR c-chart should be true when Toss minute/daily route is known. |
| `identitySource` | `toss`, `account`, `watchlist`, `search`, `top100`, `local`, or `kis-legacy`. |

Current file to extend:

- `src/shared/product-identity.ts`

### 3.2 Quote Key

`quoteKey` is the key used by `PriceStore`, SSE `price-update`, fast quote lane,
and client price-history append.

Rules:

- KR eligible product:
  - primary quote key: `krTicker`
  - alias: Toss `productCode`
  - the system may accept either inbound key, but it should normalize to
    `krTicker` before writing to `PriceStore`.
- Toss-only or US product:
  - primary quote key: normalized Toss `productCode`
  - never convert to six-digit
  - never send to KIS
- Search result:
  - action should carry full identity, not just a display code.

Files likely involved:

- `src/server/toss/toss-fast-quote-lane.ts`
- `src/server/toss/toss-quote-polling-service.ts`
- `src/server/watchlist/araon-watchlist-service.ts`
- `src/client/stores/price-history-store.ts`
- `src/client/hooks/useSSE.ts`
- `src/client/components/FavoritesBlock.tsx`

### 3.3 Chart Key

`chartKey` is not the same as `quoteKey`.

Rules:

- KR eligible product:
  - Toss c-chart route uses product code form: `A` + six-digit ticker.
  - local candle cache can be keyed by `krTicker`, but the identity must preserve
    which provider key was used to fetch it.
- Toss-only or US product:
  - do not call KR-only routes.
  - if Toss has a verified non-KR c-chart route, represent it explicitly as
    `provider='toss'`, `market='US'` or `TOSS_ONLY`, `productCode=<...>`.
  - until verified, show `지원 대기` or `Toss 전용`, not a broken chart request.
- KIS chart/backfill:
  - legacy/manual fallback only.
  - not default product path.

Files likely involved:

- `src/server/toss/toss-minute-chart.ts`
- `src/server/toss/toss-daily-chart.ts`
- `src/server/routes/stocks.ts`
- `src/server/chart/`
- `src/client/components/StockCandleChart.tsx`
- `src/client/lib/api-client.ts`

### 3.4 Sparkline / History Key

`sparklineKey` is the key used by the client store to render row-level history.
It should normally equal the normalized `quoteKey`, but it needs seed sources:

1. persisted price-history points;
2. Toss 1m candle seed for KR chart-eligible products;
3. live Toss fast quote / KIS WS accepted samples;
4. optional in-memory current-minute overlay.

Important:

- One current price point is not enough to draw a sparkline.
- If no real history exists, use Toss 1m candle closes as a real seed.
- If Toss 1m candle fetch fails, show no sparkline and a compact transient state
  only if needed.
- Do not draw a flat fake line from a single price.

Files likely involved:

- `src/client/hooks/usePersistedPriceHistory.ts`
- `src/client/stores/price-history-store.ts`
- `src/client/components/FavoritesBlock.tsx`
- `src/server/routes/stocks.ts`
- `src/server/toss/toss-minute-chart.ts`
- `src/server/db/repositories.ts`

## 4. Target Product Behavior

### 4.1 Favorites / holdings rows

For KR eligible favorites/holdings:

- row shows name;
- row shows six-digit ticker;
- row shows price;
- row shows signed percent change;
- row shows sparkline once real history seed exists;
- row click changes selected chart;
- star state is consistent with Toss watchlist/holding/local provenance.

For Toss-only or US rows:

- row shows name;
- row shows product code or meaningful symbol;
- row shows Toss quote if supported;
- row shows sparkline only after verified Toss chart/history or live samples;
- row does not show KIS state;
- row does not call KR-only endpoints.

### 4.2 Sparkline seed behavior

When a favorite row has price but no sparkline:

1. Check client memory `price-history-store`.
2. If empty, fetch persisted `/stocks/:ticker/price-history` when the product has
   a six-digit `krTicker`.
3. If persisted history is empty and the product is KR chart-eligible, fetch
   Toss 1m candles and seed sparkline from candle closes.
4. Continue overlaying live quote samples from SSE.
5. Keep a 24h visible sparkline window, but do not fake overnight gaps.

### 4.3 Chart behavior

Selected chart:

- historical candles come from Toss primary route;
- local DB is cache, not fake truth;
- current candle progresses from real live quote samples;
- minute-boundary reconciliation can refetch Toss candle data;
- full chart and mini chart use the same identity model.

### 4.4 Bottom bar and diagnostics

Product UI should not expose raw internal key/cap details.

Keep normal bottom bar user-facing:

- market tape;
- favorite count;
- quick price status;
- last update time;
- settings.

Move detailed identity/quote/chart diagnostics to settings/dev diagnostics:

- candidate count;
- requested/returned;
- accepted/unchanged;
- quote key;
- chart key;
- provider route;
- KIS eligible count.

## 5. Implementation Phases

### Phase 0: Baseline audit

Purpose: freeze the current bug evidence before changing behavior.

Tasks:

1. Check `git status --short` and do not revert existing changes.
2. Read this document fully.
3. Inspect:
   - `src/shared/product-identity.ts`
   - `src/server/watchlist/araon-watchlist-service.ts`
   - `src/server/toss/toss-fast-quote-lane.ts`
   - `src/server/routes/stocks.ts`
   - `src/client/components/FavoritesBlock.tsx`
   - `src/client/hooks/usePersistedPriceHistory.ts`
   - `src/client/stores/price-history-store.ts`
4. Confirm the current failure with a no-secret probe:
   - `298380` and `372320` have row price/change but no price-history.
   - Toss c-chart can return real 1m rows for `A298380` and `A372320`.
5. Record the sanitized evidence in the completion audit.

Do not log raw Toss session/account/watchlist payloads.

### Phase 1: Centralize key derivation

Create or extend shared helpers so all call sites derive keys consistently.

Recommended file:

- `src/shared/product-identity.ts`

Add explicit helpers such as:

- `deriveProductIdentity(input)`
- `quoteKeyForIdentity(identity)`
- `quoteAliasesForIdentity(identity)`
- `chartKeyForIdentity(identity)`
- `sparklineKeyForIdentity(identity)`
- `isKrChartEligible(identity)`
- `isTossOnlyIdentity(identity)`

Constraints:

- KR products normalize to `krTicker` for quote/history store writes.
- KR products retain `productCode` for Toss c-chart fetches.
- Toss-only/US products never enter KIS or six-digit-only routes.
- Helpers must not infer fake market support from product-code shape alone when
  a better source is available.

Tests:

- `src/shared/__tests__/product-identity.test.ts` or existing equivalent.

Required cases:

1. `A298380` -> productCode `A298380`, krTicker `298380`, quoteKey `298380`,
   Toss chart key `A298380`, kisEligible true.
2. `298380` -> same as above.
3. `US20100629001` -> productCode unchanged, krTicker null, quoteKey
   `US20100629001`, KIS false, KR chart false.
4. unknown Toss-only product -> no six-digit fallback.
5. local favorite six-digit -> Toss productCode `Axxxxxx`, quote key six-digit.

### Phase 2: Make watchlist service identity-first

Refactor watchlist mapping to preserve identity, not just display fields.

Files:

- `src/server/watchlist/araon-watchlist-service.ts`
- `src/server/watchlist/__tests__/araon-watchlist-service.test.ts`
- `src/shared/types.ts`

Required behavior:

- Toss watchlist items expose productCode, krTicker, quoteKey/chart support, and
  membership provenance.
- Holding-derived rows merge with Toss watchlist rows without losing quote/chart
  eligibility.
- Local fallback rows become identity-aware and never pretend to be Toss synced.
- UI-facing row can show compact status, but backend model preserves exact cause.

Tests:

- Toss KR watchlist item maps to identity with quote/chart support.
- Toss US item maps to Toss-only quote support and KIS false.
- Holding + Toss watchlist merge preserves manual watchlist membership.
- Local favorite fallback uses six-digit KR identity.

### Phase 3: Normalize fast quote writes and aliases

Files:

- `src/server/toss/toss-fast-quote-lane.ts`
- `src/server/toss/__tests__/toss-fast-quote-lane.test.ts`
- `src/server/toss/toss-quote-polling-service.ts`
- `src/server/app.ts`

Required behavior:

- Candidate collection accepts full identity where possible.
- Provider requests use product codes when Toss needs product codes.
- Accepted KR prices write to `PriceStore` under six-digit quote key.
- ProductCode aliases can hydrate watchlist rows.
- Toss-only prices write under productCode.
- Unchanged dedupe should not prevent initial seed visibility forever.

Special rule:

- Do not emit fake `price-update` events for snapshots.
- It is acceptable to force-accept the first real quote sample per quote key so
  history can start, even if it is unchanged relative to a watchlist payload.

Tests:

- First real quote for a never-seen KR ticker calls `priceStore.setPrice`.
- Subsequent unchanged quote is deduped.
- Toss-only product is not normalized to six-digit.
- Stale response guard still works.

### Phase 4: Add Toss candle seed for KR sparkline

This is the direct fix for rows like `298380` and `372320`.

Files:

- `src/server/routes/stocks.ts`
- `src/server/toss/toss-minute-chart.ts`
- `src/server/db/repositories.ts`
- `src/client/hooks/usePersistedPriceHistory.ts`
- `src/client/stores/price-history-store.ts`
- `src/client/components/FavoritesBlock.tsx`
- focused tests under matching `__tests__`.

Design options:

Option A, preferred:

- Extend `/stocks/:ticker/price-history` for KR tickers so that when persisted
  price-history is empty and `includeCandleSeed=true`, it can return real Toss
  1m candle closes as seed items with source `toss-time-today` or
  `toss-time-daily`.

Option B:

- Add a separate endpoint, for example `/stocks/:ticker/sparkline-seed`, that
  returns only real seed points from persisted history or Toss candles.

Rules:

- Default endpoint must stay safe for tests/no-live mode.
- Do not call Toss on clean no-session/no-network startup unless the UI asks for
  a visible row's sparkline seed.
- Add concurrency/rate guard for seed fetches.
- Cache successful seed in DB where appropriate as compressed candle/history,
  not raw tick frames.
- If Toss seed fails, return empty seed without throwing a user-visible 500.

Tests:

- Empty price-history plus Toss candle rows returns seed points.
- Seed points preserve real timestamps and close prices.
- Invalid non-KR product does not call KR c-chart.
- One-point seed does not render sparkline.
- No fake flat line is produced.

### Phase 5: Make client sparkline hydration identity-aware

Files:

- `src/client/components/FavoritesBlock.tsx`
- `src/client/hooks/usePersistedPriceHistory.ts`
- `src/client/lib/api-client.ts`
- `src/client/stores/price-history-store.ts`
- `src/client/components/__tests__/favorites-block.test.ts`
- `src/client/stores/__tests__/price-history-store.test.ts`

Required behavior:

- Favorites row passes product identity or derived keys to hydration.
- KR rows fetch sparkline seed by `krTicker`.
- Toss-only/US rows do not call six-digit-only price-history route.
- Hydration queue stays bounded.
- Sparkline appears after seed with 2+ real points.
- Price and percent display remain independent from sparkline availability.

Tests:

- `298380`-like row with real seed renders sparkline.
- `372320`-like row with empty persisted history but Toss candle seed renders
  sparkline.
- Toss-only row does not call `/stocks/US.../price-history` if unsupported.
- Hydration failures do not blank price/change.

### Phase 6: Align chart route with product identity

Files:

- `src/server/routes/stocks.ts`
- `src/client/components/StockCandleChart.tsx`
- `src/client/lib/api-client.ts`
- `src/server/routes/__tests__/candles.test.ts`
- `src/client/components/__tests__/stock-candle-chart.test.ts`

Required behavior:

- Mini chart, full chart, and row sparkline derive chart support from the same
  identity model.
- KR chart requests can use six-digit UI ticker but internally know Toss
  productCode `Axxxxxx`.
- Toss-only/US chart requests are blocked with product-safe status until a real
  Toss chart route is verified.
- Chart cache key should not collide across KR `005930` and any non-KR product.

Tests:

- KR chart request maps to Toss c-chart productCode.
- Unsupported product returns clear support status, not 400 Bad Request in UI.
- Current candle overlay still accepts live quote samples by quote key.

### Phase 7: UI cleanup and diagnostics

Files:

- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/StatusBar.tsx`
- `src/client/components/SettingsModal.tsx`
- `src/client/styles/global.css`

Required behavior:

- Normal UI avoids internal phrases such as `quoteKey`, `chartKey`, `KIS WS`,
  `fallback`, `polling`, `등록됨`.
- Favorites header should not claim `추적 10/16` in a way that implies a broken
  row when real Toss quote is working.
- Product diagnostics can show key information only inside dev/diagnostics
  surfaces, redacted and user-safe.
- Text size and row density follow `docs/design.md`.

### Phase 8: Completion audit

Create:

- `docs/research/araon-product-identity-quote-chart-key-refactor-completion-audit.md`

Audit must include:

- before/after for `298380` and `372320`;
- whether sparkline seed is from persisted history, Toss 1m candle, or live
  samples;
- quote key and chart key shown only as sanitized labels;
- no raw payloads;
- test commands and results;
- browser visual QA result.

## 6. Required Verification

Run at minimum:

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

For package-impacting changes, also run:

```bash
npm pack --dry-run --json
```

For security-sensitive changes, run a tracked-file secret grep before final
reporting.

Suggested focused tests:

```bash
npm test -- src/server/toss/__tests__/toss-fast-quote-lane.test.ts
npm test -- src/server/watchlist/__tests__/araon-watchlist-service.test.ts
npm test -- src/server/routes/__tests__/candles.test.ts
npm test -- src/client/components/__tests__/favorites-block.test.ts
npm test -- src/client/stores/__tests__/price-history-store.test.ts
```

Browser QA:

- Open the running Araon app.
- Confirm `298380` and `372320` favorite rows show sparkline after seed.
- Confirm price, direction, and percent still render.
- Confirm unsupported Toss-only rows do not show broken KR route states.
- Confirm row click still changes selected chart.
- Confirm no raw Toss/KIS/session/account/order/watchlist values appear in UI or
  console.

## 7. Acceptance Criteria

The goal is complete only when all criteria pass:

1. Product identity helper has explicit productCode/krTicker/symbol/market
   semantics.
2. Quote key derivation is centralized and tested.
3. Chart key derivation is centralized and tested.
4. Sparkline/history key derivation is centralized or directly derived from
   quote key with documented exceptions.
5. KR products write quote updates under six-digit quote key.
6. KR products keep Toss productCode for c-chart fetches.
7. Toss-only/US products never enter KIS or KR-only chart/history routes.
8. Watchlist/holdings/local favorites use the same identity model.
9. `298380` and `372320` no longer remain without sparkline when Toss 1m candle
   seed is available.
10. A row with price but missing percent/direction is not a steady-state KR
    favorite UI.
11. First real quote sample for a never-seen quote key can seed history.
12. Unchanged quote dedupe still prevents render/event spam after first seed.
13. No fake sparkline or flat synthetic movement is generated.
14. Mini/full chart still render real candle data.
15. Current candle overlay still uses real samples only.
16. No broad full-market 0.1s polling is introduced.
17. KIS remains optional `실시간 추적` only.
18. Normal UI no longer leaks internal key/cap/debug vocabulary.
19. Focused tests pass.
20. Full `npm test`, `typecheck`, `build`, and `git diff --check` pass.
21. Browser QA confirms the original sparkline bug is fixed.
22. Completion audit is written.

## 8. Known Risks

1. Toss non-KR chart endpoint is not yet verified.
   - Do not guess a route for US/Toss-only products.
2. For quiet after-hours prices, live quote samples may not create visible
   movement.
   - Use real Toss candle seed for sparkline shape.
3. Persisting every 100ms quote sample would be too noisy.
   - Keep compressed history/candle points, not raw tick storage.
4. Existing dirty worktree is large.
   - Keep changes scoped and do not clean unrelated files.
5. UI may still look hydrated because row price exists.
   - Tests must assert sparkline/history separately from row price.

## 9. Out of Scope

- npm publish.
- GitHub Release.
- live order execution.
- auto-buy or auto-sell.
- broad Toss watchlist cleanup.
- permanent raw tick database.
- speculative non-KR chart route implementation without evidence.
