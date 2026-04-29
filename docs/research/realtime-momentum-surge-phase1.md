# Realtime Momentum Surge Phase 1

Date: 2026-04-29

## Goal

Replace the meaning of Araon's realtime surge foundation from "today's
cumulative gain reappeared on a fresh tick" to "a ticker crossed a recent
rolling momentum threshold."

This phase adds only the pure detector and bucketed in-memory history. It does
not wire the detector into SSE or `SurgeBlock` yet.

## Decision

Araon now separates surge concepts:

- Recent surge: 10s / 20s / 30s scalp momentum.
- Short trend: 1m / 3m / 5m momentum.
- Today strong: existing previous-close `changePct` basis.

The default recent surge tab should eventually prioritize only scalp signals:

- `scalp`
- `strong_scalp`
- `overheat`

`trend` signals are intended for secondary labels or the combined "all" view.

## Detector

Added `src/client/lib/realtime-momentum.ts`.

The detector is pure and has no SSE, Zustand, DOM, or KIS dependency. It
supports:

- Momentum windows: `10s`, `20s`, `30s`, `1m`, `3m`, `5m`
- Same-session baseline lookup only
- Baseline tolerance per window
- Crossing-only signal generation
- 90s same-ticker cooldown
- Level escalation during cooldown
- Primary signal classification
- Exit warning helpers

Thresholds:

| Type | Window | Threshold |
|---|---:|---:|
| scalp | 10s | +0.8% |
| scalp | 20s | +1.2% |
| scalp | 30s | +1.8% |
| strong_scalp | 10s | +1.5% |
| strong_scalp | 20s | +2.2% |
| strong_scalp | 30s | +3.0% |
| overheat | 10s | +3.0% |
| overheat | 30s | +5.0% |
| trend | 1m | +2.5% |
| trend | 3m | +4.0% |
| trend | 5m | +5.0% |

## Bucketed History

Added `src/client/stores/momentum-history-store.ts`.

Policy:

- Memory-only; no `localStorage`
- 1s buckets
- 6 minute retention
- Keyed by ticker and session
- One latest price per bucket
- Cap on tracked ticker/session keys

This avoids relying on the existing raw `price-history-store`, whose 120 point
cap can be too small for high-frequency names when a stable 5m baseline is
needed.

## Validation

Focused tests:

```bash
npx vitest run \
  src/client/lib/__tests__/realtime-momentum.test.ts \
  src/client/stores/__tests__/momentum-history-store.test.ts \
  --fileParallelism=false
```

Result:

- 2 files passed
- 26 tests passed

No live KIS approval key, WebSocket connection, or cap smoke was used in this
phase.

## Follow-up

Next commit should wire this foundation into `useSSE` and `SurgeBlock`:

1. Feed only `source === 'ws-integrated'`, non-snapshot, live-market price
   updates into the bucketed history.
2. Replace realtime surge spawning from previous-close `changeRate` with
   crossing-based momentum decisions.
3. Keep the today-strong tab on existing previous-close `changePct` logic.
4. Render recent surge labels such as `급가속 · 30초 +2.1%`.
