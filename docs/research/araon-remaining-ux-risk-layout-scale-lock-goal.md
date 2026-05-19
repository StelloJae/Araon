# Araon Remaining UX Risk + Layout Scale Lock Goal

> Status: execution brief draft
> Date: 2026-05-19
> Repo: `/Users/stello/korean-stock-follower`
> Scope: post-agent-upgrade UX risks, browser scale parity, layout regression guardrails
> Design authority: `docs/design.md`
> Safety posture: no live orders, no account mutation except bounded Toss watchlist sync when explicitly needed and already authorized by the user

## 0. Purpose

Araon has repeatedly regressed in the same way: a goal run fixes one product issue
but unintentionally changes global typography, component density, panel layout, or
browser-specific scale. The next execution pass must therefore treat layout scale
as a first-class product contract, not as a final polish item.

This goal closes the remaining user-visible risks:

1. Favorites unstar does not remove the product from Toss watchlist.
2. News/disclosure content does not refresh automatically enough for agent use.
3. Sector layout is broken and wastes space.
4. Toss account rail lacks hover affordance and real product icons.
5. Agent panel and safety copy can still exceed the intended Araon type scale.
6. Bottom status bar remains visually heavy and contains labels that feel like
   internal diagnostics.
7. Browser scale differs too much between Chrome and Safari.
8. Agent panel layout must stay side-by-side on desktop, not collapse into a
   vertical stack unless the viewport is genuinely narrow.

The goal is not complete until these UX risks are fixed and visual scale is
verified in both Chrome and Safari.

## 1. Non-Negotiable Design Contract

All implementation work in this goal must preserve the existing Araon design
system from `docs/design.md`.

### 1.1 Typography Scale Lock

Use the type sizes from `docs/design.md` as hard guardrails:

| Surface | Target |
|---|---|
| App wordmark | 18px / 800 |
| Selected ticker title | 24px / 900 |
| Panel title | 13-14px / 800 |
| Section title | 15-17px / 800 |
| Metric value large | 18-24px / 900 |
| Metric value | 13-14px / 800 |
| Row primary | 12-14px / 700-800 |
| Body/helper | 11-12px / 600-700 |
| Pill text | 10-11px / 800-900 |
| Micro label | 9-10px / 700-800 |

Rules:

- Do not increase global `html`, `body`, or `:root` font size to solve a local
  readability issue.
- Do not use `vw`, `vh`, `clamp()` with viewport-scaled font sizes, or browser
  zoom assumptions for product text.
- Do not add component-local oversized font sizes unless they match a role above.
- Do not change `line-height` globally without a visual QA note and test evidence.
- If a component needs emphasis, use weight, spacing, or hierarchy before size.
- Account rail labels such as `원화`, `달러`, `보유`, `거래`, `관심` must be fixed
  locally, not by scaling the whole app.
- Any patch that changes global font tokens must include a before/after browser
  measurement note.

### 1.2 Browser Scale Parity Lock

Chrome and Safari must feel like the same product at the same viewport size.
Minor differences from browser chrome height are acceptable; oversized text,
different panel density, or different row counts are not.

Required checks:

- Chrome, light mode, 1600x1000.
- Chrome, dark mode, 1600x1000.
- Safari, light mode, 1600x1000.
- Safari, dark mode, 1600x1000.
- At least one narrower responsive check around 900px width.

Before judging a browser scale bug, reset page zoom to 100%.

Expected parity:

- TOP100 row count should be visually similar.
- Favorites row height should be visually similar.
- Agent panel should keep the same layout mode at the same viewport width.
- Account rail row density should be visually similar.
- Bottom bar height should be visually similar.
- No text should wrap because one browser is rendering the app at a much larger
  scale than the other.

### 1.3 Desktop Layout Lock

Home layout remains:

- Main workspace excluding account rail: left/right 50:50.
- Left top: TOP100 rising/falling.
- Left bottom: favorites and recent surge split 50:50.
- Right top: selected ticker panel.
- Right bottom: agent panel.
- Account rail: narrow, collapsible, right side.
- Bottom status bar: fixed visible product bar.

Agent panel desktop rule:

- At desktop widths, the agent panel body is two columns:
  - left: detected candidates / event queue.
  - right: safety / preview / lock status.
- It may collapse to one column only at narrow responsive widths, currently
  around `max-width: 900px`.
- A goal run must not introduce a desktop `max-width: 1500px` or similar rule
  that stacks the agent panel vertically.

