# Realtime Surge / Chart / Watchlist Calibration

Date: 2026-05-15 KST

This note records the execution evidence for
`docs/research/realtime-surge-chart-watchlist-sync-goal.md`. It is intentionally
small and does not include raw Toss/KIS session, account, order, or watchlist
payloads.

## Runtime Snapshot

- Repo: `/Users/stello/korean-stock-follower`
- Vite client observed on `127.0.0.1:5173`
- Fastify server observed on `127.0.0.1:3000`
- `GET /runtime/data-health` reported the bounded Toss fast quote lane as
  configured and running.
- Fast quote lane source: `toss-fast-quote`
- Fast quote interval: `500ms`
- Fast quote cap: target `40`, hard `60`
- Latest observed lane cycle: candidate `40`, requested `40`, returned `40`,
  accepted `21`, unchanged dedupe `19`, stale drops `0`, invalid drops `0`,
  failures `0`.

## Realtime Surge Source Boundary

Expected behavior:

- `ws-integrated` can feed realtime surge momentum.
- `toss-fast-quote` can feed realtime surge momentum.
- Ordinary `rest` quote refresh must not feed realtime surge momentum.
- A 3% threshold must not produce alerts for 0.x%, 1.x%, or 2.x% moves.
- Raw KIS tick update messages must not create user-facing noise toasts.

Evidence:

- Focused tests cover the realtime momentum source filter.
- Focused tests cover the 3% threshold boundary.
- Focused tests cover the agent event queue boundary so KIS realtime price
  movement below 3% is not inserted as `market_movement_detected`.
- Focused tests cover KIS raw tick toast suppression.
- Focused tests cover meaningful threshold-crossing market movement toasts.

## Chart Progression Boundary

Expected behavior:

- Mini/full chart current candle can progress from real price samples.
- `toss-fast-quote` is treated as a realtime-like price source for the current
  candle path.
- Ordinary `rest` refresh must not replace a same-bucket live point.
- No fake candle, fake movement, or synthetic non-trading gap fill is allowed.

Evidence:

- Shared source tests now classify `toss-fast-quote` as realtime and `rest` as
  non-realtime.
- Client price-history tests verify REST cannot replace same-bucket live or
  fast-quote samples.
- Server price-history recorder tests verify the same persisted-history rule.
- Candle aggregator tests verify fast-quote samples update current 1m candles.
- Candle route tests verify current candles can be returned from fast-quote
  samples.

## Watchlist Sync Foundation

Expected behavior:

- Araon 즐겨찾기 primary read model is `/watchlist`.
- Toss watchlist is the primary truth when available.
- Local favorites remain fallback/cache and sync-pending state.
- Live Toss watchlist mutation is not executed without fresh user approval.
- Toss-only products must not be routed into KIS or six-digit-only paths.

Observed API state:

- `GET /watchlist` returned `success=true`, `status=ready`,
  `primarySource=toss`.
- Toss watchlist count was `0` in the observed session.
- Local fallback/cache count was `10`.
- Returned merged UI count was `10`, with local entries shown as sync-pending.

Evidence:

- Watchlist service tests cover Toss primary reads, local fallback/cache, and
  disabled live mutation behavior.
- Watchlist route tests cover product-aware add/remove and safe error handling.
- Client watchlist UI tests cover unsupported/Toss-only add behavior without
  exposing raw 400 errors.
- Favorites UI tests cover Toss-only rows and favorite-scoped realtime tracking
  counts instead of global slot counts.

## Verification Result

- Focused tests passed for realtime source filtering, agent-event toast
  filtering, agent-event queue filtering, price-history live sample priority,
  current candle aggregation, candle routes, watchlist routes/service, favorites
  UI, and status bar copy.
- Full `npm test` passed: 217 files / 1429 tests.
- `npm run typecheck` passed.
- `npm run build` passed. Vite reported the existing large chunk warning only.
- `git diff --check` passed.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500` passed with
  `issueCount=0`.
- Tracked non-test secret grep found no raw secret-like assignments.
- Runtime `GET /runtime/data-health` confirmed Toss fast quote lane running with
  source `toss-fast-quote`, interval `500ms`, target cap `40`, hard cap `60`.
- Runtime `GET /agent/events?limit=100` confirmed zero under-threshold
  `market_movement_detected` rows after `2026-05-15T00:41:00.000Z`.
- Safari/Computer Use visual QA confirmed:
  - Home layout renders TOP100 up/down, favorites, recent surge, selected chart,
    agent panel, account rail, and bottom status bar.
  - Recent surge showed no 0.x/1.x/2.x threshold noise during observation.
  - Agent panel showed only meaningful 3%+ market movement events after the
    queue threshold patch.
  - Full chart expansion rendered with button-based interval/range controls and
    candle chart content.
  - Favorites header stayed compact with sync/tracking counts.
- Viewport QA:
  - Chrome headless screenshot at `1600x1000` confirmed the home layout with
    populated TOP100 rows, split favorites/recent-surge panel, agent panel,
    account rail, and bottom status bar remained visible without page-level
    overflow.
  - Chrome headless screenshot at `1440x900` confirmed the home layout loading
    and empty states remained contained, with the right account rail and bottom
    status bar still visible.

Live Toss watchlist add/remove was not executed. It remains blocked until the
user gives a fresh explicit GO.
