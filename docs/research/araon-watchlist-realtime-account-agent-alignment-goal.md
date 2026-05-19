# Araon Watchlist, Realtime Priority, Toss Account Rail, Agent Alignment Goal

Date: 2026-05-18

This document is the authoritative execution brief for the next Araon product
alignment pass. It supersedes older watchlist/realtime/account-rail decisions
only where this document is more specific.

The user-visible goal is simple:

- `즐겨찾기` must feel like the user's actual Toss investment surface.
- KIS must be only optional `실시간 추적`, not a source of truth.
- Toss should supply TOP100/ranking/quote/chart/account/watchlist truth.
- The Toss account rail should behave more like the Toss account surface while
  staying in Araon's design system.
- The agent surface should be honest about what is done and what is still only
  a safety foundation.

This document is an execution brief, not a completion claim.

---

## 0. Non-Negotiable Safety Boundaries

### 0.1 Allowed In This Goal

The user has explicitly granted fresh GO for Toss watchlist synchronization in
this lane. That permission covers:

1. adding a held Toss position to Toss watchlist when it is missing;
2. adding a product to Toss watchlist when the user stars it in Araon;
3. removing an item from Toss watchlist only when it was auto-added by Araon
   because of a holding and the holding is no longer present;
4. bounded verification that the add/remove succeeded;
5. local cache/provenance updates needed to keep the UI honest.

All such mutation must be:

- idempotent;
- bounded to the computed diff;
- redacted in logs/stdout/UI/docs;
- resumable after interruption;
- stopped immediately if verification or restore fails.

### 0.2 Still Forbidden

This goal does not authorize:

1. live order placement;
2. live order cancellation;
3. live order amendment;
4. account setting mutation;
5. live auto-buy or live auto-sell;
6. broad watchlist destructive cleanup without provenance;
7. raw Toss/KIS/session/account/order/watchlist payload exposure.

### 0.3 No Synthetic Finance Data

Do not fabricate prices, candles, positions, PnL, watchlist membership, signals,
or news. Unknown values must either be hidden until hydrated or shown with a
truthful product state such as `지원 대기`, `Toss 전용`, `세션 필요`, or `수집 지연`.

For `즐겨찾기`, `가격 확인 중` must not remain as a visible normal state.

---

## 1. Product Decisions Locked By The User

### 1.1 Watchlist / Holding / Favorite Truth

The user-facing rule is:

```text
Toss watchlist > Toss holdings > Araon local favorite/cache
```

Normal UI should treat these as one product surface:

```text
현재 내가 가지고 있는 종목 = watchlist = 즐겨찾기
```

Meaning:

1. Toss watchlist items appear in Araon `즐겨찾기`.
2. Toss account holdings appear in Araon `즐겨찾기`.
3. Araon local favorites appear only as sync-pending/cache/fallback until Toss
   watchlist sync succeeds.
4. A held stock should not show an empty star merely because Toss watchlist has
   not been reconciled yet.
5. Araon star/unstar is a Toss watchlist intent, not a private local-only list.

### 1.2 Provenance Rule For Safe Auto-Removal

Automatic removal must be provenance-aware.

Allowed:

- If Araon auto-added a product to Toss watchlist only because it was held, and
  that holding disappears, Araon may remove that auto-added watchlist entry.

Not allowed:

- Do not remove a product that the user manually added in Toss watchlist.
- Do not remove a product that the user manually starred in Araon.
- Do not remove a product whose provenance is unknown.

This prevents the app from deleting deliberately watched symbols after the user
sells a position.

### 1.3 KIS Realtime Priority

KIS is optional `실시간 추적` only. It is not account/order/watchlist/TOP100/chart
truth.

Slot priority must become:

1. Toss watchlist + Toss holdings + Araon starred items.
2. Agent candidates and order-intent candidates.
3. Currently selected/full-chart ticker, if not already covered.
4. Recent news/disclosure/signal tickers.
5. TOP100 only as last-resort filler, or removed entirely from KIS slots if
   enough higher-priority candidates exist.

The product copy should avoid `KIS WS`, `폴링`, `fallback`, or `등록됨` in normal
UI. Use `실시간 추적`, `빠른 가격`, `Toss 전용`, `지원 대기`, or `수집 지연`.

### 1.4 TOP100 Is Toss-Only

TOP100 does not need KIS slots. Toss ranking / Toss quote refresh is enough.

Target:

- Toss TOP100/ranking refresh cadence remains about 0.5s when enabled.
- rank reorder follows the latest Toss percentage snapshot.
- KIS slots are not spent on TOP100 unless there are spare slots and explicit
  product logic says it is useful.

### 1.5 Favorites Must Always Prefer Real Price Hydration

For visible `즐겨찾기` rows:

1. KR eligible rows must receive real price from the strongest available safe
   source:
   - Toss position current price;
   - Toss watchlist last/base;
   - Toss fast quote lane;
   - price store/session history;
   - optional KIS tick only if the ticker is inside the 40-slot cap.
2. `가격 확인 중` must not be used as a steady visible state.
3. If Toss does not support the product, show `Toss 전용` or `지원 대기` honestly.
4. If a KR eligible favorite cannot hydrate after a bounded refresh, treat it as
   a bug or explicit blocker, not acceptable normal UI.

### 1.6 Recent Surge Window

Change visible and logic framing from:

```text
10~30초
```

to:

```text
0~30초
```

Rationale:

- the user wants short-term trading response;
- a 10-second lower bound is too slow for this product surface;
- the detector may still use dedupe/cooldown, but it should not require a
  minimum 10-second wait before a meaningful surge can appear.

### 1.7 Toss Account Rail Requirements

The right account rail must more closely match the Toss account surface while
keeping Araon's visual system.

Required features:

1. Sort order control:
   - total profit rate high;
   - total profit rate low;
   - evaluation amount high;
   - evaluation amount low;
   - daily profit rate high;
   - daily profit rate low;
   - Korean alphabetical;
   - manual custom order.
2. Current display toggle:
   - `현재가`;
   - `평가금`.
3. Clicking a position row changes the selected chart/ticker.
4. Remove the `읽기 전용` pill from the rail header.
5. Replace the text `새로고침` pill/button with a compact circular refresh icon
   button.
6. Keep the rail visually attached to the right side like a drawer/panel, with
   no width jitter when opening/collapsing.
7. Use the existing Araon design system, not a direct Toss copy.

### 1.8 UI Typography Consistency

The user sees inconsistent text and UI scale. This goal must normalize:

- Toss account rail header, cash strip, investment summary, rows;
- favorites header, pills, row names, price states;
- recent surge cards;
- agent panel headings and statuses;
- bottom status bar;
- settings modal connection tab.

Use `docs/design.md` and existing Araon app tokens as the authority.

Avoid one-off inline font-size escalation. Account rail text may be slightly more
legible, but the whole app must not become oversized.

### 1.9 Agent Completion Honesty

The agent is not an autonomous live trader yet.

Current target for this lane:

- explain current agent completeness honestly in UI/docs;
- keep decision-support + safety foundation;
- show detection -> candidate -> simulation/preview -> live lock;
- remove mock-looking/internal event text from product UI;
- keep real order execution locked.

Do not imply live trading is active.

---

## 2. Current Evidence And Code Surfaces

Re-check before editing, but current inspection found these likely surfaces.

### 2.1 Watchlist / Holding / Favorite

Relevant files:

- `src/server/watchlist/araon-watchlist-service.ts`
- `src/server/routes/watchlist.ts`
- `src/server/toss/toss-watchlist-client.ts`
- `src/server/toss/toss-portfolio-client.ts`
- `src/client/stores/watchlist-store.ts`
- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/TossAccountRail.tsx`
- `src/client/lib/api-client.ts`
- `src/shared/types.ts`

Current behavior:

- `/watchlist` merges Toss watchlist, local favorites, and portfolio positions.
- `holding: true` and `watchlistMember: true` are currently different concepts.
- A held item can render with `보유` and an empty star if it is not in Toss
  watchlist/local favorites.
- `FavoritesBlock` can show `가격 확인 중`, `지원 대기`, or `Toss 전용`.
- Local store comments still describe separate `favorites` and
  `watchlistMembers` buckets.

Required change:

- introduce/extend a normalized membership model so held positions render as
  part of the primary `즐겨찾기` surface;
- track provenance for manual Toss watchlist, manual Araon star, local fallback,
  and holding-auto membership;
- make star fill state match user expectation for held/watchlisted/favorited
  products;
- add safe reconciliation from holdings -> Toss watchlist.

### 2.2 KIS Slot Allocator

Relevant files:

- `src/server/realtime/kis-ws-slot-allocator.ts`
- `src/server/routes/runtime.ts`
- `src/server/routes/__tests__/runtime.test.ts`
- `src/server/routes/__tests__/kis-ws-slots.test.ts`
- `src/server/realtime/__tests__/kis-ws-slot-candidates.test.ts`
- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/SettingsModal.tsx`

