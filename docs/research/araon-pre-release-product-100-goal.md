# Araon Pre-Release Product 100% Hardening Goal

Date: 2026-05-17

This document is the authoritative execution brief for bringing Araon product
functionality to a pre-release 100% state while intentionally leaving GitHub
Release, npm publish, and public distribution work for the final release lane.

This document supersedes older goal prompts only for the pre-release product
hardening lane. It does not replace:

- `docs/research/araon-final-product-execution-goal.md`
- `docs/research/toss-fast-quote-surge-lane-goal.md`
- `docs/research/realtime-surge-chart-watchlist-sync-goal.md`
- `docs/research/araon-release-readiness-live-watchlist-agent-roadmap.md`
- `docs/design.md`

Future goal runs must read this document first, then use the linked documents
as supporting references.

## 0. Scope

### In Scope

Bring the actual Araon product to a practical 100% pre-release state:

1. Toss-first market and account terminal behavior.
2. Toss watchlist-centered favorites.
3. Product-aware search/add/star flows.
4. Optional KIS `실시간 추적` only.
5. TOP100 / realtime ranking / recent surge quality.
6. Mini chart and full chart quality.
7. Toss account rail product polish.
8. Agent event, decision-support, order-intent preview, approval, and audit
   foundation.
9. News/disclosure/Toss signal normalization as agent/user inputs.
10. UI consistency, typography, density, responsive behavior, and visual QA.
11. Runtime stability and performance under normal no-live operation.
12. CLI/local install quality as a product surface, but not public release
    packaging.
13. Documentation of operational behavior needed by the app itself.

### Explicitly Out Of Scope Until The Final Release Lane

Do not spend this goal on public release packaging unless it blocks local
product verification:

1. GitHub Release creation.
2. npm publish.
3. public version bump for release.
4. release screenshots for GitHub marketing.
5. desktop release artifact upload.
6. changelog/release note final polishing for public users.

These are intentionally last. They should start only after this document's
Completion Criteria pass.

### Explicitly Out Of Scope Until A Separate Live-Trading Approval Lane

This document does not authorize:

1. live order placement.
2. order cancellation.
3. order amendment.
4. account setting mutation.
5. automatic live buy/sell execution.
6. standing permission for autonomous trading.

The agent goal in this document is **decision-support and safety foundation
100%**, not live auto-trading 100%.

## 1. Product Definition

Araon should become a local-first, Toss-primary personal investment terminal.

The user should be able to:

1. launch Araon locally.
2. use Toss public market data without credentials.
3. optionally complete Toss QR login once.
4. see account, portfolio, cash, order, transaction, and watchlist/account-aware
   surfaces after login.
5. monitor TOP100, favorites, recent surge, selected ticker chart, and agent
   events from the home screen.
6. optionally enable KIS credentials only for low-latency Korean-stock realtime
   tracking of high-value eligible tickers.
7. see clearly that live trading is locked.
8. create simulated/paper/order-intent previews from agent events without
   placing live orders.
9. understand whether data is live, delayed, unavailable, collecting, locked,
   or sync-pending.

The app must not pretend to be a brokerage, advisor, or live trading bot.

## 2. Safety And Data Boundaries

### 2.1 Secret And Raw Identifier Boundary

Never expose raw values in UI, logs, docs, stdout, screenshots, fixtures, or git
diff:

- Toss session/cookie/storage values.
- Toss account identifiers.
- Toss order identifiers.
- Toss watchlist upstream identifiers.
- KIS app key.
- KIS app secret.
- KIS access token.
- KIS approval key.
- KIS account number.
- raw KIS WebSocket frames.
- Telegram tokens/chat IDs.
- Naver/OpenDART API secrets.

Only safe aggregate status, counts, source labels, and redacted IDs may be used.

### 2.2 Financial Data Boundary

Do not fabricate finance data.

- No fake quotes.
- No fake candles.
- No synthetic price movement.
- No fake account/portfolio values.
- No invented news/disclosure/signal content.

Unknown values must render as:

- `수집 중`
- `대기`
- `미제공`
- `지원 대기`
- `사용 불가`
- empty state with a short reason

### 2.3 Live Mutation Boundary

Allowed without additional approval:

- read-only Toss public market data.
- read-only Toss authenticated account surfaces after user login.
- mocked/fixture Toss watchlist mutation tests.
- local-only/cache state updates.
- simulated/paper order-intent previews.
- approval challenge creation that still leaves live execution locked.

Already-approved boundary for this goal/thread:

- The user provided standing fresh GO on 2026-05-17 for future bounded,
  reversible Toss watchlist live smoke checks when they are needed for this
  pre-release goal.
- This standing GO applies only to the redacted add-then-remove watchlist smoke
  command described in section 8.3.
- Each run must still be bounded to one probe item, restore the previous count
  in the same run, and print only redacted count/status evidence.
- A failed restore remains a blocker and cancels further live watchlist mutation
  attempts until resolved.

Still requires fresh explicit user approval at the moment of execution:

- live order preview against a real account if it calls a mutation-like endpoint.
- live order placement.
- order cancel/amend.
- account mutation.

If a goal run reaches one of those boundaries, it must stop and ask the user.

## 3. Current Baseline

This baseline reflects the current branch shape after the release-slice work.
Re-check before implementation because code may drift.

### 3.1 Branch And Verification Baseline

Current branch observed:

- `codex/araon-release-slices`

Recent slices exist for:

- Toss and agent runtime integrations.
- Araon v7 terminal layout.
- agent event and order-intent safety foundation.
- fast quote surge and chart progression.
- Toss account/watchlist surfaces.
- KIS optional tracking containment.
- CLI operational commands.
- release readiness slice map.

Previous full verification passed:

- `npm test`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`
- `npm pack --dry-run --json`
- tracked-file secret-like scan

Do not assume this remains true. Re-run verification at the end of this lane.

### 3.2 Current Product Completion Estimate

Use this as a starting estimate, not a success claim:

| Product Area | Current Estimate | Target In This Goal |
|---|---:|---:|
| Toss-first public market data | 75% | 100% |
| Toss login/session/account rail | 70% | 100% |
| Toss watchlist/favorites | 60% | 100% foundation; bounded live smoke allowed under the standing smoke-only GO |
| KIS optional realtime tracking | 80% | 100% as optional rail |
| TOP100 / realtime ranking | 65% | 100% market-session verified |
| Recent surge / fast quote lane | 65% | 100% market-session verified |
| Mini/full chart | 65% | 100% product quality except external advanced-widget licensing |
| v7 home UI | 70% | 100% product quality |
| News/disclosure/Toss signal | 45% | 85-100% for normalized user/agent inputs |
| Agent event/order-intent safety | 45% | 100% foundation, 0% live execution |
| CLI/local product operation | 85% | 100% local readiness |
| GitHub/npm public release | 55% | out of scope here |

## 4. Source Of Truth Model

### 4.1 Toss Is Primary

Toss is the default source of truth for normal user-facing product behavior:

- quote
- search
- TOP100 / movers
- chart candles where available
- account summary
- portfolio positions
- cash overview
- watchlist
- orders
- transactions
- authenticated refresh notification triggers
- Toss news/signal surfaces where confirmed

Toss realtime must be modeled as:

- SSE thin notification
- then REST resource refresh

Do not describe Toss as WebSocket-based unless new verified evidence proves it.

### 4.2 KIS Is Optional `실시간 추적`

KIS is not the source of truth for:

- account
- order
- portfolio
- Toss watchlist/favorites
- ranking/TOP100
- chart history
- sector/theme truth
- broad polling

KIS exists only as optional acceleration:

- low-latency realtime tick tracking.
- eligible six-digit Korean tickers only.
- maximum 40 WebSocket subscriptions per profile.
- candidate-driven slot allocation.
- no Toss-only products sent into KIS.

User-facing copy should say:

- `실시간 추적`
- `추적 중`
- `추적 대기`
- `지원 대기`

Avoid normal UI copy:

- `KIS WS`
- `폴링`
- `폴링40`
- `등록됨`
- `내 목록`
- `fallback`
- `tracked`

Diagnostics and developer settings may mention KIS if necessary, but only with
safe, non-sensitive status.

### 4.3 Local State Is Cache/Fallback

Local favorites, tracked stocks, local price history, and local candle stores
are not the primary product truth when Toss is available.

They are allowed as:

- cache.
- fallback when Toss session is absent.
- migration support.
- no-live/offline state for UI continuity.
- local chart rendering store.

They must not appear to the user as a separate competing watchlist concept.

## 5. Product Identity Rules

Every product action must distinguish:

- Toss `productCode`
- six-digit KRX `krTicker`
- display name
- market
- exchange
- `tossEligible`
- `kisEligible`
- `quoteEligible`
- `chartEligible`
- `watchlistSyncState`

Rules:

1. `A005930` and `005930` are related but not the same identifier.
2. Toss-only products may have no six-digit KRX ticker.
3. Toss-only products must not be sent to KIS.
4. Unsupported products must not produce raw `400 Bad Request` UI.
5. UI must show honest state such as `Toss 전용`, `지원 대기`, or `동기화 불가`.
6. Search, star/unstar, watchlist, chart, and agent candidate flows must preserve
   product identity through the whole path.

## 6. Home UI Definition

Follow `docs/design.md` and the existing Araon product visual language.

### 6.1 Home Layout

The home screen is the primary operating surface.

Excluding the right account rail, main workspace is 50:50:

Left half:

- top 50%: TOP100 / movers
- bottom 50%: split 50:50 into favorites/watchlist and recent surge

Right half:

- top 50%: selected ticker / mini chart
- bottom 50%: agent event/candidate/safety summary

Right rail:

- Toss account/session/portfolio rail.
- narrow.
- visually separated by a clear border/divider.
- collapsible.
- when collapsed, main workspace expands.

Bottom:

- sticky market/status bar.
- always visible on home, full chart, and agent detail unless viewport is too
  constrained and a deliberate responsive rule replaces it.

### 6.2 Required Home Behaviors

1. TOP100 상승 and 하락 must be visible as two meaningful lists.
2. Favorites/watchlist must show more than one row in normal desktop sizes.
3. Recent surge must show meaningful threshold-crossing movement or a clear
   empty state.
4. Selecting a TOP100/favorite/surge row changes selected ticker and mini chart.
5. Search result click must not break on Toss-only products.
6. Full chart expands from the selected ticker panel, feeling like expansion,
   not unrelated navigation.
7. Agent detail expands from the agent panel, feeling like expansion.
8. Account rail collapse/expand must not leave odd rounded artifacts or dead
   whitespace.
9. No home scroll on desktop targets if the layout can scale to fit.
10. Inner scrollbars should be hidden where they make the UI look broken, while
    preserving scroll behavior if needed.

### 6.3 Visual Consistency Gates

Check these explicitly:

- text sizes are consistent across TOP100, favorites, surge, chart, agent, and
  account rail.
- status pills do not crowd or force vertical title stacking.
- favorites sparklines do not overlap pills or text.
- account rail labels such as `원화` and `달러` are readable but not oversized.
- bottom status bar items are vertically centered.
- dark mode uses dark surfaces for the bottom bar and all visible panels.
- no old prototype chrome appears.
- no placeholder avatars or static sample debug labels remain in production UI.

## 7. Toss Account / Session / Portfolio

### 7.1 Target Behavior

Without Toss login:

- UI clearly shows login required.
- QR login entry is visible enough to discover.
- app remains useful with public market data.
- no authenticated Toss calls happen unexpectedly.

With Toss login:

- session status is visible.
- account summary is visible.
- portfolio groups are visible.
- cash / orderable amount / order count / transaction count surfaces are visible
  when available.
- raw account/order/session identifiers are never displayed.
- session extend/expiry state is understandable.

### 7.2 Account Rail Quality

The right rail should feel like a Toss-like account side panel but in Araon
tokens:

- white/light surface by default.
- compact but readable.
- no huge text jumps.
- no cramped rows that show only two or three portfolio items on desktop unless
  the rail is intentionally narrow and scrollable.
- separate Korean and overseas holdings where data supports it.
- use `읽기 전용` and live-lock copy clearly.

### 7.3 Acceptance

1. Toss login absent state is clear.
2. Toss login ready state is clear.
3. Session unavailable/expired state is clear.
4. Account rail collapse/expand works visually.
5. Portfolio list uses safe display values only.
6. No raw identifiers appear.

## 8. Watchlist / Favorites

### 8.1 Product Definition

`즐겨찾기` means Toss watchlist when Toss session is available.

Local favorites are:

- fallback when Toss is unavailable.
- pending/sync cache.
- migration support.

There should not be a separate normal-user concept called `내 목록`.

### 8.2 Read Model

`GET /watchlist` or equivalent normalized read model must provide:

- item id safe for UI.
- display name.
- Toss product code if available.
- KRX ticker if available.
- market/exchange.
- price/change if available.
- sparkline if available.
- `tossEligible`.
- `kisEligible`.
- `syncState`: `toss-synced`, `local-only`, `sync-pending`,
  `sync-unavailable`, or equivalent.
- `trackingState`: whether optional realtime tracking is active/queued.
- human-readable reason.

### 8.3 Star / Unstar

Araon star/unstar intent:

- should target Toss watchlist when Toss session and supported mutation path are
  available.
- should become local-only or sync-pending when Toss is unavailable.
- should never send Toss-only products to KIS.
- should never surface raw `400 Bad Request`.
- live Toss watchlist mutation requires fresh explicit approval unless a
  separate already-approved live-smoke goal is active.

Live smoke implementation rules:

- Use only the internal redacted smoke command:

```bash
npm run smoke:toss-watchlist-live -- \
  --approved \
  --confirm LIVE_TOSS_WATCHLIST_SMOKE
