# Araon P1/P2 Product Completion Review

Date: 2026-05-06 KST
Workspace: `/Users/stello/korean-stock-follower`
Scope: P1/P2 product completion through P2-7, before the next release train.

## Summary

Araon has moved from a watchlist dashboard into a local observation tool with:

- persisted realtime signal timeline and outcome tracking
- selected-ticker daily and today-minute candle backfill controls
- data-health visibility for managed realtime/backfill operations
- cached stock news feed links
- ETF/ETN/REIT/fund grouping
- pinned candle inspection in the chart

This completion deliberately keeps the safety and data-honesty boundaries:

- no trading or order feature
- no synthetic financial data
- no raw tick permanent storage
- no full-market/master backfill
- no automatic historical minute backfill
- no fabricated chart/news summaries

## Commit List

- `b34c72d feat(signals): persist realtime signal timeline`
- `bb1a43c feat(chart): add selected ticker minute backfill`
- `1746685 feat(runtime): surface data health panel`
- `adc3856 feat(news): cache stock news feed links`
- `cf12567 feat(stocks): group ETF and ETN instruments`
- `96e17d6 feat(chart): add pinned candle inspection`

## Completed Scope

### P1-1 / P1-3: Signal Timeline and Outcomes

Implemented:

- `stock_signal_events` SQLite table
- `POST /stocks/:ticker/signals`
- `GET /stocks/:ticker/timeline`
- client-side realtime signal recording from SSE price updates
- StockDetailModal observation timeline
- candle-based 5m/15m/30m outcome calculation when stored candles exist

Policy:

- Signals are deterministic, client/server-local, and do not call an LLM.
- Outcomes are omitted when local candles do not yet cover the target time.
- Duplicate signal events are idempotent by ticker, signal timestamp, signal type, and momentum window.

Primary files:

- `src/server/db/migrations/006-stock-signal-events.sql`
- `src/server/routes/stocks.ts`
- `src/client/hooks/useSSE.ts`
- `src/client/components/StockObservationTimeline.tsx`

### P1-2: Selected Ticker Today-Minute Backfill

Implemented:

- KIS today-minute chart mapper/client
- selected-ticker backfill service
- `POST /stocks/:ticker/candles/backfill-minute`
- intraday-only `오늘 분봉 가져오기` chart control
- candle API coverage recognizes `kis-time-today`

Policy:

- This is manual/selected ticker only.
- It is not full watchlist minute backfill.
- It is not automatic historical minute backfill.
- Server-side market-hours guard remains authoritative.
- The chart still shows empty/collecting state when candles do not exist.

Primary files:

- `src/server/kis/kis-today-minute-chart.ts`
- `src/server/chart/today-minute-backfill-service.ts`
- `src/server/chart/minute-backfill-strategy.ts`
- `src/client/components/StockCandleChart.tsx`

### P1-4: Data Health Panel

Implemented:

- `GET /runtime/data-health`
- candle coverage summary for `1m` and `1d`
- tracking count and favorites count
- background daily backfill budget/cooldown/status surface
- volume baseline readiness summary
- SettingsModal managed operations health panel

Policy:

- The panel is status/diagnostic UI, not a broad operator switchboard.
- Emergency disable remains separate and explicit.
- No raw KIS credentials, access token, approval key, or account details are exposed.

Primary files:

- `src/server/routes/runtime.ts`
- `src/server/db/repositories.ts`
- `src/client/components/SettingsModal.tsx`
- `src/client/lib/api-client.ts`

### P2-5: News Feed Links

Implemented:

- `stock_news_items` SQLite table
- on-demand Naver Finance news feed fetch/cache
- `GET /stocks/:ticker/news`
- `POST /stocks/:ticker/news/refresh`
- StockDetailModal news/disclosure panel with cached news links and external DART/KIND/Naver links

Policy:

- Araon stores only source/title/url/fetched timestamp.
- It does not summarize, rank, or synthesize news.
- DART/KIND remain external links in this MVP.

