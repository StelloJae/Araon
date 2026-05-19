# Araon Post-Audit UX/Reactivity/Settings Cleanup Completion Audit

Date: 2026-05-18 12:02 KST

Scope: final audit for
`docs/research/araon-post-audit-ux-realtime-settings-cleanup-goal.md`.

This audit covers the 11 user-reported post-audit issues plus the 21 completion
criteria in the goal document. It intentionally does not claim GitHub/npm
release readiness.

## 1. Evidence Sources

Implementation and tests:

- `src/client/components/SurgeBlock.tsx`
- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/AgentEventsRail.tsx`
- `src/client/components/DashboardFocusPanel.tsx`
- `src/client/components/StockNewsDisclosurePanel.tsx`
- `src/client/components/SettingsModal.tsx`
- `src/client/styles/global.css`
- `src/client/stores/toast-store.ts`
- `src/client/stores/watchlist-store.ts`
- `src/server/watchlist/araon-watchlist-service.ts`
- `src/server/market/market-top-movers-service.ts`
- related focused tests under `src/client/**/__tests__` and
  `src/server/**/__tests__`

Browser QA artifacts:

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

The screenshots are temporary QA evidence outside the repo. They are not
intended for package or git inclusion.

## 2. Original 11 Issues

| # | Issue | Result | Evidence |
|---|---|---|---|
| 1 | Recent surge row click did not change selected ticker/chart. | PASS with caveat | Surge row click is routed through the product-aware selected-ticker path instead of a catalog-only raw ticker path. Focused tests cover handler behavior and unsupported routing. Final live QA had no visible recent-surge row, so a fresh market-row click should be rechecked when one appears. |
| 2 | Duplicate visible toasts appeared at once. | PASS | Toast store and agent-event toast path dedupe by semantic key/id. Agent home display also dedupes same event type plus same product display key. Focused tests cover duplicate visible suppression. |
| 3 | Toss holdings were not automatically shown in the watch/favorites surface. | PASS | `/watchlist` normalized surface includes Toss watchlist, Toss positions, and local fallback/cache semantics. Client watchlist store and favorites tests cover position-sourced rows without raw account identifiers. |
| 4 | Many rows showed `가격 대기`. | PASS | KR eligible rows are prioritized by Toss/fast quote hydration. Unsupported or Toss-only rows use short honest states such as `Toss 전용`, `지원 대기`, or `가격 확인 중`; no fake prices or fake sparklines are introduced. |
| 5 | TOP100 order lagged behind latest percent. | PASS | TOP100 gainers/losers use latest percent snapshot ordering while keeping bounded refresh. Home QA shows separate gainers/losers surfaces; provider staleness remains exposed through freshness status rather than hidden by fake movement. |
| 6 | Toss account rail open/collapse changed icon sidebar width. | PASS | CSS now fixes the account icon rail width at 48px and overlays the account panel at narrow widths. 900px QA confirmed workspace width stability and a fixed icon rail. |
| 7 | News and disclosure tabs showed identical content. | PASS | `StockNewsDisclosurePanel` supports separate modes. News tab QA shows news/external content; disclosure tab QA shows disclosure search entries. |
| 8 | Agent panel was not understandable and looked internal/mock-like. | PASS | Agent home/detail now presents the flow as observation, candidate, simulated preview, and live lock. Visible internal/raw strings are removed from product UI; focused tests cover internal string absence and public payload safety. |
| 9 | Settings connection tab was too large and messy. | PASS | Connection tab is reorganized into product sections: Toss session/account, optional real-time tracking, and safety/data management. Visual QA shows a concise product-facing first screen. |
| 10 | KIS API profile should be one normal profile. | PASS | Normal UI exposes one KIS profile/status. Multi-profile compatibility is contained for legacy credential files and not presented as the normal product path. |
| 11 | Settings tabs and dead code needed cleanup. | PASS | Settings inventory classified keep/dev-only/remove paths. Normal UI no longer exposes legacy polling/profile/import concepts. Backend compatibility and emergency paths remain contained where tests still need them. |

## 3. Completion Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Recent surge row click changes selected ticker/chart or gives clear unsupported reason. | PASS with caveat | Product-aware routing and tests pass. Live row absent during final QA. |
| 2 | Duplicate identical visible toasts no longer appear. | PASS | Toast-store and agent-event tests pass; semantic visible dedupe added. |
| 3 | Toss account holdings are automatically visible in home watch surface. | PASS | Watchlist service/store tests cover Toss positions merged into the normalized surface. |
| 4 | Toss watchlist and Araon star/unstar semantics are unified and product-aware. | PASS | Watchlist action/state tests pass; Toss mutation remains gated by safety boundary. |
| 5 | Local favorites are fallback/cache only in normal UI. | PASS | UI copy uses sync/pending/position states rather than local list as primary truth. |
| 6 | `가격 대기` reduced for eligible KR rows and clearer states for unsupported rows. | PASS | Favorites tests and 1920 visual QA confirm compact states. |
| 7 | TOP100 lists reorder by latest percent snapshot within intended cadence when provider data changes. | PASS | TOP100 tests pass; live QA showed current gainers/losers surfaces. Provider-side staleness remains possible and is surfaced honestly. |
| 8 | Account rail open/collapse does not resize icon rail. | PASS | 900px visual QA and CSS constants confirm fixed icon rail. |
| 9 | News and disclosure tabs are no longer duplicate combined views. | PASS | 1440 news/disclosure screenshots show different content. |
| 10 | Agent panel is understandable as decision-support plus live-lock foundation. | PASS | Agent detail visual QA shows candidate flow and live execution lock. |
| 11 | Agent panel does not show mock/fake/internal raw data. | PASS | Tests cover public payload/internal string boundaries; UI now maps internal details to product copy. |
| 12 | Settings connection tab is simplified and product-facing. | PASS | Settings connection QA screenshot confirms simplified normal surface. |
| 13 | Every settings tab reviewed; unnecessary controls removed or moved behind dev-only/internal gates. | PASS | `docs/research/araon-settings-cleanup-inventory.md` records the inventory; tests cover removed normal strings. |
| 14 | Normal UI exposes one KIS profile only. | PASS | Connection/settings UI no longer exposes multi-profile management in the normal path. |
| 15 | Backend default flow uses KIS only as optional realtime tracking. | PASS | No-live soak starts without credentials and no external KIS/Toss/Naver/OpenDART calls; KIS account/order/watchlist/ranking/chart truth is not default. |
| 16 | Dead code/legacy copy removed or contained. | PASS | Normal UI copy no longer shows legacy polling/registered/KIS WS concepts; compatibility code remains internal/dev-only where needed. |
| 17 | No raw Toss/KIS/session/account/order/watchlist values appear. | PASS | Broad marker grep was manually reviewed; strict non-test raw-value pattern returned no hits. Screenshots contain no raw secret/session/account/order values. |
| 18 | No synthetic financial data/fake candle/fake sparkline introduced. | PASS | UI uses empty/unsupported/collecting states when data missing. Tests and chart QA confirm no fake movement was added. |
| 19 | Full verification commands pass or blockers documented. | PASS | Full verification passed. See section 4. |
| 20 | Browser/Computer Use visual QA passes for required screens/viewports. | PASS with caveat | Required core screens/viewports were captured and inspected. Live recent-surge click could not be manually clicked because no row existed at final QA time. |
| 21 | Completion audit document written with PASS/FAIL evidence for 11 original issues. | PASS | This document. |

## 4. Verification Results

Commands run from `/Users/stello/korean-stock-follower`:

```text
npx vitest run src/client/components/__tests__/favorites-block.test.ts src/client/components/__tests__/agent-events-rail.test.ts --fileParallelism=false
```

Result: PASS, 9 focused tests.

```text
npm test
```

Result: PASS, 226 test files, 1493 tests.

```text
npm run typecheck
```

Result: PASS.

```text
npm run build
```

Result: PASS. Production client and CLI build completed.

```text
git diff --check
```

Result: PASS.

```text
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

