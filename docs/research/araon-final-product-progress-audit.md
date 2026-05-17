# Araon Final Product Progress Audit

Date: 2026-05-14

This is a progress audit for `araon-final-product-execution-goal.md`.
It is not a completion audit. The final goal must not be marked complete until
all 21 completion criteria pass, full verification passes, and live mutation
boundaries remain respected.

## Current Status

Overall state: `IN_PROGRESS`

Current lane focus:

- Toss-primary watchlist/favorites source model.
- Product-aware search/add behavior.
- User-facing copy cleanup away from old local/KIS mental model.
- Agent/order safety UI clarity.
- Browser visual QA against the running local app.

Safety boundaries remain active:

- No real order placement/cancel/amend.
- No account mutation.
- No live Toss watchlist add/remove smoke without fresh user GO.
- No raw Toss/KIS/session/account/order/watchlist values in docs, logs, UI, or
  verification summaries.
- No synthetic financial data.

## Verification Snapshot

Commands run in this slice:

- `npm test -- src/server/toss/__tests__/toss-watchlist-client.test.ts src/server/watchlist/__tests__/araon-watchlist-service.test.ts src/server/routes/__tests__/watchlist.test.ts`
  - Result: PASS, 3 files / 21 tests.
- `npm test -- src/client/components/__tests__/managed-operations-settings.test.ts src/client/components/__tests__/order-safety-modal.test.ts src/client/components/__tests__/order-intent-safety-rail.test.ts src/client/components/__tests__/agent-events-rail.test.ts src/client/components/__tests__/favorites-block.test.ts`
  - Result: PASS, 5 files / 28 tests.
- `npm test -- src/client/components/__tests__/status-bar.test.ts src/client/components/__tests__/favorites-block.test.ts src/client/components/__tests__/order-intent-safety-rail.test.ts src/client/components/__tests__/agent-events-rail.test.ts src/client/components/__tests__/managed-operations-settings.test.ts`
  - Result: PASS, 5 files / 34 tests.
- `npm run typecheck`
  - Result: PASS.
- `git diff --check`
  - Result: PASS.
- Full `npm test`
  - Result: PASS, 214 files / 1403 tests.
