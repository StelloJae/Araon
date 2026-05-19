# Araon Pre-Release Product 100% Progress Audit

Date: 2026-05-18 08:26 KST

This is a progress audit for
`docs/research/araon-pre-release-product-100-goal.md`.

It is **not** the final completion audit. The goal must stay active until every
completion criterion is proven against current state and
`docs/research/araon-pre-release-product-100-completion-audit.md` is written.

## Current Status

Overall state: `COMPLETE`

Current branch:

- `codex/araon-release-slices`

Current hard boundary:

- GitHub Release and npm publish remain out of scope.
- Live order placement, cancellation, amendment, and account mutation remain
  forbidden.
- Bounded, reversible Toss watchlist add/remove smoke may use the standing
  smoke-only fresh GO the user provided on 2026-05-17 and reconfirmed on
  2026-05-18; it must still add one probe item, remove it in the same run,
  restore the previous count, and print only redacted count/status evidence.
- Any failed watchlist-smoke restore cancels further live watchlist mutation
  attempts until resolved.
- Raw Toss/KIS/session/account/order/watchlist values must not appear in UI,
  logs, docs, stdout, screenshots, or git diff.
- Synthetic financial data, fake candles, and fake sparkline movement remain
  forbidden.
- Full-market fast polling remains forbidden.

## Verification Snapshot

The following verification was run after the latest pre-release hardening
changes:

| Check | Result | Notes |
|---|---|---|
| `npm test` | PASS | 226 files / 1477 tests |
| `npm run typecheck` | PASS | server, client, electron, CLI typechecks |
| `npm run build` | PASS | Vite emitted the existing large chunk warning only |
| `git diff --check` | PASS | no whitespace errors |
| `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500` | PASS | 18 samples, `issueCount=0` |
| `npm run soak:pre-release-market -- --duration-ms=1500 --interval-ms=500` | SMOKE-PASS | read-only harness runs safely; closed-market smoke correctly blocked live evidence outside Araon's integrated live window |
| `npm run soak:pre-release-market -- --require-market-evidence` market-window run | PASS | `docs/archive/pre-release-market-evidence-20260518-082240.json`; `marketEvidenceReady=true`, `completionReady=true`, `sampleCount=600`, `sampleGapP95Ms=570`, `maxGapMs=659`, endpoint `p95DurationMs=109`, TOP100 rank reorder observed, quote movement observed, chart progression observed, bounded fast quote lane healthy |
| `node dist/cli/araon.js --help` | PASS | help renders |
| `node dist/cli/araon.js --version` | PASS | `1.1.4` |
| `node dist/cli/araon.js doctor --no-live` | PASS | OK, 6 pass / 1 expected no-live Toss-session warning |
| `npm pack --dry-run --json` | PASS | migrations through `src/server/db/migrations/021-stock-signal-events-detach-stock-fk.sql` are included; packaged PNG hits are intended client icons only |
| changed-diff sensitive value scan | REVIEW-PASS | raw-value candidate scan returned `candidateCount=0`; field-name hits are code symbols/test placeholders |
| tracked secret-like value grep | PASS | no quoted/env-style raw secret-like values found in tracked non-test/non-archive paths; broader path-only scan had one reviewed false-positive code variable forwarding path |
| KIS legacy REST containment audit | PASS | `docs/research/araon-kis-legacy-rest-containment-audit.md` maps Toss-first normal flow vs manual/env-gated KIS helpers |
| focused KIS containment tests | PASS | `app-launcher`, `runtime`, `import-guard`, `market`, `master`: 5 files / 91 tests |
| focused settings copy tests | PASS | `managed-operations-settings`, `credentials-setup-copy`, `status-bar` |
| settings / realtime panel DOM copy scan | PASS | no old `KIS WS`, `WebSocket`, `legacy REST`, raw/payload, or SSE/internal copy hits |
| focused agent copy tests | PASS | `agent-events-rail`, `agent-event-toast` after Korean lifecycle reason cleanup |
| focused agent public payload tests | PASS | `agent-event-public-payload`, `agent-event-queue`, `agent-event-monitor`: 3 files / 21 tests; public payload keeps freshness/source/relevance/confidence while omitting provider dedupe keys |
| focused Toss watchlist mutation tests | PASS | `toss-watchlist-client`, `toss-watchlist-live-smoke`: 2 files / 14 tests |
| live Toss watchlist add/remove smoke | PASS | fresh user GO; redacted add -> remove -> restored count-only smoke passed |
| Toss authenticated read smoke | PASS | current persistent session; account, account summary, portfolio, orders, transactions, watchlist, and asset-news surfaces returned sanitized count-only `ok` results |
| focused pre-release market evidence tests | PASS | 8 tests; movement, rank-reorder, market-window, latency, sample-cadence, and fast-quote-lane runtime guards covered |
| focused market evidence final-goal guard test | PASS | harness keeps `completionReady` as market-evidence-only compatibility and always emits `finalGoalCompletionReady=false` with browser QA / completion audit remaining need |
| market evidence CLI require flag | PASS | `--require-market-evidence` is the preferred exit-code gate; closed-market smoke exited `1`; `--require-completion` remains a backward-compatible alias for market-data evidence only and produced the same readiness fields |
| focused pre-release market evidence summary tests | PASS | 4 tests; JSON extraction, npm preamble parsing, table escaping, final-goal blocker copy, and Browser/Computer Use checklist covered |
| market evidence summary helper | PASS | `npm run soak:pre-release-market:summary -- /tmp/araon-market-evidence-current.json --out /tmp/araon-market-evidence-current.md` produced audit-ready Markdown with readiness, criterion mapping, blockers, and browser QA checklist |
| focused signal event persistence tests | PASS | `stock_signal_events` can record provider-ranked/untracked ticker market-movement signals without requiring local tracked-stock rows |
| pre-release product 100 audit probe | PASS | 42/42 criteria pass; `goalComplete=true` |
| focused realtime surge / alert tests | PASS | 5 files / 69 tests; threshold, cooldown, source filtering, raw KIS/TOP100 toast suppression, and live surge aggregation covered |