Current behavior:

- priority currently includes holdings, user pins, current view, news,
  disclosure, Toss signal, agent candidate, manual watchlist, TOP100 rotation.
- current TOP100 rotation can still appear as a candidate.
- normal UI may expose slot/fallback concepts.

Required change:

- watchlist/holdings/starred first;
- agent candidates next;
- TOP100 not a meaningful KIS slot consumer;
- UI should surface only compact `실시간 추적` state when useful.

### 2.3 Toss Fast Quote Lane

Relevant files:

- `src/server/toss/toss-fast-quote-lane.ts`
- `src/server/toss/__tests__/toss-fast-quote-lane.test.ts`
- `src/server/toss/toss-quote-polling-service.ts`
- `src/client/components/StatusBar.tsx`
- `src/server/market/market-top-movers-service.ts`
- `src/client/lib/surge-aggregator.ts`

Current behavior:

- candidates include current view, favorites, agent, TOP100 gainers/losers, and
  KIS tracked companions.
- current view may outrank favorites.
- TOP100 consumes candidate priority.

Required change:

- favorites/holdings/watchlist candidates must hard-prioritize price hydration;
- agent candidates should be next;
- TOP100 should rely primarily on Toss ranking and only use quote lane if spare;
- no full-market 0.5s polling;
- keep hard cap and in-flight/backoff/stale guards.

### 2.4 Recent Surge

Relevant files:

- `src/client/components/SurgeBlock.tsx`
- `src/client/lib/surge-aggregator.ts`
- `src/client/lib/realtime-momentum.ts`
- `src/client/hooks/useSSE.ts`
- `src/client/stores/toast-store.ts`
- `src/server/agent/market-movement-agent-event.ts`

Current behavior:

- visible copy still says `10~30초`.
- surge items can show numeric codes when product display names are missing.
- previous reports showed duplicate toasts and row click issues.

Required change:

- copy and logic window become `0~30초`;
- surge rows use product-display-name resolution;
- clicking surge row changes selected ticker/chart;
- duplicate movement alerts stay deduped.

### 2.5 Toss Account Rail

Relevant files:

- `src/client/components/TossAccountRail.tsx`
- `src/client/App.tsx`
- `src/client/components/SettingsModal.tsx`
- `src/client/styles/global.css`
- `src/client/components/__tests__/toss-account-rail.test.tsx` if added

Current behavior:

- no sort control;
- no current/evaluation amount toggle;
- position row does not change chart;
- header has `읽기 전용` pill;
- refresh is text;
- inline styles control most typography.

Required change:

- add sort/toggle controls;
- wire row click to selected ticker/product-aware chart path;
- icon-only refresh button;
- remove read-only pill;
- normalize font sizes.

### 2.6 Agent Surface

Relevant files:

- `src/client/components/AgentEventsRail.tsx`
- `src/client/components/OrderIntentSafetyRail.tsx`
- `src/client/components/OrderSafetyModal.tsx`
- `src/server/agent/agent-event-queue.ts`
- `src/server/agent/market-movement-agent-event.ts`
- `src/server/agent/order-intent-service.ts`
- `src/server/routes/agent-events.ts`
- `src/server/routes/agent-order-intents.ts`

Current approximate completion:

| Area | Estimate |
|---|---:|
| event queue / normalized inputs | 60-70% |
| decision-support UI | 40-50% |
| order intent / preview / audit / live lock | 55-60% |
| real strategy decision engine | 15-25% |
| paper/live execution and reconciliation | 10-20% |
| autonomous trading readiness overall | 25-30% |

Required change:

- product UI must say what is active, what is preview-only, and what is locked;
- no internal mock-looking event rows;
- no live trading claim.

---

## 3. Implementation Plan

### Phase 0 - Baseline Audit

1. Run `git status --short` and preserve the dirty worktree.
2. Read this document, `docs/design.md`, and the latest completion/progress
   audits.
3. Verify dev server URLs if running.
4. Capture current behavior for:
   - favorites rows with `가격 확인 중` / `지원 대기`;
   - held item star state;
   - KIS slot candidate counts;
   - TOP100 cadence;
   - Toss account rail sort/click limitations;
   - agent readiness copy.