- `npm run build`
  - Result: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`
  - Result: PASS, no unexpected external-call issue reported.
- Raw-value secret grep
  - Result: REVIEW-PASS.
  - Broad field-name grep still finds expected code paths that construct Toss
    `Cookie` headers from in-memory session objects. No raw Toss/KIS/session/
    account/order/watchlist value was printed into this audit.
- User-facing legacy-copy grep
  - Result: REVIEW-PASS for normal client UI.
  - Normal client UI no longer exposes `일반 갱신`, `폴링40`, `등록됨`,
    `내 목록`, `KIS 실시간`, `KIS WS`, or `KIS 보조`.
  - Internal server/tests/docs still mention KIS WS where the implementation
    name is accurate.

Latest recheck after the final copy cleanup:

- Focused client tests: PASS, 5 files / 34 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS,
  `issueCount=0`.
- Changed-diff sensitive-token grep: REVIEW-PASS. It found only non-secret
  constant/key names in changed code paths, not raw values.

Latest recheck after watchlist tracking/search identity cleanup:

- Focused client tests:
  - `src/client/lib/__tests__/stock-search.test.ts`
  - `src/client/components/__tests__/favorites-block.test.ts`
  - Result: PASS, 2 files / 22 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS,
  `issueCount=0`.
- Changed-diff sensitive-token grep: REVIEW-PASS. It found user-facing field
  names and safe watchlist labels only, not raw Toss/KIS/session/account/order
  values.
- The bottom/status realtime count now follows actual KIS slot runtime state
  when the optional 실시간 추적 rail is enabled, instead of using favorite count
  as a proxy.
- The Favorites header now reports watchlist-specific eligible/subscribed
  실시간 추적 coverage. It no longer presents a global slot count as if every
  favorite were subscribed.
- Toss search result display now prefers the visible exchange ticker when
  available while preserving Toss `productCode` separately. This keeps Toss-only
  product identity from being accidentally treated as a six-digit KRX ticker.
- Safari Computer Use recheck:
  - Home still renders TOP100, watchlist, recent surge, selected chart, agent
    panel, Toss account rail, icon rail, and bottom status bar.
  - Search for a Toss-only product showed `Toss 전용` / `지원 대기` instead of
    exposing a raw `400 Bad Request`.
  - The search check was observational only and did not perform a live Toss
    watchlist mutation.

Latest recheck after Toss-only mocked mutation support:

- Focused server tests:
  - `src/server/watchlist/__tests__/araon-watchlist-service.test.ts`
  - `src/server/routes/__tests__/watchlist.test.ts`
  - `src/server/toss/__tests__/toss-watchlist-client.test.ts`
  - Result: PASS, 3 files / 23 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS,
  `issueCount=0`.
- Changed-diff sensitive-token grep: REVIEW-PASS. The latest server diff did
  not contain raw Toss/KIS/session/account/order values.
- Toss-only products can now pass through the mocked/disabled-by-default Toss
  watchlist mutation path without being written to local favorites or sent to
  KIS. Live Toss watchlist add/remove remains blocked until fresh user GO.

Latest recheck after agent safety flow clarity pass:

- TDD guard:
  - Added a failing test that required the home safety rail to show a
    user-facing locked decision pipeline.
  - The test failed before implementation because `판단 흐름` was not rendered.
- Focused client test:
  - `src/client/components/__tests__/order-intent-safety-rail.test.ts`
  - Result: PASS, 1 file / 3 tests.
- Full `npm test`: PASS, 214 files / 1409 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS,
  `issueCount=0`.
- Safari Computer Use recheck:
  - The home agent/safety panel now shows the compact flow
    `판단 흐름: 감지 > 후보 > 승인 > 실행 잠금`.
  - The panel still says actual execution is locked and still does not imply
    live auto-trading readiness.
  - No live Toss watchlist mutation or live order action was performed.

Latest recheck after product-aware star/unstar UI payload pass:

- TDD guard:
  - Added a failing helper test before implementation. It failed because the
    product-aware watchlist UI helper did not exist yet.
- Focused client tests:
  - `src/client/lib/__tests__/watchlist-ui.test.ts`
  - `src/client/lib/__tests__/stock-search.test.ts`
  - `src/client/stores/__tests__/watchlist-store.test.ts`
  - Result: PASS, 3 files / 27 tests.
- `npm run typecheck`: PASS.
- `git diff --check`: PASS.
- Home star/unstar now builds `/watchlist/items` payloads through a shared
  product identity helper instead of hardcoding `A${ticker}` and
  `krTicker=ticker`.
- Existing normalized `/watchlist` item metadata is preferred for remove and
  add actions. This preserves Toss-only productCode values and keeps
  `krTicker=null` for products that are not KIS eligible.
- No live Toss watchlist mutation or live order action was performed.

Latest recheck after agent event contract expansion:

- TDD guard:
  - Added a failing test for `watchlist_changed` with product identity,
    related ids, raw-payload redaction marker, and skip reason.
  - Added route expectation that public agent events include the expanded safe
    contract shape.
- Focused agent tests:
  - `src/server/agent/__tests__/agent-event-queue.test.ts`
  - `src/server/routes/__tests__/agent-events.test.ts`
  - `src/client/lib/__tests__/agent-event-toast.test.ts`
  - `src/client/lib/__tests__/agent-event-browser-event.test.ts`
  - `src/client/lib/__tests__/agent-event-order-intent.test.ts`
  - `src/client/components/__tests__/agent-events-rail.test.ts`
  - `src/client/components/__tests__/order-intent-safety-rail.test.ts`
  - Result: PASS, 7 files / 26 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- Changed-file sensitive-token grep: REVIEW-PASS. Matches were expected
  redaction-test strings and field names, not raw values.
- Agent event contract now includes the additional future-facing families:
  `watchlist_changed`, `position_changed`, `order_intent_created`,
  `order_intent_skipped`, `approval_requested`, `approval_granted`,
  `approval_denied`, and `execution_locked`.
- Public agent event payloads now include product identity, redaction status,
  related ids, and skip reason without exposing provider dedupe keys or raw
  payloads.
- No live Toss watchlist mutation or live order action was performed.

Latest recheck after settings watchlist hydration cleanup and full verification:

- Settings catalog reload now hydrates the normalized Araon `/watchlist` model
  instead of reading the old local `/favorites` list as the primary UI source.
- Normal client UI grep:
  - `getFavorites`, `addFavorite`, `removeFavorite`, `/favorites`, and
    `setFavorites` remain only in the dev market simulator and watchlist-store
    tests outside `api-client.ts`.
  - No normal dashboard/settings UI path still treats the local tracked list as
    the primary watchlist surface.
- Full `npm test`: PASS, 215 files / 1413 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS,
  `issueCount=0`.
- Changed/new-file sensitive-token grep: REVIEW-PASS. Matches are expected
  redaction tests, placeholder fixtures, safe field names, and code paths that
  construct in-memory credential/session headers. No real raw Toss/KIS/session/
  account/order/watchlist value was identified in this audit.
- No live Toss watchlist mutation or live order action was performed.

Latest recheck after order-intent lifecycle foundation pass:

- TDD guard:
  - Added failing tests requiring order-intent previews to expose the safe
    lifecycle steps from candidate observation through execution lock.
  - Tests failed before implementation because preview payloads did not include
    `lifecycle`.
- Implemented order-intent lifecycle payload:
  - `candidate_observed`
  - `evidence_collected`
  - `strategy_evaluated`
  - `risk_checked`
  - `preview_created`
  - `approval_required`
  - `execution_locked`
- Lifecycle status is honest:
  - strategy evaluation is `not_ready`.
  - live risk check and execution are `blocked`.
  - approval remains `pending`.
- Order Safety modal and the Settings managed-operations approval control now
  show user-facing `판단 단계` context so the agent safety path is visible
  without implying live autonomous execution readiness.
- Focused tests:
  - `src/server/agent/__tests__/order-intent-service.test.ts`
  - `src/server/routes/__tests__/agent-order-intents.test.ts`
  - `src/client/components/__tests__/order-safety-modal.test.ts`
  - `src/client/components/__tests__/order-intent-safety-rail.test.ts`
  - `src/client/lib/__tests__/api-client-order-intents.test.ts`
  - `src/server/realtime/__tests__/kis-ws-slot-candidates.test.ts`
  - `src/client/components/__tests__/managed-operations-settings.test.ts`
  - Result: PASS, 7 files / 42 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS,
  `issueCount=0`.
- Changed/new-file sensitive-token grep: REVIEW-PASS. Matches are expected
  redaction tests, placeholder fixtures, safe field names, and code paths that
  construct in-memory credential/session headers. No real raw Toss/KIS/session/
  account/order/watchlist value was identified in this audit.
- No live Toss watchlist mutation or live order action was performed.

Latest recheck after automation-readiness gap contract pass:

- TDD guard:
  - Added failing tests requiring the order-intent live policy API, client API
    type fixture, home safety rail, Settings approval control, and Order Safety
    modal to expose missing auto-trading readiness pieces as structured
    `automationReadinessGaps`.
  - Tests failed before implementation because the policy payload did not carry
    those readiness gaps and the UI still used a hardcoded summary.
- Implemented structured not-ready/locked readiness contract:
  - `decision_engine`
  - `strategy_policy`
  - `risk_policy`
  - `paper_trading_ledger`
  - `simulation_result_view`
  - `toss_order_execution`
  - `live_approval_executor`
  - `execution_reconciliation`
  - `agent_performance_audit`
  - `intent_explanation`
  - `provider_freshness`
  - `event_dedupe`
- The live policy now marks those gaps as `not_ready`, `locked`, or `partial`
  instead of implying autonomous execution readiness.
- Home safety rail, Settings managed-operations approval control, and Order
  Safety modal now render the structured readiness labels from the live policy.
- Focused tests:
  - `src/server/agent/__tests__/order-intent-service.test.ts`
  - `src/server/routes/__tests__/agent-order-intents.test.ts`
  - `src/client/lib/__tests__/api-client-order-intents.test.ts`
  - `src/client/components/__tests__/order-intent-safety-rail.test.ts`
  - `src/client/components/__tests__/order-safety-modal.test.ts`
  - `src/client/components/__tests__/managed-operations-settings.test.ts`
  - Result: PASS, 6 files / 38 tests.
- Full `npm test`: PASS, 215 files / 1413 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS,
  `issueCount=0`.
- Changed/new-file sensitive-token grep: REVIEW-PASS. A broad path-only scan
  found expected security-sensitive code/test paths, and a stricter
  secret-shaped literal scan returned `SUSPECT_COUNT=0`.
- No live Toss watchlist mutation or live order action was performed.

Latest recheck after TOP100 polling cancellation guard pass:

- TDD guard:
  - Added a failing client test requiring TOP100 polling to keep sub-second
    refresh cadence while refusing to schedule a next poll after cancellation.
  - The test failed before implementation because the polling guard helpers did
    not exist.
- Implemented TOP100 client polling guard:
  - Server-provided `refreshIntervalMs=500` stays at `0.5초` cadence.
  - Invalid or too-small intervals clamp to a 300ms floor to avoid accidental
    zero-delay loops.
  - If the TOP100 component unmounts while a request is in flight, the response
    no longer schedules a new timer.
  - Hidden-tab and failed-request timers also respect cancellation.
- Focused tests:
  - `src/client/components/__tests__/top100-view.test.ts`
  - `src/server/market/__tests__/market-top-movers-service.test.ts`
  - Result: PASS, 2 files / 30 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- Focused sensitive-token grep over the latest touched TOP100/audit files:
  REVIEW-PASS, no matches.
- No live Toss watchlist mutation or live order action was performed.

Runtime/API spot checks:

- Dev server listening on `127.0.0.1:3000`.
- Vite client listening on `127.0.0.1:5173`.
- `GET /watchlist`
  - Result: `success=true`.
  - Normalized data envelope present.
  - Source observed as Toss-backed.
  - Items present.
- `GET /market/top-movers?limit=5`
  - Result: `success=true`.
  - Source observed as Toss overview ranking.
  - Refresh interval observed at 500ms.
  - Provider coverage showed no local fallback filler.
- `GET /runtime/data-health`
  - Result: `success=true`.
  - Toss quote polling was enabled.
  - Tracking and favorite counts were exposed through sanitized aggregate
    counters only.
- `GET /market/toss/search?q=채비&limit=5`
  - Result: `success=true`.
  - The first result was identified as Toss-only and not KIS eligible.
- `GET /runtime/realtime/kis-ws-slots`
  - Result: `success=true`.
  - Optional realtime tracking was enabled with active slots.
- `GET /agent/order-intents/live-policy`
  - Result: `success=true`.
  - Live execution remained disabled.
  - Policy approval remained false.
  - Kill switch remained engaged.
  - The live policy exposed 12 automation readiness gaps.

Toss watchlist mutation research:

- `tossinvest-cli` confirms read-only watchlist support through `watchlist list`.
- Its reverse-engineering notes still do not provide supported add/remove
  mutation methods.
- A public Toss web bundle static inspection found watchlist mutation candidate
  calls:
  - add: `POST /api/v1/new-watchlists/items`
  - remove: `POST /api/v1/new-watchlists/items/remove`
  - groups: `GET /api/v1/new-watchlists/groups/simple`
  - item body shape: `items: [{ code, itemType: 'STOCK' }]`
- Araon now has a mocked/locked client implementation for those candidate
  request shapes. The normal app wiring still does not enable live Toss
  watchlist mutation.
- Live add/remove smoke remains blocked until fresh user GO and a mutation-only
  acceptance pass that redacts raw session/account/watchlist identifiers.

Browser visual QA:

- Safari on `http://127.0.0.1:5173/` checked with Computer Use.
- Home layout rendered:
  - TOP100 상승/하락.
  - 즐겨찾기.
  - 최근 급상승.
  - selected ticker chart.
  - agent panel.
  - Toss account rail.
  - bottom status bar.