Primary files:

- `src/server/db/migrations/007-stock-news-items.sql`
- `src/server/news/news-feed-service.ts`
- `src/server/routes/stocks.ts`
- `src/client/components/StockNewsDisclosurePanel.tsx`

### P2-6: ETF/ETN Grouping

Implemented:

- `Stock.instrumentType`
- master stock `security_group_code` enrichment
- lightweight instrument detection from public master metadata and stock names
- effective sector priority now:
  1. manual sector
  2. instrument type
  3. KIS official index industry
  4. unclassified

Policy:

- Manual user grouping still wins.
- KRX sector flags still do not become display sectors.
- ETF/ETN/REIT/fund are grouped as product types, not as fake industries.

Primary files:

- `src/shared/types.ts`
- `src/server/services/stock-service.ts`
- `src/server/db/repositories.ts`
- `src/client/lib/effective-sector.ts`
- `src/client/stores/stocks-store.ts`

### P2-7: Chart Marker / Pin Polish

Implemented:

- chart helper text now tells users that hover shows OHLCV and click pins a candle
- Lightweight Charts click handler pins the selected candle
- pinned candle panel shows actual OHLCV/source rows
- clear button removes the pinned candle

Policy:

- The pinned panel uses only existing candle API data.
- It does not generate markers from missing events.
- It does not synthesize prices, volume, or backfilled candles.

Primary files:

- `src/client/components/StockCandleChart.tsx`
- `src/client/components/__tests__/stock-candle-chart.test.ts`

## API Surface Added or Extended

### `POST /stocks/:ticker/signals`

Records a deterministic signal event for a tracked ticker.

### `GET /stocks/:ticker/timeline`

Returns notes and signal events, including candle-derived outcome fields when available.

### `POST /stocks/:ticker/candles/backfill-minute`

Runs selected-ticker today-minute backfill through guarded server policy.

### `GET /runtime/data-health`

Returns managed operation health for candle coverage, backfill state, and volume baseline readiness.

### `GET /stocks/:ticker/news`

Returns cached stock news links.

### `POST /stocks/:ticker/news/refresh`

Refreshes cached stock news links on demand.

## Verification Snapshot

Focused checks completed during implementation:

- signal timeline tests: passed
- selected today-minute backfill tests: passed
- runtime data-health tests: passed
- news feed cache tests: passed
- ETF/ETN grouping tests: passed
- pinned candle inspection tests: passed
- repeated `npm run typecheck`: passed

Final full verification and Browser Use UI acceptance are recorded in the final report after this document commit.

## Known Limitations

- News ingestion depends on Naver Finance HTML shape and may require parser maintenance.
- DART/KIND are linked, not API-ingested.
- Signal outcomes require stored candle coverage; missing coverage means no outcome, not a guessed result.
- Today-minute backfill is selected ticker/manual, not automatic watchlist minute backfill.
- Background daily backfill remains tracked/favorites only.
- Full master backfill remains prohibited.
- Historical minute automatic backfill remains prohibited.
- Volume surge ratio remains hidden until baseline samples are sufficient.

## Review Prompt for GPT 5.5 Pro

Please review this Araon P1/P2 completion as a product/engineering gate.

Focus areas:

1. Data honesty: Are there any places where Araon could imply data exists when it does not?
2. KIS safety: Are backfill, realtime, and news paths scoped tightly enough for a localhost monitoring tool?
3. Product clarity: Do the new UI surfaces explain why a ticker matters without becoming noisy?
4. Test adequacy: Are the pure logic, API, and presentational tests sufficient for this MVP?
5. Operational risk: Which remaining limitation should be promoted to P1 before the next release?

Current self-assessment:

- P0 blockers: none known
- Release blocker: Browser Use UI acceptance still must pass after the final build
- Highest remaining P1 candidate: restart-safe/persistent backfill budget and cooldown
