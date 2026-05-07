# Existing Local Data UI Smoke

Date: 2026-05-06 16:50-16:54 KST
Tooling: Computer Use + local CLI server
Commit target: `docs(runtime): record existing local data UI smoke`

## Goal

Verify Araon with an existing local data directory and saved credentials from
the real user flow, without exposing raw KIS credentials or account identifiers.

## Server

Command:

```txt
node dist/cli/araon.js --no-open --host 127.0.0.1 --port 4173 --log-level warn
```

CLI data directory:

```txt
/Users/stello/Library/Application Support/Araon
```

The server was stopped after the smoke.

## API Read-Only Checks

Redacted API shape:

```json
{
  "credentialsConfigured": true,
  "runtimeStatus": "started",
  "realtimeState": "idle",
  "subscribedTickerCount": 0,
  "approvalKeyStatus": "none",
  "settings": {
    "websocketEnabled": false,
    "applyTicksToPriceStore": false,
    "backgroundDailyBackfillEnabled": true,
    "backgroundDailyBackfillRange": "3m",
    "rateLimiterMode": "paper"
  },
  "trackedStocks": 5
}
```

No raw key, token, approval key, or account value was printed.

## Computer Use UI Checks

Browser URL:

```txt
http://127.0.0.1:4173
```

Observed:

- Dashboard loaded with 5 tracked stocks.
- Header showed market state `LIVE`.
- Footer showed total stocks, favorite/WS tier count, polling count, and last
  update timestamp.
- Settings modal opened through the visible settings button.
- Connection tab showed:
  - runtime connected
  - credentials stored
  - paper mode for this existing local profile
  - REST polling active
  - WebSocket waiting
  - integrated realtime card with emergency disable action
  - daily backfill card with automatic operation text and 3m range
  - master stock count/refresh state
- StockDetailModal opened for `005930`.
- Realtime tab rendered price history and observation reasons.
- Chart tab rendered local candle data through TradingView Lightweight Charts.

## Notes

This existing local profile has explicit persisted realtime false settings, so
the smoke verifies compatibility with an emergency-disabled existing profile
rather than forcing managed realtime ON. That is intentional: explicit false
settings are preserved by policy.

The UI still labels the favorite realtime tier as `WS` even when persisted
WebSocket settings are disabled. This did not block the smoke, but it is a small
copy precision issue to revisit during later UI polish.

## Verdict

`CONDITIONAL GO` for existing local data UI smoke.

No P0 blocker found.
