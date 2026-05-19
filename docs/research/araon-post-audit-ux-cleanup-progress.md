# Araon Post-Audit UX Cleanup Progress

Date: 2026-05-18 12:02 KST

This note records the execution progress for
`docs/research/araon-post-audit-ux-realtime-settings-cleanup-goal.md`.

## Current Runtime Re-Audit

The built production client was rebuilt and served through the Araon CLI server
before visual QA. Browser inspection used the actual app, not static mock HTML.

Observed screens:

- Home, 1920x1080: `/tmp/araon-qa/01-home-1920x1080.png`
- Home, 1600x1000: `/tmp/araon-qa/02-home-1600x1000.png`
- Full Chart, 1600x1000: `/tmp/araon-qa/03-full-chart-1600x1000.png`
- Agent Detail, 1600x1000: `/tmp/araon-qa/04-agent-detail-1600x1000.png`
- News tab, 1440x900: `/tmp/araon-qa/05-news-tab-1440x900.png`
- Disclosure tab, 1440x900: `/tmp/araon-qa/06-disclosure-tab-1440x900.png`
- Settings connection tab, 1440x900:
  `/tmp/araon-qa/07-settings-connection-1440x900.png`
- Account rail open, 900x900: `/tmp/araon-qa/08-account-open-900x900.png`
- Dark status bar, 1440x900: `/tmp/araon-qa/09-dark-status-1440x900.png`

## Findings Closed In This Pass

- Account rail width now stays stable when opened at narrow width. The account
  panel overlays from the right instead of shrinking the workspace grid.
- The 900px account rail keeps the icon rail at a fixed 48px width.
- Unsupported/Toss-only favorites rows no longer show tall stacked status text
  that crushes the row layout.
- Favorites rows now prefer short state text such as `Toss 전용`, `지원 대기`, or
  `가격 확인 중` instead of broad legacy copy.
- Agent home display dedupes same event type and same product display key so a
  duplicated visible candidate does not occupy multiple home rows.
- News and disclosure tabs render different content. News shows external/news
  items; disclosure shows DART/KIND disclosure search entries.
- Settings connection tab is product-facing in the normal view and no longer
  exposes profile/polling-oriented controls in the visible default surface.
- Dark mode bottom status bar no longer stays white.

## Caveats

- The current live UI did not contain a `최근 급상승` row at the time of final
  visual QA. Click behavior is covered by the product-aware route wiring and
  component/store tests, but a live market row click should still be rechecked
  opportunistically when a fresh surge row appears.
- Some backend compatibility code for legacy KIS and credential files remains
  intentionally contained. It is not shown as normal product UI.

## Verification Snapshot

- Focused component tests: passed.
- `npm test`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: passed.
- Broad secret marker grep found only field names, policy text, and code
  identifiers. A stricter non-test raw-value pattern returned no hits.