Browser visual QA was also performed against the local app:

- 1600x1000 home and full chart.
- 1440x900 home.
- 900px responsive home and full chart.
- Agent detail after lifecycle label cleanup.
- Fresh browser console check after reload showed only the React DevTools info
  line.

The QA screenshots were temporary local artifacts and were removed from the
worktree.

Live-window browser QA was re-run on 2026-05-18 after the market evidence
harness passed and after the stock-signal FK fix:

- 1600x1000 home: 50:50 product layout held; TOP100 상승/하락 was live; selected
  chart, agent panel, and bottom status bar were visible and aligned.
- 1440x900 home: layout density remained stable and usable.
- 900px home: no document scroll; old/internal copy scan found no visible hits
  for `KIS WS`, `WebSocket`, `등록됨`, `폴링`, or `내 목록`; TOP100 timestamp and
  values advanced during observation.
- 900px full chart: opened through the chart expand control without URL/page
  navigation; workspace stayed at viewport height with no document scroll;
  chart time and price advanced without refresh during observation.
- 900px Agent Detail: opened through workspace expansion; no document scroll;
  live execution lock and auto-trading not-ready state were visible; no
  English `Realtime momentum` lifecycle reason remained.
- Fresh browser response observation after rebuild/restart found no 5xx
  responses from the signal route.

Additional product-copy visual QA was performed on 2026-05-17 after the
settings cleanup:

- Settings connection tab at 1600x1000.
- Header realtime status popover at 1600x1000.
- Browser DOM scan found no visible hits for old/internal copy such as
  `KIS WS`, `WS rail`, `WebSocket`, `legacy REST`, `raw key`, `payload`,
  `dedupe`, `agent queue`, `first_seen`, `thin notification`, `SSE 시작`,
  `SSE 중지`, `read-only`, `freshness`, `profiles`, or `DevTools`.
