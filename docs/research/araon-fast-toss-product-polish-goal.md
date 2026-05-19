# Araon Fast Toss Product Polish Goal

Date: 2026-05-18
Status: Execution brief
Repo: `/Users/stello/korean-stock-follower`

This document is the execution brief for the next Araon product polish lane.
It assumes the larger Araon watchlist/realtime/account/agent alignment goal is
paused until market-hours verification, and it defines the next product
direction for fast Toss quote cadence, favorites/holdings hydration, chart
behavior, and bottom status bar cleanup.

## 0. Product Decision

Araon should optimize for fast, clear, real market updates.

Toss is the product source of truth for:

- account;
- holdings;
- watchlist/favorites;
- search;
- TOP100/ranking;
- quote;
- sparkline;
- chart/history;
- news/disclosure/signal surfaces when available.

KIS is optional acceleration only:

- KR eligible ticker low-latency tick assist;
- max 40 WebSocket subscriptions per profile;
- no account/order/watchlist/TOP100/chart truth;
- no normal product copy that makes KIS look required.

KIS may be useful, but Araon must not depend on KIS for the normal product
experience.

## 1. Non-Conservative Toss Policy

Previous Toss public quote probing showed that the old Araon caps were
conservative app defaults, not Toss-side hard limits.

New direction:

- Do not keep Toss quote lane conservative by default.
- Optimize for product responsiveness.
- Use smart request control, not timid caps.
- Avoid full-market 0.1s polling.
- Favorites/holdings/current chart must feel near-realtime.

Target operating model:

| Lane | Scope | Target Cadence | Initial Target Cap | Hard Cap | Purpose |
|---|---:|---:|---:|---:|---|
| Hot quote lane | Toss watchlist + holdings + Araon starred + selected chart + agent hot candidates | 100ms | 200 | 400 | User-visible price freshness |
| TOP100/ranking lane | Toss TOP100 gainers/losers/ranking | 500ms | provider ranking | provider ranking | market discovery |
| General quote lane | broader catalog/background hydration | 1-3s or on demand | batch oriented | bounded | non-critical backfill |
| KIS WS | KR eligible high-value tick assist | streaming | 40 | 40 | optional low-latency acceleration |

The hot lane may make multiple batch requests per cycle when needed. With
batch size 100, 200 symbols at 100ms is roughly 20 req/s and 400 symbols is
roughly 40 req/s, still below the previously accepted 100 req/s probe envelope.

## 2. Smart 0.1s Hot Quote Design

0.1s is a product target, not permission to create UI jank.

Required safeguards:

1. Single in-flight guard per lane.
2. Stale response guard: discard responses older than newer accepted samples.
3. Unchanged price dedupe.
4. Semantic event dedupe for surge/toast events.
5. UI render coalescing: store can accept 100ms samples, but React rendering may
   batch updates through `requestAnimationFrame` or a short frame scheduler.
6. Candidate priority sorting every cycle.
7. No unsupported Toss-only product in KR-only routes.
8. No KIS request for Toss-only product.
9. 429/5xx backoff, but do not permanently reduce product target without
   measured evidence.
10. Runtime health should expose warnings if in-flight skips or latency become
    high.

Hot lane candidate priority:

1. Toss account holdings.
2. Toss watchlist.
3. Araon starred/local sync-pending favorites.
4. Selected ticker / full chart ticker.
5. Agent order-intent or imminent decision candidates.
6. Recent news/disclosure/signal candidates.
7. KIS tracked companion only if still useful.
8. TOP100 only when spare capacity remains.

## 3. Favorites/Holdings Display Contract

Favorites is the user-facing `watchlist + holdings + Araon starred` surface.

Visible favorite rows must not settle into weak states.

Required behavior:

1. KR eligible rows should show:
   - name;
   - ticker;
   - current price;
   - direction;
   - percent change;
   - sparkline when enough real samples exist.
