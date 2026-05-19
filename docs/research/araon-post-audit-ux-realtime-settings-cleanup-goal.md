# Araon Post-Audit UX, Realtime, Watchlist, Agent, Settings Cleanup Goal

Date: 2026-05-18

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> or `superpowers:executing-plans` to implement this document task-by-task.
> This document is an execution brief for the next goal run, not a status claim.
>
> **Important:** This document is a post-completion-audit regression brief. If an
> older completion/progress audit says the pre-release lane is complete, this
> document supersedes that claim for the issues listed here until they are fixed
> and re-verified in the live product UI.

## Goal

Fix the user-visible issues found after the Araon pre-release product hardening
audit:

1. recent surge row click must change the selected chart.
2. duplicate visible notifications must be suppressed.
3. Toss account holdings and Toss watchlist must become one coherent Araon
   watch/favorites surface.
4. `가격 대기` rows must be explained, reduced, and fed by the correct Toss quote
   path where possible.
5. TOP100 rising/falling rank order must visibly reorder by percentage with the
   intended live cadence.
6. Toss account rail open/collapse must not resize the icon sidebar by a few
   pixels.
7. News and disclosure tabs must either be separated correctly or merged honestly.
8. Agent UI must become understandable for a normal user and must not feel like
   mock/internal data.
9. Settings modal, especially the connection tab, must be drastically simplified.
10. KIS API profile UX/backend must move to a single-profile model.
11. dead legacy UI and backend code that no longer matches the product direction
    must be contained or removed.

## Architecture

Araon remains Toss-primary. Toss public/authenticated surfaces are the user-facing
truth for search, quote, TOP100, chart, account, portfolio, and watchlist.
KIS remains optional `실시간 추적` only, with one KIS profile and a 40 ticker cap.
The UI must keep the existing Araon design system from `docs/design.md`: compact
desktop terminal density, IBM Plex Sans, white/dark card surfaces, KR red/blue
market semantics, stable bottom status bar, and no synthetic financial data.

## Tech Stack

- Server: Node 20, Fastify 5, SQLite repositories, TypeScript.
- Client: React 19, Vite, Zustand stores, SSE.
- Realtime: Toss fast quote lane, Toss TOP100/ranking refresh, optional KIS WS
  `실시간 추적`.
- Testing: Vitest, React SSR render tests, route tests, no-live soak scripts,
  browser visual QA.

---

## 0. Non-Negotiable Product Decisions

These decisions should guide every patch in this goal.

### 0.1 Toss Watchlist + Toss Holdings Are The User Watch Surface

Normal users should not have to understand three buckets called Toss sync,
local favorites, and portfolio holdings.

Araon should expose one primary surface:

- `즐겨찾기 / 보유 관심`: the home list that contains Toss watchlist items and
  Toss account holdings.
- Toss watchlist membership remains star/watchlist truth.
- Toss holdings are automatically surfaced even if they are not in Toss
  watchlist, because the user expects held positions to be visible in a trading
  terminal.
- Holdings should be visually distinguishable with a small label such as `보유`
  only when useful, not as a separate product concept.
- Local favorites remain only as offline/sync-pending/cache fallback.
- Local-only rows must not look like a separate primary watchlist product.

### 0.2 Araon Star/Unstar Means Toss Watchlist Intent

The star button means:

- add/remove this product from Toss watchlist if Toss mutation is allowed;
- otherwise mark it `동기화 대기`, `지원 대기`, or `로그인 필요`;
- never silently make a hidden local-only primary list unless Toss cannot be
  reached and the UI says so.

Live Toss watchlist add/remove is bounded and reversible only. Do not run broad
mutation probes.

### 0.3 KIS Is One Profile, Optional Realtime Tracking Only

KIS must not be presented as multi-profile infrastructure in normal UI.

Target model:

- one KIS credential set.
- one optional `실시간 추적` status.
- 40 eligible Korean tickers max.
- no user-facing multi-profile controls.
- no KIS account/order/watchlist/ranking/chart truth.

Existing multi-profile code may be preserved internally only if removing it is
risky, but normal UI and docs must not ask a personal user to manage multiple
KIS profiles.

### 0.4 Recent Surge, Agent Events, And Toasts Are Related But Not The Same UI

The same market movement can feed:

- recent surge list,
- agent event queue,
- visible toast.