- A later 1600x1000 browser DOM recheck also found no visible hits for
  `browser SSE`, `UI hard-limit`, `controlled live smoke`, `최근 tick`,
  `cap 선택`, `현재 cap`, or `이전 KIS 보조 경로`.
- After that wording pass, focused settings copy tests, full `npm test`
  (224 files / 1469 tests), `npm run typecheck`, `npm run build`, and
  `git diff --check` were re-run and passed.

Final visual sweep progress on 2026-05-17 22:00 KST:

- 1920x1080 dark home: no document scroll, bottom status bar aligned, no old
  internal copy hits.
- 1600x1000 dark home: 50:50 workspace preserved; left top/bottom and right
  chart/agent panels split evenly; no document scroll.
- 1440x900 dark home: 50:50 workspace preserved; no document scroll.
- 900x900 dark home: account rail defaults to collapsed icon rail; no document
  scroll; bottom bar stays dark and vertically centered.
- 900x900 account rail: collapsed label is `계좌 펼치기`; clicking opens the
  account rail to a 320px side panel; clicking again collapses it back to 48px
  with no page scroll.
- 900x900 full chart: expanded chart workspace fits without document scroll;
  no chart warning copy is visible.
- 900x900 Agent Detail: expanded agent workspace fits without document scroll;
  lifecycle reasons render in Korean (`모의 미리보기 생성 · 실거래 잠금`,
  `리스크 확인 완료 · 실거래 잠금`) instead of raw English internals.
- 900x900 settings connection tab: no old/internal copy hits for `KIS WS`,
  `WebSocket`, `legacy REST`, raw/payload/SSE/internal phrases, `폴링`,
  `등록됨`, or `내 목록`.
- 900x900 theme toggle: light mode bottom bar is white; dark mode bottom bar is
  `rgb(22, 27, 34)`, so the previous dark-mode white-bar regression is not
  present.
- Search overlay with `채비`: shows `Toss 전용` / `지원 대기`, with no raw
  `400 Bad Request`, `등록됨`, or old `전체 종목` copy.
- Temporary QA screenshot artifacts were removed from the worktree.

## Recent Completed Work

### Chart Session Window And Live Overlay

- Intraday `1d` chart windows now use the latest KST trading session instead of
  a blind rolling 24h window.
- Weekend / closed-market 24h gaps are no longer introduced by the server query
  window.
- Live quote overlay is guarded so a quote outside the stored candle's KST
  trading day does not create a fake candle.
- Current chart behavior remains based on real stored candles and real quote
  samples only.

### Toss Quote Lane Status Stability

- General Toss quote refresh and fast quote lane counters no longer reset to
  `0/0` mid-cycle.
- Bottom status bar distinguishes regular Toss quote refresh from fast quote
  candidates.

### Favorites And Surge UX

- Favorites header status was compressed into one combined sync/tracking pill
  to avoid the two-pill layout break.
- Watchlist-only rows with no displayable price now show an honest waiting
  state instead of a misleading `0` price.
- Recent surge empty/calm states now distinguish live monitoring from after-
  hours waiting.

### Agent Event And Order Intent Lifecycle

- Agent event types now include:
  - `risk_check_completed`
  - `preview_created`
- `OrderIntentService.createPreview` now enqueues safe lifecycle events for
  risk completion and preview creation.
- The app wires the shared agent event queue into the order-intent service.
- Agent event UI/toast/settings labels were updated for the new lifecycle
  event types.
- DB migration `020-agent-event-lifecycle-types.sql` expands the
  `agent_events` and `agent_event_alert_deliveries` type constraints so the new
  lifecycle events do not crash delayed alert delivery.

### Settings Copy Cleanup

- Settings copy no longer uses product-facing English/internal phrases for
  realtime tracking, account screens, or previous-compatibility chart paths.
- KIS-related settings now frame KIS as 선택 실시간 추적 or an explicitly enabled
  previous-compatibility path, not as the normal Toss-first product path.
