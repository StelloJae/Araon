# NXT - always-on realtime and volume UI

Date: 2026-04-29

## Decision

After cap 1/3/5/10/20/40 controlled UI smoke evidence, this workstation's local
runtime treats H0UNCNT0 integrated realtime as the steady-state path. Fresh
installs stay conservative and require an explicit persisted settings change
before always-on realtime starts.

## Runtime changes

- Local `data/settings.json` was updated to `websocketEnabled=true` and
  `applyTicksToPriceStore=true` for this workstation runtime.
- Fresh-install code defaults remain `websocketEnabled=false` and
  `applyTicksToPriceStore=false`.
- The market-hours scheduler follows the integrated KRX+NXT window:
  - warmup: 07:55 KST
  - open: 08:00 KST
  - close: 20:00 KST
  - shutdown: 20:05 KST
- Warmup connects the WebSocket and subscribes the current realtime favorite
  assignment immediately.
- Runtime favorite subscriptions are capped at `WS_MAX_SUBSCRIPTIONS=40`.
- REST polling remains active as fallback.

## Design follow-up

The Claude design/handoff included visible `volume` in the watchlist and
surge-oriented surfaces. Current backend quotes already carry raw cumulative
share volume, but the UI had not exposed it in compact rows.

This update restores honest volume visibility:

- `StockRow` shows `거래량 N.N만`.
- `SurgeBlock` row sublabels include `거래량 N.N만` when the current quote is
  available.

The UI still does not show a volume-multiple label such as `거래량 5.2x`.
That would require an average-volume or previous-volume baseline. Inventing
the multiplier from raw cumulative volume alone would violate the synthetic
financial data rule.

## Verification

- Focused tests covered:
  - default runtime gates
  - integrated market-hour transitions
  - warmup connect and initial favorite subscription
  - compact stock-row volume rendering
  - surge-row volume label formatting
- Full regression:
  - `npm test`: 50 files / 467 tests passed.
  - `npm run typecheck`: clean.
  - `npm run build`: clean (`dist/assets/index-BWOqcXcv.js` 317.70 kB / gzip 95.13 kB).
  - `git diff --check`: clean.
  - refined secret grep over `src`, `docs`, and `AGENTS.md`: no raw long token/key literal found.
