# Realtime Momentum Surge Phase 1

Date: 2026-04-29

## Goal

Replace the meaning of Araon's realtime surge foundation from "today's
cumulative gain reappeared on a fresh tick" to "a ticker crossed a recent
rolling momentum threshold."

Phase 1 added only the pure detector and bucketed in-memory history. Phase 3+4
then wired that foundation into SSE, `useSurgeStore`, and `SurgeBlock`.

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

## Phase 3+4 Wiring

Added the frontend wiring after the Phase 1+2 foundation:

- `src/client/hooks/useSSE.ts` now feeds only `ws-integrated`, non-snapshot,
  live-market `price-update` events into the momentum history/detector path.
- REST polling updates and snapshots no longer create realtime surge entries.
- `src/client/stores/surge-store.ts` now supports realtime-momentum payloads,
  same-ticker de-duplication, signal-level escalation, and exit-warning updates.
- `src/client/lib/surge-aggregator.ts` keeps `trend` signals out of the default
  recent-surge tab while still allowing them in the combined view.
- `src/client/components/SurgeBlock.tsx` labels the tabs as:
  - Recent surge: `최근 급상승`
  - Today strength: `오늘 강세`
  - Combined: `전체`

Current UI meaning:

- `최근 급상승`: 10s / 20s / 30s scalp momentum only.
- `오늘 강세`: existing previous-close `changePct` basis.
- `전체`: recent momentum signals, trend-only signals, and today-strong rows.

Trend-only signals from 1m / 3m / 5m are deliberately not primary recent-surge
entries. They are context for the combined view, not scalp entry candidates.

Exit warnings currently surface the detector helper labels such as `이탈 경고`
or `탄력 약함` when the active signal state weakens.

## Follow-up

Next live/market observation should tune thresholds, not redefine the model:

1. Observe whether 10s / 20s / 30s thresholds are too noisy or too sparse.
2. Tune threshold values if needed.
3. Consider session-specific thresholds for regular vs pre/after markets.