- Focused settings copy tests pass after the wording update.

### Final Visual Sweep Fixes

- Narrow account rail state now matches the visual layout: at 900px the rail
  defaults to collapsed with `계좌 펼치기`, can open as a 320px side panel, and
  can collapse back without document scroll.
- Agent event lifecycle reasons are sanitized for product UI/toasts so
  English internals like `Local simulated order preview created; live execution
  remains locked.` are displayed as Korean safety copy.

### Toss Watchlist Live Smoke Fix

- A fresh user GO was provided for a bounded Toss watchlist add/remove smoke.
- The first live smoke proved add worked, but restore verification failed
  because the remove path targeted Toss `RECENT_WATCH` before the actual
  user-made watchlist group.
- The remove selector now skips recent-watch/history groups and targets the
  user-made watchlist group.
- A restore-only follow-up confirmed the temporary smoke item was removed.
- The final redacted live smoke passed: before count -> add count +1 -> remove
  count restored, with no raw product, group, session, or account values in
  stdout.

### Pre-Release Market Evidence Harness Guard

- The read-only market-hours harness now reports `sampleCadence` in addition to
  movement and endpoint latency.
- Completion evidence now blocks when TOP100/realtime ranking values move but
  sampling cadence is too slow to support the intended 300-500ms product
  behavior.
- Sample cadence is now checked with separate p95 and max-gap thresholds, so a
  loop with mostly slow 1-2s gaps cannot pass as healthy 500ms evidence.
- Completion evidence now includes `marketWindow`, and blocks off-hours runs
  with `Evidence window was outside Araon integrated Korean-market live hours.`
  even if samples happen to move. The completion window matches Araon's
  integrated Korean-market live window, 08:00-20:00 KST, not only the narrower
  09:00-15:30 regular session. This is a KST weekday/time heuristic and does
  not check an official holiday calendar.
- Completion evidence now also blocks when ranking values move but no
  TOP100/realtime rank-order reorder is observed, so value-only refreshes cannot
  satisfy the user's rank-reorder requirement.
- Criterion-level evidence for #12, #14, #16, #17, and #41 now also blocks
  outside Araon's integrated Korean-market live window. This keeps off-hours or
  cached movement from appearing as criterion-level `pass` or `supporting`
  evidence even when the top-level report is already `completionReady=false`.
- The harness now also samples `/runtime/data-health` and reports
  `fastQuoteLane`, so criterion #13/#14 evidence can distinguish a healthy
  bounded `toss-fast-quote` runtime lane from generic quote movement.
- Completion evidence now blocks when the bounded fast quote lane is not
  configured/running, does not report source `toss-fast-quote`, drifts outside
  the 250-750ms interval window, or exceeds the target/hard cap guard.
- The market evidence report now explicitly separates market-data readiness
  from final product-goal completion. `completionReady` remains a compatibility
  alias for read-only market evidence readiness, while
  `finalGoalCompletionReady=false` and `finalGoalRemainingNeed` make it clear
  that browser/Computer Use visual QA and the written completion audit are
  still required before the persistent goal can be completed.
- `--out` now creates the output directory before writing, so market-hours
  evidence can be saved directly under an archive/evidence path.
- A short closed-market smoke on 2026-05-18 00:58 KST after the
  rank-reorder and market-window guards
  produced `ok=true`, `completionReady=false`, `marketEvidenceReady=false`,
  `finalGoalCompletionReady=false`, `sampleCadence.ok=true`,
  `sampleGapP95Ms=650`, `integratedLiveWindowLikely=false`,
  `top100RankReorderObserved=false`, `realtimeRankReorderObserved=false`, and
  expected market-hours movement blockers only. Criterion-level statuses were
  `#12=blocked`, `#13=supporting`, `#14=blocked`, `#16=blocked`,
  `#17=blocked`, and `#41=blocked`.