But the user should not see duplicate toasts for the same movement. A single
threshold crossing should produce at most one visible toast per dedupe window.
The agent queue may keep normalized event history, but the toast stack must
dedupe by stable event semantics, not by incidental event row id.

### 0.5 News And Disclosures Must Be Honest

If News and Disclosure tabs show the same combined panel, they should not be
separate tabs.

Preferred final state:

- `뉴스`: news only.
- `공시`: DART/KRX/Naver disclosure only.
- If the backend cannot separate them yet, merge the UI into `뉴스·공시` until
  separation is implemented.

### 0.6 Agent Panel Is Decision Support, Not A Bot Claim

The agent panel must explain:

- what was detected,
- why it matters,
- what Araon can do now,
- what is locked,
- what is not ready for automated trading.

It must not imply live trading is active. It must not show raw event internals
or mock-looking placeholder data. It should read like:

- `1. 감지: 레인보우로보틱스 +3.09%`
- `2. 후보: 단기 급등, 거래량 기준선 수집 중`
- `3. 가능: 모의 미리보기`
- `4. 잠금: 실제 주문은 꺼져 있음`

## 1. Current Evidence And Likely Code Surfaces

This section is based on current repo inspection. Re-check before editing.
The user-reported evidence came from the actual running dashboard on
2026-05-18 around the market open, not from a static mock. Treat the screenshots
as product acceptance evidence: code-only review is not enough.

### 1.1 Recent Surge Click Path

Observed issue:

- clicking a row in the `최근 급상승` panel does not update the chart.

Relevant files:

- `src/client/components/SurgeBlock.tsx`
- `src/client/App.tsx`
- `src/client/stores/stocks-store.ts`
- `src/client/lib/surge-aggregator.ts`
- `src/client/components/DashboardFocusPanel.tsx`

Current wiring:

- `SurgeBlock` accepts `onOpenDetail(code)`.
- `SurgeRow` calls `onOpenDetail(item.code)`.
- Home passes `selectTicker` to `SurgeBlock`.
- `selectTicker` only sets `focusCode`.
- `focusedStock` resolves from `allStockVMs`, which only contains local catalog
  entries.

Likely failure modes to test:

- surge item is not present in `catalog`, so `focusCode` changes but
  `focusedStock` falls back to the previous/default stock.
- click happens while workspace is expanded and does not return to home.
- `item.code` is product code or unsupported code instead of six-digit catalog
  ticker.
- overlay/toast consumes click in the actual viewport.

Acceptance:

- clicking a recent surge row changes the selected ticker title and chart.
- if a surge item is not in the catalog but is a supported Toss/KR product,
  Araon opens it through the same product-aware path as TOP100/search.
- if unsupported, UI shows a clear non-raw reason instead of silently doing
  nothing.

### 1.2 Duplicate Toasts

Observed issue:

- two identical visible toasts appear at once.

Relevant files:

- `src/client/stores/toast-store.ts`
- `src/client/hooks/useSSE.ts`
- `src/client/lib/agent-event-toast.ts`
- `src/client/lib/toss-user-notification-toast.ts`
- `src/client/hooks/useAlertEvaluator.ts`
- `src/server/agent/agent-event-queue.ts`
- `src/server/agent/market-movement-agent-event.ts`

Current risk:

- `useToastStore.push()` appends entries and caps to 2, but it does not dedupe
  by `id` or `cooldownKey`.
- `agent-event` SSE and local alert evaluator can both create visible toasts
  for conceptually the same market movement.
- server-side agent event dedupe is by event queue key, but visible toast id is
  currently `agent-event-${payload.id}`, so two events with different ids can
  still display the same user-facing alert.

Acceptance:

- identical market movement notifications do not show twice in one visible
  toast stack.
- visible toast dedupe uses a stable semantic key:
  `kind + ticker/productCode + source class + threshold window + direction`.
- dedupe does not suppress genuinely new movements after the configured cooldown.
- agent event queue can still keep normalized event records.

### 1.3 Toss Holdings Not Appearing In Favorites

Observed issue:

- positions held in the user's Toss account are not automatically shown in
  `즐겨찾기`.

Relevant files:

- `src/server/watchlist/araon-watchlist-service.ts`
- `src/server/routes/watchlist.ts`
- `src/server/app.ts`
- `src/server/toss/toss-portfolio-client.ts`
- `src/server/toss/toss-account-summary-client.ts`
- `src/client/App.tsx`
- `src/client/stores/watchlist-store.ts`
- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/TossAccountRail.tsx`

Current model:

- `/watchlist` merges Toss watchlist and local favorites.
- Toss positions are fetched for the account rail.
- KIS slot preview already considers Toss portfolio positions in server route
  tests, but the home favorites surface does not use positions as row members.

Target model:

- `/watchlist` or a new normalized endpoint should include:
  - Toss watchlist items,
  - Toss portfolio positions,
  - local fallback/sync-pending items.
- The client should hydrate one home watch surface from that normalized model.
- Positions that are not in Toss watchlist must be included with source
  `position`, `toss_synced` or `account_position`, and a safe label like `보유`.
- Star state should still represent Toss watchlist membership, not mere holding.

Acceptance:

- logged-in Toss holdings appear in home watch/favorites surface without manual
  local add.
- UI does not force the user to choose between `Toss 동기화` and `자체 내부
  즐겨찾기`.
- local fallback only appears when Toss is unavailable or mutation is pending.

### 1.4 `가격 대기` Rows

Observed issue:

- many favorites/watchlist rows show `가격 대기`.

Relevant files:

- `src/client/components/FavoritesBlock.tsx`
- `src/server/watchlist/araon-watchlist-service.ts`
- `src/server/toss/toss-fast-quote-lane.ts`
- `src/server/toss/toss-quote-polling-service.ts`
- `src/client/stores/stocks-store.ts`
- `src/client/stores/watchlist-store.ts`
- `src/shared/product-identity.ts`

Current model:

- `WatchlistOnlyRow` shows `가격 대기` when `item.last` is null/invalid.
- Toss watchlist item can be Toss-only, US, KR, or unknown.
- Watchlist-only rows do not necessarily have quote samples in `stocks-store`.

Likely failure modes:

- Toss watchlist payload has no last/base for some items.
- fast quote lane does not prioritize all watchlist/position rows.
- Toss-only product identity is not mapped to a quote path.
- US product appears in watchlist but chart/quote path still expects six-digit
  KRX ticker.

Acceptance:

- for KR Toss/KRX eligible rows, Araon attempts Toss quote/fast quote before
  showing long-lived `가격 대기`.
- for unsupported products, UI says `지원 대기` or `Toss 전용` with a short reason,
  not just `가격 대기`.
- for account holdings, use real account position market value/quantity when
  available and clearly separate it from quote price if quote is missing.
- no fake price/sparkline is generated.

### 1.5 TOP100 Reorder Lag

Observed issue:

- TOP100 rising/falling rows update but do not reorder by percent immediately
  enough.

Relevant files:

- `src/client/components/SectionStack.tsx`
- `src/client/components/TopMoversBoard.tsx`
- `src/server/market/market-top-movers-service.ts`
- `src/server/toss/toss-realtime-ranking-service.ts`
- `src/server/toss/toss-fast-quote-lane.ts`
- `src/server/soak/pre-release-market-evidence.ts`

Current model:

- client TOP100 refresh minimum interval is 300ms.
- hidden interval is 3000ms.
- server market top movers still has sequential gainers/losers fetching and
  possible cache/provider delays.

Acceptance:

- visible TOP100 gainers and losers reorder by newest percent snapshot.
- observed live cadence target remains 300-500ms where provider allows.
- no full-market 0.3-0.5s polling is introduced.
- if Toss provider itself returns stale ranking for a period, UI exposes
  freshness/staleness honestly.

### 1.6 Account Rail Collapse Width

Observed issue:

- when the Toss account rail opens/closes, the right icon sidebar width shifts
  by a few pixels.

Relevant files:

- `src/client/App.tsx`
- `src/client/styles/global.css`
- `src/client/components/TossAccountRail.tsx`

Current model:

- `.main` grid uses `minmax(320px, 382px)` for account rail.
- collapsed account column uses `50px`.
- `.account-rail` internally uses `48px` icon rail.
- padding/gap/border combinations can create a 48 vs 50 pixel mismatch.

Acceptance:

- account icon rail has one constant width in both open and collapsed states.
- opening the account panel changes only the account panel area, not the icon
  rail width.
- no rounded ghost border or top/bottom margin artifacts return.
- visual QA checks both open and collapsed rail at 1600x1000, 1440x900, and
  900px.

### 1.7 News And Disclosure Tabs

Observed issue:

- mini chart/full chart `뉴스` and `공시` tabs show the same combined content.

Relevant files:

- `src/client/components/DashboardFocusPanel.tsx`
- `src/client/components/StockNewsDisclosurePanel.tsx`
- `src/client/components/StockDetailModal.tsx`
- `src/server/news/`
- `src/server/disclosure/`
- `src/server/routes/stock-timeline.ts`

Current model:

- `DashboardFocusPanel` renders `StockNewsDisclosurePanel` for both `news` and
  `disclosures`.
- The panel itself can fetch news and disclosures separately, but the tab
  contract is misleading.

Acceptance options:

- Preferred: add a mode prop:
  - `mode="news"` renders only news section.
  - `mode="disclosures"` renders only disclosure section.
  - optional `mode="combined"` remains for detail pages if needed.
- Acceptable fallback: merge the tabs into `뉴스·공시` until separate tabs have
  product value.

### 1.8 Agent Panel Is Still Too Internal

Observed issue:

- the agent panel is not understandable for someone who does not know Araon's
  internal architecture.
- some data feels mock-like.

Relevant files:

- `src/client/components/AgentEventsRail.tsx`
- `src/client/components/OrderIntentSafetyRail.tsx`
- `src/client/components/OrderSafetyModal.tsx`
- `src/server/agent/`
- `src/shared/types.ts`

Current risk:

- labels like event source/reason/freshness are compact but still internal.
- `모의 미리보기` appears without explaining what it does and what it will not do.
- readiness gaps exist, but the home surface does not translate them into a
  clear user-facing safety story.

Acceptance:

- home agent panel explains the four-stage flow:
  `감지 -> 후보 -> 모의 미리보기 -> 실거래 잠금`.
- rows use display names, short Korean reason, percent/time, and one clear action.
- no raw source strings, payload refs, provider dedupe keys, or fake examples.
- if there are no real events, show an honest empty state:
  `감지된 거래 후보 없음 · 뉴스/공시/급등 신호 대기`.
- Agent Detail can show more audit detail, but still in product language.

### 1.9 Settings Modal Cleanup

Observed issue:

- settings connection tab is too crowded and dirty.
- every settings tab should be read carefully, and unnecessary controls removed.

Relevant files:

- `src/client/components/SettingsModal.tsx`
- `src/client/components/CredentialsSetup.tsx`
- `src/client/components/SSEIndicator.tsx`
- `src/client/lib/api-client.ts`
- `src/server/routes/runtime.ts`
- `src/server/routes/credentials.ts`
- `src/server/routes/import.ts`

Current risk:

- `SettingsModal.tsx` has many control panels in one tab:
  realtime session, KIS slots, Toss session/SSE, account surfaces, order-intent,
  agent monitor, agent feed, backfill, credential profiles, data health, backup,
  master catalog, KIS import.
- Some panels are useful diagnostics but not normal user settings.
- Multi-profile KIS controls remain in the product surface.

Acceptance:

- settings becomes user-first and sparse.
- connection tab should show only:
  - Toss login/session status and simple actions.
  - KIS single credential setup/status for optional `실시간 추적`.
  - simple realtime tracking state and emergency off.
  - safe backup/reset if still needed.
- developer diagnostics should move behind a dev-only section or out of the
  normal settings modal.
- KIS import/master/backfill legacy helper controls should be removed from
  normal flow unless a clear manual legacy section is explicitly hidden/dev-only.
- each tab has a clear purpose:
  - `연결`: Toss session + KIS optional tracking.
  - `알림`: notification delivery and thresholds.
  - `차트`: chart rendering options only.
  - `급상승`: recent surge/list behavior only.
  - `룰`: user alert rules only, if still product-ready.
- before deleting controls, write a short inventory in the progress note:
  - keep in normal UI,
  - move to advanced/dev-only,
  - remove from UI but keep backend compatibility,
  - remove from backend after tests,
  - needs user decision.

### 1.10 KIS Single Profile Direction

Observed issue / decision:

- KIS API profiles should be one profile only.
- multiple API keys are not useful for the intended personal-user UX.

Relevant files:

- `src/server/credential-store.ts`
- `src/server/bootstrap-kis.ts`
- `src/server/kis/kis-multi-profile-outbound-limiter.ts`
- `src/server/kis/kis-rest-profile-router.ts`
- `src/server/routes/credentials.ts`
- `src/server/routes/runtime.ts`
- `src/client/components/SettingsModal.tsx`
- `src/client/components/CredentialsSetup.tsx`
- `src/client/lib/api-client.ts`
- tests under `src/server/routes/__tests__/credentials.test.ts`,
  `src/server/routes/__tests__/runtime.test.ts`,
  and `src/client/components/__tests__/managed-operations-settings.test.ts`.

Target:

- normal stored credential remains `primary`.
- no add-extra-profile UI.
- no profile fanout presented to users.
- runtime status may include one redacted profile summary internally.
- if old data has extra profiles, preserve them safely or ignore them in normal
  runtime; do not silently delete credentials without a migration/backup plan.

Stop condition:

- if removing multi-profile backend code risks existing encrypted credential
  compatibility, first contain it and hide it from product surfaces. Only remove
  after tests prove old credential files still load safely.

## 2. Implementation Order

### Phase 0: Re-Audit Current Runtime And Screens

**Files to inspect:**

- `docs/design.md`
- `docs/research/araon-pre-release-product-100-goal.md`
- `docs/research/araon-pre-release-product-100-progress-audit.md`
- `src/client/App.tsx`
- `src/client/components/SurgeBlock.tsx`
- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/DashboardFocusPanel.tsx`
- `src/client/components/AgentEventsRail.tsx`
- `src/client/components/OrderIntentSafetyRail.tsx`
- `src/client/components/SettingsModal.tsx`
- `src/server/watchlist/araon-watchlist-service.ts`
- `src/server/agent/market-movement-agent-event.ts`
- `src/server/routes/runtime.ts`