### 1.4 CSS Regression Guardrails

Before editing CSS:

1. Identify the component selector being changed.
2. Check whether the same behavior can be fixed locally.
3. Avoid global font/layout changes unless the root cause is truly global.
4. If global CSS must change, add explicit browser QA evidence to the audit.

Suggested regression checks:

- Add or update tests that render the relevant component and assert stable class
  names or structural layout where possible.
- Use browser visual QA for actual dimensions; unit tests alone are insufficient.
- For CSS-only changes, run `git diff --check` and at least focused component
  tests for touched components.

## 2. Scope Of Remaining UX Risks

### 2.1 Favorites Unstar / Toss Watchlist Sync

Observed issue:

- Clicking a filled favorite star does not remove the product from favorites.
- Expected behavior is product-aware Toss watchlist removal.
- If the product is currently held in the Toss account, it must remain visible in
  the user-facing favorites/holdings surface and should not be removable from the
  surface as long as it is held.

Product rule:

- User-facing truth priority remains:
  1. Toss watchlist.
  2. Toss holdings.
  3. Araon local favorite/cache fallback.

Expected behavior:

- Watchlist-only product:
  - star on: in Toss watchlist.
  - unstar: remove from Toss watchlist and disappear from favorites after sync.
- Holding product:
  - star on or filled/held indicator: visible because it is held.
  - unstar: if also Toss watchlist, remove watchlist membership but keep visible
    as `보유`.
  - if not Toss watchlist and only held, the remove action should be disabled or
    explained as `보유 종목은 계좌에 있는 동안 표시됩니다`.
- Toss mutation failure:
  - no raw error.
  - show `동기화 대기`, `로그인 필요`, or `동기화 실패` with a short user-safe reason.

Relevant surfaces:

- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/StockRow.tsx`
- `src/client/stores/watchlist-store.ts`
- `src/client/lib/api-client.ts`
- `src/server/routes/watchlist.ts`
- `src/server/watchlist/araon-watchlist-service.ts`
- `src/server/toss/toss-watchlist-client.ts`

Acceptance:

- Unstar works for a non-held Toss watchlist product.
- Held products remain visible and are not misleadingly removable.
- No raw Toss/session/watchlist value appears in UI/logs/docs.
- Tests cover watchlist-only removal, holding-preserved removal, and mutation
  failure copy.

### 2.2 News / Disclosure Auto Refresh For Agent Input

Observed issue:

- News/disclosure data refreshes only when the user clicks the tab.
- The agent cannot rely on fresh news/disclosure input if refresh is purely
  click-triggered.

Product rule:

- News and disclosure are inputs to decision support, not just passive tabs.
- They should refresh on selected ticker changes and on a bounded freshness
  interval.
- Do not full-market poll news/disclosures aggressively.

Expected behavior:

- When selected ticker changes, fetch or refresh news/disclosure for that ticker.
- While the ticker remains selected, refresh on a bounded cadence if the data is
  stale.
- Favorites/holdings/agent candidates may be queued for low-frequency freshness
  checks, but never broad full-market scraping.
- Agent event view model can receive normalized `news_detected` and
  `disclosure_detected` events when available.
- UI separates `뉴스` and `공시` if data can be separated; otherwise use honest
  combined copy `뉴스·공시`.

Relevant surfaces:

- `src/client/components/StockNewsDisclosurePanel.tsx`
- `src/client/components/DashboardFocusPanel.tsx`
- `src/client/hooks/useSSE.ts`
- `src/server/routes/stock-timeline.ts`
- `src/server/routes/stocks.ts`
- `src/server/agent/market-movement-agent-event.ts`
- `src/server/db/repositories.ts`

Acceptance:

- Selecting a ticker refreshes its news/disclosure without requiring a tab click.
- Stale selected ticker data refreshes automatically within the configured
  freshness window.
- Agent UI can reference fresh news/disclosure availability without mock data.
- News and disclosure tabs no longer show identical content unless explicitly
  merged into one combined tab.

### 2.3 Sector Layout Repair

Observed issue:

- Sector panel content overlaps and breaks: rows, badges, sparklines, and price
  columns collide.
- Sector layout should use the same density discipline as TOP100/favorites, not
  oversized freeform rows.

Product rule:

- Sector view is a market browsing mode, not a debug panel.
- It should preserve compact terminal density and avoid horizontal overflow.

Expected behavior:

- Sector groups use a stable two-column grid on desktop when space permits.
- Each group has:
  - sector name,
  - short description,
  - count badge,
  - compact rows.
- Rows have fixed lanes:
  - rank/star,
  - stock identity,
  - sparkline,
  - price,
  - percent/delta.
- Long Korean text truncates intentionally.
- No badges overlap sparklines.
- No row spills into adjacent group.
- Internal scroll only appears where intentionally designed; sector content
  should not trap scroll in a broken subpanel.

Relevant surfaces:

- `src/client/components/TopMoversBoard.tsx`
- `src/client/components/StockRow.tsx`
- `src/client/styles/global.css`

Acceptance:

- Sector view is readable at 1600x1000 and 1440x900.
- Sector view remains usable around 900px responsive width.
- No text/sparkline/price overlap in Chrome and Safari.
- CSS changes do not change global app scale.

### 2.4 Toss Account Rail Hover And Icons

Observed issues:

- Toss rail rows do not feel interactive on hover.
- Product icons are missing and rows fall back to one Hangul character.

Product rule:

- Toss account rail should feel close to Toss account list interaction, but with
  Araon visual tokens.
- Hover should signal row click changes the selected chart.
- Icons should use real provider/product icon when available; fallback initials
  are acceptable only when no safe icon exists.

Expected behavior:

- Row hover:
  - subtle background tint,
  - cursor pointer,
  - clear focus/active state,
  - no layout shift.
- Row click:
  - changes selected ticker/chart.
- Icons:
  - use available logo/icon URL from Toss/account/product data when safe.
  - fallback avatar remains compact and consistent.
  - image failures degrade to fallback without broken icon.
  - no raw URL secrets or session-bearing image URLs in logs/docs.
- Sort and current/evaluation toggle must keep their existing product behavior.

Relevant surfaces:

- `src/client/components/TossAccountRail.tsx`
- `src/client/lib/toss-account-rail.ts`
- `src/client/components/__tests__/toss-account-rail.test.ts`
- `src/client/lib/__tests__/toss-account-rail.test.ts`
- `src/client/styles/global.css`

Acceptance:

- Hover is visible in both light and dark mode.
- Row click changes chart.
- Icons render when available and fall back cleanly when unavailable.
- Account rail open/collapse does not change icon sidebar width by even 1px.

### 2.5 Bottom Status Bar Productization

Observed issues:

- `투자 유의사항` should be removed.
- Large pill styling such as `빠른 가격 정상` makes the bottom bar look taller
  than necessary.
- Internal counters and diagnostics should not dominate the product UI.

Product rule:

- Bottom bar is a market tape + product status strip, not a diagnostics console.
- Diagnostics can move to settings/dev/advanced view.

Expected visible content:

- Market tape items such as KOSPI, KOSDAQ, USD/KRW, WTI when available.
- Favorites count or watch surface count, compact.
- Fast price status, compact text rather than large pill.
- Last update time.
- Settings icon.

Remove or hide from normal bottom bar:

- `투자 유의사항`.
- Large standalone status pills that increase bar height.
- Raw cap labels, internal polling labels, KIS REST budget labels.
- Any copy that requires understanding internal provider architecture.

Acceptance:

- Bottom bar height remains stable and compact in both themes.
- Items are vertically centered.
- Hover can pause tape/highlight item if already implemented, but must not
  increase bar height.
- No internal diagnostics are shown in normal UI.

### 2.6 Agent Panel Text And Layout Discipline

Observed issues:

- Agent safety copy still has oversized text.
- Candidate list may report 10 items but only show two because the panel cannot
  fit the content.
- Agent panel was restored to side-by-side; future goal runs must not break it.

Product rule:

- Home agent panel is a compact summary.
- Agent Detail is where long content belongs.
- Home panel should never stretch text sizes to compensate for insufficient
  space.

Expected behavior:

- Home agent panel:
  - left column shows 2-4 latest candidates depending on available height.
  - right column shows compact safety summary.
  - if there are more candidates, show count and expand affordance.
  - no oversized paragraphs.
- Agent Detail:
  - can show the full candidate list and safety flow.
  - still follows Araon type scale.
- Safety copy:
  - use compact labels and short lines.
  - avoid large yellow/red text blocks unless critical.

Acceptance:

- At 1600x1000, agent panel is two columns.
- At 1440x900, agent panel remains two columns unless the account rail/state
  makes it impossible; if it collapses, the reason must be documented.
- At 900px responsive, one-column collapse is allowed.
- Candidate count and visible rows are honest.

### 2.7 TOP100 Downward Movement And Agent Semantics

Observed issue:

- Agent can interpret TOP100 falling movement as a `급상승` signal.

Product rule:

- Rising and falling movement are both market movements, but they are not the
  same semantic event.
- A falling TOP100 item must not be labeled as `급상승`.

Expected behavior:

- Upward movement:
  - `급상승`, `상승`, `강세`.
- Downward movement:
  - `급락`, `하락`, `약세`.
- Agent candidate reasons must preserve direction.
- Toasts must preserve direction.
- Recent surge panel should only include upward surge unless explicitly filtered
  to include falling movers.

Relevant surfaces:

- `src/client/lib/surge-aggregator.ts`
- `src/server/agent/market-movement-agent-event.ts`
- `src/client/lib/agent-event-toast.ts`
- `src/client/components/SurgeBlock.tsx`
- `src/client/components/AgentEventsRail.tsx`

Acceptance:

- Downward TOP100 item never appears as `급상승`.
- Downward movement can appear as `급락` or market risk if product design wants it.
- Tests cover direction-aware labels.

### 2.8 Market Pause / Tracking Error Copy

Observed issue:

- Around 08:50-08:59, market data was paused but favorites showed
  `Toss 동기화 · 추적 오류`.

Product rule:

- Market pause, no trade, stale quote, unsupported product, and actual provider
  error are different states.

Expected behavior:

- During market pause / no quote movement:
  - show `장 준비 중`, `업데이트 대기`, or stale timestamp copy.
  - do not show `추적 오류` unless a real provider error occurred.
- Unsupported product:
  - show `지원 대기` or `Toss 전용`.
- Valid KR product with delayed hydration:
  - show `수집 지연` only briefly and with retry path.
- Actual provider failure:
  - show short error state, no raw details.

Acceptance:

- Market pause window does not display error copy for otherwise valid rows.
- Tests cover state mapping.

## 3. Implementation Order

Follow this order. Do not jump into visual changes before adding the scale lock.

### Phase 0. Baseline And Scale Snapshot

1. Preserve dirty worktree.
2. Read this document and `docs/design.md`.
3. Record current branch and dirty files.
4. Capture or inspect current UI in Chrome and Safari:
   - light mode,
   - dark mode,
   - 1600x1000 if practical,
   - current app URL.
5. Reset browser zoom to 100% before visual comparison.
6. Record baseline problems in a completion audit.

Deliverable:

- `docs/research/araon-remaining-ux-risk-layout-scale-lock-completion-audit.md`
  with a Phase 0 baseline section.

### Phase 1. Layout / Typography Guardrails

1. Verify `global.css` font stack and IBM Plex Sans fallback.
2. Verify `html/body` font size and `text-size-adjust` are stable.
3. Add CSS comments or tests only if useful; avoid noisy comments.
4. Lock agent panel desktop two-column behavior.
5. Check account rail/icon sidebar fixed width and no jitter.

Verification:

- Browser visual QA in Chrome/Safari.
- Focused component tests if any class structure changes.

### Phase 2. Favorites Unstar And Holdings Preservation

1. Trace star/unstar action from UI to API.
2. Make non-held Toss watchlist removal work.
3. Preserve held rows even if unstarred.
4. Add user-safe pending/error copy.
5. Add tests for product-aware behavior.

Stop condition:

- If live Toss mutation needs a broad cleanup or irreversible action, stop and
  ask the user. Bounded add/remove for one product is allowed only within the
  user's fresh GO and must be idempotent/restorable.

### Phase 3. News / Disclosure Auto Refresh

1. Trace selected ticker timeline/news/disclosure fetch path.
2. Add selected ticker refresh on change.
3. Add bounded stale refresh for selected ticker.
4. Expose normalized freshness to agent view model if already feasible.
5. Separate tabs or merge honestly.

Verification:

- Focused tests for refresh trigger.
- Browser QA: tab click no longer required for selected ticker freshness.

### Phase 4. Sector Layout Repair

1. Reproduce sector layout at 1600x1000 and 1440x900.
2. Fix with local component CSS.
3. Preserve row lanes and truncation.
4. Validate Chrome and Safari.

Do not:

- Increase global font size.
- Use viewport-scaled typography.
- Hide overflow in a way that clips primary price/percent data.

### Phase 5. Toss Rail Hover / Icons / Row Interaction

1. Add or repair row hover state.
2. Use safe product icon data if available.
3. Keep fallback initials consistent.
4. Ensure row click changes selected ticker/chart.
5. Ensure account rail collapse does not change icon sidebar width.

### Phase 6. Bottom Bar Cleanup

1. Remove `투자 유의사항`.
2. Replace large status pills with compact inline status text.
3. Move internal diagnostics out of normal product bar.
4. Re-check vertical centering.

### Phase 7. Agent Semantics And Copy Pass

1. Fix down-mover semantic labels.
2. Ensure candidate count and visible rows are honest.
3. Compact safety copy according to type scale.
4. Keep long explanation in Agent Detail, not Home.

### Phase 8. Market Pause / Error State Mapping

1. Audit row state mapping for favorites and Toss sync.
2. Split market pause, stale data, unsupported, delayed collection, and provider
   error copy.
3. Add tests for the state map.

### Phase 9. Final Browser QA And Audit

Required browser QA:

- Chrome light, 1600x1000.
- Chrome dark, 1600x1000.
- Safari light, 1600x1000.
- Safari dark, 1600x1000.
- At least one 1440x900 check.
- At least one 900px responsive check.

Required interaction QA:

- Favorites unstar.
- Held product cannot disappear incorrectly.
- News/disclosure refresh without tab click.
- Sector view no overlap.
- Toss rail hover and row click.
- Bottom bar compact and vertically centered.
- Agent panel two columns on desktop.
- Downward TOP100 is not labeled `급상승`.
- Market pause does not show false tracking error.

## 4. Tests And Verification

Run at minimum:

```bash
npm test -- --run \
  src/client/components/__tests__/favorites-block.test.ts \
  src/client/components/__tests__/toss-account-rail.test.ts \
  src/client/components/__tests__/stock-news-disclosure-panel.test.ts \
  src/client/components/__tests__/top100-view.test.ts \
  src/client/components/__tests__/agent-events-rail.test.ts \
  src/client/components/__tests__/order-intent-safety-rail.test.ts \
  src/client/components/__tests__/status-bar.test.ts
