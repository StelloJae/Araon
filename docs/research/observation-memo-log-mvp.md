# Observation Memo Log MVP

Date: 2026-05-06

## Goal

Add a small local observation log to the stock detail modal so Araon can preserve
the user's own thesis fragments and follow-up notes alongside realtime signals
and local chart history.

This is not an advice engine and does not synthesize financial data.

## Implemented Scope

- Local SQLite table: `stock_notes`
- Per-ticker note list, create, and delete
- `StockDetailModal` section: `관찰 메모`
- Client API helpers for note list/create/delete
- Notes cascade when a tracked stock is removed

## API

- `GET /stocks/:ticker/notes`
- `POST /stocks/:ticker/notes`
  - body: `{ "body": "..." }`
  - body is trimmed and capped at 2,000 characters
- `DELETE /stocks/:ticker/notes/:noteId`

All routes are local app routes. They do not call KIS and do not expose
credentials, account values, tokens, or approval keys.

## Data Policy

- Notes are user-authored text only.
- No synthetic prices, candles, ratios, news, or recommendations are generated.
- Removing a tracked stock deletes its notes through the stock foreign key.

## Validation

- Focused tests:
  - `src/server/routes/__tests__/stock-notes.test.ts`
  - `src/client/components/__tests__/stock-notes-panel.test.ts`
- `npm run typecheck`

## HOLD

- Rich tagging / categories
- Editing an existing note
- Exporting notes
- Linking notes to exact candle timestamps
- AI summaries