**Steps:**

- [ ] Capture current UI behavior in browser for the 11 user-reported issues.
- [ ] Confirm whether dev server is serving current built assets, not stale
      `dist/client` files.
- [ ] Record findings in a new progress note:
      `docs/research/araon-post-audit-ux-cleanup-progress.md`.
- [ ] Do not mark prior completion audit as final if these issues still
      reproduce.

**Verification:**

- Browser/Computer Use visual notes for 1600x1000 and 1440x900.
- Console/network check for visible 4xx/5xx on click paths.

### Phase 1: Make Recent Surge Row Click Product-Aware

**Test first:**

- Modify/add `src/client/components/__tests__/volume-visibility.test.ts` or a
  focused `surge-block-click.test.tsx`.
- Add a test that renders a `SurgeRow` and asserts row click calls the supplied
  handler with the ticker.
- Add an App-level or helper-level test for unsupported/catalog-missing surge
  tickers if an existing test harness exists.

**Implementation:**

- Route `SurgeBlock` clicks through the same product-aware ticker opener used by
  TOP100/search, not a raw `selectTicker` when catalog membership is uncertain.
- Ensure row click returns/keeps workspace in Home unless the user explicitly
  opened Full Chart.
- For unsupported products, show one safe error banner/toast with product label
  and no raw response.