- Search dropdown showed Toss-only unsupported product as `Toss 전용` /
  `지원 대기`.
- Clicking the unsupported search row did not show a raw `400 Bad Request`.
- Settings modal opened and closed normally.
- Chart expand button opened an in-workspace expanded chart view and `작게 보기`
  returned to Home without changing the URL.
- Agent expand button opened an in-workspace expanded agent/safety view and
  `작게 보기` returned to Home without changing the URL.
- Header data-source panel was rechecked in Safari after clearing a stale Vite
  transform cache. The panel now shows `비실시간` and `Toss 가격`, not the old
  `일반 갱신 후보` / `Toss refresh` copy.
- Home agent safety rail now explicitly shows `자동거래 준비 안됨` with
  `전략·리스크·Toss 주문·정산 잠금`, so future autonomous trading pieces are
  visible as locked/not-ready instead of implied-ready.
- Safari Computer Use recheck after the TOP100 polling guard pass:
  - Settings modal was closed and Home was re-opened.
  - TOP100 initially showed a loading state, then rendered 상승 TOP100 and
    하락 TOP100 side by side.
  - TOP100 row copy showed Toss/provider ranking cadence and no local fallback
    filler wording.
  - Mini chart, agent panel, Toss account rail, icon rail, and bottom status bar
    were visible.
  - The account rail showed authenticated read data, but no account raw values
    are copied into this audit.
