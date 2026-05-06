# Restart-Safe Daily Backfill Budget/Cooldown

Date: 2026-05-06
Commit target: `feat(backfill): persist daily backfill budget state`

## Goal

Managed daily backfill is enabled by default after KIS credentials are
configured. Its safety budget and cooldown must survive app restarts so a restart
does not immediately forget recent 429/5xx throttling or the daily call budget.

## Implementation

- Added `background-backfill-state.json` under the active Araon data directory.
- Persisted fields:
  - `budgetDateKey`
  - `dailyCallCount`
  - `cooldownUntilMs`
- `createBackgroundDailyBackfillScheduler()` now accepts an optional
  `stateStore`.
- `createAraonServer()` wires the scheduler to `createFileBackfillStateStore()`.
- Missing, unreadable, or malformed state files fall back to an empty state.

## Policy

This does not widen backfill scope.

- Backfill remains tracked/favorites only.
- Market-hours guard remains in place.
- Full master backfill remains HOLD.
- Historical minute backfill remains HOLD.
- No live KIS call is required for the tests.

## Verification

Focused tests:

```txt
npx vitest run \
  src/server/chart/__tests__/backfill-state-store.test.ts \
  src/server/chart/__tests__/background-backfill-scheduler.test.ts \
  --fileParallelism=false
```

Result:

```txt
2 files / 13 tests pass
```