**Acceptance:**

- clicking recent surge changes selected ticker/chart.
- no silent no-op.
- no raw `400 Bad Request`.

### Phase 2: Visible Toast Dedupe

**Test first:**

- Extend `src/client/stores/__tests__/toast-store.test.ts`.
- Add cases:
  - pushing same `id` twice leaves one visible toast.
  - pushing same `cooldownKey` within a short visible window leaves one toast.
  - pushing a newer event with same key can update or replace the older one
    instead of stacking duplicates.
- Extend `src/client/lib/__tests__/agent-event-toast.test.ts` for stable
  semantic cooldown keys for market movement.

**Implementation:**

- Add dedupe logic in `useToastStore.push()`.
- Prefer replacing/updating the existing toast when same `id` or same
  `cooldownKey` arrives.
- Revisit `agentEventToToastSpec()` so cooldown key is semantic for market
  movement:
  - `market-movement:<ticker>:<source-class>:<threshold-window>:<direction>`.
- Keep max visible toasts capped.

**Acceptance:**

- screenshot case with two identical `시장 움직임` toasts cannot reproduce.
- genuinely different ticker events can still show together.

### Phase 3: Merge Toss Holdings Into Normal Watch Surface

**Test first:**

- Extend `src/server/watchlist/__tests__/araon-watchlist-service.test.ts`.
- Add a fixture with:
  - Toss watchlist item,
  - local fallback favorite,
  - Toss portfolio position not in watchlist.