```

- The smoke must add exactly one bounded probe candidate and remove it in the
  same run.
- The report may show only counts, actions, redacted candidate kind, and
  restored status.
- It must not print raw Toss product codes, watchlist/group identifiers,
  session values, account values, or upstream response bodies.
- Remove must target a real user-made watchlist group, not Toss recent-watch /
  history groups such as `RECENT_WATCH`.
- A failed restore is a product blocker. Stop new live mutation attempts until
  the temporary probe item is restored or the blocker is documented.

### 8.4 UI Rules

1. Top-level header can show compact counts:
   - `동기화 대기 N`
   - `실시간 추적 N/40`
2. Row-level large `KIS 실시간` pills should be avoided if they block sparklines.
3. Use subtle dot, icon, tooltip, or compact status when row space is tight.
4. Hide scrollbar styling in favorites if it harms the visual surface.
5. Sparkline should preserve useful real samples without fake movement.

### 8.5 Sparkline Persistence

Favorites sparkline should use real captured samples only:

- keep intraday/pre-market/regular/after-hours samples for up to 24 hours.
- when the next trading session begins, start a new session buffer.
- if no data arrives overnight, show the last real session shape rather than a
  fake flat line when safe.
- do not fabricate points.

### 8.6 Acceptance

1. Toss watchlist is primary when logged in.
2. Local fallback works when not logged in.
3. Search/add/star uses product identity safely.
4. No `내 목록` in normal UI.
5. No `등록됨` as old KIS/local-polling copy.
6. Sparkline and status do not overlap.
7. Optional realtime tracking count is understandable.
8. Live mutation is gated unless explicitly approved.

## 9. Search / Add / Product Support

### 9.1 Search Sources

Search may combine:

- Toss search.
- local cached product metadata.
- KIS/master metadata only as legacy/supporting metadata when appropriate.

Toss should be the preferred product discovery path.

### 9.2 Search Result States

Each result should be clear:

- `즐겨찾기`
- `추가`
- `동기화 대기`
- `Toss 전용`
- `지원 대기`
- `실시간 추적 가능`
- `실시간 추적 불가`

Avoid:

- `전체 종목` if it means old local tracked universe.
- `등록됨` if it means old local/KIS polling registration.

### 9.3 Acceptance

1. Searching `채비` or other Toss-only-like products does not show a raw 400.
2. KRX product search can select and chart.
3. Toss-only product search can show safe unsupported state.
4. Add/star/unstar actions route by product support, not by guessing.
5. Errors are human-readable and short.

## 10. TOP100 / Realtime Ranking

### 10.1 Target Behavior

TOP100 should feel close to Toss:

- rising and falling lists update frequently.
- rank reorder can refresh around 0.3-0.5 seconds if runtime is healthy.
- UI should avoid heavy rerender jank.
- data must come from provider ranking, not local filler.

### 10.2 Performance Rules

1. Do not full-market poll at 0.5 seconds.
2. Keep candidate/batch scope bounded.
3. Use in-flight guards.
4. Use stale response guards.
5. Use 429/5xx backoff.
6. Deduplicate unchanged rows.
7. Avoid rendering every tiny internal update if it causes visible app lag.

### 10.3 Acceptance

1. TOP100 rising/falling both show real provider rows when provider is healthy.
2. If provider unavailable, UI says why.
3. Rank reorder is visible without full page refresh.
4. No local watchlist filler masquerades as TOP100.
5. No severe UI jank during refresh.

## 11. Recent Surge / Fast Quote

### 11.1 Target Behavior

Recent surge should detect meaningful short-term movement from:

- KIS `ws-integrated` ticks for eligible tracked tickers.
- Toss `toss-fast-quote` samples for bounded hot candidates.

It must not treat slow/manual generic REST refresh as realtime surge input.

### 11.2 Threshold Rules

If user threshold is 3%:

- 0.x% should not alert.
- 1.x% should not alert.
- 2.x% should not alert.
- threshold crossing should alert only once per cooldown window.

Noise to suppress:

- raw KIS WS tick update toasts.
- Toss ranking rotation rows that do not meet movement threshold.
- repeated duplicate alerts for unchanged price.

### 11.3 Candidate Set

Toss fast quote lane may include only bounded hot candidates:

1. selected ticker.
2. full chart ticker.
3. Toss watchlist/favorites.
4. TOP100 gainers/losers top slice.
5. recent ranking entrants.
6. agent candidates.
7. order-intent candidates.
8. KIS tracked companions.

Defaults:

- interval: 500ms or tuned 300-500ms if stable.
- target cap: 40 tickers.
- hard cap: 60 tickers.
- no full-market fast polling.

### 11.4 Acceptance

1. Recent surge receives `toss-fast-quote`.
2. Recent surge receives `ws-integrated`.
3. Generic `rest` does not trigger realtime surge.
4. Threshold and cooldown behave correctly.
5. No raw update spam toasts.
6. UI stays responsive.
7. Live market-session calibration is documented.

## 12. Chart

### 12.1 Mini Chart

Mini chart should:

- show selected ticker.
- show current trading day by default.
- update current price/candle without manual refresh when real samples arrive.
- avoid horizontal/vertical scroll on desktop.
- scale to its panel.
- skip long non-trading gaps visually.
- never create fake candles.

### 12.2 Full Chart

Full chart should:

- expand from mini chart.
- feel like an in-workspace expansion.
- not navigate to an unrelated page.
- not scroll if viewport can scale.
- have interval/range buttons, not only dropdowns.
- support current price/candle progression from real samples.
- use Araon tokens.

### 12.3 Advanced Chart Decision

TradingView Advanced Chart is a separate decision:

- investigate official/embed/licensing/technical constraints.
- do not show scary warnings in normal UI.
- if advanced widget cannot be used safely, keep Araon chart but make limitation
  clear in dev docs, not in user-facing warning blocks.

### 12.4 Acceptance

1. Mini chart updates without refresh.
2. Full chart updates without refresh.
3. Current candle progresses from real samples.
4. Non-trading gaps are hidden without synthetic data.
5. Full chart has no unwanted scroll at target viewports.
6. Full chart controls are button-based and usable.
7. Advanced chart blocker is documented honestly.

## 13. News / Disclosure / Toss Signal

### 13.1 Target Product Role

News/disclosure/signal are not decorative content. They are:

- user-facing context.
- agent decision inputs.
- alert/event sources.
- audit evidence.

### 13.2 Provider Model

Supported providers may include:

- Toss news/signal surfaces where verified.
- Naver Finance/news/search.
- OpenDART disclosures.
- local provider cache.

Each event must include where possible:

- event type.
- ticker/product identity.
- source.
- provider published time.
- Araon first-seen time.
- freshness.
- dedupe key.
- relevance.
- confidence.
- reason.
- link/source reference if safe.

### 13.3 Latency Honesty

Do not claim `발행 후 10-30초 보장`.

Instead distinguish:

- provider publication time.
- provider exposure time if known.
- Araon first-seen time.
- user notification time.
- agent event queue time.

### 13.4 Deduplication

Avoid duplicates from:

- same URL variants.
- same title with tracking params.
- same article syndicated under different URLs.
- false ticker/name matches.
- stale provider responses.

### 13.5 Acceptance

1. News/disclosure/signal events have normalized shape.
2. Agent queue can consume them.
3. UI can show latest relevant context.
4. Duplicate handling exists.
5. Provider freshness is visible or inspectable.
6. Missing providers show `수집 중` / `미제공`, not fake content.

## 14. Agent Foundation

### 14.1 What 100% Means Here

For this goal, agent 100% means:

- the foundation for safe future trading is complete.
- the user can see what the agent is observing.
- the user can see candidate events and reasons.
- the user can create simulated/paper/order-intent previews.
- approval and audit lifecycle is understandable.
- live execution is clearly locked.
- missing autonomous-trading pieces are explicit.

It does **not** mean:

- agent places live trades.
- agent has standing permission.
- agent can auto-buy.
- agent can cancel/amend orders.

### 14.2 Event Contract

Agent events should support:

- `news_detected`
- `disclosure_detected`
- `toss_signal_detected`
- `market_movement_detected`
- `watchlist_changed`
- `position_changed`
- `order_intent_created`
- `approval_requested`
- `approval_granted`
- `approval_denied`
- `execution_locked`
- `risk_check_completed`
- `preview_created`

Each event should include:

- id.
- type.
- ticker/product identity.
- source.
- firstSeenAt.
- confidence.
- freshness.
- reason.
- severity/priority.
- safe public payload.
- audit reference when relevant.

### 14.3 Decision Support

Agent decision-support should show:

- what happened.
- why it matters.
- what data supported it.
- whether it is actionable.
- what action is blocked or allowed.
- what next manual step exists.

The UI should not imply that a trade has happened when only a preview exists.

### 14.4 Order Intent Lifecycle

Order intent lifecycle:

1. event observed.
2. candidate generated.
3. simulated/paper preview created.
4. risk checks run.
5. approval challenge may be created.
6. confirmation token can be checked.
7. live execution remains locked.
8. audit trail records every step.

### 14.5 Readiness Gaps To Expose

Expose these as not-ready/locked:

- decision engine.
- strategy policy.
- risk policy.
- paper trading ledger.
- Toss live order execution adapter.
- approval executor.
- execution reconciliation.
- position/order reconciliation.
- performance audit.
- kill switch policy for live auto-trading.

### 14.6 Agent UI Acceptance

1. Home agent panel is understandable in 10 seconds.
2. Agent detail expansion shows event queue and safety state.
3. Order intent preview is clearly simulated/paper/local.
4. Live execution locked state is visually strong.
5. Approval/audit trail is inspectable.
6. No user can mistake the current agent for a live trading bot.

## 15. KIS Optional Tracking

### 15.1 Slot Allocation

KIS slot allocator should prioritize:

1. holdings.
2. current selected ticker.
3. Toss watchlist/favorites.
4. pinned/user-priority realtime candidates.
5. recent news/disclosure/signal tickers.
6. agent candidates.
7. order-intent candidates.
8. TOP100/ranking hot samples.

Each candidate should carry:

- score.
- source.
- reason.
- ttl.
- lastSeenAt.
- pinned.
- `kisEligible`.

### 15.2 Churn Control

Use:

- subscribe/unsubscribe diff.
- minimum residence time.
- sticky TTL.
- churn cooldown.
- market phase guard.
- cap 40 per profile.

### 15.3 UI Acceptance

Normal UI:

- shows `실시간 추적 N/40`.
- does not show a giant separate KIS rail.
- does not show `KIS WS` in normal surfaces.
- shows row-level tracking only if compact and non-obtrusive.

Diagnostics:

- can show more details in settings/runtime panels.
- must remain secret-safe.

## 16. Runtime Stability And Performance

### 16.1 No-Live Startup

Clean install/no credentials:

- app starts.
- no external KIS calls.
- no authenticated Toss calls.
- no live mutation.
- Toss public market-data calls may occur only for visible public surfaces.
- UI clearly shows login/credential optional states.

### 16.2 Lag / Explosion Prevention

Guard against:

- unbounded timers.
- multiple overlapping polling loops.
- duplicate EventSource connections.
- repeated chart instance recreation.
- rerender storms from TOP100 or fast quote updates.
- raw tick toast spam.
- fast lane full-market expansion.

### 16.3 Acceptance

1. App remains responsive with TOP100 and fast quote lane active.
2. No unbounded memory/timer growth in ordinary use.
3. No duplicated SSE/listener behavior after navigation/refresh.
4. no-live soak passes.
5. real browser QA does not feel laggy.

## 17. CLI / Local Product Operation

CLI is in scope only as local product readiness, not public release packaging.

### 17.1 Required Commands

Keep working:

- `araon`
- `araon --help`
- `araon --version`
- `araon --no-open`
- `araon --port <port>`
- `araon --host <host>`
- `araon --data-dir <path>`
- `araon doctor --no-live`
- `araon status`
- `araon open`
- `araon reset --session`
- `araon reset --data --confirm DELETE_LOCAL_ARAON_DATA`

### 17.2 Acceptance

1. CLI help is accurate.
2. Doctor is no-live and secret-safe.
3. Status does not expose raw session/account/order/watchlist values.
4. Reset session is scoped.
5. Reset data requires explicit confirm.

## 18. Settings

Settings should be a supporting surface, not a dumping ground.

Required sections:

1. Toss auth/session.
2. KIS optional realtime tracking.
3. market data/provider health.
4. alerts/recent surge thresholds.
5. agent safety/order intent.
6. data/cache/reset.
7. diagnostics/developer details, collapsed by default.

Settings should:

- use Araon typography.
- avoid oversized controls.
- avoid raw provider jargon in normal tabs.
- separate user actions from diagnostics.
- keep dangerous actions behind confirm.

## 19. Responsive And Visual QA Matrix

### 19.1 Required Viewports

Check at least:

- 1920x1080
- 1600x1000
- 1440x900
- 900px wide responsive

### 19.2 Required Screens

Check:

- Home.
- Home with account rail collapsed.
- Home with account rail expanded.
- Search open with KRX result.
- Search open with Toss-only result.
- Full Chart expanded.
- Agent Detail expanded.
- Settings modal.
- Toss login/session absent state.
- Toss login/session ready state if available.
- Dark mode.

### 19.3 Visual PASS Criteria

1. no text overlap.
2. no unexpected page scroll on desktop home.
3. bottom bar aligned and visible.
4. right rail has no weird top/bottom artifacts.
5. row density consistent.
6. status pills do not break layout.
7. no stale legacy copy.
8. no raw identifiers.
9. chart panels scale to available space.
10. expansion transitions feel like expansion.

## 20. Implementation Phases

Execute in this order. Each phase should be commit-sized where possible.

### Phase 0 - Re-Audit Current State

Purpose: avoid fixing ghosts or regressing working pieces.

Steps:

1. `git status --short -uall`.
2. confirm branch and recent commits.
3. read this document.
4. read `docs/design.md`.
5. read the linked final product and realtime goal docs.
6. inspect current code paths for each target area.
7. run focused baseline checks if cheap.
8. if dev server is running, inspect actual UI before editing.

Output:

- short audit note in the working log or completion audit.
- list of confirmed current blockers.

### Phase 1 - UI Scale And Consistency Pass

Purpose: fix the user's current visible issue that text/UI sizes are
inconsistent.

Focus files:

- `src/client/styles/global.css`
- `src/client/App.tsx`
- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/TossAccountRail.tsx`
- `src/client/components/TopMoversBoard.tsx`
- `src/client/components/SurgeBlock.tsx`
- `src/client/components/StockCandleChart.tsx`
- `src/client/components/AgentEventsRail.tsx`
- `src/client/components/OrderIntentSafetyRail.tsx`