```

Then:

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

Also run a tracked-file secret scan before completion. Do not print raw secret
values; report only PASS/FAIL.

## 5. Completion Audit Requirements

Create:

```text
docs/research/araon-remaining-ux-risk-layout-scale-lock-completion-audit.md
```

The audit must include:

1. Baseline screenshots/inspection notes.
2. Files changed by phase.
3. PASS/FAIL for each issue in this document.
4. Chrome/Safari scale parity evidence.
5. Light/dark evidence.
6. Desktop/responsive evidence.
7. Test commands and result summary.
8. Remaining blockers, if any.
9. Confirmation that no raw Toss/KIS/session/account/order/watchlist values were
   exposed.
10. Confirmation that no synthetic financial data was introduced.

## 6. Acceptance Criteria

The goal is complete only when all criteria below are satisfied.

1. Chrome/Safari at the same viewport have comparable density and text scale.
2. Light/dark mode do not alter layout scale.
3. Agent panel is side-by-side on desktop and only collapses on narrow responsive
   widths.
4. No global font-size increase is used to solve local readability problems.
5. Favorites unstar works for non-held Toss watchlist rows.
6. Held products remain visible and are not misleadingly removable.
7. News/disclosure refreshes on selected ticker change and stale selected ticker
   cadence.
8. News/disclosure tabs are separated honestly or merged honestly.
9. Sector view no longer overlaps at 1600x1000 and 1440x900.
10. Toss account rail rows have hover affordance and stable row click behavior.
11. Toss account rail icons render safely or fall back cleanly.
12. Account rail open/collapse does not alter icon sidebar width.
13. Bottom bar removes `투자 유의사항`.
14. Bottom bar no longer uses oversized status pills that increase bar height.
15. Bottom bar remains vertically centered and product-facing.
16. Agent safety copy follows `docs/design.md` type scale.
17. Agent candidate count and visible candidate rows are honest.
18. TOP100 falling movement is not labeled as `급상승`.
19. Market pause/stale quote is not shown as a false tracking error.
20. Focused tests pass.
21. Full `npm test` passes or any failure is documented as unrelated with exact
    blocker.
22. `npm run typecheck` passes.
23. `npm run build` passes.
24. `git diff --check` passes.
25. `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500` passes.
26. Completion audit is written with PASS/FAIL evidence.

## 7. Out Of Scope

- GitHub Release.
- npm publish.
- Actual live buy/sell orders.
- Order cancel/amend.
- Account mutation.
- Broad destructive Toss watchlist cleanup.
- Full-market aggressive news/disclosure polling.
- Replacing the entire design system.
- Rebuilding the dashboard from scratch.

## 8. Prompt To Start The Goal

Use the prompt below in Codex App:

```text
[$goal] Araon remaining UX risk + layout scale lock을 끝까지 진행한다.