- Settings managed-operations approval control was rechecked in Safari after
  creating a local simulated preview. It showed `판단 단계` with candidate,
  evidence, strategy-not-ready, risk-blocked, preview-created, approval-pending,
  and execution-locked states. This was a local simulated preview only; no live
  order or Toss watchlist mutation was performed.
- Settings managed-operations approval control was rechecked again after the
  automation-readiness contract pass. It showed `자동거래 준비 12개 필요` and
  surfaced readiness gaps such as decision engine, strategy policy, risk policy,
  and paper-trading ledger from the live policy payload.
- Additional viewport screenshots were captured at `1600x1000`, `1440x900`,
  and `900x900` using a browser viewport. The isolated browser context did not
  reuse the logged-in Toss session, so account-data correctness was checked in
  Safari while viewport layout was checked from the screenshots.
- The `1600x1000` and `1440x900` screenshots showed the 50:50 home layout,
  account rail, icon rail, and bottom status bar without major overlap.
- The `900x900` screenshot showed the account rail collapsed and the main
  workspace filling the available width. The bottom ticker is animated, so a
  moving frame can show clipped text mid-marquee, but the bar itself remains
  present and fixed.

Latest verification after TOP100 polling cancellation guard:

- Focused TOP100 tests passed after adding the cancelled-poll guard and
  sub-second refresh clamp.
