# Toss Fast Quote Surge Lane Goal

Date: 2026-05-15

This document is the authoritative execution brief for adding a bounded Toss
fast quote lane to Araon so `최근 급상승` can use Toss-derived near-real-time
price updates, not only KIS WebSocket ticks.

This is not a live-trading approval. It does not authorize placing, cancelling,
or amending real orders. It does not authorize Toss account mutation or Toss
watchlist mutation. It only covers read-only public market-data refresh and UI
state derived from that refresh.

## 1. Problem

Current Araon has a mismatch:

- Toss TOP100/ranking can refresh at about 0.5 seconds.
- The `최근 급상승` feed does not reliably use those Toss ranking rows as price
  momentum input.
- The current realtime momentum gate only accepts `price-update` events whose
  source is `ws-integrated` and whose `isSnapshot` is `false`.
- When KIS WebSocket has no parsed/applied tick, or when the ticker is outside
  the KIS 40-slot set, `최근 급상승` can stay empty even while Toss TOP100 shows
  rapidly rising names.

The user goal is:

> If Toss ranking can refresh around 0.5 seconds, use Toss quote refresh around
> 0.5 seconds for the relevant hot tickers too, then feed that into recent surge
> detection.

## 2. Key Decision

Implement a bounded Toss fast quote lane.

This lane is not a true exchange tick stream. It is a REST quote-batch refresh
that produces realtime-like price samples for a small, high-value candidate set.
Call it `Toss fast quote`, `Toss fast refresh`, or internally
`toss-fast-quote`. Do not call it WebSocket or guaranteed tick data.

Do not lower every existing quote/polling path to 500ms.

Create or adapt a dedicated hot lane with:

- bounded candidate count,
- single in-flight request,
- stale response detection,
- unchanged-price dedupe,
- 429/5xx backoff,
- no full-market polling,
- no synthetic price or candle generation.

## 3. Existing Code Facts

These facts should be rechecked before implementation because the worktree is
active and may drift.

### Toss quote-batch already exists

- `src/server/toss/toss-public-client.ts`
  - `fetchTossQuoteBatch()` maps Toss product stock prices into `Price`.
  - Current mapped price uses `isSnapshot: false` and `source: 'rest'`.
- `src/server/toss/toss-public-market-data-provider.ts`
  - Provider exposes `getQuoteBatch()`.
  - Provider capabilities include `quote-batch`.
- `src/server/routes/market.ts`
  - `GET /market/toss/quotes?tickers=...` exists and calls Toss quote batch.
- `tossinvest-cli/docs/reverse-engineering/rpc-catalog.md`
  - Documents `GET /api/v1/product/stock-prices?meta=true&productCodes=...`
    as the public bulk price lookup used by quote/watchlist.

### Toss quote polling already exists but is not enough

- `src/server/toss/toss-quote-polling-service.ts`
  - Existing service polls `stockRepo.findAll()`.
  - It writes usable prices into `priceStore`.
  - It is broad tracked-list polling, not a dedicated hot candidate lane.
- `src/server/settings-store.ts`
  - `tossQuotePollingIntervalMs` currently has min `1000` and default `3000`.
  - This should not simply be dropped to 500 for all tracked stocks.

### Recent surge currently ignores Toss REST quotes

- `src/client/lib/realtime-momentum-feed.ts`
  - `shouldProcessRealtimeMomentumPrice()` currently requires
    `price.source === 'ws-integrated'`.
  - Toss quote-batch prices currently use `source: 'rest'`.
  - Result: Toss REST quote updates can update visible price/history, but they
    are not automatically valid inputs for realtime momentum surge.

## 4. Source Semantics

Introduce explicit source semantics instead of overloading `rest`.

Preferred internal model:

```ts
type PriceSource =
  | 'rest'
  | 'ws-krx'
  | 'ws-integrated'
  | 'ws-nxt'
  | 'toss-fast-quote';
```

Rules:

- `rest`: normal REST quote refresh; not necessarily realtime-like.
- `toss-fast-quote`: bounded 0.5s Toss quote-batch hot lane.
- `ws-integrated`: KIS WebSocket normalized live tick.
- `isSnapshot=false` is still required.
- Momentum logic may accept `toss-fast-quote` only when the fast-lane freshness
  guards pass.

If the codebase prefers avoiding a new `PriceSource`, use an explicit metadata
or lane flag, but do not silently treat all `rest` prices as realtime momentum
input. That would create false surge signals from slow/manual REST refresh.

## 5. Candidate Set

The fast quote lane must not poll the whole market.

Build a `HotQuoteCandidateSet` from these sources:

1. Toss TOP100 gainers top N.
2. Toss TOP100 losers top N only if needed for movement/alert context.
3. Toss realtime ranking rows that have large rank delta or recent entry.
4. Toss watchlist / Araon favorites.
5. Current selected ticker / mini chart ticker.
6. Full Chart ticker when expanded.
7. Agent candidates / order-intent candidates.
8. KIS realtime-tracked tickers, as reconciliation companions.

Default candidate caps:

- Target cap: 40 tickers.
- Hard cap: 60 tickers.
- Batch size: 50.
- Interval: 500ms.
- Never exceed 100 without a separate explicit plan and measurement.

Priority:

1. current selected/full chart ticker
2. Toss watchlist/favorites
3. agent candidates
4. TOP100 gainers
5. TOP100 losers/realtime ranking
6. KIS tracked companions

Deduplicate by normalized Toss product code and six-digit KRX ticker mapping.
Do not send Toss-only unsupported product codes into KIS.

## 6. Fast Lane Runtime Rules

The lane should behave like this:

1. Every 500ms, collect candidate set.
2. If previous request is still in flight, skip this tick.
3. If candidate set is empty, do nothing.
4. Call Toss quote-batch for the bounded candidates.
5. Mark resulting prices as fast-lane prices.
6. Drop unusable prices:
   - non-finite price,
   - price <= 0,
   - malformed ticker/product identity,
   - stale provider timestamp if one is available and clearly stale.
7. Deduplicate unchanged values if the same ticker has identical price, volume,
   and effective timestamp within the dedupe window.
8. Write accepted prices to `priceStore`.
9. Let existing SSE `price-update` flow broadcast bounded updates.
10. Feed accepted fast-lane prices into recent surge evaluation.

Backoff:

- On 429: pause fast lane for at least 5 seconds, then resume at 1000ms.
- On repeated 5xx/network failures: exponential backoff up to 5000ms.
- On success after backoff: return gradually to 500ms.
- If UI becomes visibly laggy, increase interval before increasing candidate
  count.

SSE / UI storm guards:

- Respect existing per-ticker SSE throttle.
- Avoid emitting price-update when accepted price did not change.
- Keep per-cycle update count bounded.
- Do not create toast alerts for every raw fast-lane update.
- Recent surge alerts must still pass the configured threshold and cooldown.

## 7. Recent Surge Semantics

`최근 급상승` should combine two signal classes:

### Price momentum

Sources:

- KIS `ws-integrated` ticks.
- Toss `toss-fast-quote` samples.

Meaning:

- Price moved enough inside the configured 10/20/30s window.
- This is closest to the user's "실시간 급상승" expectation.

### Ranking movement

Sources:

- Toss TOP100/ranking refresh.

Meaning:

- A ticker entered TOP100, rose sharply in rank, or is newly prominent in the
  provider ranking.
- This is not the same as price momentum and should be labeled differently if
  shown.

Implementation should avoid mixing these silently. UI can show:

- `가격 급등`
- `랭킹 급상승`
- `실시간 추적`
- `Toss 가격`

Avoid low-value toasts like `KIS WS tick 가격 업데이트 감지`. Raw tick/update
messages are noise. Only user-meaningful threshold-crossing events should alert.

## 8. Chart And Sparkline Interaction

Fast quote samples may update:

- current visible price,
- currently forming mini/full chart candle,
- favorites/watchlist sparkline points,
- recent surge momentum buffers.

They must not:

- synthesize missing historical candles,
- fill non-trading gaps with fake data,
- persist raw upstream payloads,
- create fake movement when price is unchanged.

Mini chart default should remain current trading day. Full chart may offer
broader ranges, but non-trading empty gaps should not dominate the visible view.

## 9. Settings And Diagnostics

Expose sanitized runtime status only:

```ts
interface TossFastQuoteLaneStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  candidateCount: number;
  requestedCount: number;
  returnedCount: number;
  acceptedCount: number;
  droppedUnchangedCount: number;
  droppedStaleCount: number;
  skippedInFlightCount: number;
  failureCount: number;
  backoffUntil: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastMessage: string | null;
}
```

Do not expose:

- Toss raw response,
- session/cookie/storage values,
- account identifiers,
- order identifiers,
- raw KIS frames,
- raw provider payloads.

User-facing copy:

- Prefer `Toss 가격 갱신`.
- Prefer `실시간 추적` for KIS fast overlay.
- Avoid `폴링40`, `KIS WS`, `등록됨`, `tracked`, `fallback` in normal UI.

## 10. Implementation Order

### Phase 0 - Audit current inputs