Tasks:

1. inventory current font-size and row-height outliers.
2. normalize panel header sizes.
3. normalize row primary/secondary text sizes.
4. shrink oversized pills.
5. prevent favorites header title stacking.
6. ensure account rail values are readable but not huge.
7. verify dark mode bottom bar.

Verification:

- focused component tests if existing.
- browser visual QA at 1600x1000 and 1440x900.

### Phase 2 - Watchlist/Favorites 100%

Purpose: make Toss watchlist-centered favorites feel finished.

Tasks:

1. verify `/watchlist` read model.
2. ensure FavoritesBlock uses normalized watchlist state.
3. remove normal UI `내 목록` / `등록됨` remnants.
4. fix row status/sparkline collisions.
5. hide ugly scrollbars.
6. ensure 24h real-sample sparkline behavior.
7. verify KIS optional tracking count is accurate and understandable.
8. ensure star/unstar intent is product-aware.
9. keep live Toss mutation gated to the standing smoke-only approval above.
10. verify approved live smoke with the redacted internal command under the
    standing smoke-only GO when fresh watchlist evidence is needed.
11. ensure remove skips Toss recent-watch/history groups and removes from the
    user-made watchlist group.

Verification:

- watchlist service tests.
- Toss watchlist client mutation tests.
- Toss watchlist live smoke core tests.
- client watchlist/favorites tests.
- product identity tests.
- approved live smoke output with restored count-only evidence.
- browser search/favorite QA.