- Assert normalized payload includes all relevant items without raw account
  identifiers.
- Extend client favorites tests to render position-sourced row with a small
  `보유` label and no fake price.

**Implementation options:**

1. Preferred: enhance `AraonWatchlistService` to accept a sanitized portfolio
   snapshot provider and include positions in `/watchlist`.
2. Alternative: create a separate `/watch-surface` normalized endpoint if
   mixing watchlist and holdings inside `/watchlist` makes mutation semantics
   unclear.

Required fields for normalized rows:

- productCode
- krTicker
- symbol
- display name
- market/currency
- source: `toss_watchlist`, `toss_position`, `local_cache`, `merged`
- watchlistMembership: true/false
- holding: true/false
- syncState
- quote/chart/realtime eligibility
- safe price/value fields only when real data exists

**Acceptance:**

- held Toss positions appear in home watch surface.
- a held-but-not-starred item does not pretend to be in Toss watchlist.
- starring held item creates Toss watchlist intent.
- unstarring removes Toss watchlist membership, not the held position row.

### Phase 4: Fix `가격 대기` Semantics And Quote Priority

**Test first:**

- Extend `src/client/components/__tests__/favorites-block.test.ts`.
- Add cases:
  - KR watchlist item with no quote shows `가격 확인 중` or similar short state.
  - unsupported Toss-only item shows `지원 대기`/`Toss 전용`, not a misleading
    generic price wait.
  - account position can show real holding value even if quote is missing.
- Extend `src/server/toss/__tests__/toss-fast-quote-lane.test.ts` for watchlist
  and position candidate priority if not already covered.

**Implementation:**

- Make watch/position rows part of the bounded fast quote candidate set.
- Distinguish:
  - quote pending,
  - quote unsupported,
  - Toss-only product,
  - account value available but quote unavailable.
- Avoid wide pills that crush row layout. Use one compact status mark or short
  text.

**Acceptance:**

- most KR eligible watch/holding rows receive real quote samples during market
  hours.
- unsupported rows are honest and compact.
- no synthetic price or fake sparkline.

### Phase 5: TOP100 Live Reorder Cadence

**Test first:**

- Extend `src/client/components/__tests__/section-stack` or `TopMoversBoard`
  tests for sorting by latest percent.
- Extend server market evidence tests if reordering evidence is computed.

**Implementation:**

- Ensure client state replaces TOP100 rows with the newest ordered snapshot.
- Ensure no stale local sort order defeats server/provider order when percent
  changes.
- If provider returns rows unsorted, sort by percent in the client/server layer
  while preserving direction.
- Keep refresh interval bounded and no full-market fast polling.

**Acceptance:**

- during market window, rank order visibly changes within intended cadence when
  percentages cross.
- if no reorder occurs because provider data is stale, freshness text says so.

### Phase 6: Account Rail Width Stability

**Test first:**

- Add a lightweight CSS/DOM test if existing setup supports class rendering.
- Browser visual QA is required for final acceptance.

**Implementation:**

- Normalize account rail constants:
  - `--account-icon-rail-width: 48px` or equivalent.
  - collapsed grid column must match icon rail + borders exactly.
- Avoid `50px` outer collapsed column if inner icon rail is `48px`.
- Keep border/padding from changing layout width.

**Acceptance:**

- icon rail width stays stable open vs closed.
- only the account panel area appears/disappears.

### Phase 7: Separate Or Merge News/Disclosure Tabs

**Test first:**

- Extend `src/client/components/__tests__/stock-news-disclosure-panel.test.ts`.
- Add `DashboardFocusPanel` render test if available:
  - `뉴스` tab renders only news.
  - `공시` tab renders only disclosures.

**Implementation:**

- Add `mode` prop to `StockNewsDisclosurePanel`:
  - `news`
  - `disclosures`
  - `combined`
- Use `mode="news"` for `뉴스`.
- Use `mode="disclosures"` for `공시`.
- Keep `combined` only where a combined timeline is intentionally desired.

**Acceptance:**

- news and disclosure tabs are no longer visually identical.
- no fake summary or AI-generated news copy.

