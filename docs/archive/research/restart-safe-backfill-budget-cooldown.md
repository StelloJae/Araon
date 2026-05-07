# Restart-Safe Daily Backfill Call Counter/Cooldown

Date: 2026-05-06
Original commit target: `feat(backfill): persist daily backfill budget state`

## Goal

Managed daily backfill is enabled by default after KIS credentials are
configured. Its call counter and cooldown survive app restarts so a restart does
not immediately forget recent 429/5xx throttling. As of the follow-up product
policy, Araon no longer stops daily backfill on an arbitrary daily budget; it
continues at the managed low rate during allowed market-closed windows.

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