- The market evidence summary helper is now split into a testable server module
  and a thin CLI wrapper. Focused tests cover JSON extraction from clean files
  and npm-script output, Markdown table escaping, final-goal blocker wording,
  and the required Browser/Computer Use visual QA checklist. A follow-up
  closed-market smoke at 2026-05-18 01:20 KST produced audit Markdown from
  `/tmp/araon-market-evidence-current.json`; it remained correctly blocked
  for live movement evidence while showing healthy read-only runtime latency
  and sample cadence.

### Realtime Surge And Alert Logic Guard

- Focused client tests prove that recent surge accepts realtime-like sources
  (`realtime-momentum`, `ws-integrated`, and `toss-fast-quote`) while excluding
  generic REST refreshes from the realtime surge lane.
- User threshold behavior is covered: a 3% threshold does not surface
  0.x/1.x/2.x movements in the live recent-surge view.
- Toast filtering is covered: raw KIS tick updates and TOP100 rotation events
  do not create user-facing market-movement toasts, while meaningful
  realtime-momentum threshold crossings do.
- This closes the non-live logic side of criterion #14. Final completion still
  needs market-hours UI evidence that the live feed behaves the same with real
  moving prices.

### Agent Event Public Contract Guard

- Server-side public payload tests now prove that agent-facing events preserve
  normalized product identity, source, `publishedAt`, `firstSeenAt`,
  `freshnessMs`, freshness bucket, relevance, confidence, and
  `rawPayloadRedacted=true`.
- The same tests prove provider dedupe keys and raw provider IDs stay internal
  and are not emitted in the public event payload.
- Freshness bucket boundaries are covered without inventing provider timing:
  unknown, near realtime, recent, and stale.

### Provider-Ranked Market Movement Signals

- Browser QA found that provider-ranked/TOP100 market movement signals could
  hit a 500 when the ticker was not already present in the local `stocks` table.
- Migration `021-stock-signal-events-detach-stock-fk.sql` detaches
  `stock_signal_events` from the local tracked-stock FK so Toss-ranked and
  Toss-only observation events can be recorded without pretending they are local
  tracked rows.
- Focused route coverage now posts a market movement signal for an untracked
  provider-ranked ticker, persists it, and enqueues `market_movement_detected`.
- Agent signal reason copy now renders Korean product labels such as
  `실시간 모멘텀 · 과열 · 30초`, avoiding old English lifecycle fragments.

## Criteria Evidence Matrix

Legend:

- `PASS`: current evidence is strong enough for this progress audit.
- `PARTIAL-PASS`: non-live/static evidence is strong, but a live-session
  requirement remains.
- `PARTIAL`: implementation exists, but live/current-state evidence is not yet
  strong enough for completion.
- `MARKET-HOURS REQUIRED`: can only be finally proven during live market hours.
- `USER-ACTION REQUIRED`: requires the user to log in or approve a live-safe
  boundary action.
- `PENDING`: not yet complete.