- Full `npm test` passed: 215 files / 1414 tests.
- `npm run typecheck` passed.
- `npm run build` passed. Vite still reports only the existing chunk-size
  warning.
- `git diff --check` passed before this audit update.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500` passed with
  18 no-credentials samples and zero issues.
- The live Home API snapshot still showed Toss overview ranking as the TOP100
  source and `refreshIntervalMs=500`; Safari visual QA showed TOP100 loading
  into 상승/하락 columns.

Final completion audit:

- Written at `docs/research/araon-final-product-completion-audit.md`.
- Verdict is `PASS_WITH_AUTHORIZATION_BOUNDARY`: this closes the authorized
  product lane while keeping live Toss watchlist mutation and live trading
  blocked until separate fresh user approval.

## Completion Criteria Status

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | Toss login/session is primary account-aware connection | PASS-PARTIAL | Running UI and API show Toss session/account surfaces. Needs final full QA. |
| 2 | Toss watchlist and Araon 즐겨찾기 unified product model | PASS-PARTIAL | `/watchlist` normalized route exists and UI consumes normalized state. Favorites now show watchlist-specific 실시간 추적 coverage instead of global KIS slot counts. Toss mutation candidate endpoints are implemented only behind an explicit disabled-by-default gate. |
| 3 | Araon star/unstar product-aware and sync-safe | PASS-PARTIAL | Safe local-only, sync-pending, unsupported, KRX mocked Toss mutation success, Toss-only mocked Toss mutation success, and product-aware UI add/remove payloads exist. Real Toss add/remove still needs fresh GO. |
| 4 | Local favorites fallback/cache only | PASS-PARTIAL | Normalized model demotes local rows, normal dashboard/settings UI no longer hydrates local `/favorites` as the primary source, and remaining client uses are dev-simulator/tests. Legacy `/favorites` still exists for fallback/migration. |
| 5 | Search handles KRX and Toss-only without confusing 400 | PASS-PARTIAL | Safari checked Toss-only row without visible 400. Focused tests now cover visible ticker vs Toss productCode separation and UI watchlist payload identity. Needs more product examples in final audit. |
| 6 | Unsupported Toss-only products show Toss 전용 / 지원 대기 | PASS | Confirmed in UI for a Toss-only search result. |
| 7 | KIS visible only as optional 실시간 추적 | PASS | Normal home/data-source/status copy uses `실시간 추적`, `비실시간`, and `Toss 가격`; settings diagnostics can still mention KIS accurately. |
| 8 | KIS never receives non-eligible product codes | PASS-PARTIAL | Product identity tests, UI path guard, and watchlist add/remove payload helper exist; final audit still needed. |
| 9 | KIS REST polling/chart/ranking/master/import not default product path | PASS-PARTIAL | Toss-primary path visible; KIS legacy surfaces remain diagnostics/manual/legacy-gated. |
| 10 | TOP100 provider ranking, not local filler | PASS | API spot check shows Toss overview ranking and no local fallback filler. |
| 11 | Mini/full chart update without manual refresh | PASS-PARTIAL | Current quote/candle overlay code exists; needs longer live visual observation. |
| 12 | Non-trading chart gaps hidden without synthetic data | PASS-PARTIAL | Code/tests cover compacting non-trading gaps; needs final visual QA. |
| 13 | Agent panel shows observation/candidate/preview/locked | PASS-PARTIAL | Home panel shows observation, preview action, safety lock, and the compact `판단 흐름: 감지 > 후보 > 승인 > 실행 잠금` strip. Agent contract expansion is now test-covered; final browser audit still needed. |
| 14 | Agent event contract exists | PASS-PARTIAL | Shared types, queue, route payload, and focused tests now cover news/disclosure/Toss signal/market movement plus watchlist/position/order-intent/approval/execution-locked families. Final completion audit still needed. |
| 15 | Order-intent lifecycle supports preview/risk/approval/audit without live execution | PASS-PARTIAL | UI/tests cover preview, challenge, audit, live lock, explicit lifecycle steps through `execution_locked`, and the visible Settings approval-control summary. The live policy now also exposes structured readiness gaps without enabling execution. |
| 16 | Missing auto-trading pieces documented/locked/not-ready | PASS-PARTIAL | Goal doc documents missing pieces. Server live policy now exposes structured `automationReadinessGaps`, and home safety rail, Settings, and Order Safety modal show those gaps as locked/not-ready/partial. Decision engine, strategy policy, risk policy, paper trading, Toss order execution, reconciliation, and performance audit remain explicitly not complete. |
| 17 | Live trading remains locked | PASS | Live policy API and UI show locked/kill-switch state. No live execution performed. |
| 18 | No raw sensitive values in UI/log/docs/stdout/git diff | PASS-PARTIAL | Raw-value grep found no exposed values. Expected code paths that construct Toss Cookie headers remain. |
| 19 | Full tests/typecheck/build/diff/no-live soak pass | PASS | Latest focused watchlist/agent/TOP100 tests, full test suite (215 files / 1414 tests), typecheck, build, diff-check, no-live soak, and changed/new-file secret grep passed in this slice. |
| 20 | Real browser visual QA passes | PASS | Safari Computer Use QA plus 1600x1000, 1440x900, and 900x900 viewport screenshots passed for major layout/overflow issues. |
| 21 | Completion audit is written | PASS | `docs/research/araon-final-product-completion-audit.md` was written after full verification and real-browser QA. |

## Current Blockers / Gates

1. Live Toss watchlist add/remove smoke is intentionally blocked until fresh user
   GO.
2. Toss watchlist add/remove candidate endpoint shape is present in the public
   web bundle and mocked in Araon, but has not been live-smoked against the
   user's real Toss account.
3. Remaining settings/diagnostic KIS labels must stay accurate but should not
   leak into normal user mental model.
4. Advanced auto-trading pieces remain explicitly not-ready or locked through
   the live policy readiness-gap contract: decision engine, strategy policy,
   risk policy, paper trading, Toss order execution, reconciliation, and
   performance audit are not complete.

## Next Milestones

1. Keep live Toss watchlist mutation disabled by default.
2. When the user gives fresh GO, run a narrow mutation-only live smoke with
   redacted evidence, then decide whether to enable a user-controlled sync gate.
3. Continue agent productization beyond the visible not-ready rail: strategy
   policy, risk policy, paper trading, order execution gate, and reconciliation
   need design/implementation before live automation can be considered.
4. Write final completion audit only after all criteria are green or explicitly
   blocked by a user-controlled live-mutation gate.