### Phase 3 - Search/Add 100%

Purpose: eliminate product identity errors and raw 400s.

Tasks:

1. test KRX search selection.
2. test Toss-only search selection.
3. test unsupported product add/star path.
4. ensure errors are mapped to human copy.
5. ensure KIS receives only eligible KRX tickers.
6. ensure UI state copy is product-aware.

Verification:

- route tests.
- client search tests.
- browser search QA.

### Phase 4 - TOP100 And Recent Surge 100%

Purpose: make realtime market movement credible.

Tasks:

1. verify TOP100 provider source.
2. verify rising/falling split.
3. tune rank reorder to 300-500ms only if stable.
4. verify fast quote candidate cap.
5. verify threshold behavior.
6. suppress raw update toasts.
7. measure UI lag.
8. document live market-session calibration.

Verification:

- fast quote lane tests.
- surge tests.
- top movers route tests.
- browser QA during market session if possible.
- no-live soak.

### Phase 5 - Chart 100%

Purpose: make mini/full charts feel reliable.

Tasks:

1. verify current candle progression.
2. prevent chart instance recreation.
3. ensure KST time handling.
4. hide non-trading gaps.
5. prevent mini/full chart scroll.
6. make full chart range/interval buttons polished.
7. remove normal-user advanced-chart warnings.
8. document advanced chart blocker separately.