| # | Criterion | Current status | Evidence / remaining need |
|---:|---|---|---|
| 1 | Toss-first public market data works without credentials | PASS | no-live soak passed; public market screens have automated coverage |
| 2 | Toss QR login/session/account rail works when user logs in | PASS | fresh current-session authenticated read smoke passed with persistent session and sanitized count-only account/portfolio/order/transaction/watchlist evidence |
| 3 | Toss account screens are read-only and secret-safe | PASS | account rail/CLI/secret scan evidence; no mutation path authorized |
| 4 | Toss watchlist is the primary favorites model when available | PASS | normalized watchlist model exists; fresh-GO live add/remove smoke passed with restored redacted counts |
| 5 | Local favorites are fallback/cache only | PASS | UI copy and watchlist tests reflect Toss-primary behavior |
| 6 | Search/add/star handles KRX and Toss-only products without raw 400s | PASS | search/product identity paths and tests cover unsupported/Toss-only behavior |
| 7 | Product identity is preserved across search/watchlist/chart/KIS/agent flows | PASS | product identity tests and Toss-only/KIS eligibility guards cover this |
| 8 | KIS is optional `실시간 추적` only | PASS | UI copy and slot allocator paths keep KIS as optional realtime tracking |
| 9 | KIS receives only eligible six-digit KR tickers | PASS | KIS slot/candidate tests cover eligibility |
| 10 | KIS REST-heavy legacy paths are not normal product flow | PASS | `araon-kis-legacy-rest-containment-audit.md` confirms Toss-first normal flow; remaining KIS REST paths are manual, credential-gated, or explicit env opt-in |
| 11 | TOP100 rising/falling uses provider ranking, not local filler | PASS | provider ranking tests and no filler rule are covered |
| 12 | TOP100 updates/reorders at intended cadence without severe lag | PASS | 08:22 KST market-window evidence recorded `marketEvidenceReady=true`, `sampleGapP95Ms=570`, endpoint `p95DurationMs=109`, TOP100 value movement, and 9 distinct TOP100 rank orders; browser QA also observed TOP100 timestamp/value advancement without visible severe lag |
| 13 | Recent surge uses `toss-fast-quote` and `ws-integrated`, not generic REST | PASS | fast quote and surge tests cover source separation; market evidence harness now also records bounded `fastQuoteLane` runtime health from `/runtime/data-health` |
| 14 | Recent surge threshold/cooldown is correct | PASS | focused surge/alert tests prove threshold, cooldown, source filtering, and noisy-toast suppression; 08:22 KST evidence proved bounded fast-quote quote movement with 120 distinct value states; live browser QA showed no subthreshold/noisy market-movement toast regression during observation |
| 15 | Raw KIS/Toss update spam toasts are suppressed | PASS | toast filtering tests and UI behavior cover noise suppression |
| 16 | Mini chart updates current candle from real samples without refresh | PASS | 08:22 KST evidence recorded chart progression from real samples with newest bucket `2026-05-17T23:23:00.000Z` and latest sample count 76; home browser QA kept the selected chart visible without refresh |
| 17 | Full chart updates current candle from real samples without refresh | PASS | 08:22 KST evidence recorded chart progression from real samples; 900px full chart browser QA observed price/time advancement without refresh and no document scroll |
| 18 | Non-trading gaps are hidden without synthetic candles | PASS | KST trading-session server test and live overlay guard test cover this |
| 19 | Chart panels do not create unwanted scroll at target viewports | PASS | browser QA at 900px and 1600px verified full chart fit |
| 20 | Full chart expansion feels like expansion | PASS | browser QA verified expanded chart workspace rather than broken page flow |
| 21 | Account rail collapse/expand is visually clean | PASS | 900px browser QA verified collapsed icon rail, expanded 320px side panel, correct labels, and no document scroll |
| 22 | UI text sizes and row density are consistent | PASS | 1920/1600/1440/900 browser QA verified section proportions and no title stacking regression after latest copy fixes |
| 23 | Favorites sparkline/status layout is clean | PASS | favorites header/pill cleanup plus visual QA |
| 24 | Bottom status bar is aligned and dark-mode compatible | PASS | 900px browser QA verified light white bar and dark `rgb(22, 27, 34)` bar with vertical centering |
| 25 | News/disclosure/signal events are normalized enough for UI and agent input | PASS | agent event monitor supports news, disclosure, Toss signal normalized events; public payload tests preserve source/product/relevance/confidence while hiding provider dedupe keys |
| 26 | Provider freshness and first-seen timing are tracked or honestly absent | PASS | provider observations and first-seen/freshness fields exist in event flow; public payload tests cover unknown/near-realtime/recent/stale freshness buckets |
| 27 | Agent event queue is functional | PASS | agent queue and route tests pass |
| 28 | Agent Detail explains observation/candidate/reason/safety state | PASS | Agent detail visual QA and UI tests pass |
| 29 | Order-intent preview/risk/approval/audit lifecycle is functional | PASS | preview/risk lifecycle events, order-intent tests, and alert delivery migration pass |
| 30 | Live execution remains locked and obvious | PASS | safety UI and order-intent rail tests cover live lock |
| 31 | Missing auto-trading pieces are displayed as not-ready/locked | PASS | safety foundation exposes not-ready/live-lock state |
| 32 | Settings are understandable and not a legacy junk drawer | PASS | settings connection tab browser scan shows no old/internal copy hits after wording cleanup |
| 33 | CLI local commands still work | PASS | help/version/doctor no-live passed |
| 34 | No raw secret/account/session/order/watchlist identifiers are exposed | PASS | changed-diff sensitive scan review passed |
| 35 | No synthetic financial data is introduced | PASS | tests and implementation preserve real-sample-only candle/quote behavior |
| 36 | `npm test` passes | PASS | 226 files / 1476 tests |
| 37 | `npm run typecheck` passes | PASS | latest run passed |
| 38 | `npm run build` passes | PASS | latest run passed |
| 39 | `git diff --check` passes | PASS | latest run passed |
| 40 | no-live soak passes | PASS | latest no-live soak issueCount 0 |
| 41 | real browser visual QA passes | PASS | 1920/1600/1440/900 home, account rail, settings, search, light/dark bottom bar, full chart, and agent detail checked; 2026-05-18 live-window QA additionally verified TOP100 movement, no visible severe lag, no 5xx responses after signal fix, full-chart expansion without page navigation, and Agent Detail safety copy |
| 42 | completion audit is written | PASS | `docs/research/araon-pre-release-product-100-completion-audit.md` written on 2026-05-18 after criteria #1-#41 had current evidence |

