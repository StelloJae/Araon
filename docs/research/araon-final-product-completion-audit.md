# Araon Final Product Lane Completion Audit

Date: 2026-05-14

Authoritative brief:
`docs/research/araon-final-product-execution-goal.md`

This audit closes the authorized final product lane for Araon: Toss watchlist as
the primary favorite model, product-aware search/add, KIS as optional realtime
tracking only, chart/TOP100/agent UX quality, and a locked foundation for future
agent trading.

This document does not grant live trading approval. It also does not approve a
live Toss watchlist add/remove smoke. Real order execution, account mutation,
order cancel/amend, and live Toss watchlist mutation remain blocked until a
separate fresh user GO.

## Completion Verdict

Status: `PASS_WITH_AUTHORIZATION_BOUNDARY`

Araon now behaves as a Toss-primary terminal in the normal product path. Toss is
the user-facing source for account/session, portfolio, watchlist/favorites,
TOP100 ranking, search, quote/chart surfaces, and agent input surfaces. KIS is
kept as an optional `실시간 추적` acceleration rail for eligible Korean tickers
only. Legacy local favorites, KIS polling, and KIS REST-heavy concepts no longer
present as the normal user mental model.

The only intentionally unexecuted pieces are outside the current authorization:
live Toss watchlist mutation and live trading. Both are represented as gated or
locked rather than silently implied ready.

## Criteria Evidence

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Toss login/session is primary account-aware connection | PASS | Live UI and API surfaces show Toss auth/session, account summary, portfolio positions, and read-only account rail. Account values are intentionally omitted from this audit. |
| 2 | Toss watchlist and Araon 즐겨찾기 are unified in product model | PASS | `/watchlist` normalized read model exists; FavoritesBlock consumes normalized watchlist state; local favorites are fallback/cache. |
| 3 | Star/unstar is product-aware and sync-safe | PASS | Client action carries Toss `productCode`, KRX `krTicker`, and eligibility state; no six-digit-only route is used for Toss-only products; live mutation stays disabled until fresh GO. |
| 4 | Local favorites are fallback/cache only | PASS | Normal dashboard/settings no longer hydrate local `/favorites` as primary truth; remaining local favorite paths are migration/dev/test fallback. |
| 5 | Search handles KRX and Toss-only without confusing 400 | PASS | Toss-only search result was checked in Safari without visible `400 Bad Request`; focused tests cover product identity and watchlist payload separation. |
| 6 | Toss-only unsupported products show `Toss 전용` / `지원 대기` | PASS | Safari search QA confirmed unsupported Toss-only state. |
| 7 | KIS visible only as optional `실시간 추적` | PASS | Normal UI copy uses `실시간 추적`, `Toss 가격`, `비실시간`, `지원 대기`; large `KIS WS`/polling copy is absent from normal surfaces. |
| 8 | KIS never receives non-eligible product codes | PASS | Product identity helpers, KIS slot candidate filtering, UI guards, and focused tests prevent Toss-only/non-six-digit products from entering KIS flows. |
| 9 | KIS REST polling/chart/ranking/master/import not default product path | PASS | Toss-primary surfaces are default; KIS legacy paths are diagnostics/manual/legacy-gated rather than normal product truth. |
| 10 | TOP100 comes from Toss/provider ranking, not local filler | PASS | API spot check showed `toss-overview-ranking` and `toss-web-ranking`; Safari showed separate 상승/하락 TOP100 columns. |
| 11 | Mini/full chart update without manual refresh when valid data arrives | PASS | Quote/candle overlay code and tests are present; Safari showed chart surfaces updating in-place without route changes. |
| 12 | Non-trading chart gaps hidden without synthetic data | PASS | Code/tests cover non-trading gap compaction; chart still uses stored/provider candles and does not synthesize finance data. |
| 13 | Agent panel shows observation/candidate/preview/locked | PASS | Home and expanded agent panel show observation events, mock preview action, safety lock, and judgment flow. |
| 14 | Agent event contract exists | PASS | Shared event types and route/client tests cover news, disclosure, signal, market movement, watchlist, position, order-intent, approval, and lock families. |
| 15 | Order-intent lifecycle supports preview/risk/approval/audit without live execution | PASS | Lifecycle reaches preview, risk/approval, audit, and execution-locked states; Settings and safety modal expose the lifecycle without enabling live execution. |
| 16 | Missing auto-trading pieces are documented and locked/not-ready | PASS | Live policy exposes readiness gaps for decision engine, strategy policy, risk policy, paper trading, Toss order execution, reconciliation, and performance audit. |
| 17 | Live trading remains locked | PASS | Live policy API and UI show execution locked/kill-switch state. No live order action was performed. |
| 18 | No raw sensitive values appear in UI/log/docs/stdout/git diff | PASS | Completion docs omit raw account/session/order/watchlist identifiers. Focused diff grep found no sensitive tokens in the latest touched files. |
| 19 | Full tests/typecheck/build/diff/no-live soak pass | PASS | Full suite, typecheck, build, diff-check, focused tests, and no-live soak passed. |
| 20 | Real browser visual QA passes | PASS | Safari/Computer Use checked Home, TOP100, selected chart, full chart expansion, agent expansion, account rail, icon rail, and bottom status bar. |
| 21 | Completion audit is written | PASS | This file is the completion audit. |