2. A row with price but no percent/direction is not acceptable steady UI.
3. If Toss quote returns price without change fields, carry forward prior
   real change fields only if from the same trading session.
4. If change fields are still missing after a bounded refresh, show a compact
   honest transient state like `등락률 수집 중`, but treat it as a bug/blocker
   if it persists for normal KR eligible products.
5. `가격 확인 중`, `가격 준비 중`, or blank percent should not remain steady for
   KR eligible favorites/holdings.
6. Unsupported Toss-only products should show `Toss 전용` or `지원 대기`, not
   pretend KIS or six-digit KR quote can hydrate them.
7. Holding-derived rows must render with filled star or a clear held-state, not
   an empty star.

## 4. KIS Usage Policy

KIS slot priority:

1. Toss holdings + Toss watchlist + Araon starred KR eligible tickers.
2. Agent/order-intent candidates.
3. Selected/full-chart ticker.
4. Recent news/disclosure/signal tickers.
5. TOP100 last-resort only if spare slots remain.

If KIS slots are free, favorites/holdings should be filled first. If a favorite
is not in KIS because it is Toss-only/unsupported, UI should not count it as
KIS-eligible. If KIS slots are full, Toss hot quote lane remains the replacement
price lane.

The favorites header should not make users learn KIS internals. Prefer:

- `실시간 추적 16/16`
- `동기화 대기 3`
- `빠른 가격 정상`

Avoid:

- `KIS WS`
- `fallback`
- `polling`
- `등록됨`
- large row-level `KIS 실시간` pills.

## 5. Chart Strategy

Use Toss authoritative history plus local cache plus live overlay.

### 5.1 Historical Candles

For interval/range changes:

1. Fetch Toss chart/candle data as primary.
2. Store normalized candles in local DB as a cache.
3. Serve cached candle data immediately when available.
4. Revalidate with Toss in the background or on explicit range/interval change.
5. KIS historical chart/backfill is legacy/manual fallback only.

Do not generate fake historical candles.

### 5.2 Current Candle

For selected ticker:

1. Hot quote lane supplies real samples at target 100ms.
2. Frontend overlays current candle immediately from live samples.
3. Server candle recorder compresses accepted real samples into 1m OHLCV.
4. At minute boundary, previous candle becomes finalized/flushable.
5. Toss candle refresh may reconcile the finalized minute candle.

Do not store raw ticks permanently unless separately approved. It is acceptable
to keep a small in-memory rolling sample buffer for the current minute and
sparkline rendering.

### 5.3 Why Not Delete All Old Local Candles

Araon should not rely on network fetch for every chart draw. Local candle cache
is useful because:

- ticker switching feels instant;
- network hiccups do not blank the chart;
- previous session chart remains inspectable;
- tests can verify candle progression without fake data;
- local storage contains compressed OHLCV, not raw tick payloads.

Keep local candle cache. Do not keep all raw ticks.

### 5.4 Non-Trading Gaps

Mini and full charts must hide long non-trading gaps without synthetic candles.

Rules:

- Use KST bucket/session logic.
- Do not render empty overnight ranges as flat fake candles.
- Do not append closed-night live candles.
- If Toss chart history includes placeholder rows, trim them from visible chart
  edges.

## 6. Bottom Status Bar Cleanup

Current bottom bar exposes too many internal counters:

- `총 종목`;
- `일반 갱신`;
- `일반 가격 n종목`;
- `빠른 가격 n종목`;
- KIS REST budget/rate info.

This is diagnostic information, not normal product UI.

### 6.1 Keep In Product Bar

Keep:

- `투자 유의사항`;
- market tape: KOSPI, KOSDAQ, USD/KRW, Nasdaq/S&P when available;
- `즐겨찾기 n`;
- fast freshness status in user language;
- last update time;
- settings icon.

Recommended normal labels:

- `빠른 가격 정상`
- `빠른 가격 일부 지연`
- `마지막 업데이트 18:01:19`
- `즐겨찾기 21`

### 6.2 Move To Diagnostics