### Phase 8: Rewrite Agent Home/Detail UX

**Test first:**

- Extend `src/client/components/__tests__/agent-events-rail.test.ts`.
- Extend `src/client/components/__tests__/order-intent-safety-rail.test.ts`.
- Add tests that internal strings do not appear:
  - raw source names unless explicitly mapped,
  - `payloadRef`,
  - `dedupeKey`,
  - mock/fake/sample labels.

**Implementation:**

- Replace current two-card mini layout if needed with a clearer decision support
  summary:
  - `감지`
  - `후보`
  - `모의 미리보기`
  - `실거래 잠금`
- Show latest event and latest safety state in plain Korean.
- Use `모의 미리보기` only as a clearly non-live action.
- Agent Detail can keep event list/audit details but must explain the flow.
- If data is empty, show a useful empty state, not internal placeholders.

**Acceptance:**

- a user unfamiliar with Araon can tell:
  - no live trading is happening,
  - what event was detected,
  - what the next safe action is,
  - what is still not ready.

### Phase 9: Settings Modal Product Cleanup

**Test first:**

- Extend `src/client/components/__tests__/managed-operations-settings.test.ts`.
- Add visible text scans that normal settings do not include:
  - `profiles`
  - `KIS watchlist import`
  - `legacy REST`
  - `polling fallback`
  - `payload`
  - `dedupe`
  - raw endpoint/provider internals.

**Implementation:**

- First inventory every visible control in each settings tab and classify it:
  `keep`, `advanced/dev-only`, `remove-ui`, `remove-backend`, or
  `decision-needed`.
- Split connection tab into small product sections:
  - Toss 계정 / 세션
  - 선택 실시간 추적
  - 안전 / 데이터 관리
- Move diagnostic panels behind dev-only gates or remove from normal UI.
- Remove normal user controls for:
  - KIS watchlist import,
  - multiple KIS profiles,
  - legacy REST helper toggles,
  - raw monitor/run panels that are not product settings.
- Keep emergency disable and safe reset/backup if still useful.

**Acceptance:**

- settings modal looks like a product setting surface, not an internal console.
- each tab is concise.
- connection tab fits within the modal without feeling like a log dashboard.

### Phase 10: KIS Single-Profile Containment / Simplification

**Test first:**

- Update `src/server/routes/__tests__/credentials.test.ts`.
- Update `src/server/routes/__tests__/runtime.test.ts`.
- Update `src/client/components/__tests__/credentials-setup-copy.test.ts`.
- Update managed settings tests.

**Implementation stages:**

1. UI containment:
   - remove `CredentialProfilesPanel` from normal settings.
   - remove add-profile API usage from client.
2. API containment:
   - keep `/credentials/profiles` read-only if needed for compatibility, but
     return one primary summary in normal product status.
   - deprecate or guard POST extra-profile route.
3. Runtime containment:
   - use primary profile only for KIS optional realtime.
   - multi-profile REST router must not be part of default product flow.
4. Data compatibility:
   - old credential files with `profiles` must still decrypt/load.
   - extra profiles must not be logged or exposed raw.
   - do not delete stored extra profiles without a documented migration.

**Acceptance:**

- normal UI exposes one KIS credential/status.
- product docs say one KIS key/profile.
- KIS still works as optional `실시간 추적`.

### Phase 11: Dead Code And Legacy Copy Cleanup

**Scope carefully.**

Remove or contain only code made obsolete by the current product direction and
covered by tests.

Candidates to review:

- `src/server/routes/favorites.ts` local favorite primary semantics.
- `src/server/routes/import.ts` KIS watchlist import helper.
- KIS multi-profile UI/API paths.
- settings diagnostics that belong in dev-only tools.
- old `polling`, `registered`, `KIS WS`, `legacy REST`, `내 목록` copy.
- client components no longer referenced after settings cleanup.

Rules:

- Do not delete operational emergency paths.
- Do not delete migrations.
- Do not delete archived docs.
- Do not remove KIS realtime emergency disable.
- If unsure, move behind dev-only/internal route first.

**Acceptance:**

- normal product UI has no dead legacy concepts.
- backend still passes tests and no-live startup.
- clean install without credentials does not call external Toss/KIS/Naver/OpenDART
  unexpectedly.

### Phase 12: Final Browser QA And Completion Audit

