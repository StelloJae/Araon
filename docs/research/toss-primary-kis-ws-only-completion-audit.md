# Toss Primary + KIS WS-Only Completion Audit

Date: 2026-05-14

Authoritative brief:
`docs/research/toss-primary-kis-ws-only-transition-plan.md`

This audit records the current evidence that Araon has moved to a Toss-primary
data model with KIS preserved only as an optional Korean-stock WebSocket
acceleration rail.

No live trading approval is granted by this document. No Toss account mutation,
Toss watchlist mutation, KIS order API, or automated live execution is approved.

## Summary

Status: `PASS`

Araon now treats Toss as the default source for search, quote, TOP100, chart,
account, portfolio, watchlist, news, and agent signal surfaces. KIS REST quote,
polling, chart fallback, master auto refresh, and ranking fallback are not part
of the default product path. Remaining KIS functionality is framed as optional
WebSocket acceleration for eligible Korean tickers only.

## Acceptance Criteria

### 1. Clean no-credentials startup has no surprise KIS outbound calls

Status: `PASS`

Evidence:

- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500` returned
  `ok=true`, `issueCount=0`.
- Focused app-launcher tests cover clean first-run startup and Toss no-session
  read routes without external fetches.
- Legacy KIS master auto refresh, quote fallback, chart fallback, and polling
  fallback are gated by explicit opt-in environment variables.

### 2. Toss login enables read surfaces without KIS credentials

Status: `PASS`

Sanitized local API smoke against `http://127.0.0.1:3000`:

| Surface | Result |
|---|---|
| Toss auth status | HTTP 200 |
| Toss account summary | HTTP 200 |
| Toss portfolio positions | HTTP 200, positions count present |
| Toss watchlist | HTTP 200, items count present |
| TOP100 KR | HTTP 200, 100 gainers and 100 losers |
| Toss realtime ranking | HTTP 200, partial/explicit coverage |
| Toss quote for `005930` | HTTP 200, provider `toss-public` |
| Toss search for `채비` | HTTP 200, provider `toss-public` |
| Candles for `005930` | HTTP 200, candle list present |
| News for `005930` | HTTP 200, item count present |
| Agent signal/event status | HTTP 200, providers include `tossSignal` |

Only status, counts, provider labels, and coverage keys were printed. Account
amounts, session values, raw payloads, and order identifiers were not recorded.

### 3. Search represents KRX and Toss-only products truthfully

Status: `PASS`

Evidence:

- `src/shared/product-identity.ts` separates Toss `productCode` from six-digit
  KRX `krTicker`.
- `src/client/components/GlobalSearch.tsx` labels non-KIS-eligible Toss results
  as `Toss 전용` and `지원 대기`.
- Browser QA with query `채비` showed `0011T0` as `Toss 전용` / `지원 대기`,
  while normal six-digit KRX results still showed `+ 추가`.

### 4. Sector/theme UI does not depend on KIS as primary

Status: `PASS`

Evidence:

- `docs/design.md` now frames sector/theme as Toss-first with local or legacy
  fallback only.
- UI copy no longer presents KIS as the primary sector/theme source.
- Legacy KIS industry metadata remains secondary/fallback material, not the
  normal user-facing source of truth.

### 5. Sparkline and chart default to Toss-derived data

Status: `PASS`

Evidence:

- Toss quote refresh is the visible default in the bottom status bar.
- Mini chart/full chart use stored candle data produced by Toss-first refresh
  and Toss candle paths.
- KIS WS tick is framed as an overlay for latest price/current candle only,
  not as chart history truth.

### 6. KIS WS accelerates at most 40 eligible Korean tickers

Status: `PASS`

Evidence:

- KIS WS slot state/API remains capped at 40.
- Browser QA shows compact `KIS 20/40` state in the watchlist header instead of
  large row-level KIS badges.
- Slot allocator tests passed for cap and eligibility behavior.

