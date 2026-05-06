# P1/P2 Integration Acceptance

## Summary

- **Date**: 2026-05-06 19:01 KST
- **Repository**: `/Users/stello/korean-stock-follower`
- **Baseline HEAD**: `0535c6b` (`docs(product): record P1 P2 verification`)
- **Acceptance fix HEAD**: `46a07ea` (`fix(stocks): avoid false REIT instrument matches`)
- **Package version**: `1.1.0-beta.9`
- **Verdict**: **CONDITIONAL GO**

P1/P2 기능 묶음은 주요 사용자 플로우에서 막히지 않았다. Clean dataDir first-run,
existing local dashboard, stock detail modal, chart tab, pinned candle inspection,
observation timeline, notes surface, news/disclosure links, data-health panel, and
managed realtime/backfill status all rendered without a P0 blocker.

조건부 판정인 이유는 기능 실패가 아니라 운영 검증 범위다. Browser Use MCP backend
was unavailable in this session, so UI acceptance used the Computer Use plugin
fallback. Selected-ticker minute backfill was intentionally not executed live,
news refresh was not executed live, and long-run retention/data-growth behavior
remains a P1/P2 operational follow-up.

## Scope

Recently added P1/P2 surfaces covered by this acceptance:

- Persisted realtime signal timeline and outcome display
- Selected ticker today-minute backfill control
- Data health panel
- Stock news/disclosure links
- ETF/ETN/REIT/fund grouping
- Pinned candle inspection
- Observation notes/log surface

Explicitly not executed in this acceptance:

- Live cap/realtime smoke retest
- Selected ticker minute live backfill call
- Full watchlist backfill
- Automatic historical minute backfill
- News refresh live call
- npm publish/tag/release work

## Clean DataDir Acceptance

A clean CLI server was started with a temporary data directory:

- URL: `http://127.0.0.1:3922/`
- Data directory: `/tmp/araon-p1p2-clean-ui-WSsBAR`

Results:

- First-run UI displayed the KIS app key registration screen.
- The onboarding copy says Araon is a localhost read-only monitoring tool.
- The onboarding copy says there is no order/trading feature.
- The onboarding copy says realtime quotes and daily backfill are managed after
  credentials are registered.
- The onboarding copy says cap40 integrated realtime and REST polling fallback
  are used.
- `GET /credentials/status` returned `configured=false`, `runtime=unconfigured`,
  `isPaper=null`.
- `GET /settings` returned managed defaults: `websocketEnabled=true`,
  `applyTicksToPriceStore=true`, `backgroundDailyBackfillEnabled=true`,
  `backgroundDailyBackfillRange=3m`, `rateLimiterMode=live`.
- `GET /runtime/data-health` returned zero tracked/favorites/candles and
  backfill enabled with `dailyCallCount=0`.
- The clean data directory created `watchlist.db` and
  `background-backfill-state.json`, but did **not** create `credentials.enc`.

Assessment:

- Clean install without credentials remains safe.
- Managed defaults do not by themselves create credentials or start configured
  KIS runtime work.
- No token, approval key, account, or credential value appeared in API output or
  UI.

## Existing Local Data UI Acceptance

Existing local UI was inspected through Chrome at `http://127.0.0.1:5173/` with
the Computer Use plugin.

Dashboard result:

- Main dashboard rendered.
- Search input rendered.
- Total tracked count rendered as `111`.
- Favorites rendered with `7` items.
- Recent surge / today strong / overall surfaces rendered.
- Sector grouping rendered, including manual sector groups and KIS official
  industry groups.
- Managed realtime indicator displayed as live/connected.
- Local simulator/dev panel was visible; no simulator or backfill action was
  triggered.

Stock detail modal result, using `005930`:

- Modal opened from dashboard row.
- Realtime tab rendered the session sparkline and current metrics.
- Chart tab rendered before the metrics table, as intended.
- The intraday chart displayed `1m · 1d` local candle data.
- The UI showed `1400+` candles and partial/collecting status.
- Clicking a candle pinned an inspection panel with time, OHLCV, and
  `ws-integrated` source.
- The manual `오늘 분봉 가져오기` control was visible for intraday intervals and
  disabled with a market-hours guard message.
- Observation notes surface rendered with the read-only trading disclaimer.
- Observation timeline rendered and correctly showed an empty state when no
  signal/note existed.
