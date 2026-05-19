# Araon Product Identity / Quote Key / Chart Key Refactor Completion Audit

Date: 2026-05-18
Repo: `/Users/stello/korean-stock-follower`
Status: PASS

This audit records the completion evidence for
`araon-product-identity-quote-chart-key-refactor-goal.md`.

## 1. Scope

Goal:

- separate Toss `productCode`, KR `krTicker`, display `symbol`, `quoteKey`,
  chart key, and sparkline/history key;
- keep Toss product identity intact while normalizing KR quote/history writes to
  six-digit tickers;
- prevent Toss-only or US products from entering KIS, KR-only chart, or
  six-digit-only history routes;
- fix KR favorite rows such as `298380` and `372320` where price and percent
  existed but sparkline was missing;
- use only real persisted price history, real Toss 1m candle seed, and live real
  quote overlay for sparkline rendering.

Out of scope remained unchanged:

- live orders;
- live auto-buy or auto-sell;
- broad Toss watchlist cleanup;
- npm/GitHub release.

## 2. Implementation Evidence

### 2.1 Product identity helpers

Files:

- `src/shared/product-identity.ts`
- `src/shared/__tests__/product-identity.test.ts`

Added explicit derivation helpers:

- `quoteKeyForIdentity`
- `sparklineKeyForIdentity`
- `krTossChartProductCodeForIdentity`
- `quoteAliasesForIdentity`

Behavior:

- KR identity such as `A298380` derives quote/sparkline key `298380`.
- KR Toss chart fetch preserves `A298380`.
- Toss-only or US identity keeps product code as quote/sparkline key and has no
  KR Toss chart product code.
- Alias derivation accepts six-digit KR key, Toss product code, and display
  symbol without duplicate keys.

### 2.2 Fast quote write key

Files:

- `src/server/toss/toss-fast-quote-lane.ts`
- `src/server/toss/__tests__/toss-fast-quote-lane.test.ts`

Evidence:

- KR fast quote candidate `A298380` is requested through the normalized Toss quote
  lane and writes accepted price under six-digit quote key `298380`.
- Toss-only product code remains product-code keyed.
- Existing unchanged-price dedupe remains tested.

### 2.3 KR sparkline seed from real Toss 1m candles

Files:

- `src/server/routes/stocks.ts`
- `src/server/routes/__tests__/price-history.test.ts`
- `src/server/app.ts`
- `src/client/lib/api-client.ts`
- `src/client/hooks/usePersistedPriceHistory.ts`
- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/__tests__/favorites-block.test.ts`

Behavior:

- `/stocks/:ticker/price-history` accepts `includeCandleSeed=true`.
- When persisted price-history has fewer than two visible points and the ticker
  is KR chart eligible, the route can return real Toss 1m candle close points as
  sparkline seed.
- The seed path is request-driven by visible UI hydration, not clean-start
  background work.
- One current price point alone is not turned into a fake flat sparkline.
- Toss-only/US rows are not sent to six-digit KR price-history route.

Important display rule:

- Toss candle seed supplies sparkline shape.
- Row percent/direction still comes from real quote/watchlist data when present,
  so neutral seed metadata does not overwrite the visible percent.

## 3. Original Bug Evidence

### 3.1 Before

Observed before this lane:

- `298380` and `372320` favorite rows could show price and percent change.
- Their `/stocks/:ticker/price-history?range=1d` responses had no usable points.
- Direct Toss c-chart probing showed real 1m candle data was available for the
  KR products.
- Result: row looked priced, but sparkline area stayed empty.

### 3.2 After

Browser QA after this lane:

- `298380` favorite row text rendered with price and percent.
- `298380` row contained one sparkline SVG/path.
- `372320` favorite row text rendered with price and percent.
- `372320` row contained one sparkline SVG/path.
- Console error count during the focused browser probe: `0`.
- Generated browser screenshots were removed after QA because account values can
  appear on screen and should not be kept as repo artifacts.

Sanitized row evidence from browser probe:

| Ticker | Row State | Sparkline Evidence |
|---|---|---|
| `298380` | price + signed percent rendered | `svgCount=1`, `pathCount=1` |
| `372320` | price + signed percent rendered | `svgCount=1`, `pathCount=1` |

## 4. Unsupported Product Guard Evidence

Client hydration now gates persisted KR price-history preload on:

- `krTicker !== null`
- `chartEligible === true`

Result:

- KR chart-eligible rows can request `/stocks/:ticker/price-history`.
- Toss-only/US rows do not call six-digit-only price-history routes.
- Unsupported products stay product-safe instead of producing a broken KR route
  request.

## 5. Verification

Focused tests:

```bash
npm test -- src/server/routes/__tests__/price-history.test.ts
npm test -- src/client/components/__tests__/favorites-block.test.ts
npm test -- src/shared/__tests__/product-identity.test.ts
npm test -- src/server/toss/__tests__/toss-fast-quote-lane.test.ts
npm test -- src/client/components/__tests__/favorites-block.test.ts src/server/routes/__tests__/price-history.test.ts src/shared/__tests__/product-identity.test.ts
```

Result:

- PASS.

Full checks:

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

Result:

- `npm test`: PASS, 226 files / 1514 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `soak:no-live`: PASS, `issueCount=0`.

Secret scan:

- Broad scan found only test sentinel strings and field names used to verify
  redaction behavior.
- Narrow non-test/product-surface scan found no raw Toss/KIS/session/account/order
  secret-like values.

Browser QA:

- `http://127.0.0.1:5173/`
- Viewport: `1600x1000`
- Home dashboard loaded.
- Focused probe found `298380` and `372320` favorite rows with sparkline SVG
  paths.