**Required viewports:**

- 1920x1080
- 1600x1000
- 1440x900
- 900px responsive

**Required screens/states:**

- Home light and dark.
- Account rail open and collapsed.
- Recent surge row click.
- TOP100 row click.
- Favorites/holdings watch surface.
- Full Chart.
- News tab.
- Disclosure tab.
- Agent home panel.
- Agent Detail.
- Settings `연결`, `알림`, `차트`, `급상승`, `룰`.

**Write final audit:**

- `docs/research/araon-post-audit-ux-realtime-settings-cleanup-completion-audit.md`

The audit must include PASS/FAIL for each of the 11 original issues.

## 3. Verification Commands

Run focused tests as each phase lands, then run the full checks before claiming
completion:

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

For CLI/package-impacting changes only:

```bash
npm pack --dry-run --json
```

For security-sensitive or Toss/KIS/account/watchlist work:

```bash
git grep -nE '(SESSION|UTK|LTK|FTK|appSecret|appKey|approval key|accountNo|account number|watchlist-item|watchlist-group)' -- ':!docs/archive/**' ':!**/*.test.ts' ':!**/*.test.tsx'
```

Review hits manually. Field names in code are allowed; raw values are not.

## 4. Completion Criteria

This goal is complete only when all criteria below are satisfied.

1. Recent surge row click changes selected ticker/chart or gives a clear
   unsupported reason.
2. Duplicate identical visible toasts no longer appear.
3. Toss account holdings are automatically visible in the home watch surface.
4. Toss watchlist and Araon star/unstar semantics are unified and product-aware.
5. Local favorites are fallback/cache only in normal UI.
6. `가격 대기` is reduced for eligible KR rows and replaced with clearer state
   for unsupported rows.
7. TOP100 rising/falling lists reorder by latest percent snapshot within the
   intended live cadence when provider data changes.
8. Account rail open/collapse does not resize the icon rail.
9. News and disclosure tabs are no longer duplicate combined views.
10. Agent panel is understandable as decision-support + live-lock foundation.
11. Agent panel does not show mock/fake/internal raw data.
12. Settings connection tab is simplified and product-facing.
13. Every settings tab has been reviewed and unnecessary controls are removed
    or moved behind dev-only/internal gates.
14. Normal UI exposes one KIS profile only.
15. Backend default flow uses KIS only as optional realtime tracking, not
    account/order/watchlist/ranking/chart truth.
16. Dead code/legacy copy introduced by previous product direction is removed
    or explicitly contained.
17. No raw Toss/KIS/session/account/order/watchlist values appear in UI, logs,
    docs, stdout, screenshots, or git diff.
18. No synthetic financial data, fake candle, or fake sparkline movement is
    introduced.
19. Full verification commands pass or blockers are documented with exact next
    probe.
20. Browser/Computer Use visual QA passes for required screens/viewports.
21. Completion audit document is written with PASS/FAIL evidence for all 11
    original user issues.

## 5. Stop Conditions

Stop and ask the user before proceeding if:

- a fix requires live order, order cancel, order amend, or account mutation.
- a fix requires broad live Toss watchlist mutation beyond a bounded add/remove
  smoke.
- KIS credential migration would delete stored extra profiles or credentials.
- Toss provider behavior prevents TOP100 or quote freshness targets, and the
  only workaround would be full-market 0.3-0.5s polling.
- a needed endpoint exposes raw account/session/watchlist identifiers to the UI.

## 6. Suggested Commit Slices

Use small, reviewable commits:

1. `fix(ui): make surge row selection product-aware`
2. `fix(alerts): dedupe visible market movement toasts`
3. `feat(watchlist): surface Toss holdings in Araon watchlist`
4. `fix(quotes): prioritize watchlist quote states without fake prices`
5. `fix(top100): tighten live reorder semantics`
6. `fix(layout): stabilize account rail collapse width`
7. `fix(ticker): separate news and disclosure tab content`
8. `feat(agent): clarify decision-support and live-lock UI`
9. `refactor(settings): simplify connection tab and product settings`
10. `refactor(kis): contain KIS to a single optional realtime profile`
11. `chore(cleanup): remove contained legacy UI/code`
12. `docs(audit): record post-audit cleanup verification`

Do not stage or commit without explicit user approval if this document is being
created in a dirty worktree.