- News/disclosure panel rendered cached-news empty state plus external Naver
  Finance, DART, and KIND links.

Settings/data-health result:

- Connection tab rendered managed realtime as automatic/verified.
- Emergency realtime stop and daily backfill stop controls remained visible.
- Data health displayed tracked/favorite counts, candle coverage, daily backfill
  budget, and volume baseline readiness.
- UI text stated raw App Key/App Secret/account data is not displayed.

## API Cross-Checks

Existing local status checks:

- `GET /runtime/realtime/status`
  - `configured=true`
  - `runtimeStatus=started`
  - `state=connected`
  - `subscribedTickerCount=7`
  - `canApplyTicksToPriceStore=true`
  - `approvalKey.status=ready`
  - raw approval key string was not present in the response shape checked by the
    acceptance script.

- `GET /runtime/data-health`
  - `trackedCount=111`
  - `favoriteCount=7`
  - `1m candles=148446` across `110` tickers
  - `1d candles=20` across `1` ticker
  - background daily backfill enabled, range `3m`, daily call count `0`,
    cooldown inactive
  - volume baseline readiness: `ready=0`, `collecting=110`, `unavailable=1`

- `GET /stocks/005930/candles?interval=1m&range=1d`
  - returned `1403` candles
  - `coverage.localOnly=true`
  - `coverage.backfilled=false`
  - `sourceMix=["ws-integrated"]`
  - `status.state=partial`
  - no synthetic backfilled candle was implied.

- `GET /stocks/005930/timeline?limit=5`
  - returned an empty timeline for this local data state.
  - This matched the UI empty state.

- `GET /stocks/005930/news`
  - returned an empty cached news list for this local data state.
  - This matched the UI empty state and external fallback links.

## Acceptance Fix During Verification

During existing local data audit, `138040 메리츠금융지주` appeared as
`instrumentType=reit` because the first ETF/ETN/REIT grouping heuristic matched
any Korean name containing `리츠`. That was a real false positive (`메리츠`
contains the same substring).

Fix:

- `detectInstrumentType()` now treats Korean REIT names more narrowly, while
  still accepting names that end with or clearly mark `리츠`, and English `REIT`.
- Added a regression test so `메리츠금융지주` remains `equity`.

Verification for the fix:

- Focused stock/effective-sector/store tests passed: `41` tests across `3`
  files.
- `npm run typecheck` passed.
- Existing local `/stocks` confirmed `138040` is now `instrumentType=equity`,
  `autoSector=금융업`.

## Feature-Specific Results

### Signal Timeline / Outcomes

Result: **PASS with operational follow-up**

- Timeline UI rendered in the stock modal.
- Empty state was natural when no signals/notes existed.
- Timeline API enforces query `limit <= 100`.
- Signal repository clamps direct signal listing to max `200` rows.
- Outcome fields are only built from candle data; no fake outcome was shown when
  no timeline event existed.

Follow-up:

- `stock_signal_events` has bounded reads but no retention/prune job yet.
- Recommend 90 or 180 day retention before heavy long-run usage.

### Selected Ticker Minute Backfill

Result: **PASS for UI/contract, live execution not run**

- Intraday chart shows `오늘 분봉 가져오기` only for intraday intervals.
- The button was disabled during the acceptance window with a guard message.
- Server route is selected-ticker scoped:
  `POST /stocks/:ticker/candles/backfill-minute`.
- The route uses `planSelectedTickerMinuteBackfill()` and rejects non-ready
  states with safe errors.
- No selected-ticker minute KIS call was executed in this acceptance.

Follow-up:

- A controlled single-ticker minute backfill live probe remains pending.
- It should not be widened to full watchlist or automatic historical minute
  backfill.

### Data Health Panel

Result: **PASS**

- Settings connection tab shows managed realtime/backfill status and data health.
- It exposes tracked/favorite counts, candle coverage, backfill budget/cooldown,
  and volume baseline readiness.
- It does not expose raw App Key, App Secret, approval key, token, or account
  values.

Follow-up:

- The panel is still technical. A later polish pass should show a higher-level
  `정상 / 주의 / 오류` summary first, with diagnostics below.

### News / Disclosure Links

Result: **CONDITIONAL PASS**

- Modal labels the surface as `관련 뉴스 · 공시`, not analysis or summary.
- Empty cached news state rendered safely.
- External fallback links to Naver Finance, DART, and KIND rendered.
- The Naver parser stores links only and does not synthesize summaries.