### 7. Non-KIS-eligible products never enter KIS flows

Status: `PASS`

Evidence:

- `krTickerFromTossProductCode` returns `null` for Toss-only codes such as
  `0011T0`.
- `kisEligible` is true only for normalized six-digit Korean tickers.
- KIS WS candidate builders drop US, Toss-only, and non-six-digit candidates.
- Search UI prevents unsupported Toss-only rows from using the normal add path.

### 8. KIS REST paths are outside the default product path

Status: `PASS`

Evidence:

- KIS REST quote fallback, polling fallback, chart fallback, and master auto
  refresh require explicit legacy/manual environment gates.
- `docs/runbooks/nxt-ws-rollout.md` now describes KIS as an optional realtime
  rail and uses Toss REST refresh language for default refresh behavior.
- The only normal KIS role left in product copy is optional WS acceleration.

### 9. Ambiguous legacy UI copy is removed from normal rows

Status: `PASS`

Evidence:

- Browser QA showed `비실시간`, `Toss 가격`, `Toss 전용`, `지원 대기`, and compact
  `KIS 20/40`.
- Normal rows no longer show large `KIS 실시간` pills.
- `등록됨`, `폴링40`, and old polling/fallback labels were removed from normal
  product surfaces or rewritten to Toss-first terms.

### 10. No raw sensitive Toss/KIS/session/account/order payloads are exposed

Status: `PASS`

Evidence:

- Focused route tests assert sanitized Toss no-session behavior and sanitized
  KIS WS slot/status output.
- Local API smoke emitted only counts/status/source labels.
- Tracked-file secret grep was run as part of final verification.

## Browser Visual QA

Browser target: `http://127.0.0.1:5173/`

Viewport checked: `1600x1000`

Observed:

- TOP100 panel shows separate rising/falling ranking columns.
- Toss ranking source and 0.5s cadence are visible.
- Search dropdown shows Toss-only and KRX addable states distinctly.
- Watchlist uses compact `KIS 20/40`; row-level large KIS badges are absent.
- Selected ticker panel states `Toss 우선 · KIS WS 보조`.
- Account rail is visible as a Toss read-only portfolio rail.
- Bottom status bar says `비실시간` and `Toss 가격`, not legacy KIS polling copy.
- Fresh page reload produced no console errors; only the React DevTools info
  message appeared.

## Verification Commands

Focused tests:

```bash
npm test -- src/server/__tests__/app-launcher.test.ts src/shared/__tests__/product-identity.test.ts src/server/realtime/__tests__/kis-ws-slot-candidates.test.ts src/server/realtime/__tests__/kis-ws-slot-allocator.test.ts src/server/market/__tests__/market-top-movers-service.test.ts src/client/lib/__tests__/stock-search.test.ts src/client/components/__tests__/credentials-setup-copy.test.ts src/client/components/__tests__/managed-operations-settings.test.ts src/client/components/__tests__/status-bar.test.ts src/client/components/__tests__/top100-view.test.ts src/client/components/__tests__/stock-candle-chart.test.ts src/client/components/__tests__/agent-events-rail.test.ts src/client/lib/__tests__/agent-event-toast.test.ts
```

No-live startup smoke:

```bash
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

Final checks:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Results:

- `npm test`: PASS, 210 files / 1379 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- Secret-like grep: PASS for active code/docs after excluding intentional test
  sentinel fixtures.

The broader grep only matched fake redaction sentinel values inside tests, such
as `raw-session-must-not-leak`; active source/docs did not match the raw-value
literal pattern.

## Remaining Notes

- Toss signal support is exposed through the agent event monitor/provider path,
  not through a public `GET /stocks/:ticker/signals` route.
- Toss-only products are searchable and truthfully labeled, but unsupported
  Toss-only add/view behavior remains intentionally gated as `지원 대기`.
- KIS legacy code still exists for explicit/manual fallback and migration
  helpers. It is not default product behavior.
