# Alert and News Live Acceptance

Date: 2026-05-07

## Scope

This closes the approved follow-up covering:

1. Telegram phone alert smoke
2. selected-stock alert rule quick-add UX
3. Naver/OpenDART news and disclosure API live acceptance
4. minimal alert delivery log
5. existing-profile browser acceptance

No KIS token issuance, approval key issuance, WebSocket session, cap smoke, or
candle backfill live run was intentionally executed for this acceptance.

## Results

### Telegram phone bridge

- Server status route was checked through the running local server.
- Result: Telegram bridge is not configured in the current environment.
- `POST /runtime/notifications/telegram/alert` returned the safe
  `PHONE_NOTIFICATION_NOT_CONFIGURED` error.
- Real phone delivery was **not executed** because
  `ARAON_TELEGRAM_BOT_TOKEN` and `ARAON_TELEGRAM_CHAT_ID` are not present.
- No raw Telegram token/chat value was printed or stored.

### Stock modal alert quick-add

- StockDetailModal now exposes compact selected-ticker presets:
  - `등락률 +5%`
  - `등락률 -5%`
  - `거래량 2.5x`
  - `현재가 +3%`, only when the current price is available
- Duplicate rules are detected by ticker/kind/threshold/market-cap scope.
- Rules remain browser-local through `araon-rules-v1`.

### Alert delivery log

- The alert evaluator records recent delivery outcomes to
  `araon-alert-deliveries-v1`.
- Retention is a local ring buffer capped at 200 entries.
- Channels tracked: toast, sound, desktop, phone.
- Settings > 알림 shows the latest local delivery records and a clear action.
- This log is diagnostic only; it does not contain credentials, tokens, approval
  keys, account numbers, or raw upstream responses.

### Naver/OpenDART live acceptance

Ticker: `005930`

Redacted result shape:

| Route | Status | Returned | Total | Source evidence |
|---|---:|---:|---:|---|
| `POST /stocks/005930/news/refresh` | 200 | 5 | 176 | Naver Finance + Naver Search cached |
| `GET /stocks/005930/news?limit=3&offset=0` | 200 | 3 | 176 | pagination `hasNext=true` |
| `POST /stocks/005930/disclosures/refresh` | 200 | 5 | 102 | OpenDART filing cached |
| `GET /stocks/005930/disclosures?limit=3&offset=0` | 200 | 3 | 102 | pagination `hasNext=true` |

Additional source count check for the first 50 cached news items:

- `naver-finance`: 38
- `naver-search`: 12

The acceptance stored titles, snippets/descriptions, dates, and links only.
Araon still does not store full article bodies, raw HTML, disclosure document
bodies, generated summaries, or sentiment analysis.

### Browser acceptance

Browser Use/Playwright verified the existing local profile at
`http://127.0.0.1:5173`:

- Dashboard loaded with `LIVE · 장중`.
- Search for 삼성전자 opened StockDetailModal.
- StockDetailModal showed:
  - realtime tab
  - alert quick-add presets
  - data quality panel
  - cached news page with live links
  - cached DART filing page
- Settings > 알림 showed:
  - Telegram unconfigured copy
  - disabled Telegram test button
  - recent alert delivery log empty state

## Verification

Focused tests:

- `src/client/lib/__tests__/alert-rule-presets.test.ts`
- `src/client/stores/__tests__/alert-delivery-store.test.ts`
- `src/client/components/__tests__/alert-delivery-log-panel.test.ts`
- `src/client/components/__tests__/volume-visibility.test.ts`

Focused result: 4 files / 22 tests passed.

Full verification should still include:

- `npm test`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- raw secret/token/key leak grep

## Remaining

- Telegram real phone delivery remains pending until the user supplies
  Telegram bot token and chat id in env.
- Naver/OpenDART live acceptance is complete for the selected 005930 path, but
  long-run parser/provider observation remains useful.