Verification:

- chart component tests.
- price history tests.
- browser chart QA.

### Phase 6 - Toss Account Rail 100%

Purpose: make account/session surfaces feel product-grade.

Tasks:

1. normalize typography.
2. improve portfolio list density.
3. ensure Korean/overseas grouping is clear.
4. make read-only/live-locked state obvious.
5. polish collapsed/expanded rail.
6. verify no raw identifiers.

Verification:

- Toss account rail tests.
- browser QA.
- secret-safe scan.

### Phase 7 - News/Disclosure/Signal 85-100%

Purpose: make event inputs useful even if every provider is not perfect.

Tasks:

1. audit existing Naver/OpenDART/Toss signal surfaces.
2. normalize event schema.
3. implement or verify dedupe.
4. add freshness tracking.
5. feed normalized events into agent queue.
6. show concise UI context.
7. show unavailable/collecting honestly.

Verification:

- provider normalization tests.
- agent event queue tests.
- UI empty-state tests.

### Phase 8 - Agent Foundation 100%

Purpose: complete safe decision-support foundation.

Tasks:

1. verify event contract.
2. verify agent event queue.
3. improve home agent panel clarity.
4. improve Agent Detail.
5. ensure preview creation from event is understandable.
6. verify risk/approval/audit lifecycle.
7. expose live policy gaps clearly.
8. ensure live execution cannot happen.
9. add completion tests for locked live path.

Verification:

- agent service tests.
- order-intent tests.
- route tests.
- browser agent QA.

### Phase 9 - Runtime Stability 100%

Purpose: make app stable under normal use.

Tasks:

1. check timers/listeners.
2. check EventSource lifecycle.
3. check fast quote in-flight guards.
4. check chart rendering performance.
5. check TOP100 rerender frequency.
6. run no-live soak.
7. run browser interaction QA for lag.

Verification:

- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`
- browser QA.
- focused tests if regressions found.

### Phase 10 - Settings And Local Operation 100%

Purpose: make local user operation clear.

Tasks:

1. settings section cleanup.
2. Toss/KIS/agent/provider states separated.
3. dangerous reset guarded.
4. CLI doctor/status secret-safe.
5. no-live startup behavior verified.

Verification:

- settings tests.
- CLI tests.
- no-live startup/doctor.

### Phase 11 - Final Product Completion Audit

Purpose: close this goal honestly.

Tasks:

1. write `docs/research/araon-pre-release-product-100-completion-audit.md`.
2. include criteria table.
3. include visual QA results.
4. include test results.
5. include remaining release-only items.
6. include remaining live-trading-only items.

## 21. Verification Commands

Run at the end:

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

For CLI/local operation:

```bash
node dist/cli/araon.js --help
node dist/cli/araon.js --version
node dist/cli/araon.js doctor --no-live
```

For package structure only if local product changes touch packaging:

```bash
npm pack --dry-run --json
```

For sensitive changes:

```bash
git grep -nE "SESSION|UTK|LTK|FTK|browserSessionId|deviceId|accountNo|orderNo|approval[_-]?key|appkey|appsecret|access[_-]?token|bearer" -- ':!src/**/__tests__/**' ':!docs/archive/**'
```

Any positive hit must be reviewed. Test fixtures with fake values may be okay,
but raw real values are never okay.

## 22. Browser / Computer Use QA

Code-only verification is not enough.

Use actual browser visual QA for:

1. 1920x1080 home.
2. 1600x1000 home.
3. 1440x900 home.
4. 900px responsive.
5. account rail expanded/collapsed.
6. search open.
7. full chart expanded.
8. agent detail expanded.
9. settings modal.
10. dark mode.

During market hours, additionally verify:

1. TOP100 rank movement.
2. recent surge threshold behavior.
3. mini chart current candle progression.
4. full chart current candle progression.
5. no severe lag.

Use the read-only market evidence harness to capture repeatable evidence:

```bash
npm run soak:pre-release-market -- \
  --url http://127.0.0.1:3000 \
  --duration-ms=60000 \
  --interval-ms=500 \
  --ticker 005930 \
  --tickers 005930,000660 \
  --out "docs/archive/pre-release-market-evidence-$(date +%Y%m%d-%H%M%S).json" \
  --require-market-evidence
```

Then summarize the saved evidence JSON for the completion audit:

```bash
npm run soak:pre-release-market:summary -- \
  docs/archive/pre-release-market-evidence-YYYYMMDD-HHMMSS.json \
  --out docs/archive/pre-release-market-evidence-YYYYMMDD-HHMMSS.md
```

The harness samples only bounded read endpoints:

- `/market/top-movers?limit=100&market=kr`
- `/market/toss/realtime-ranking?limit=100&market=kr`
- `/market/toss/quotes?tickers=...`
- `/stocks/:ticker/candles?interval=1m&range=1d`
- `/runtime/data-health`

It must not call live mutation, live order, or live Toss watchlist add/remove
endpoints. If run outside market hours, `marketEvidenceReady=false` and
`completionReady=false` are expected and the output should be treated as
blocker evidence, not failure of the product.
The report's `completionReady` field is retained as a compatibility alias for
market-data evidence readiness only. It is not the final persistent goal
completion signal. The report must always keep `finalGoalCompletionReady=false`
because browser/Computer Use visual QA and the written completion audit are
separate gates.
The report must include both movement evidence and `sampleCadence` evidence so
a slow or stalled poll loop cannot be mistaken for the intended 300-500ms
product cadence. It must also include `fastQuoteLane` evidence from
`/runtime/data-health` so generic quote movement cannot be mistaken for the
bounded `toss-fast-quote` realtime-like lane.
The report must include `marketWindow` evidence using KST weekday/time
heuristics. Araon's live evidence window follows the product's integrated
Korean-market live window, 08:00-20:00 KST. Evidence collected outside that
window must stay blocked even if cached values happen to move. This is a
heuristic and does not replace an official holiday calendar.
For TOP100/realtime ranking completion, value movement alone is not enough.
The report must also show rank-order reorder evidence from TOP100 or realtime
ranking, otherwise the user-visible "순위가 갱신된다" requirement remains
blocked.
For final audit evidence, keep `--require-market-evidence` so the command exits
non-zero unless the market-data evidence is complete. `--require-completion`
remains accepted only as a backward-compatible alias for the same market-data
gate; it must not be interpreted as final goal completion.

After the market evidence command passes, perform browser/Computer Use visual
QA in the same live window before writing the completion audit:

1. Home at 1600x1000: verify TOP100 rising/falling ranks reorder without
   severe lag, recent surge does not emit sub-threshold noise, and bottom status
   bar remains aligned.
2. Home at 1440x900: verify favorites/recent surge/chart/agent panels keep the
   locked information structure without document scroll.
3. Full Chart: verify expansion feels like workspace expansion, not navigation,
   and the current candle/current price progresses without refresh.
4. Agent Detail: verify event/safety state remains understandable and live
   execution stays clearly locked.
5. 900px responsive: verify account rail collapse/expand, chart, and status bar
   do not overflow.

The completion audit may only be written after the saved market-evidence JSON
plus summary markdown and browser/Computer Use observations all support the
remaining criteria.

## 23. Completion Criteria

This pre-release product hardening goal is complete only when all are true:

1. Toss-first public market data works without credentials.
2. Toss QR login/session/account rail works when user logs in.
3. Toss account surfaces are read-only and secret-safe.
4. Toss watchlist is the primary favorites model when available.
5. Local favorites are fallback/cache only.
6. Search/add/star handles KRX and Toss-only products without raw 400s.
7. Product identity is preserved across search/watchlist/chart/KIS/agent flows.
8. KIS is optional `실시간 추적` only.
9. KIS receives only eligible six-digit KR tickers.
10. KIS REST-heavy legacy paths are not normal product flow.
11. TOP100 rising/falling uses provider ranking, not local filler.
12. TOP100 updates/reorders at the intended cadence without severe lag.
13. Recent surge uses `toss-fast-quote` and `ws-integrated`, not generic REST.
14. Recent surge threshold/cooldown is correct.
15. Raw KIS/Toss update spam toasts are suppressed.
16. Mini chart updates current candle from real samples without refresh.
17. Full chart updates current candle from real samples without refresh.
18. Non-trading gaps are hidden without synthetic candles.
19. Chart panels do not create unwanted scroll at target viewports.
20. Full chart expansion feels like expansion.
21. Account rail collapse/expand is visually clean.
22. UI text sizes and row density are consistent.
23. Favorites sparkline/status layout is clean.
24. Bottom status bar is aligned and dark-mode compatible.
25. News/disclosure/signal events are normalized enough for UI and agent input.
26. Provider freshness and first-seen timing are tracked or honestly absent.
27. Agent event queue is functional.
28. Agent Detail explains observation/candidate/reason/safety state.
29. Order-intent preview/risk/approval/audit lifecycle is functional.
30. Live execution remains locked and obvious.
31. Missing auto-trading pieces are displayed as not-ready/locked.
32. Settings are understandable and not a legacy junk drawer.
33. CLI local commands still work.
34. No raw secret/account/session/order/watchlist identifiers are exposed.
35. No synthetic financial data is introduced.
36. `npm test` passes.
37. `npm run typecheck` passes.
38. `npm run build` passes.
39. `git diff --check` passes.
40. no-live soak passes.
41. real browser visual QA passes.
42. completion audit is written.

## 24. Remaining Work After This Goal

Only after this goal passes, start the final release lane:

1. decide public version.
2. update README/README.ko/INSTALL.
3. write release notes.
4. generate screenshots.
5. run package/release acceptance.
6. create GitHub draft release.
7. publish npm only after final approval.

Only after a separate live-trading approval lane:

1. decision engine.
2. strategy policy.
3. risk policy.
4. paper trading ledger to real reconciliation.
5. Toss order execution adapter.
6. live approval executor.
7. execution reconciliation.
8. live kill switch.
9. bounded live pilot.

## 25. Goal Prompt

Use this prompt after reviewing this document:

```text
[$goal] Araon을 GitHub/npm 배포 직전의 product 100% 상태까지 끌어올린다. GitHub Release와 npm publish는 마지막 별도 lane으로 남긴다.