Move to settings/diagnostics tooltip or dev-only panel:

- targetCap/hardCap;
- requested/returned/accepted;
- dropped unchanged/stale counts;
- in-flight skip count;
- KIS REST budget;
- general polling count;
- total local catalog count.

### 6.3 Remove Or Rename

Remove from normal bottom bar:

- `일반 갱신`;
- `일반 가격 68종목`;
- raw `64/64` style cap display;
- KIS REST `safe/busy` budget labels unless warning state is serious.

If a warning exists, show user-facing copy:

- `가격 일부 지연`
- `연결 복구 중`
- `실시간 추적 지연`

Do not show request/cap internals in the primary tape.

## 7. Scheduled Market-Hours Verification

The current alignment goal remains paused until market-hours evidence.

At the next market-hours resume:

1. Start Araon without resetting user data.
2. Confirm Toss session/account/watchlist status.
3. Confirm hot quote lane target/cadence.
4. Confirm favorites/holdings rows show price + direction + percent.
5. Confirm no steady `가격 확인 중`/blank percent for KR eligible rows.
6. Confirm recent surge live rows appear during market movement.
7. Click a recent surge row and verify selected ticker/chart changes.
8. Confirm duplicate surge toast is suppressed.
9. Confirm TOP100 rank reorder follows latest percent snapshot.
10. Confirm bottom bar shows product labels, not diagnostic counters.
11. Confirm mini/full chart current candle progresses without refresh.
12. Confirm no raw Toss/KIS/session/account/order/watchlist payload appears in
    UI, logs, stdout, docs, screenshots, or git diff.

If live market movement does not produce a valid recent-surge row, mark that
item as market-hours blocker. Do not inject fake product data to close the
gate.

## 8. Acceptance Criteria

1. Hot quote lane supports 100ms target cadence for favorites/holdings/current
   chart without broad full-market polling.
2. Toss fast quote target cap is raised from conservative defaults toward
   product target 200/hard 400 or an equivalent measured configuration.
3. Favorites/holdings are first in hot quote priority.
4. TOP100 does not displace favorites/holdings in fast quote or KIS slots.
5. KIS remains optional `실시간 추적`, max 40, KR eligible only.
6. Favorites header no longer shows confusing KIS/polling internals.
7. KR eligible favorite rows show price, direction, percent, and sparkline when
   enough real samples exist.
8. Rows with price but blank percent are fixed.
9. Unsupported products show honest support state.
10. Bottom bar removes normal-user confusing counters and moves diagnostics out
    of the main tape.
11. Chart uses Toss history primary, local candle cache, and live quote overlay.
12. Current candle progresses from real samples without refresh.
13. No synthetic financial data is used in product UI.
14. Market-hours browser QA proves recent surge row click changes selected
    chart.
15. Verification results are recorded in the active completion audit.

## 9. Verification Commands

Run focused tests first, then broader gates:

```bash
npm test -- \
  src/server/toss/__tests__/toss-fast-quote-lane.test.ts \
  src/client/components/__tests__/favorites-block.test.ts \
  src/client/components/__tests__/status-bar.test.ts \
  src/client/components/__tests__/stock-candle-chart.test.ts \
  src/client/components/__tests__/volume-visibility.test.ts \
  src/client/lib/__tests__/surge-aggregator.test.ts

npm test
npm run typecheck
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

Also run actual Browser/Computer Use visual QA during market hours.

## 10. Safety Boundary

Forbidden:

- live order;
- order cancel/amend;
- account setting mutation;
- live auto-buy/auto-sell;
- broad destructive Toss watchlist cleanup;
- raw session/account/order/watchlist payload exposure;
- fake candle/fake movement in product UI;
- full-market 0.1s polling.

Allowed:

- bounded Toss watchlist sync under prior fresh GO;
- Toss quote/ranking/chart reads;
- KIS WS optional realtime tick subscription for eligible KR tickers;
- local compressed candle cache.
