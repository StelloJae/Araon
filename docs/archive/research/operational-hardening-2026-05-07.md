# Araon Operational Hardening — 2026-05-07

## Scope

This pass closed the five remaining operational gaps after the Telegram alert
and beta desktop work. It did not add new market-data sources and did not change
the no-synthetic-data policy.

## Changes

- Background daily backfill now classifies zero-work results as `no_change`.
  A ticker that returns no daily candle work is placed in a 6 hour in-memory
  no-work cooldown, so the scheduler does not retry the same empty ticker every
  minute.
- REST polling now accepts a runtime skip predicate. Production wiring skips
  REST polling only for tickers currently covered by a connected integrated
  WebSocket assignment and only when both persisted realtime gates are enabled.
  If WebSocket is disconnected, REST polling still covers every tracked ticker.
- Telegram phone alert delivery is now split into a testable queue helper and a
  server-side sanitized in-memory delivery log:
  `GET /runtime/notifications/telegram/deliveries`.
- `/runtime/data-health` now surfaces:
  - backfill no-work cooldown count and next retry time
  - disclosure cache growth/staleness
  - phone alert delivery counts and latest sanitized status
- Settings data health UI now shows no-work backfill exclusions, disclosure
  cache health, and phone alert delivery health.

## Verification

Focused tests added or updated:

- `src/server/chart/__tests__/background-backfill-scheduler.test.ts`
- `src/server/polling/__tests__/polling-scheduler.test.ts`
- `src/server/routes/__tests__/runtime.test.ts`
- `src/server/routes/__tests__/stock-news.test.ts`
- `src/client/components/__tests__/managed-operations-settings.test.ts`
- `src/client/components/__tests__/backfill-status-strip.test.ts`
- `src/client/lib/__tests__/phone-alert-delivery.test.ts`

Focused result: 7 files / 66 tests passed.

## Notes

- The no-work cooldown is intentionally in-memory. Restart-safe 429/5xx cooldown
  and call counters remain in `background-backfill-state.json`; the no-work
  cooldown is a light guard against per-minute empty loops, not a correctness
  boundary.
- Full watchlist minute backfill and automatic historical minute backfill remain
  prohibited.
- The phone delivery log stores sanitized metadata only. It does not store bot
  tokens, chat IDs, credentials, raw Telegram responses, or account data.
