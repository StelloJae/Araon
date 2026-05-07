# Araon Monitoring Feature Next Wave

Date: 2026-05-07

## Scope

This closes the approved monitoring-focused next wave after the P1/P2 product
surface work. Araon remains read-only and does not add order/trading flows.

Implemented:

- Phone alert bridge: optional Telegram env bridge for alert crossings.
- Alert condition builder: volume surge ratio rules and market-cap scoped rules.
- Market-cap filters: confirmed active on the main surge block.
- Data source and reliability indicators: stock data quality now distinguishes
  integrated realtime, KRX/NXT realtime, REST fallback, and snapshots.
- Market phase status: top market badge shows `LIVE · 장중`, `PRE · 장전`, or
  `SNAPSHOT · 장후`.
- Automated signal review: data-health copy labels the existing signal outcome
  dashboard as automatic review.

Not implemented by product decision:

- Signal Inbox.
- Phone handoff card.
- Separate pre/open/after dashboards.

## Policy

- Telegram phone alerts are optional and disabled by default.
- If `ARAON_TELEGRAM_BOT_TOKEN` or `ARAON_TELEGRAM_CHAT_ID` is missing, the
  server returns `PHONE_NOTIFICATION_NOT_CONFIGURED`.
- Volume-surge-ratio rules only fire when both previous and current quotes have
  `volumeBaselineStatus=ready`.
- Market-cap scoped rules default to `all` for backward compatibility with older
  localStorage rules.
- No KIS live call, WebSocket session, cap test, or backfill run is required for
  these changes.

## Verification

- Focused alert/settings/runtime/component tests cover:
  - phone notification status and alert routes
  - phone notification setting persistence
  - volume surge ratio crossing
  - market-cap scoped rule filtering
  - alert-rule market-cap persistence
  - market badge phase labels
  - data-quality source labels
- Full verification should include `npm test`, `npm run typecheck`,
  `npm run build`, `git diff --check`, secret grep, and browser UI smoke.