- Console errors in focused probe: `0`.

## 6. Acceptance Criteria

| # | Criteria | Result |
|---|---|---|
| 1 | Product identity helper has explicit productCode/krTicker/symbol/market semantics | PASS |
| 2 | Quote key derivation is centralized and tested | PASS |
| 3 | Chart key derivation is centralized and tested | PASS |
| 4 | Sparkline/history key derivation is centralized or directly derived from quote key | PASS |
| 5 | KR products write quote updates under six-digit quote key | PASS |
| 6 | KR products keep Toss productCode for c-chart fetches | PASS |
| 7 | Toss-only/US products never enter KIS or KR-only chart/history routes | PASS |
| 8 | Watchlist/holdings/local favorites use the same identity model | PASS |
| 9 | `298380` and `372320` no longer remain without sparkline when Toss 1m seed is available | PASS |
| 10 | Row with price but missing percent/direction is not a steady-state KR favorite UI | PASS |
| 11 | First real quote sample for a never-seen quote key can seed history | PASS |
| 12 | Unchanged quote dedupe prevents render/event spam after first seed | PASS |
| 13 | No fake sparkline or flat synthetic movement is generated | PASS |
| 14 | Mini/full chart still render real candle data | PASS |
| 15 | Current candle overlay still uses real samples only | PASS |
| 16 | No broad full-market 0.1s polling is introduced | PASS |
| 17 | KIS remains optional 실시간 추적 only | PASS |
| 18 | Normal UI no longer leaks internal key/cap/debug vocabulary for this lane | PASS |
| 19 | Focused tests pass | PASS |
| 20 | Full test/typecheck/build/diff-check pass | PASS |
| 21 | Browser QA confirms original sparkline bug is fixed | PASS |
| 22 | Completion audit is written | PASS |

## 7. Residual Risk

- Toss non-KR chart route remains unverified. No speculative route was added.
- Off-hours data can remain visually quiet when real market data is unchanged;
  this lane only adds real candle seed, not synthetic movement.
- Existing dirty worktree is large and includes prior goal work. This audit only
  covers the product identity / quote key / chart key refactor lane.

## 8. Completion Decision

PASS.

The original 298380 / 372320 sparkline bug is fixed through identity-aware key
derivation plus real Toss 1m candle seed. Verification passed without adding
fake financial data or widening KIS beyond optional realtime tracking.