## Remaining Blocker Before Completion Audit

The live market evidence and live-window browser QA have now been captured.
The only remaining audit blocker is criterion #42:

1. write `docs/research/araon-pre-release-product-100-completion-audit.md`.
2. update criterion #42 to `PASS`.
3. run the criteria-matrix guard.
4. re-run the required final verification commands.

Before marking the persistent goal complete, run:

```bash
npm run audit:pre-release-product -- \
  --audit-path=docs/research/araon-pre-release-product-100-progress-audit.md \
  --require-complete
```

The guard must exit `0` and report `goalComplete=true` before any goal
completion action is allowed.

Current market-window evidence:

- `docs/archive/pre-release-market-evidence-20260518-080025.json`
- `docs/archive/pre-release-market-evidence-20260518-080025.md`
- `docs/archive/pre-release-market-evidence-20260518-082240.json`
- `docs/archive/pre-release-market-evidence-20260518-082240.md`

The 08:22 KST run is the current strongest evidence: `marketEvidenceReady=true`,
healthy sample cadence, TOP100 rank-order movement, quote movement, chart
progression, and healthy bounded `toss-fast-quote` lane.

### Fresh User Action / Approval

Closed on 2026-05-17:

- Live Toss watchlist add/remove smoke had fresh user GO and passed after the
  `RECENT_WATCH` removal-target fix.
- Fresh Toss current-session authenticated read smoke passed with a persistent
  session and sanitized count-only evidence for account, portfolio, order,
  transaction, watchlist, and asset-news read surfaces.

### Final Visual Sweep

Latest sweep passed on 2026-05-17 22:00 KST for:

1. 1920x1080 home.
2. 1600x1000 home.
3. 1440x900 home.
4. 900px responsive.
5. account rail expanded/collapsed.
6. search open with Toss-only result.
7. full chart expanded.
8. agent detail expanded.
9. settings connection tab.
10. light/dark mode, especially the bottom status bar.

Re-run this only if later UI edits touch layout, settings copy, account rail,
chart, agent detail, search, or status bar.

### Final Code/Flow Review

Before completion:

1. grep/review remaining normal UI copy for old `KIS WS`, `폴링`, `등록됨`,
   `내 목록`, and fallback-centric language if later UI edits touch those
   areas again.
2. re-run all verification commands after the final visual/code pass.
3. write the final completion audit only when every row above is `PASS`.