Result: PASS. `ok: true`, `issueCount: 0`, 18 samples.

```text
git grep -nE '(SESSION|UTK|LTK|FTK|appSecret|appKey|approval key|accountNo|account number|watchlist-item|watchlist-group)' -- ':!docs/archive/**' ':!**/*.test.ts' ':!**/*.test.tsx'
```

Result: PASS after manual review. Hits were policy text, code field names,
redaction logic, and generated local watchlist reference labels. No raw values
were found.

```text
git grep -nE '(SESSION|UTK|LTK|FTK|browserSessionId|deviceId|approval[_-]?key|appSecret|appKey|accountNumber|accountNo|CANO|ACNT_PRDT_CD|Bearer)[[:space:]]*[:=][[:space:]]*[\"' ]?[A-Za-z0-9_./+=-]{24,}' -- ':!docs/archive/**' ':!package-lock.json' ':!**/*.test.ts' ':!**/*.test.tsx'
```

Result: PASS. No non-test raw-value pattern hits.

## 5. Remaining Risk

- Live recent surge row click still needs opportunistic human/browser recheck
  when a fresh surge row exists. No fake row was created for this audit.
- Provider freshness can still make TOP100 appear briefly stale if Toss itself
  returns stale rank snapshots. Araon now avoids hiding that with synthetic
  movement.
- Legacy KIS compatibility code remains to preserve encrypted credential and
  emergency runtime behavior. It is contained away from normal product UI.

## 6. Decision

Post-audit UX/realtime/watchlist/agent/settings cleanup is implementation-closed
and verification-closed, with the single live-data caveat above documented.
