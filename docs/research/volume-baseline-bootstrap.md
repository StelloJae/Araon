# Volume Baseline Bootstrap

Date: 2026-05-06

## Goal

Wire the existing trustworthy volume-baseline model into the live price pipeline
so Araon can show a volume surge ratio as soon as enough persisted same-time
samples exist.

## Implemented Scope

- `createVolumeBaselineEnricher`
- `PriceStore` optional price enrichment hook
- `PriceSnapshotRepository.findSinceForTickers`
- App wiring: every REST/WebSocket price update passes through the volume
  baseline enricher before storage and SSE emission

## Baseline Source

The bootstrap uses local `price_snapshots` history:

```txt
current cumulative volume
/
recent local snapshot average for the same ticker/session/KST minute
```

This is the same model defined in `volume-surge-baseline-v1.md`.

## Honest Display Policy

- `sampleCount >= 5` and valid average volume: `volumeBaselineStatus=ready`
  and `volumeSurgeRatio` is emitted.
- Missing/insufficient samples: `volumeBaselineStatus=collecting` and ratio
  remains `null`.
- Missing/invalid current volume or unknown session: `unavailable`.

No full-day volume average, synthetic baseline, historical minute backfill, or
full-market backfill is used.

## Runtime Policy

The baseline cache rebuilds only when the KST date/session/minute bucket changes.
This avoids querying local SQLite for every high-frequency WebSocket tick.

## Validation

- Focused tests:
  - `src/server/volume/__tests__/volume-baseline-service.test.ts`
  - `src/server/price/__tests__/price-store.test.ts`
  - existing volume baseline helper tests
- `npm run typecheck`

## HOLD

- Historical minute bootstrap
- KIS historical volume bootstrap
- Persisted materialized baseline table
- Confidence labels beyond collecting/ready/unavailable