기준 repo는 /Users/stello/korean-stock-follower 이다.
반드시 /Users/stello/korean-stock-follower/docs/research/araon-remaining-ux-risk-layout-scale-lock-goal.md 를 먼저 읽고, 이 문서를 authoritative execution brief로 따른다.

핵심 목표:
1. Chrome/Safari, light/dark 사이에서 UI 텍스트 크기와 레이아웃 밀도가 무너지지 않도록 layout scale lock을 먼저 세운다.
2. docs/design.md의 Araon typography/density를 하드 가드레일로 사용한다.
3. agent panel은 desktop에서 좌우 2열을 유지하고, narrow responsive에서만 1열로 접히게 한다.
4. 즐겨찾기 해제는 Toss watchlist remove intent로 동작하게 하되, 보유 종목은 계좌에 있는 동안 사용자-facing surface에서 사라지지 않게 한다.
5. 뉴스/공시는 selected ticker 변경과 freshness 기준으로 자동 갱신되어야 하며, agent input으로 쓸 수 있게 정리한다.
6. 뉴스/공시 탭이 같은 내용을 보여주면 분리하거나 정직하게 뉴스·공시로 합친다.
7. 섹터 화면의 row/badge/sparkline/price overlap을 고친다.
8. Toss account rail에 hover affordance, 안전한 product icon, row click chart 변경을 구현한다.
9. Toss account rail open/collapse 시 icon sidebar 폭이 1px도 흔들리지 않게 한다.
10. bottom bar에서 투자 유의사항과 과한 내부 진단/큰 pill을 제거하고 제품형 market/status bar로 정리한다.
11. agent safety/candidate copy는 docs/design.md type scale 안에 맞추고, desktop 2열 레이아웃을 유지한다.
12. TOP100 하락 움직임이 급상승으로 표시되지 않게 direction semantics를 고친다.
13. 장 준비/market pause/stale quote 상태를 추적 오류로 잘못 표시하지 않게 한다.

