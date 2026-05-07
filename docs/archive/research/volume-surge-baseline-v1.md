# Volume surge baseline v1

Date: 2026-04-29

## Decision

Araon must not display fake volume-surge multipliers. The approved baseline is:

```txt
today cumulative volume at the current session/time bucket
/
recent 20 trading days average cumulative volume at the same session/time bucket
```

Simple full-day average volume is not used because it overstates normal morning
volume concentration and understates late-session comparisons.

## Existing data/API check

Current KIS REST wiring only implements the narrow quote path used by polling:

- `GET /uapi/domestic-stock/v1/quotations/inquire-price`
- mapped cumulative volume field: `acml_vol`

There is no implemented historical minute/daily volume endpoint in the app
today. The v1 foundation therefore does not add live historical KIS calls and
does not fan out across all master stocks.

The existing local `price_snapshots` table already stores cumulative volume for
tracked prices at the periodic snapshot cadence. v1 treats this table as the
local baseline sample source and adds pure helpers to derive same-session /
same-time baselines from those snapshots.

## Baseline model

```ts
{
  ticker: string,
  session: 'pre' | 'regular' | 'after' | 'unknown',
  timeBucket: 'HH:mm',
  sampleCount: number,
  avgCumulativeVolume: number,
  updatedAt: string
}
```

Session buckets use KST:

- `pre`: 08:00-08:50
- `regular`: 09:00-15:20
- `after`: 15:30-20:00
- `unknown`: outside comparable windows

## Display policy

- `sampleCount < 5`: ratio hidden, UI may show `기준선 수집 중`.
- `sampleCount >= 5`: ratio can be displayed with one decimal place.
- `sampleCount >= 20`: high-confidence baseline.
- `avgCumulativeVolume <= 0`, missing baseline, invalid volume, or unknown
  session: ratio hidden.

The UI now supports:

- `거래량 N.N만` for current cumulative volume.
- `기준선 수집 중` when current volume exists but baseline is not ready.
- `거래량 5.2x` only when a same-session/time-bucket baseline is available.

## Current status

P1 is closed as a trustworthy foundation, not as a fully backfilled historical
ratio rollout.

Implemented:

- Pure ratio helper with null-safe policy.
- KST session/time-bucket helper.
- Snapshot-history baseline builder using the most recent 20 matching KST dates.
- Collector helper that only emits baseline candidates for tracked stocks.
- Surge UI display path that refuses to invent a multiplier without baseline.

Remaining future enhancement:

- Wire a scheduled baseline materialization step or historical KIS backfill once
  a safe, rate-limited historical endpoint is explicitly approved.