Follow-up:

- Naver HTML parsing remains brittle by nature.
- News cache has read limits and URL upsert dedupe, but no TTL/prune policy yet.
- Add parser-failure UX and cache retention before treating this as a robust news
  subsystem.

### Notes / Observation Log

Result: **PASS for UI/contract, existing-data write not run**

- Observation note UI rendered.
- The copy clearly says notes are observation records, not buy/sell decisions.
- Create/list/delete routes and tests already cover persistence behavior.
- No note was created in the user's existing local data during this acceptance,
  to avoid modifying personal observation data.

Follow-up:

- Notes list currently returns all notes for a ticker at repository level before
  timeline slicing. This is acceptable for small local use, but long-run note
  volume needs a limit/pagination policy.

### ETF / ETN / REIT / Fund Grouping

Result: **PASS after fix**

- Dashboard sector grouping rendered.
- Existing data showed a false REIT classification for `메리츠금융지주`; this was
  fixed and verified.
- API now reports that ticker as ordinary `equity` with official sector fallback.

Follow-up:

- Add more real ETF/ETN/REIT tracked samples in future acceptance if the user's
  watchlist starts containing those instruments.

### Pinned Candle Inspection

Result: **PASS**

- Clicking a candle in the TradingView Lightweight Charts surface pinned an OHLCV
  inspection panel.
- The panel showed bucket time, open/high/low/close, volume, and candle source.
- The chart continued rendering after pinning.

## Retention / Data Growth Audit

Current protections:

- Candle repository has `pruneOldCandles()` policy: `1m` older than 30 days and
  `1d` older than 2 years.
- Background daily backfill budget/cooldown is persisted through
  `background-backfill-state.json`.
- Background daily backfill is limited to favorites/tracked tickers, max 5
  tickers per run, request gap, daily budget, and cooldown after errors.
- Timeline API enforces max `limit=100`.
- Signal event repository clamps direct signal list reads to max `200`.
- News repository clamps reads to max `100` and dedupes by `(ticker, url)`.

Remaining gaps:

- Confirm whether `pruneOldCandles()` is scheduled automatically in production
  runtime; it exists as repository behavior but this acceptance did not prove
  scheduler invocation.
- `stock_signal_events` lacks retention/prune.
- `stock_notes` lacks pagination/retention.
- `stock_news_items` lacks TTL/prune and parser-failure fallback metadata.
- Data health panel surfaces candle/backfill/baseline status but not
  signal/news/note table growth.

## Browser / Computer Verification Note

The Browser Use MCP backend was attempted but returned `Target page, context or
browser has been closed`. Because the user explicitly requested direct visual
verification, acceptance continued with the Computer Use plugin against Google
Chrome.

Computer Use verified:

- clean first-run onboarding screen at `http://127.0.0.1:3922/`
- existing local dashboard at `http://127.0.0.1:5173/`
- stock detail realtime/chart tabs
- pinned candle inspection
- timeline/notes/news panels
- settings connection/data-health panel

## Backlog

### P0

None found.

### P1

- Add retention/prune policy for `stock_signal_events`.
- Add pagination or bounded repository query for `stock_notes`.
- Add TTL/prune/failure-state policy for `stock_news_items`.
- Prove candle prune scheduling, not only repository behavior.
- Run one controlled selected-ticker today-minute live backfill probe.
- Keep Browser Use backend health on the validation checklist; Computer Use
  fallback worked, but Browser Use itself was unavailable in this run.

### P2

- Simplify data health panel into top-level `정상 / 주의 / 오류` with diagnostics
  collapsed below.
- Add richer ETF/ETN/REIT/fund tracked-sample acceptance when local watchlist
  includes those instruments.
- Add chart tooltip/crosshair polish after the current pinned inspection flow
  stabilizes.
- Consider stronger official news/disclosure sources before calling the Naver
  link cache a durable news feature.

## Final Verdict

**CONDITIONAL GO**

The current P1/P2 product surface is usable and no P0 blocker was found. The main
user flow works: dashboard, search/list grouping, modal, realtime tab, chart tab,
pinned candle, observation surfaces, news/disclosure links, and data health all
render coherently.

The conditional items are operational rather than blocking: Browser Use backend
unavailability, no live selected minute backfill probe in this acceptance, and
remaining retention/data-growth policies for signal/news/note tables.