안전 경계:
- 실제 주문, 주문 취소, 주문 정정, 계좌 변경 mutation 금지.
- live auto-buy/live auto-sell 금지.
- broad destructive Toss watchlist cleanup 금지.
- Toss watchlist sync는 사용자 fresh GO 범위 안에서 bounded/idempotent/redacted 방식으로만 수행한다.
- Toss/KIS/session/account/order/watchlist raw 값은 UI/log/docs/stdout/git diff/screenshots에 노출 금지.
- 합성 금융 데이터, fake candle, fake sparkline movement 금지.
- 기존 dirty worktree와 사용자 변경 보존.

진행 순서:
1. git status 확인 후 기존 변경을 절대 되돌리지 않는다.
2. goal 문서와 docs/design.md 전체를 읽는다.
3. Phase 0 browser baseline과 scale snapshot부터 작성한다.
4. layout/typography guardrails를 먼저 고정한다.
5. favorites unstar, news/disclosure refresh, sector layout, Toss rail hover/icon, bottom bar, agent semantics, market pause state 순서로 진행한다.
6. UI 변경마다 Chrome/Safari 실제 화면으로 확인한다.
7. 완료 전 completion audit을 작성한다.

검증:
- focused component/client/server tests
- npm test
- npm run typecheck
- npm run build
- git diff --check
- npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
- tracked-file secret grep
- Chrome/Safari light/dark Browser/Computer Use visual QA

완료 조건:
docs/research/araon-remaining-ux-risk-layout-scale-lock-goal.md 의 Acceptance Criteria 26개를 모두 만족하고,
docs/research/araon-remaining-ux-risk-layout-scale-lock-completion-audit.md 에 PASS/FAIL evidence를 남겼을 때만 완료 처리한다.

[$caveman] hangul-full을 항상 사용할 것
```