- Confirm current TOP100 refresh path and cache TTL.
- Confirm current Toss quote polling service interval and batch behavior.
- Confirm current recent surge input gate.
- Confirm whether priceStore already emits Toss quote-batch updates through SSE.
- Confirm whether chart/sparkline stores consume `price-update` from Toss REST.

Output:

- Short notes in the implementation summary.
- No behavioral change yet.

### Phase 1 - Add fast-lane source contract

- Add a safe source or lane indicator for `toss-fast-quote`.
- Add tests proving normal `rest` does not become momentum input.
- Add tests proving `toss-fast-quote` can become momentum input when fresh and
  non-snapshot.

### Phase 2 - Build bounded candidate set

- Create a small candidate collector from TOP100, watchlist/favorites, selected
  ticker, chart expansion state where available, agent candidates, and KIS slot
  state where already exposed.
- Keep hard cap.
- Add deterministic priority tests.
- Ensure Toss-only products never enter KIS, and KIS-only paths are not invoked.

### Phase 3 - Implement fast quote lane

- Implement server-side service or adapt existing Toss quote polling with a
  separate hot lane.
- Do not just lower `tossQuotePollingIntervalMs` globally.
- Add single in-flight guard.
- Add dedupe.
- Add backoff.
- Add sanitized runtime status.

### Phase 4 - Wire recent surge

- Allow recent surge evaluation to accept fast-lane prices.
- Keep threshold/cooldown behavior.
- Prevent raw update toasts.
- Add tests for:
  - price movement crosses threshold,
  - movement under threshold does not alert,
  - setting threshold 3% blocks 0.x/1.x/2.x signals,
  - ranking movement and price momentum remain distinguishable.

### Phase 5 - UI polish and QA

- Show clear source/state in diagnostics if useful.
- Do not add noisy visible labels to every row.
- Verify `최근 급상승` receives real fast-lane candidates when TOP100 rows move.
- Verify UI does not lag.
- Verify mini/full chart still resizes and avoids scroll regressions.

## 11. Tests

Focused tests should cover:

- candidate prioritization and cap,
- quote-batch called with bounded candidate set,
- in-flight skip,
- unchanged-price dedupe,
- 429 backoff,
- 5xx/network backoff,
- sanitized runtime status,
- `shouldProcessRealtimeMomentumPrice()` accepts `toss-fast-quote` but not
  normal `rest`,
- surge threshold respects user setting,
- no raw update toast spam,
- no Toss-only product sent to KIS.

Run at least:

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

For security-sensitive changes:

```bash
git grep -nE "(SESSION|UTK|LTK|FTK|appSecret|appKey|approval_key|accountNumber)" -- ':!package-lock.json'
```

Interpret grep carefully. Existing safe variable names may match; raw secret
values must not.

## 12. Browser QA

Use real browser/Computer Use visual QA after implementation.

Required observations:

- Home loads without visible jank.
- TOP100 still refreshes.
- `최근 급상승` can receive Toss fast quote-derived price momentum.
- Threshold setting blocks under-threshold alerts.
- KIS raw update toasts do not appear.
- Favorites/watchlist sparkline does not overlap row copy.
- Mini chart and full chart still resize without scroll regressions.
- Dark/light bottom bar remains correct.

Recommended viewports:

- 1920x1080
- 1600x1000
- 1440x900
- about 900px width

## 13. Acceptance Criteria

Complete only when all are true:

1. Toss fast quote lane exists and is separate from broad quote polling.
2. Default fast quote interval is 500ms.
3. Candidate set is bounded and prioritized.
4. No full-market 500ms polling exists.
5. Single in-flight guard prevents request pileups.
6. 429/5xx backoff exists.
7. Normal `rest` quote refresh does not trigger realtime momentum by itself.
8. `toss-fast-quote` can trigger recent surge when thresholds are met.
9. Under-threshold movement does not alert.
10. Ranking movement and price momentum are not silently conflated.
11. KIS WS remains optional `실시간 추적`, not the only surge input.
12. Toss-only products are never sent to KIS.
13. Raw Toss/KIS/session/account/order values are not exposed.
14. UI remains responsive during fast quote refresh.
15. Required tests/typecheck/build/diff-check/no-live soak pass.
16. Real browser QA passes on at least two desktop viewports.

## 14. Non-Goals

- No live trading.
- No Toss account mutation.
- No Toss watchlist live mutation.
- No all-market fast polling.
- No fake candles.
- No fake sparkline movement.
- No raw tick or raw upstream response persistence.
- No replacement of the locked v7 layout.

## 15. Suggested Final Summary Shape

When completing this goal, report:

- what lane was added,
- exact candidate cap and interval,
- how recent surge uses it,
- what prevents overload,
- which tests passed,
- what browser QA showed,
- any remaining provider freshness uncertainty.
