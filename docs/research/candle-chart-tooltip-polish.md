# Candle Chart Tooltip Polish

Date: 2026-05-06

## Goal

Make the persisted candle chart easier to inspect without changing the data
source or inventing missing candles.

## Implemented Scope

- Header hint: hover over the chart to inspect OHLCV.
- Lightweight Charts crosshair handler.
- Floating tooltip with:
  - KST minute
  - open / high / low / close
  - volume
  - source when present

## Data Policy

- Tooltip values come only from the candle item returned by
  `GET /stocks/:ticker/candles`.
- No synthetic candles, inferred prices, or fabricated volume multipliers are
  shown.

## Validation

- Focused test:
  - `src/client/components/__tests__/stock-candle-chart.test.ts`
- `npm run typecheck`

## HOLD

- Click-to-pin tooltip
- Crosshair synchronized with external metrics panels
- Custom tooltip formatting per interval
- Keyboard chart inspection
