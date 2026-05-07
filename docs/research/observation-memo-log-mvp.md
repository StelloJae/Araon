# Observation Surfaces Removal

Date: 2026-05-07

## Decision

The user-authored observation surfaces were removed from Araon.

Removed product surfaces:

- `관찰 계획`
- `관찰 메모`
- `관찰 타임라인`
- stock-detail 전용 `관찰 근거` 섹션

The reason is product focus. These panels made the stock detail modal heavier
without improving the core monitoring loop: realtime movement, candle coverage,
news/disclosure links, and data health.

## Removed Runtime/API Surface

- `GET /stocks/:ticker/observation-plan`
- `PUT /stocks/:ticker/observation-plan`
- `GET /stocks/:ticker/notes`
- `POST /stocks/:ticker/notes`
- `DELETE /stocks/:ticker/notes/:noteId`
- `GET /stocks/:ticker/timeline`

`StockDetailModal` no longer imports or renders the observation plan, notes,
timeline, or detail-only observation reason components. The client API helpers
for those routes were also removed.

## Data Policy

Existing SQLite migration files and deployed tables remain in place for
migration compatibility. New code paths do not read, write, export, restore, or
display those records.

Realtime signal events remain as internal diagnostics for signal outcome
tracking and data-health summaries. They are no longer exposed through a stock
detail observation timeline.

## Validation Target

- Removed routes return `404`.
- Local backup/restore contains only tracked stocks and favorites.
- `/runtime/data-health` no longer reports observation-note growth.
- The stock detail modal shows realtime/chart/data-quality/news surfaces without
  observation plan, notes, timeline, or observation-reason panels.