## Browser Visual QA

Target:

- Safari
- `http://127.0.0.1:5173/`

Observed:

- Home renders the 50:50 structure:
  - TOP100 rising/falling columns.
  - Favorites and recent surge.
  - Selected ticker mini chart.
  - Agent events/safety panel.
- Toss account rail is visible, narrow, read-only, and visually separate from
  the workspace.
- Bottom status bar is present.
- Full chart opens as an in-workspace expansion and returns with `작게 보기`
  without URL/page navigation.
- Agent detail opens as an in-workspace expansion and returns with `작게 보기`
  without URL/page navigation.
- Full chart interval/range controls are buttons, not dropdown-only controls.
- Normal UI does not show legacy `내 목록`, `등록됨`, `폴링40`, or `KIS WS`
  mental-model copy.
- Account/session/portfolio values were visible in the user's local UI, but raw
  values are not copied into this audit.

## API Spot Checks

Sanitized checks against the running local API:

| Endpoint | Result |
|---|---|
| `/market/top-movers?limit=5` | HTTP 200, Toss overview ranking source, sub-second refresh interval |
| `/watchlist` | HTTP 200, normalized watchlist model, sync state present |
| `/runtime/data-health` | HTTP 200, safe aggregate health payload |
| `/market/toss/search?q=채비&limit=5` | HTTP 200, Toss-only result represented without KIS eligibility |
| `/runtime/realtime/kis-ws-slots` | HTTP 200, optional realtime tracking slot state |
| `/agent/order-intents/live-policy` | HTTP 200, live execution disabled and readiness gaps present |

Only statuses, counts, source labels, and readiness semantics were used. Raw
session, account, order, and watchlist identifiers were not recorded.

## Verification Commands

Focused tests:

```text
npm test -- src/client/components/__tests__/top100-view.test.ts
PASS

npm test -- src/client/components/__tests__/top100-view.test.ts src/server/market/__tests__/market-top-movers-service.test.ts
PASS
```

Full verification:

```text
npm test
PASS: 215 files, 1414 tests

npm run typecheck
PASS

npm run build
PASS

git diff --check
PASS

npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
PASS: ok=true, sampleCount=18, issueCount=0
```

Build note: Vite still reports the existing post-minification chunk-size
warning. It is not a functional failure for this goal.

## Safety Gates Still Closed

These are intentionally not complete because they require separate user
authorization:

1. Live Toss watchlist add/remove smoke.
2. Live Toss watchlist mutation in normal UI.
3. Live order execution.
4. Order cancel/amend.
5. Account mutation.
6. Live auto-buy.

These are productized as locked/not-ready surfaces, not hidden promises.

## Remaining Product Work After This Goal

Future work can proceed from this foundation:

1. User-approved live Toss watchlist add/remove smoke with redacted evidence.
2. Decision engine design.
3. Strategy policy and risk policy.
4. Paper-trading ledger and simulation result UI.
5. Toss order preview/execution adapter behind fresh approval.
6. Execution reconciliation against Toss positions/orders.
7. Agent performance/audit reporting.

None of those future items are required to close this authorized final product
lane.
