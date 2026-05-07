# News / Disclosure Feed MVP

Date: 2026-05-06
Updated: 2026-05-07

## Goal

Replace the placeholder `관련 뉴스 · 공시` area in `StockDetailModal` with a
useful, honest first step. The first version was link-only. The current version
adds a local cached feed while keeping the same honesty boundary: Araon stores
titles, provider snippets, timestamps, and source links, not article bodies or
Araon-generated summaries.

## Implemented Scope

- `StockNewsDisclosurePanel`
- Cached per-ticker news feed:
  - Naver Finance stock-news HTML parser
  - optional Naver Search API provider when `NAVER_SEARCH_CLIENT_ID` and
    `NAVER_SEARCH_CLIENT_SECRET` are configured
- Cached per-ticker disclosure feed:
  - optional DART OpenAPI filings when `DART_API_KEY` is configured
  - DART corp-code catalog is fetched and cached locally on demand
- Per-ticker external links:
  - Naver Finance stock news
  - Naver Finance stock page
  - DART disclosure search
  - KIND disclosure search

## Data Policy

- Araon does not generate news, disclosure summaries, sentiment, or claims.
- News rows store title, URL, optional provider/snippet text, published time,
  and fetched time.
- Disclosure rows store report title, URL, source, kind, published time, and
  fetched time.
- Article body text is not stored.
- DART document bodies are not downloaded.
- No KIS calls, WebSocket calls, or background jobs are required for this feed.

## Optional API Keys

Naver Finance stock-news HTML works without an API key. Naver Search and DART
are opt-in providers:

```bash
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
DART_API_KEY=
```

How to obtain keys:

- Naver: register an application at Naver Developers and enable the Search API.
  The news endpoint uses `https://openapi.naver.com/v1/search/news.json`.
- DART: create an OpenDART account/key and use the 공시검색 / 고유번호 APIs.

## Validation

- Focused test:
  - `src/client/components/__tests__/stock-news-disclosure-panel.test.ts`
  - `src/server/news/__tests__/news-feed-service.test.ts`
  - `src/server/disclosures/__tests__/dart-disclosure-service.test.ts`
  - `src/server/routes/__tests__/stock-news.test.ts`

## HOLD

- Disclosure change alerts
- AI summary / sentiment
- Saved article/disclosure reading log
- KIND API ingestion
