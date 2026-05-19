# Araon KIS Legacy REST Containment Audit

Date: 2026-05-17 22:20 KST

This note supports pre-release product criterion #10 from
`docs/research/araon-pre-release-product-100-goal.md`:

> KIS REST-heavy legacy paths are not normal product flow.

Conclusion: **PASS for current code shape, with one explicit caveat.** KIS REST
helpers still exist for manual maintenance and explicit fallback, but the normal
product flow is Toss-first. KIS is the optional `실시간 추적` rail by default.

The caveat is that this is a code/current-runtime audit, not a market-hours
behavior audit. It does not close TOP100 cadence, recent surge calibration, or
chart progression market-hours criteria.

## 1. Default Gates

KIS legacy REST helpers are disabled by default through
`src/server/kis/kis-legacy-fallback-policy.ts`.

| Surface | Default | Explicit gate |
|---|---:|---|
| legacy master auto refresh | off | `ARAON_KIS_MASTER_AUTO_REFRESH=1` |
| legacy chart REST fallback | off | `ARAON_KIS_CHART_FALLBACK_ENABLED=1` |
| legacy foreground quote fallback | off | `ARAON_KIS_QUOTE_FALLBACK_ENABLED=1` |
| legacy watchlist quote polling fallback | off | `ARAON_KIS_POLLING_FALLBACK_ENABLED=1` |

`src/server/bootstrap-kis.ts` logs that the legacy KIS polling scheduler is
disabled by default unless the runtime dependency gate explicitly allows it.

`src/server/app.ts` also keeps legacy KIS master auto refresh disabled unless
`ARAON_KIS_MASTER_AUTO_REFRESH=1` is set. Clean startup without credentials
does not perform KIS master refresh.

## 2. Normal Product Flow

### TOP100 / Movers

Normal `/market/top-movers` wiring in `src/server/app.ts` uses
`createTossPublicMarketDataProvider()` for KR and US providers with
`sourceKind: 'toss-overview-ranking'`.

The old KIS source kind remains as a helper path inside
`src/server/market/market-top-movers-service.ts`, but the composition root no
longer wires it as the normal product source.

### Quote Refresh

Foreground quote refresh is Toss-first:

1. `refreshForegroundQuote()` calls Toss public quote batch first.
2. KIS REST quote is attempted only when
   `ARAON_KIS_QUOTE_FALLBACK_ENABLED=1` and the KIS runtime is already started.

### Chart / Candle Backfill

Daily, today-minute, and historical-minute backfill services are Toss-first:

1. Daily candles call Toss public daily candles first.
2. Today and historical minute candles call Toss public c-chart paths first.
3. KIS chart REST helpers are reached only when
   `ARAON_KIS_CHART_FALLBACK_ENABLED=1` and the KIS runtime is already started.

The route layer still exposes coverage/backfill routes for selected ticker chart
maintenance, but the provider path behind them is Toss-first by default.

### Search / Add

Normal search is Toss:

- `/market/toss/search`
- `/stocks/from-toss-search`

`/stocks/from-master` is a local cache promotion route. It does not fetch KIS
network data by itself.

### Account / Portfolio / Watchlist

Normal authenticated account surfaces are Toss:

- `/toss/account`
- `/toss/account/summary`
- `/toss/portfolio`
- `/toss/orders`
- `/toss/transactions`
- `/toss/watchlist`
- normalized `/watchlist`

KIS is not used as account, order, portfolio, or Toss watchlist truth source.

### Realtime

KIS is retained for eligible six-digit Korean tickers as optional `실시간 추적`.
The product-facing route is `/runtime/realtime/session-enable` and the slot
allocator path. This is WebSocket tick tracking, not KIS REST truth.

## 3. Legacy / Manual Helper Inventory

These paths remain intentionally available, but they are not normal product
flow.

| Path / surface | Role | Guard |
|---|---|---|
| `POST /master/refresh` | manual KIS master metadata refresh | requires credentials; auto off unless `ARAON_KIS_MASTER_AUTO_REFRESH=1` |
| `POST /import/kis-watchlist` | legacy KIS watchlist migration helper | requires started KIS runtime; never auto-called by normal UI hydration |
| `POST /stocks/:ticker/candles/backfill` | selected ticker chart maintenance | Toss-first; KIS only with chart fallback env gate |
| `POST /stocks/:ticker/candles/ensure-coverage` | selected ticker coverage maintenance | Toss-first; KIS only with chart fallback env gate |
| `POST /stocks/:ticker/candles/backfill-minute` | selected ticker minute maintenance | Toss-first; KIS only with chart fallback env gate |
| `/runtime/data-health.kisLegacyRest` | status/reporting only | exposes role/state/mode; not an execution path |

## 4. UI Copy Boundary

Normal UI copy should not present KIS REST/polling as the main product model.
Current Settings/Data Health copy maps internal legacy REST labels into Korean
operator language:

- `이전 KIS 경로`
- `선택 보조`
- `기본 억제`
- `직접 켬`
- `수동 도구`

The primary user-facing KIS language remains `실시간 추적`.

## 5. Verification Evidence

Current tests that support this audit:

- `src/server/__tests__/app-launcher.test.ts`
  - legacy KIS master/chart/quote/polling fallback gates default to false.
  - clean first-run startup blocks external calls until credentials exist.
- `src/server/routes/__tests__/runtime.test.ts`
  - `/runtime/data-health.kisLegacyRest` reports optional fallback role.
  - account/order/live-trading truth-source flags stay false.
  - KIS watchlist REST helper stays suppressed by default even when Toss quote
    polling repeatedly fails.
  - KIS watchlist REST helper re-opens only with explicit env opt-in.
- `src/server/routes/__tests__/import-guard.test.ts`
  - `/import/kis-watchlist` returns 503 when KIS runtime is not started.
- `src/server/routes/__tests__/market.test.ts`
  - `/market/top-movers` uses the wired top movers service, which the
    composition root currently wires to Toss overview ranking.
- `src/server/routes/__tests__/master.test.ts`
  - manual master refresh is credential-gated.

Latest command evidence from this goal run:

- `npm test`: PASS, 221 files / 1453 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS,
  `issueCount=0`.
- production-source secret grep over non-test `src/client`, `src/server`, and
  `src/shared`: PASS, no raw secret hits.

## 6. Completion-Audit Interpretation

Criterion #10 can be marked `PASS` in the progress audit because:

1. Toss is wired as normal TOP100/quote/search/chart/account/watchlist source.
2. KIS REST quote/chart/polling/master paths are either default-off env-gated,
   credential-gated, or manual helper routes.
3. KIS watchlist import is a legacy migration helper, not the primary watchlist.
4. KIS is still available as optional `실시간 추적` via WebSocket slot allocation.
5. no-live soak verifies clean startup does not unexpectedly call live external
   KIS paths.

Do not use this audit to claim market-hours realtime behavior is complete.