기준 repo는 /Users/stello/korean-stock-follower 이다.
반드시 /Users/stello/korean-stock-follower/docs/research/araon-pre-release-product-100-goal.md 를 먼저 읽고, 이 문서를 authoritative execution brief로 따른다.

핵심 목표:
1. Toss-first public/account/watchlist/quote/search/TOP100/chart 제품 경험을 100%로 닫는다.
2. Toss watchlist를 Araon 즐겨찾기의 primary truth로 완성하고, local favorites는 fallback/cache로 격리한다.
3. Search/add/star/watchlist/chart/KIS/agent 경로에서 Toss productCode와 six-digit KRX krTicker를 끝까지 분리한다.
4. Toss-only product는 KIS/six-digit-only route로 보내지 않고, 지원 상태를 정직하게 표시한다.
5. KIS는 optional low-latency `실시간 추적` rail로만 남기고, 계좌/주문/watchlist/ranking/chart truth source가 되지 않게 한다.
6. TOP100 상승/하락, realtime ranking, recent surge, Toss fast quote lane, threshold/cooldown/noise suppression을 장중 기준으로 검증 가능한 상태까지 끌어올린다.
7. mini/full chart가 real sample로 current candle/current price를 새로고침 없이 갱신하고, non-trading gap을 synthetic data 없이 숨긴다.
8. v7 Home UI, Toss account rail, favorites/recent surge, chart expansion, agent detail, settings, bottom status bar의 텍스트 크기/밀도/정렬/반응형을 기존 Araon 디자인 시스템 기준으로 정리한다.
9. 뉴스/공시/Toss signal을 user alert와 agent input으로 쓸 수 있게 source, firstSeenAt, freshness, confidence, reason, dedupe를 갖춘 normalized event로 정리한다.
10. Agent는 live trading bot이 아니라 decision-support + safety foundation으로 100% 닫는다: event queue, reason, preview, risk, approval, audit, live lock, readiness gaps를 명확히 구현한다.
11. CLI/local operation은 유지하되 GitHub Release/npm publish/공개 배포 작업은 이번 goal에서 하지 않는다.

안전 경계:
- 실제 주문, 주문 취소, 주문 정정, 계좌 변경 mutation 금지.
- live auto-buy/live auto-sell 금지.
- live Toss watchlist add/remove는 fresh explicit GO 없이는 실행 금지.
- Toss/KIS/session/account/order/watchlist raw 값은 UI/log/docs/stdout/git diff/screenshots에 노출 금지.
- 합성 금융 데이터, fake candle, fake sparkline movement 금지.
- full-market 0.3~0.5초 polling 금지.
- 기존 dirty worktree와 사용자 변경 보존.

진행 순서:
1. git status와 현재 branch를 확인하고 사용자 변경을 보존한다.
2. docs/research/araon-pre-release-product-100-goal.md 전체를 읽는다.
3. docs/design.md 와 기존 final/realtime/watchlist 관련 goal docs를 필요한 만큼 확인한다.
4. Phase 0 re-audit을 수행해 현재 blocker를 확정한다.
5. Phase 1 UI scale consistency부터 Phase 11 completion audit까지 작은 milestone 단위로 진행한다.
6. 각 milestone마다 focused tests를 추가/갱신하고 typecheck/build 영향 범위를 확인한다.
7. UI 변경은 반드시 실제 브라우저/Computer Use로 visual QA한다.
8. 장중 검증이 필요한 항목은 장중 evidence를 남기고, 장외라면 blocker로 명시한다.
9. live mutation/trading boundary에 닿으면 멈추고 사용자에게 별도 승인을 요청한다.

검증:
- focused tests
- npm test
- npm run typecheck
- npm run build
- git diff --check
- npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
- node dist/cli/araon.js --help
- node dist/cli/araon.js --version
- node dist/cli/araon.js doctor --no-live
- tracked-file secret grep
- 실제 브라우저/Computer Use visual QA

완료 조건:
docs/research/araon-pre-release-product-100-goal.md 의 Completion Criteria 42개를 모두 만족하고, docs/research/araon-pre-release-product-100-completion-audit.md 를 작성했을 때만 완료 처리한다.

[$caveman] hangul-full을 항상 사용할 것
```