Output:

- update or create a short progress note under `docs/research/` if evidence is
  needed for later completion audit.

### Phase 1 - Unified Watchlist Membership Model

Server work:

1. Extend `AraonWatchlistItem` with safe membership/provenance fields if needed:
   - `watchSurfaceMember`;
   - `watchlistMember`;
   - `holding`;
   - `membershipSource`;
   - `autoSyncedFromHolding`;
   - `manualWatchlist`;
   - `localFallback`;
2. Do not expose raw Toss identifiers.
3. Make holdings part of the primary returned watch surface.
4. Preserve Toss watchlist as primary manual truth.
5. Preserve local favorites as fallback/cache.

Client work:

1. `watchlist-store` should treat the visible favorites set as the normalized
   watch surface.
2. Star fill state should be true for Toss watchlist, held positions awaiting
   auto-sync, and Araon starred items.
3. Star/unstar remains a product-aware Toss watchlist sync intent.
4. Product identity must keep Toss `productCode` separate from KRX `krTicker`.

Tests:

- held position without Toss watchlist renders as visible favorite with filled
  star or sync-pending filled star;
- manual Toss watchlist item stays after no holding;
- local fallback does not masquerade as fully synced;
- unsupported Toss-only product does not get sent to KIS/six-digit-only routes.

### Phase 2 - Safe Toss Watchlist Reconciliation

Implement a bounded reconciliation path.

Required behavior:

1. Compute diff:
   - held positions missing from Toss watchlist -> add candidates;
   - previously auto-added holding entries no longer held -> remove candidates;
   - manual Toss/Araon watchlist entries -> never auto-remove.
2. Run in small bounded batches.
3. Use redacted logs only.
4. Verify after mutation by re-reading Toss watchlist.
5. Stop on first unexpected failure.
6. Store enough local provenance to avoid deleting manual watchlist entries.

Suggested API/runtime shape:

- server service function:
  - `reconcileHoldingsWithTossWatchlist({ dryRun?: boolean, maxMutations?: number })`
- route or internal action:
  - safe read-only preview by default;
  - mutation only when explicitly called by normal product sync path under this
    goal's granted watchlist permission.

Acceptance:

- a held KR product missing from Toss watchlist becomes Toss-synced or clearly
  sync-pending with no raw payload;
- a held product no longer held is removed only if Araon provenance says it was
  auto-added from holding;
- user-manual watchlist items survive no-holding state.

### Phase 3 - Favorites Price Hydration

Target:

- no visible steady `가격 확인 중` in favorites.

Server:

1. hydrate watchlist rows with best real price in priority order:
   - Toss position current price;
   - Toss watchlist `last` and `base`;
   - price store latest;
   - Toss fast quote lane accepted samples.
2. ensure KR eligible favorites/holdings are added to Toss fast quote candidates
   before TOP100.
3. do not fabricate price if no quote returns.

Client:

1. remove or demote `가격 확인 중` copy from normal favorites UI.
2. for KR eligible rows without price during the first brief load, use a
   skeleton/hidden hydration state rather than a permanent text row.
3. if unsupported, show `지원 대기` or `Toss 전용` as a product state.

Tests:

- KR eligible favorite with Toss fast quote sample renders numeric price;
- held position current price renders numeric price;
- unsupported Toss-only product renders `Toss 전용`/`지원 대기`, not `가격 확인 중`;
- no fake price appears.

### Phase 4 - KIS Slot Priority And TOP100 Containment

Change KIS `실시간 추적` candidate order:

1. watchlist/holdings/starred;
2. agent/order-intent candidates;
3. selected/full-chart ticker;
4. recent news/disclosure/signal;
5. TOP100 last-resort only, or removed when enough higher-priority candidates
   exist.

Rules:

- KIS cap stays 40.
- Toss-only products never enter KIS.
- `fallback` should not be product-facing copy.
- When KIS slot is full, Toss fast quote continues as the replacement lane.

Tests:

- 40-slot cap respected.
- watchlist/holding candidates outrank TOP100.
- agent candidates outrank TOP100.
- TOP100 does not displace watchlist/holding candidates.
- Toss-only product is excluded from KIS.

### Phase 5 - Toss Fast Quote Candidate Priority

Change fast quote priority to match the product goal:

1. Toss watchlist + holdings + Araon starred.
2. Agent/order-intent candidates.
3. Selected/full-chart ticker.
4. TOP100 only if spare capacity remains.
5. KIS tracked companion only if useful and not already covered.

Keep:

- 500ms default interval;
- target cap 64, hard cap 100, batch size 100 unless a later measured plan
  changes it;
- single in-flight guard;
- backoff;
- unchanged/stale dedupe;
- no full-market polling.

2026-05-18 measurement note:

- `64` is Araon's conservative fast quote candidate default, not a Toss-side
  cap.
- Public quote probe evidence: 10 rps x 64 for 10 minutes passed cleanly; short
  burst 300 rps x 64 passed cleanly; 500 rps x 64 still returned 200/complete
  rows but p95 latency degraded beyond 2 seconds, so it is not a product
  operating target.
- Product default should favor low request rate plus broader batch coverage:
  favorites/holdings first, then agent/current/KIS companions, with TOP100 only
  using spare capacity.

Tests:

- favorites/holdings stay inside target cap before TOP100;
- TOP100 candidates are dropped first when cap is full;
- quote lane does not request unsupported product codes;
- status bar wording stays user-friendly.

### Phase 6 - Recent Surge 0-30s

Change:

- `10~30초` -> `0~30초` in copy and logic.

Acceptance:

- recent surge title says `0~30초`;
- empty state says `최근 0~30초`;
- detector can accept meaningful movements below 10 seconds old;
- threshold still works, so 3% does not alert on 0.x/1.x/2.x movements;
- duplicate toasts remain suppressed;
- clicking a surge row changes selected ticker/chart.

Tests:

- surge aggregator accepts 0-30 second window;
- threshold 3% blocks 2.99%;
- row click uses product-aware select path;
- display names resolve before falling back to code.

### Phase 7 - Toss Account Rail Product Polish

Implement account rail controls:

1. Sort menu:
   - 총 수익률 높은 순
   - 총 수익률 낮은 순
   - 평가금 높은 순
   - 평가금 낮은 순
   - 일간 수익률 높은 순
   - 일간 수익률 낮은 순
   - 가나다 순
   - 직접 설정하기
2. Display toggle:
   - 현재가
   - 평가금
3. Row click:
   - KR position changes selected chart;
   - unsupported product shows honest `지원 대기` or no-op reason;
   - no raw ids.
4. Header:
   - remove `읽기 전용` pill;
   - circular icon refresh button;
   - no sidebar width jitter.

Manual order:

- If implementing drag/drop is too large, implement a local persisted manual
  order mode with explicit up/down controls or a compact reorder affordance.
- Do not claim `직접 설정하기` is complete unless the user can actually change
  order.

Tests:

- sort comparators work;
- display toggle changes value shown;
- row click callback fires with product-aware identity;
- refresh is icon-labeled and accessible;
- no `읽기 전용` pill in account rail header.

### Phase 8 - Typography And Density Pass

Audit and normalize:

- account rail;
- favorites;
- recent surge;
- agent panel;
- bottom status bar;
- settings modal.

Rules:

- use existing CSS variables and design tokens;
- prefer class-based styles over one-off inline font-size jumps where practical;
- keep desktop terminal density;
- do not make the entire UI larger to fix one tiny label;
- verify at 1920x1080, 1600x1000, 1440x900, and about 900px width.

Acceptance:

- no vertical title wrapping such as `즐 / 겨 / 찾 / 기`;
- no overlapping pills/sparklines;
- account rail labels and values are readable but not oversized;
- status bar remains vertically centered in light and dark mode.

### Phase 9 - Agent Completion And UI Honesty

Update product UI/docs to show the real state:

1. Event inputs: active.
2. Candidate detection: active/partial depending on source.
3. Simulated preview/order-intent: foundation ready.
4. Approval/audit: foundation ready.
5. Live order execution: locked.
6. Strategy decision engine: not ready.
7. Paper trading/reconciliation: not ready or partial.

UI should explain the flow:

```text
감지 -> 후보 -> 모의 미리보기 -> 실거래 잠금
```

Acceptance:

- normal user can understand that Araon is not trading live;
- no mock-looking/internal raw event text;
- no unsupported claim that the agent can trade autonomously now.

### Phase 10 - Settings Cleanup Follow-Up

Because watchlist/KIS/account rules are changing again, re-check settings:

1. Connection tab should not expose multi-profile KIS UX.
2. Product-facing copy should use `실시간 추적`, not KIS jargon.
3. Toss watchlist sync controls should be safe and understandable.
4. Dangerous mutation controls must be explicit and bounded.
5. Developer/internal diagnostics should move behind an advanced/dev-only area.

Acceptance:

- a normal user can understand the connection tab;
- settings do not contradict the new watchlist/realtime truth model.

### Phase 11 - Completion Audit

Create:

```text
docs/research/araon-watchlist-realtime-account-agent-alignment-completion-audit.md
```

It must include PASS/FAIL evidence for:

1. held positions render in favorites;
2. held item star state is filled/syncing, not empty;
3. Toss watchlist auto-add works with redacted evidence;
4. provenance prevents deleting manual watchlist items;
5. no normal `가격 확인 중` in favorites;
6. KIS slots prioritize watchlist/holdings over TOP100;
7. TOP100 remains Toss-only / does not consume important KIS slots;
8. Toss fast quote cap prioritizes favorites/holdings;
9. recent surge uses `0~30초`;
10. surge threshold still blocks sub-threshold noise;
11. account rail has sort/toggle/row-click/icon refresh;
12. account rail width does not jitter;
13. UI typography is visually consistent;
14. agent readiness is honestly labeled;
15. no raw secret/session/account/order/watchlist payload is exposed.

---

## 4. Verification Checklist

Run the strongest feasible set before completion.

Required:

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

Security-sensitive check:

```bash
git grep -nE 'SESSION|UTK|LTK|FTK|browserSessionId|deviceId|appSecret|approval key|account number' -- ':!docs/archive/*'
```

Focused tests to add or update:

- watchlist service merge/provenance/reconcile tests;
- Toss watchlist client mutation tests if contracts change;
- FavoritesBlock visible state tests;
- KIS WS slot allocator tests;
- Toss fast quote candidate priority tests;
- SurgeBlock 0-30s tests;
- TossAccountRail sort/toggle/click tests;
- agent UI copy/readiness tests.

Browser / visual QA:

1. Open the actual app, not only static mock.
2. Verify account rail open/collapse no jitter.
3. Verify favorites with held positions.
4. Verify account rail sorting and current/evaluation toggle.
5. Verify account rail row click changes selected chart.
6. Verify recent surge row click changes selected chart.
7. Verify UI scale at:
   - 1920x1080;
   - 1600x1000;
   - 1440x900;
   - about 900px width.

Market-hours evidence:

- When market is open, verify TOP100/ranking/recent surge cadence.
- If market is closed, document remaining market-hours checks as blockers
  rather than claiming complete.

---

## 5. Completion Criteria

This goal is complete only when all criteria below are satisfied:

1. Toss watchlist, Toss holdings, and Araon favorites behave as one coherent
   `즐겨찾기` product surface.
2. Held positions appear in favorites without requiring a manual Araon favorite.
3. Held items do not show empty star just because Toss watchlist sync has not
   run yet.
4. Araon star/unstar is product-aware Toss watchlist sync intent.
5. Toss watchlist auto-add/remove uses safe provenance and redacted evidence.
6. Manual Toss/Araon watchlist items are not auto-deleted just because holdings
   disappear.
7. Normal favorites UI does not show steady `가격 확인 중`.
8. Favorites/holdings are first-priority price hydration candidates.
9. KIS slots prioritize watchlist/holdings, then agent, then lower-priority
   sources; TOP100 does not displace higher-priority rows.
10. KIS fallback/full-slot behavior is covered by Toss fast quote, not a broken
    price state.
11. TOP100 remains Toss-primary and does not depend on KIS.
12. Recent surge copy and logic use `0~30초`.
13. Recent surge row click changes selected chart.
14. Duplicate visible movement toasts remain suppressed.
15. Toss account rail supports sort order selection.
16. Toss account rail supports current price / evaluation amount toggle.
17. Toss account rail row click changes selected chart when supported.
18. Toss account rail refresh is a circular icon button and `읽기 전용` pill is
    removed.
19. Toss account rail open/collapse causes no sidebar width jitter.
20. UI typography/density is consistent with `docs/design.md`.
21. Agent UI explains decision-support readiness and live-trading lock honestly.
22. No raw Toss/KIS/session/account/order/watchlist payload leaks into UI, logs,
    docs, stdout, or git diff.
23. Completion audit document is written.
24. Required tests/build/diff/no-live soak pass, or remaining blockers are
    explicitly documented with next minimal probe.
