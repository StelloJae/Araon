# News / Disclosure Link MVP

Date: 2026-05-06

## Goal

Replace the placeholder `관련 뉴스 · 공시` area in `StockDetailModal` with a
useful, honest first step.

## Implemented Scope

- `StockNewsDisclosurePanel`
- Per-ticker external links:
  - Naver Finance stock news
  - Naver Finance stock page
  - DART disclosure search
  - KIND disclosure search
- The panel opens external pages in a new tab and does not fetch, cache, or
summarize articles/disclosures.

## Data Policy

- Araon does not generate news, disclosure summaries, sentiment, or claims.
- The panel is a navigation surface only.
- No KIS calls, WebSocket calls, or background jobs are involved.

## Validation

- Focused test:
  - `src/client/components/__tests__/stock-news-disclosure-panel.test.ts`

## HOLD

- In-app news feed
- DART/KIND API ingestion
- Disclosure change alerts
- AI summary / sentiment
- Saved article/disclosure reading log
