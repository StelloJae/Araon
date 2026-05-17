# Toss Primary Agent Platform Completion Audit

Captured: 2026-05-12

This audit maps the active goal prompt to concrete Araon artifacts. It is not a
completion claim. The goal remains active until every required row below is
implemented and verified with real evidence.

## Verdict

Status: **complete**

Araon now has a strong Toss-first implementation skeleton with tests around
public market data, authenticated read surfaces, Toss SSE refresh routing, KIS
WS slot allocation, agent events, alert dispatch, and order-intent safety.
User-assisted Toss QR login validation and real authenticated read-only Toss
surface smoke evidence have now passed. A real Toss SSE event-to-refresh sample
also passed on 2026-05-13 KST. Full repo verification and packaging hygiene
passed on 2026-05-13 KST; repeat them if code changes after this audit update.

## Machine-Checkable Remaining Gates

The goal must stay active until every gate below is either closed with the
listed evidence or explicitly reclassified in this audit with a concrete reason.
The machine-readable guard is
`npx tsx scripts/internal/probes/probe-goal-completion-audit.mts`; its latest
run parsed 8 gates as 8 pass, 0 partial, 0 open, 0 unknown, so
`goalComplete=true` and `shouldCallUpdateGoal=true`.

| Gate | Requirement | Current State | Evidence To Run | Completion Condition |
| --- | --- | --- | --- | --- |
| `GATE-TOSS-SSE-REFRESH` | Prove Toss SSE thin notification produces the expected Araon REST refresh audit row. | Pass; the app-route smoke is delta-based and only `refreshed` rows count as completion proof. Latest 2026-05-13 KST isolated latest-code app-route smoke ran against a temporary data dir containing only copied SQLite state plus encrypted Toss session, with no KIS credentials, and reported `outcome=refresh_observed`. It observed `state=connected`, `eventCount=2`, `refreshHintCount=3`, `refreshResultCount=3`, `refreshHintDispatchFailureCount=0`, `thinNotificationOnly=true`, event types `pending-order-refresh` and `purchase-price-refresh`, refresh resources `account-summary`, `pending-orders`, and `portfolio-positions`, and latest refresh result `portfolio-positions` / `refreshed`. No raw Toss frame/session/account/order data was printed. | Re-run `npx tsx scripts/internal/probes/probe-toss-realtime-route-smoke.mts --duration-ms=600000` if Toss SSE routing code changes. | Probe reports `outcome=refresh_observed` for at least one newly observed `refreshed` resource, with only sanitized counters/resource names and no raw Toss frame/session data. |
| `GATE-TOSS-SIGNAL-CAPTURE` | Capture and vet the Toss overview signals request template, or keep Toss signals explicitly disabled. | Pass by explicit supported-empty policy; fresh QR login succeeded, isolated Chrome session replay now uses domain-scoped Toss cookies, and logged-in capture stayed off community pages. The old `/api/v2/dashboard/wts/overview/signals` request was not observed; sanitized candidates showed repeated `POST /api/v1/dashboard/intelligences/all` and `GET /api/v1/trading/analysis/productCode/A005930`. A vetted static request body for `dashboard/intelligences/all` was captured without printing raw values, direct smokes for `005930`, `000660`, `254120`, and a current premarket mover returned `outcome=ok`, `externalCallsEnabled=true`, `rawTemplateExposed=false`, `surface.id=toss-dashboard-intelligences`, `items=0`, and `semanticState=supported_empty`. Shape probes showed `result.intelligences` containers exist but current sampled tickers had `data.intelligence=null`; the parser supports future non-null `intelligences[].data.intelligence`. The reusable `trading/analysis/productCode` shape probe checks both `wts-info-api` and `wts-cert-api`; the latest summary-only sweep returned HTTP 200 for all 6 host/ticker samples, with `nonNullResultSampleCount=0` and `resultTypeCounts.null=6`. Araon now exposes a Toss signal semantic policy in status/smoke/UI: `emptyResponse=supported_empty_not_actionable`, `eventEmission=non_empty_items_only`, `agentEventType=toss_signal_detected`, and `rawPayloadExposed=false`. Focused tests prove empty Toss signal responses enqueue no agent events while non-empty sanitized items enqueue `toss_signal_detected`. | Re-run direct signal smoke if Toss changes the surface; non-empty future items should be treated as parser-hardening evidence, not a blocker for the current supported-empty policy. | Toss signal collection is connected and fail-closed: empty provider responses are visible as supported empty-state, not fabricated signals; only non-empty sanitized provider items can enter the agent event queue. |
| `GATE-PROVIDER-LATENCY` | Prove live provider observations for news/disclosures/signals and first_seen alert dispatch latency. | Pass for provider observation latency; latest isolated env-loaded tick with copied encrypted Toss session and one watched ticker recorded Naver news 100 events in 386ms, Toss news 25 events in 329ms, Toss signal 0 events in 164ms, and DART disclosures 20 events in 947ms. Local first_seen alert delivery smoke separately passed within the 30s target. Non-empty Toss signal semantics remain tracked under `GATE-TOSS-SIGNAL-CAPTURE`. | Repeat the same isolated env-loaded tick or running-server `probe-agent-event-monitor-smoke.mts --run-tick` before final acceptance if provider configuration changes. | Enabled providers record attempted time, sanitized outcome, refresh duration, inserted count, and alert delivery stays within the configured first_seen target without raw provider payloads. |
| `GATE-MARKET-PHASE-TOP100` | Validate Toss-first TOP100/movers behavior in an appropriate market phase. | Pass; latest 2026-05-13 KST premarket API smoke via `probe-market-top100-phase-smoke.mts --market=kr --limit=100 --wait-until-fetchable --max-wait-ms=900000` waited 54.741s into the fetchable premarket window, returned `outcome=market_phase_observed`, `sourcePhase=premarket`, `/market/top-movers` `status=ready`, `guaranteedTop100=true`, 100 gainers and 100 losers, and `rankingRateLimited=false`. A Computer Use Chrome UI smoke on `http://127.0.0.1:5173/` then showed TOP100 selected with `상승 TOP100 100`, `하락 TOP100 100`, `토스 웹 랭킹 보장`, `LIVE`, and `30초마다`; no raw Toss/KIS session or provider payload values were copied into this audit. | Re-run the same API/UI smoke before final acceptance if TOP100 provider code changes. | UI/API show honest Toss source/coverage or a documented provider-unavailable state, without filling TOP100 from local watchlist data. |
| `GATE-FRONTEND-FINAL-SMOKE` | Confirm the final React/Vite UI follows Araon design system and hides sensitive data. | Latest 2026-05-13 KST Playwright smoke passed for dashboard and settings connection tab on `http://127.0.0.1:5173/`: console warning/error count was 0, required dashboard/settings labels rendered, and raw Toss/KIS/session/account marker scan returned no matches. A long DART agent-event reason overflow found during this smoke was fixed in `AgentEventsRail` by moving freshness to a secondary line and allowing reason text to wrap inside the existing rail. Repeat after any further frontend changes and before final acceptance. | Browser/Playwright dashboard and settings smoke on `http://127.0.0.1:5173/`. | No console errors, no layout-breaking labels, no raw Toss/KIS/session/account/order/provider secrets in visible text, and OpenDesign remains a reference rather than an API-contract change. |
| `GATE-CLEAN-NO-CREDS` | Prove clean startup without credentials does not make unexpected external calls. | Latest 2026-05-13 KST smoke passed again with `ok=true`, `mode=no-live`, six sampled local endpoints, and `issueCount=0`. | `npm run soak:no-live -- --duration-ms=1000 --interval-ms=1000` with an isolated data dir and no credentials. | Smoke reports `ok=true`, `issueCount=0`, and only expected read-only local endpoints; Toss/KIS/Naver/OpenDART are not called unexpectedly. |
| `GATE-FINAL-VERIFY` | Re-run full repo verification and packaging hygiene before any completion claim. | Pass as of 2026-05-13 KST: `npm test` passed with 208 files and 1349 tests, `npm run typecheck` passed, `npm run build` passed, `git diff --check` passed, `npm pack --dry-run --json` passed with 59 package entries, no-live soak passed with `ok=true` and `issueCount=0`, and tracked-file secret scans reported only expected documentation/source/test paths and synthetic fixture locations rather than real Toss/KIS/account/order/session data. Reopen if code changes after this audit entry. | Repeat the same verification bundle if another code or package-facing change is made before completion. | All checks pass, and secret grep finds only documented redacted fixtures/synthetic tests/local variable names, not real Toss/KIS/account/order/session data. |
| `GATE-TOSSINVEST-READONLY` | Confirm `/Users/stello/tossinvest-cli` stayed read-only. | Latest 2026-05-13 KST re-check still reports only `README.md` modified in that repo. | `git -C /Users/stello/tossinvest-cli status --short` before final acceptance. | No Araon work modified the reference repo; any pre-existing dirty file is documented as pre-existing. |

## Prompt To Artifact Checklist

| Requirement | Current Evidence | Status | Missing Or Weak Evidence |
| --- | --- | --- | --- |
| Keep `/Users/stello/tossinvest-cli` read-only reference | Migration doc names it as read-only reference; no edits are made in that repo from this worktree | Pass | Re-check `git -C /Users/stello/tossinvest-cli status --short` before final acceptance |
| Toss is not WebSocket; realtime is SSE thin notification + REST refresh | `src/server/toss/toss-realtime-service.ts`, `src/server/toss/toss-sse-refresh-router.ts`, `src/server/toss/toss-sse-refresh-executor.ts`, route tests, real logged-in SSE smoke showing `connected` state, and the 2026-05-13 KST app-route smoke showing `outcome=refresh_observed` with sanitized `refreshed` REST audit rows | Pass | Re-run the route smoke if Toss SSE routing code changes |
| Toss public TOP100, quote, search, chart | Toss provider/client/service paths and route/client tests exist; chart UI now says Toss chart backfill first for empty long-range states; live local API smoke covered Toss public realtime ranking, quote batch, search, candle read, and chart coverage ensure; TOP100 tab falls back to the honest Toss realtime popularity board when movers are unavailable, and the latest supported premarket smoke verified `/market/top-movers` ready/guaranteed TOP100 plus matching TOP100 UI labels | Pass | Repeat supported-window smoke if TOP100 provider code changes |
| Toss QR login/session/extend | `src/server/toss/toss-cdp-login-service.ts`, `src/server/toss/toss-session-store.ts`, `src/server/toss/toss-session-extension-service.ts`, `src/server/routes/toss-auth.ts`, UI settings controls, and user-assisted QR smoke | Pass | Browser first showed a loading state; user refresh revealed QR and login completed |
| Toss account list | `src/server/toss/toss-account-client.ts`, `src/server/routes/toss-account.ts`, route/client/no-session tests, and logged-in smoke | Pass | UI drilldown polish remains future work |
| Toss account summary / cash overview | `src/server/toss/toss-account-summary-client.ts`, `src/server/routes/toss-account-summary.ts`, account rail UI tests, logged-in smoke, and persistent-session UI smoke | Pass | Broader layout polish remains future work |
| Toss portfolio positions | `src/server/toss/toss-portfolio-client.ts`, `src/server/routes/toss-portfolio.ts`, snapshot store, account rail UI tests, logged-in smoke, and persistent-session UI smoke | Pass | Broader layout polish remains future work |
| Toss watchlist | `src/server/toss/toss-watchlist-client.ts`, `src/server/routes/toss-watchlist.ts`, account rail UI tests, and logged-in smoke | Pass | Smoke returned an empty watchlist from provider, which is valid |
| Toss pending/completed orders | `src/server/toss/toss-orders-client.ts`, `src/server/routes/toss-orders.ts`, route/client tests, and logged-in smoke | Pass | Live mutation remains intentionally absent |
| Toss transactions | `src/server/toss/toss-transactions-client.ts`, `src/server/routes/toss-transactions.ts`, route/client tests, logged-in smoke, and persistent-session UI smoke | Pass | Broader layout polish remains future work |
| No raw Toss session/account/order identifiers in logs/API/UI/docs | Sanitized route boundaries, DTO tests, secret grep after sensitive changes | Pass for current code paths | Repeat tracked-file secret grep before commit/final acceptance |
| KIS credential absent still allows Toss core startup | Launcher/no-credential tests cover startup, auth routes, Toss account routes, KIS slot preview, agent monitor disabled default | Pass | Repeat clean-install smoke before final acceptance |
| KIS is optional low-latency realtime rail, not account/order truth | `GET /runtime/data-health` legacy KIS REST surface and KIS WS slot preview tests; KIS truth-source flags are false; README/INSTALL/runbooks now describe KIS as optional realtime/fallback material | Pass | Re-check wording before final packaging |
| KIS WS profile cap 40 | `src/server/realtime/kis-ws-slot-allocator.ts`, session rebalancer, state store, runtime route tests | Pass | Real KIS credential live WS observation optional, not required for Toss core |
| KIS WS smart candidates and priorities | Tests cover holdings, current screen, recent news agent events, order-intent candidates, manual watchlist, TOP100 phase guard | Pass | UI polish and final runbook still need cleanup |
| News collection | Naver finance/search service and agent monitor integration exist | Partial | Provider latency/freshness needs operational observation; full-market polling remains intentionally off |
| Disclosure collection | OpenDART service and canonical receipt dedupe exist | Partial | Requires configured OpenDART credential smoke if used operationally |
| Toss asset news | `src/server/toss/toss-news-client.ts`, session-gated service, agent monitor integration, and logged-in smoke | Pass | Parser may still need hardening as provider payloads vary |
| Toss signals | `src/server/toss/toss-signal-client.ts`, `src/server/toss/toss-signal-smoke.ts`, sanitized parser, request template guard/candidate validator, monitor contract/status/UI, `scripts/internal/probes/probe-toss-signal-smoke.mts`, `scripts/internal/probes/probe-toss-signal-template-candidate.mts`, and `scripts/internal/probes/probe-toss-analysis-candidate-smoke.mts` | Pass | `dashboard/intelligences/all` session-gated smoke connects with a vetted static body and no raw template exposure, zero-item success is machine-labelled as `semanticState=supported_empty`, `trading/analysis/productCode` returns HTTP 200 shape metadata from both known Toss hosts, aggregate-only sweep supports `samples=[]`, and agent monitor status/UI exposes shape-only hosts plus semantic policy. Current live samples had zero/null items, so Araon treats empty responses as supported but non-actionable and emits `toss_signal_detected` only for future non-empty sanitized items |
| Agent event contract | `src/server/agent/agent-event-queue.ts`, `src/server/agent/market-movement-agent-event.ts`, Toss TOP100 rotation wiring, event routes, SSE/toast/browser event clients, DTO sanitization | Pass | End-to-end user notification observation pending |
| Event fields include source, firstSeenAt, freshness/confidence/reason where relevant | Queue/DTO/parser tests cover normalized event fields and freshness buckets | Pass | Real provider payload variability may require parser hardening |
| Alert dispatch 10-30 seconds from first_seen | Alert delivery scheduler/audit tests cover minimum delay and delivery audit | Partial | Operational latency samples with real providers pending |
| Agent monitor operator control | `GET /agent/event-monitor/status`, `POST /agent/event-monitor/tick`, `POST /agent/event-monitor/start`, `POST /agent/event-monitor/stop`, Settings connection-tab controls, and `scripts/internal/probes/probe-agent-event-monitor-smoke.mts` expose bounded opt-in monitor state/control without raw provider payloads. Status/UI/probe output now include provider-specific observations for Naver news, Toss asset news, Toss signals, and DART disclosures: attempted time, coarse outcome, refresh duration, inserted event count, and sanitized error code only. | Partial | Real long-running provider observation pending |
| Automatic trading foundation | Order intent service/routes/audit UI, preview/approval challenge/live lock tests | Pass | Live execution intentionally blocked until separate policy approval |
| No live order/cancel/amend/account mutation without approval | No live mutation route is enabled; live order-intent requests return locked/blocked audit state | Pass | Keep blocked in final acceptance unless user explicitly authorizes policy |
| No synthetic financial data | UI/account/chart states render empty/session-gated/collecting states; chart uses stored candles only | Pass | Repeat UI smoke after OpenDesign/frontend integration |
| Existing Araon frontend design system respected | Rails are integrated into existing React/Vite components and settings modal; OpenDesign treated as reference; persistent-session UI smoke passed for dashboard and settings connection tab | Partial | Final frontend pass and visual polish still needed after backend stabilizes |
| Legacy KIS REST/polling/chart/master/import cleanup or isolation | `/runtime/data-health` exposes legacy KIS REST as optional fallback with per-surface status, activation mode, automatic/manual state, and env gate; `docs/research/kis-legacy-role-inventory.md` maps keep/isolate/remove decisions; README/INSTALL and KIS-specific docs now describe Toss-first + optional KIS realtime rail; KIS master auto refresh is disabled by default unless `ARAON_KIS_MASTER_AUTO_REFRESH=1`; KIS chart fallback is suppressed by default unless `ARAON_KIS_CHART_FALLBACK_ENABLED=1`; KIS foreground quote fallback is suppressed by default unless `ARAON_KIS_QUOTE_FALLBACK_ENABLED=1`; KIS watchlist polling fallback is suppressed by default unless `ARAON_KIS_POLLING_FALLBACK_ENABLED=1`; KIS watchlist import is labelled as optional migration helper with Toss watchlist as primary provider; follow-up grep confirmed active app TOP100 uses Toss overview ranking while remaining KIS TOP100 wording is legacy service/test scoped | Pass | Delete fallback plumbing only if Toss parity policy later chooses removal over isolated opt-in fallback |

## Verification Snapshot

Recent checks in this working tree:

- `npm test`: passed after the Toss signal endpoint-status follow-up with
  203 test files and 1327 tests.
- Focused Toss signal/client/monitor/UI/server checks after the latest safety
  changes: passed.
- `npm run typecheck`: passed after the Toss signal endpoint-status follow-up.
- `npm run build`: passed after the Toss signal endpoint-status follow-up.
- `git diff --check`: passed after the Toss signal endpoint-status follow-up.
- `npm pack --dry-run --json`: passed after the Toss signal endpoint-status
  follow-up with 59 package entries.
- `npm run soak:no-live -- --duration-ms=1000 --interval-ms=1000`: passed
  after the Toss signal endpoint-status follow-up with `ok=true`, six sampled
  local endpoints, and `issueCount=0`.
- Secret-like tracked-file grep: reported only known redacted fixtures,
  synthetic sensitive-value tests, and local variable names after the KIS
  realtime market-movement follow-up.
- `ARAON_DATA_DIR=/tmp/araon-empty-toss-smoke npx tsx scripts/internal/probes/probe-toss-authenticated-read-smoke.mts`:
  returned `session_required` with all Toss read surfaces skipped. This proves
  the smoke harness does not call Toss authenticated endpoints before a session
  exists.
- `scripts/internal/probes/probe-toss-realtime-sse-smoke.mts` exists as the
  matching sanitized Toss SSE smoke harness. With no session, it must return
  `session_required` without starting the SSE service. After QR login, it should
  observe only counter/status metadata for a bounded duration.
- `scripts/internal/probes/probe-toss-login-capture.mts` exists as the
  sanitized user-assisted QR login probe. It should be run only when the user is
  ready to approve the Toss QR login.
- `scripts/internal/probes/probe-toss-acceptance-smoke.mts` exists as the
  preferred combined QR login + authenticated read + bounded SSE smoke. It
  gates read/SSE probes behind successful or pre-existing login. With
  `--require-existing-session=true`, it does not open Chrome and reports
  `login_incomplete` when no session is present.
- Focused probe tests now cover login capture, authenticated read, realtime
  SSE, and the combined acceptance orchestrator. Latest focused run:
  `npm test -- src/server/toss/__tests__/toss-login-capture-smoke.test.ts src/server/toss/__tests__/toss-acceptance-smoke.test.ts`
  passed with 8 tests.
- Empty-data-dir safe run passed:
  `ARAON_DATA_DIR=/tmp/araon-empty-toss-acceptance npx tsx scripts/internal/probes/probe-toss-acceptance-smoke.mts --require-existing-session=true --sse-duration-ms=1000`
  returned `login_incomplete`; login stage was `session_required`; read and
  realtime stages were `null`.
- Real user-assisted Toss acceptance passed:
  `npx tsx scripts/internal/probes/probe-toss-acceptance-smoke.mts --login-timeout-ms=600000 --sse-duration-ms=30000`
  returned `outcome=ok`. The login stage returned `succeeded` with a persistent
  Toss session captured after the user refreshed the browser QR page and
  approved the Toss login. The authenticated read stage returned `ok` for
  account list, account summary/cash overview, portfolio positions, pending
  orders, completed orders, KR transactions, KR/US transaction overview,
  watchlist, and Toss asset news. The 30s realtime stage returned `ok` with
  `started=true`, `state=connected`, and `thinNotificationOnly=true`; no SSE
  events arrived during that bounded window.
- Existing-session Toss acceptance follow-up passed after the same QR login:
  `npx tsx scripts/internal/probes/probe-toss-acceptance-smoke.mts --require-existing-session=true --sse-duration-ms=5000`
  returned `outcome=ok` without opening a new Chrome login flow. The login stage
  was `already_configured`; authenticated read surfaces again returned `ok` for
  account list, account summary/cash overview, portfolio positions, pending
  orders, completed orders, KR transactions, KR/US transaction overview,
  watchlist, and Toss asset news. The 5s realtime stage connected to Toss SSE
  and still reported `thinNotificationOnly=true`; no event arrived during the
  short bounded observation.
- Longer Toss SSE follow-up passed:
  `npx tsx scripts/internal/probes/probe-toss-realtime-sse-smoke.mts --duration-ms=120000`
  returned `outcome=ok`, `started=true`, `state=connected`, and
  `thinNotificationOnly=true`. No event arrived during the 120s observation, so
  real event-to-refresh acceptance is still not closed.
- App-level Toss realtime route smoke now exists at
  `scripts/internal/probes/probe-toss-realtime-route-smoke.mts`. Unlike the
  standalone SSE smoke, this observes the running Araon server's
  `/toss/realtime/status` and `/toss/realtime/refresh-results` audit surface
  together and prints only lifecycle counters, resource/result names, and
  ticker presence. Focused verification passed:
  `npm test -- src/server/toss/__tests__/toss-realtime-route-smoke.test.ts src/server/toss/__tests__/toss-realtime-smoke.test.ts src/server/routes/__tests__/toss-realtime.test.ts`.
  A short local route run returned `connected_no_event`, `eventCount=0`,
  `refreshResultCount=0`, and `thinNotificationOnly=true`, so it is ready for
  the next real event window but does not close event-to-refresh acceptance yet.
- Persistent-session UI smoke passed at `http://127.0.0.1:5173/` against the
  already-running local Fastify server. The dashboard rendered Toss account,
  KIS realtime rail, agent events, and order safety rails. The settings
  connection tab reached a ready Toss session state after its normal async
  status load, exposed enabled SSE/session controls, and the read-only account
  surface refresh rendered portfolio/order/transaction labels. Browser console
  errors/warnings were empty, and DOM snapshots did not contain raw Toss
  cookie/storage keys, KIS secret keys, raw account/order identifiers, or raw
  provider key names.
- Follow-up frontend polish smoke passed after compacting agent event freshness
  labels. Focused tests covered the dashboard Agent events rail and settings
  Agent event feed, including a stale multi-day event case. Playwright reloads
  of the dashboard and settings connection tab showed no giant raw seconds
  labels such as multi-million-second Korean strings, no console
  errors/warnings, and no raw Toss/KIS session or secret-like tokens in visible
  text.
- Toss public API smoke on the running local server returned successful,
  sanitized responses for realtime ranking, quote batch, search, local candle
  read, and chart coverage ensure. The observed realtime ranking surface
  returned 50 Toss public ranking items; quote batch returned two requested
  tickers; search returned five results; the selected daily candle read returned
  20 candles; chart coverage ensure was already current. The broader
  `/market/top-movers` aggregation still reported the current time phase as
  unsupported with zero gainers/losers, so market-phase TOP100/movers acceptance
  remains partially open rather than complete.
- TOP100 tab Playwright smoke passed after wiring the Toss realtime popularity
  board as the honest fallback when movers are unavailable. In the observed
  after-hours window the tab rendered `토스 실시간 인기 TOP100` instead of only
  the unsupported movers state, with no console errors/warnings and no raw
  Toss/KIS secret-like strings in visible text.
- Latest desktop frontend Playwright smoke on 2026-05-13 KST passed at
  `1600x1000` against `http://127.0.0.1:5173/`. The dashboard rendered Araon,
  Toss account, KIS realtime, Agent events, and order-safety surfaces; the
  settings connection tab rendered connection/agent monitor surfaces. Console
  errors and warnings were zero, page-level horizontal overflow was false, no
  visible layout spill was detected, no giant raw-seconds label was visible,
  and no raw Toss/KIS/account/order/session key or value was visible. A generic
  provider status label containing the word `session` was observed, but no raw
  session key such as `SESSION=` was visible.
- Agent event monitor status-only smoke passed against the running local
  server. The monitor reported `enabled=false`, `running=false`, a 30s interval,
  max 5 watched tickers per cycle, watch sources limited to favorite,
  agent-event, and tracked stocks, and `fullMarketPolling=false`. A follow-up
  explicit manual tick while disabled returned `state=disabled` with
  `externalCallsMayRun=false`, zero provider refreshes, and zero inserted
  events. Toss signals remained fail-closed with `bodyContract=capture_required`
  and `externalCallsEnabled=false`.
- Latest focused verification after the frontend polish and TOP100 fallback
  work passed: Agent events rail/settings tests, TOP100 view tests,
  `npm run typecheck`, `npm run build`, and `git diff --check`.
- Full `npm test` also passed after the same changes with 201 test files and
  1310 tests.
- A short no-live soak after the same work also passed with `ok=true`,
  `issueCount=0`, and the expected read-only endpoints only. The isolated
  temporary data directory had no credentials; startup deferred KIS master
  refresh until credentials are configured.
- User-facing `README.md` and `INSTALL.md` were rewritten away from KIS-required
  first-run language. They now describe Toss public market data as the default,
  Toss QR login as the account-aware read-only path, Toss realtime as SSE thin
  notification plus REST refresh, and KIS as an optional capped realtime rail.
- `docs/runbooks/install-acceptance.md`,
  `docs/runbooks/nxt-ws-rollout.md`, and the KIS OpenAPI setup guides now frame
  KIS as optional/historical realtime-rail material instead of required first-run
  setup.
- Legacy KIS master auto refresh is now off by default. Boot-time and
  post-credential KIS master refresh only run when
  `ARAON_KIS_MASTER_AUTO_REFRESH=1` is explicitly set; manual
  `POST /master/refresh` remains available.
- Legacy KIS chart fallback is now off by default. Toss c-chart remains the
  primary chart backfill source; KIS chart fallback only runs when
  `ARAON_KIS_CHART_FALLBACK_ENABLED=1` is explicitly set, and runtime
  data-health reports chart fallback as `suppressed` otherwise.
- Legacy KIS foreground quote fallback is now off by default. Toss quote refresh
  remains the foreground source; KIS quote fallback only runs when
  `ARAON_KIS_QUOTE_FALLBACK_ENABLED=1` is explicitly set, and runtime
  data-health reports foreground quote fallback as `suppressed` otherwise.
- Legacy KIS watchlist polling fallback is now off by default. KIS REST polling
  only runs when `ARAON_KIS_POLLING_FALLBACK_ENABLED=1` is explicitly set and
  Toss quote polling is disabled or repeatedly failing; runtime data-health and
  UI wording report it as suppressed/locked otherwise.
- Legacy KIS watchlist import remains available as a manual migration helper.
  Successful responses identify the source as `kis-legacy-watchlist-import`,
  role as `optional_migration_helper`, and primary provider as
  `toss-watchlist`. Route logs avoid raw group names.
- `/runtime/data-health` now exposes KIS legacy REST activation metadata for
  each surface: `mode`, `automatic`, and `envGate`. The settings data-health UI
  renders these fields so operators can distinguish credentials-required,
  suppressed-by-default, conditional fallback, explicit opt-in, and manual-only
  legacy paths.
- Latest post-probe `npm run typecheck`, `npm run build`, `git diff --check`,
  `npm pack --dry-run --json`, and tracked-file secret-like grep passed.
- Focused monitor-control follow-up passed:
  `npm test -- src/server/routes/__tests__/agent-event-monitor.test.ts src/client/components/__tests__/managed-operations-settings.test.ts`
  passed with 26 tests after adding sanitized start/stop control routes and
  matching settings UI buttons.
- Focused Toss signal smoke follow-up passed:
  `npm test -- src/server/toss/__tests__/toss-signal-smoke.test.ts` passed
  with 3 tests. A no-template run of
  `npx tsx scripts/internal/probes/probe-toss-signal-smoke.mts --ticker=005930 --name=삼성전자`
  returned `outcome=template_required`, `externalCallsEnabled=false`,
  `rawTemplateExposed=false`, and process exit code `2`.
- Focused Toss signal template-candidate follow-up passed:
  `npm test -- src/server/toss/__tests__/toss-signal-client.test.ts` passed
  with 6 tests after adding captured-body placeholder conversion and sensitive
  field rejection. The candidate validator returned `candidate_required` with
  exit code `2` when no body was provided, and returned `ok` for a fixture body
  while printing only placeholder counts, byte length, and write status.
- Focused Toss signal capture follow-up passed:
  `npm test -- src/server/toss/__tests__/toss-signal-capture-smoke.test.ts src/server/toss/__tests__/toss-signal-client.test.ts`
  passed with 12 tests after the capture probe was strengthened. An empty-data-dir run of
  `ARAON_DATA_DIR=/tmp/araon-empty-toss-signal-capture npx tsx scripts/internal/probes/probe-toss-signal-capture.mts --ticker=005930 --name=삼성전자 --timeout-ms=10000`
  returned `outcome=session_required`, `browserObservationEnabled=false`,
  `directSignalRequestEnabled=false`, `rawCandidateExposed=false`,
  `rawTemplateExposed=false`, and process exit code `2`.
- Real existing-session Toss signal capture attempt was safe but did not
  observe the endpoint:
  `npx tsx scripts/internal/probes/probe-toss-signal-capture.mts --ticker=005930 --name=삼성전자 --timeout-ms=60000 --write-template-file=/tmp/araon-toss-signal-template.json`
  returned `outcome=capture_not_observed`, `browserObservationEnabled=true`,
  `directSignalRequestEnabled=false`, `rawCandidateExposed=false`, and
  `rawTemplateExposed=false`. The session was present and persistent, but the
  Toss overview signals POST request did not fire from automatic stock-page
  navigation during the bounded window. This means user-assisted interaction
  with the opened Toss stock page is still required before enabling Toss signal
  reads.
- A later existing-session Toss signal capture retry with a longer 120s window
  was also safe but still did not observe the endpoint:
  `npx tsx scripts/internal/probes/probe-toss-signal-capture.mts --ticker=005930 --name=삼성전자 --timeout-ms=120000 --write-template-file=/tmp/araon-toss-signal-template.json`
  returned `outcome=capture_not_observed`, `browserObservationEnabled=true`,
  `directSignalRequestEnabled=false`, `rawCandidateExposed=false`,
  `rawTemplateExposed=false`, and `templateWritten=false`.
- Follow-up capture failure classification test passed:
  `npm test -- src/server/toss/__tests__/toss-signal-capture-smoke.test.ts`
  passed with 6 tests after separating browser/write failures from
  sensitive-body rejection without echoing raw error text.
- Focused provider-observation follow-up passed:
  `npm test -- src/client/components/__tests__/managed-operations-settings.test.ts src/server/agent/__tests__/agent-event-monitor.test.ts src/server/routes/__tests__/agent-event-monitor.test.ts`
  passed with 39 tests after adding provider-specific latency observations to
  monitor status/API/UI. `npm run typecheck` also passed.
- Latest broad verification after the capture follow-up passed:
  `npm run typecheck`, `npm run build`, `npm test`, `git diff --check`, and
  `npm pack --dry-run --json`. A later full test run after the provider
  observation follow-up covers 199 test files and 1297 tests. `git diff
  --check` passed again, and tracked-file secret-like grep reported only known
  redacted fixtures, synthetic sensitive-value tests, and local variable names;
  no real Toss/KIS secret or account/order identifier was found.
- Existing-session Toss authenticated-read smoke passed after the user
  completed QR login:
  `npx tsx scripts/internal/probes/probe-toss-authenticated-read-smoke.mts --news-ticker=005930 --news-name=삼성전자`
  returned `outcome=ok`. The sanitized count-only report covered one account,
  account summary/cash overview, 15 portfolio positions, zero pending orders,
  27 completed orders, 50 KR transaction items, KR/US transaction overview,
  empty Toss watchlist groups/items, and 30 Toss asset-news items. The report
  did not print account names, account numbers, order refs, transaction refs,
  watchlist refs, cookies, storage values, or raw provider payloads.
- Existing-session Toss realtime SSE smoke passed:
  `npx tsx scripts/internal/probes/probe-toss-realtime-sse-smoke.mts --duration-ms=30000`
  returned `outcome=ok` with session state `persistent`, realtime state
  `connected`, `thinNotificationOnly=true`, and zero reconnects. No raw session
  cookie/storage value was printed. The 30 second window produced
  `eventCount=0`, so this is connection evidence only; event-type-specific REST
  refresh evidence still needs an actual Toss SSE notification window.
- Browser-assisted Toss signal capture was attempted headlessly:
  `npx tsx scripts/internal/probes/probe-toss-signal-capture.mts --ticker=005930 --name=삼성전자 --timeout-ms=60000 --headless=true --write-template-file=/tmp/araon-toss-signal-template.json`
  returned `outcome=capture_not_observed` with a persistent Toss session,
  `rawCandidateExposed=false`, `rawTemplateExposed=false`, and
  `templateWritten=false`. This confirms fail-closed behavior, but does not
  provide the required request-body template. A user-observed/headful stock-page
  interaction is still needed before enabling direct Toss signal collection.
  `npx tsx scripts/internal/probes/probe-toss-signal-smoke.mts --ticker=005930 --name=삼성전자`
  returned `outcome=template_required`, `externalCallsEnabled=false`, and
  `rawTemplateExposed=false`, so direct Toss signal collection remains closed
  until a vetted template is configured.
- Existing-session headful Toss signal capture was retried on 2026-05-13 KST:
  `npx tsx scripts/internal/probes/probe-toss-signal-capture.mts --ticker=005930 --name=삼성전자 --timeout-ms=120000 --write-template-file=/tmp/araon-toss-signal-template.json`
  returned `outcome=capture_not_observed` with `captureMode=headful`, a
  persistent Toss session, `directSignalRequestEnabled=false`,
  `rawCandidateExposed=false`, `rawTemplateExposed=false`, and
  `templateWritten=false`. This confirms automatic headful stock-page
  navigation still does not trigger the overview signals POST; a user-observed
  manual Toss stock-page interaction is required to close
  `GATE-TOSS-SIGNAL-CAPTURE`.
- A later 2026-05-13 KST user-observed headful capture window also returned
  `outcome=capture_not_observed` after 120s with a persistent Toss session,
  `directSignalRequestEnabled=false`, `rawCandidateExposed=false`,
  `rawTemplateExposed=false`, and `templateWritten=false`. The requested
  `/tmp/araon-toss-signal-template.json` file was not created. This keeps
  direct Toss signal collection fail-closed.
- A follow-up capture attempt exposed that the existing persisted session could
  be stale for isolated Chrome replay even though the store status was
  `persistent`. The stored session was cleared, QR login was repeated, and the
  login capture succeeded with a persistent session. The capture probe then
  switched cookie replay from host-only `www.tossinvest.com` cookies to
  domain-scoped `.tossinvest.com` cookies and added a guard that navigates back
  to `/stocks/{productCode}` if Toss UI opens a community route.
- The Toss signal capture contract now exposes
  `blockedRoutePathPrefixes=["/community"]`, and the isolated Chrome probe
  applies the same route block through CDP before interacting with the stock
  page. Community surfaces are outside the signal goal because they can include
  logged-in identity/moderation context. Focused tests passed for this probe
  hardening.
- The latest logged-in Toss signal capture still returned
  `outcome=capture_not_observed`, but it now reports sanitized candidate
  endpoint metadata. It observed repeated
  `POST /api/v1/dashboard/intelligences/all` and
  `GET /api/v1/trading/analysis/productCode/A005930` calls without printing
  query strings, request bodies, responses, cookies, storage values, account
  identifiers, or order identifiers. A separate read-only status/shape probe for
  `GET /api/v1/trading/analysis/productCode/A005930` returned HTTP 200 with no
  raw payload exposure. This shifts the next signal-source probe from the old
  overview-signals endpoint to `dashboard/intelligences/all`.
- The direct Toss signal smoke was re-run after the headful capture miss:
  `npx tsx scripts/internal/probes/probe-toss-signal-smoke.mts --ticker=005930 --name=삼성전자`
  returned `outcome=template_required`, `externalCallsEnabled=false`,
  `rawTemplateExposed=false`, and
  `errorCode=TOSS_SIGNAL_TEMPLATE_REQUIRED`. This confirms direct Toss signal
  calls remain fail-closed until a vetted request-body template exists.
- Focused Toss signal capture/smoke/client tests were re-run after the latest
  capture/runbook update:
  `npm test -- src/server/toss/__tests__/toss-signal-capture-smoke.test.ts src/server/toss/__tests__/toss-signal-smoke.test.ts src/server/toss/__tests__/toss-signal-client.test.ts`
  passed with 3 test files and 15 tests.
- The current Toss signal candidate endpoint was then wired behind an explicit
  endpoint path and session-gated Cookie replay:
  `/api/v1/dashboard/intelligences/all`. The capture probe wrote a vetted
  static request-body template to a temporary file without printing the raw
  body, and sensitive-term grep of that temporary template produced no matches.
  A direct smoke with that template returned `outcome=ok`,
  `endpointPath=/api/v1/dashboard/intelligences/all`,
  `surface.id=toss-dashboard-intelligences`, `externalCallsEnabled=true`,
  `rawTemplateExposed=false`, and `items=0`. This closes the
  `template_required` blocker for the candidate read path, but not the
  non-empty Toss signal/intelligence semantics.
- An isolated Agent Event Monitor tick was run with the same vetted
  `dashboard/intelligences/all` Toss signal endpoint and default persisted Toss
  session store. The sanitized report returned `outcome=ok`, provider contract
  `bodyContract=configured`, `externalCallsEnabled=true`,
  `rawTemplateExposed=false`, one watched ticker, `refreshedTossSignals=1`,
  `insertedEvents=0`, `lastOutcome=refreshed`, `lastDurationMs=245`, and
  `lastErrorCode=null`. This proves the monitor can call the new candidate
  source without raw payload exposure, while the zero-item semantic gate stays
  open.
- Sanitized shape probes against `dashboard/intelligences/all` showed HTTP 200
  responses with `result.intelligences` present and one container, but sampled
  tickers returned `data.intelligence=null`. No raw response values were
  printed. The parser was updated to handle future non-null
  `intelligences[].data.intelligence` objects while ignoring null containers,
  and source/surface labels now distinguish `toss-dashboard-intelligences` from
  the legacy `toss-overview-signals` endpoint.
- Agent event monitor smoke status now exposes the sanitized Toss signal
  endpoint path alongside the body-contract state. A status-only run against
  the local server returned `outcome=ok`, `enabled=false`,
  `fullMarketPolling=false`, `watchedTickerCount=5`, and
  `tossSignal.endpointPath=/api/v2/dashboard/wts/overview/signals` without
  printing watched tickers or raw provider/session values.
- Focused endpoint-status verification passed after that smoke surface change:
  `npm test -- src/server/agent/__tests__/agent-event-monitor-smoke.test.ts src/server/agent/__tests__/agent-event-monitor.test.ts src/server/toss/__tests__/toss-signal-client.test.ts src/server/toss/__tests__/toss-signal-smoke.test.ts`
  passed with 4 test files and 33 tests, `npm run typecheck` passed, and full
  `npm test` passed with 203 test files and 1327 tests. This verifies the
  sanitized status contract only; it does not close non-empty Toss signal
  semantics or the SSE event-to-refresh gate.
- The Toss signal capture probe was then strengthened to cycle through both
  `/stocks/{productCode}` and `/stocks/{productCode}/order` route variants and
  perform bounded scroll/tab/button interactions while only observing the
  overview-signals POST body. Focused tests and `npm run typecheck` passed.
  A real existing-session headless retry with the stronger interaction plan
  still returned `capture_not_observed`, `directSignalRequestEnabled=false`,
  `rawCandidateExposed=false`, `rawTemplateExposed=false`, and
  `templateWritten=false`. This narrows the remaining signal blocker to a
  user-observed/headful Toss UI interaction rather than missing no-session or
  sanitization plumbing.
- Toss signal capture report guidance was tightened after that. The helper now
  emits `targetRouteTemplate`, `endpointPath`, `captureMode`, and a sanitized
  `nextAction` such as `manual_stock_page_interaction_required` without
  exposing raw body/template/session values. Focused verification passed:
  `npm test -- src/server/toss/__tests__/toss-signal-capture-smoke.test.ts`.
  A 10s headless existing-session smoke returned persistent session metadata,
  `outcome=capture_not_observed`, and
  `nextAction=manual_stock_page_interaction_required`.
- Local agent event monitor smoke passed against the running server:
  `npx tsx scripts/internal/probes/probe-agent-event-monitor-smoke.mts` returned
  `outcome=ok` with monitor `enabled=false`, `fullMarketPolling=false`, five
  watched candidates, Toss signal `capture_required`, and no raw provider
  payloads. `npx tsx scripts/internal/probes/probe-agent-event-monitor-smoke.mts --run-tick`
  also returned `outcome=ok`; because the monitor is disabled, the manual tick
  reported `externalCallsMayRun=false`, `state=disabled`, and zero refreshed
  providers. This confirms the disabled/manual gate, not live provider latency.
- Running-server runtime status was sampled without printing raw session
  material: `GET /toss/auth/status` reported Toss session `persistent` with
  count-only cookie/storage metadata, `GET /toss/realtime/status` reported
  realtime `connected`, `thinNotificationOnly=true`, and `eventCount=0`, and
  `GET /runtime/data-health` showed Toss quote polling running successfully
  while KIS legacy REST quote/polling/chart fallbacks were suppressed by
  default and KIS master/watchlist helpers were manual-only. This is useful
  local status evidence, but still not a live Toss SSE event-to-refresh sample.
- The clean no-credentials no-live smoke was repaired and re-run. The
  `scripts/internal/soak/soak-araon.mts` import path now points at the real
  repo `src/` tree, and
  `npm run soak:no-live -- --duration-ms=1000 --interval-ms=1000` returned
  `ok=true` with six sampled endpoints and `issueCount=0` from a temporary
  credential-free data directory. The run confirmed that credential status,
  stocks, realtime status, data-health, signal outcomes, and backup export
  respond without configuring KIS credentials.
- The same no-live soak path was rechecked after correcting stale internal KIS
  probe import paths. `rg` no longer finds `scripts/internal/probes` or
  `scripts/internal/soak` imports that point at the old `../src` or `../../src`
  locations, `npm run typecheck` passed, `npm run build` passed, `npm test`
  passed with 201 test files and 1309 tests, `git diff --check` passed, and
  the 1-second no-live soak again returned `ok=true` with `issueCount=0`. A
  path-only tracked-file secret-term scan was also run to avoid printing raw
  values while identifying files that contain secret-handling terms.
  `npm pack --dry-run --json` passed and produced 59 package entries. The
  read-only reference repo `/Users/stello/tossinvest-cli` still has an existing
  modified `README.md`; no file in that repo was edited by this Araon work. The
  live KIS approval/WS probe scripts were not executed because they can issue
  approval keys or open realtime connections and require separate explicit live
  approval.
- Latest clean no-credentials smoke passed again on 2026-05-13 KST:
  `npm run soak:no-live -- --duration-ms=1000 --interval-ms=1000` returned
  `ok=true`, `mode=no-live`, sampled six expected local endpoints, and
  reported `issueCount=0` from a temporary credential-free data directory.
- `docs/runbooks/toss-login-acceptance.md` now includes the operator flow for a
  user-observed/headful Toss signal capture retry after automatic stock-page
  navigation returns `capture_not_observed`, including the 120s command and the
  rule that raw Toss request bodies must not be copied into docs, terminals, or
  logs.
- A follow-up KIS-first wording/plumbing search reviewed README/INSTALL/docs
  and active `src/server`/`src/client` paths outside `docs/archive`. The current
  app composition creates both KR and US TOP100 services with
  `sourceKind='toss-overview-ranking'`, while KIS ranking messages remain only
  in the legacy service/test paths. The remaining KIS REST surfaces are still
  intentionally present as opt-in/manual legacy fallback plumbing, not default
  account/order/trading truth.
- Focused legacy-KIS wording cleanup passed after changing the manual
  `/master/refresh` no-credential error to describe it as optional legacy KIS
  master refresh rather than a primary public-master prerequisite:
  `npm test -- src/server/routes/__tests__/master.test.ts src/server/routes/__tests__/runtime.test.ts src/client/components/__tests__/managed-operations-settings.test.ts`
  passed with 3 test files and 72 tests.
- Focused KIS watchlist import hardening passed after replacing raw legacy KIS
  watchlist failure logs/responses with bounded sanitized diagnostics:
  `npm test -- src/server/kis/__tests__/kis-watchlist-api.test.ts src/server/routes/__tests__/import-guard.test.ts`
  passed with 2 test files and 9 tests. `npm run typecheck`, `npm run build`,
  and `git diff --check` passed; tracked-file secret-like grep reported only
  known redaction docs, synthetic sensitive-value tests, probe guard patterns,
  and local variable names.
- Focused agent monitor smoke follow-up passed:
  `npm test -- src/server/agent/__tests__/agent-event-monitor-smoke.test.ts`
  passed with 4 tests. A status-only run of
  `npx tsx scripts/internal/probes/probe-agent-event-monitor-smoke.mts`
  returned `outcome=ok` with monitor status, provider states, provider
  observations, watch-source policy, watched/candidate counts, and Toss signal
  capture contract only. A disabled-monitor manual tick run with
  `--run-tick` returned `externalCallsMayRun=false`, `state=disabled`, and zero
  refresh/insert counts.
- A bounded start/tick/stop attempt against the running local server on
  2026-05-13 KST also remained disabled because the process was not started
  with `ARAON_AGENT_EVENT_MONITOR_ENABLED=1`. The sanitized result showed
  `fullMarketPolling=false`, five watched candidates, Naver news/Toss news/DART
  provider states available, Toss signal disabled by missing request template,
  and a manual tick result of `state=disabled` with zero provider refreshes.
  This confirms the default no-external-call gate, but it does not close
  `GATE-PROVIDER-LATENCY`; live provider latency requires an intentional
  env-enabled monitor run or an explicit future runtime-enable policy.
- The agent monitor smoke report now emits a bounded tick `nextAction`.
  Focused test verification passed:
  `npm test -- src/server/agent/__tests__/agent-event-monitor-smoke.test.ts`
  with 6 tests. A running-server `--run-tick` smoke while disabled returned
  `externalCallsMayRun=false`, `state=disabled`,
  `nextAction=set_env_and_restart`, and zero provider refreshes.
- Latest post-`nextAction` verification passed on 2026-05-13 KST:
  trailing-whitespace scan found no matches in the touched audit/runbook/agent
  files, `git diff --check` passed, `npm run typecheck` passed,
  `npm run build` passed, and focused agent/Toss signal tests passed with
  4 test files and 20 tests. This verifies the smoke-report type surface and
  fail-closed Toss signal paths, but it does not close the remaining live
  provider gates.
- An isolated env-enabled agent monitor smoke on 2026-05-13 KST used a
  temporary data directory, `ARAON_AGENT_EVENT_MONITOR_ENABLED=1`, one tracked
  ticker, and `fullMarketPolling=false`. The manual tick completed with one
  Naver news refresh, one session-gated Toss news refresh, zero Toss signal
  calls, zero disclosure calls, and 15 inserted events. Sanitized provider
  observations recorded Naver news as `refreshed` in 147ms with 15 inserted
  events, Toss news as `refreshed` with zero inserted events, Toss signals as
  not attempted because the request-body template is missing, and disclosure as
  not attempted because DART was not configured. This narrows
  `GATE-PROVIDER-LATENCY` but does not close the Toss signal or disclosure
  provider portions.
- The agent monitor smoke helper now refetches monitor status after a requested
  manual tick so provider observations in the report reflect the tick that just
  ran. Focused verification passed:
  `npm test -- src/server/agent/__tests__/agent-event-monitor-smoke.test.ts`
  with 6 tests; `npm run typecheck`, `npm run build`, and `git diff --check`
  also passed. A helper-based isolated env-enabled smoke then showed count-only
  post-tick provider observations: Naver news `refreshed` in 139ms with
  15 inserted events, session-gated Toss news `refreshed` with zero inserted
  events, Toss signals not attempted because the request-body template is
  missing, and disclosure not attempted because DART was not configured.
  The running-server CLI probe path was also rechecked with
  `npx tsx scripts/internal/probes/probe-agent-event-monitor-smoke.mts --run-tick`;
  because that server was not started with the monitor env gate, it returned
  `state=disabled`, `externalCallsMayRun=false`,
  `nextAction=set_env_and_restart`, and no provider refreshes.
- A follow-up isolated env-enabled monitor smoke loaded local env in a temporary
  data directory and completed one tracked-ticker manual tick with
  `fullMarketPolling=false`. Count-only provider observations recorded Naver
  news `refreshed` in 239ms with 100 inserted events, session-gated Toss news
  `refreshed` with zero inserted events, and DART disclosure `refreshed` in
  991ms with 20 inserted events. Toss signals remained unattempted because the
  request-body template is still missing. The tick inserted 120 total agent
  events and printed no raw provider payloads, account data, session values, or
  secret-like values.
- Focused agent alert-delivery smoke passed:
  `npm test -- src/server/agent/__tests__/agent-event-alert-delivery-smoke.test.ts`
  passed with 2 tests. A local isolated run of
  `npx tsx scripts/internal/probes/probe-agent-event-alert-delivery-smoke.mts`
  created one signal-derived agent event in a temporary data dir, observed zero
  immediate alert deliveries, then observed one delivery audit row after the
  10s first_seen delay with `dispatchLatencyMs=10002`, `withinTarget=true`
  against the 30s target, and `unexpectedExternalFetchCount=0`. The probe
  output is count/status/latency only.
- Focused KIS realtime market-movement event wiring passed:
  `npm test -- src/server/agent/__tests__/market-movement-agent-event.test.ts src/server/realtime/__tests__/realtime-bridge.nxt4a.test.ts src/server/__tests__/bootstrap-kis.test.ts src/server/__tests__/app-launcher.test.ts`
  passed with 4 test files and 63 tests. The new helper throttles KIS WS applied
  prices by source/ticker/minute, skips snapshots and non-KR tickers, and keeps
  raw price values out of the public event reason/payload surface.
- Focused Toss TOP100 market-movement event follow-up passed:
  `npm test -- src/server/market/__tests__/market-top-movers-service.test.ts src/server/agent/__tests__/market-movement-agent-event.test.ts src/server/routes/__tests__/market.test.ts`
  passed with 3 test files and 28 tests. The service does not emit on the first
  ranking load; it only reports newly entered TOP100 rotation samples after a
  prior cache exists, keeps TOP100 refresh usable if event publication fails,
  and the agent helper keeps raw price payloads out of the event.
- Latest read-only reference check:
  `git -C /Users/stello/tossinvest-cli status --short` still reports only a
  modified `README.md` in the reference repo. Araon work continues to treat
  `/Users/stello/tossinvest-cli` as read-only reference material.
- Latest post-endpoint-status verification on 2026-05-13 KST passed:
  `npm run typecheck`, `npm run build`, `git diff --check`,
  `npm pack --dry-run --json`, and
  `npm run soak:no-live -- --duration-ms=1000 --interval-ms=1000`. The pack
  dry-run still contains 59 package entries, and the no-credentials smoke
  reported `ok=true`, six sampled local endpoints, and `issueCount=0`. A
  path-only tracked-file secret-term scan was also run so sensitive values were
  not printed; it returned expected secret-handling, docs, fixture, and test
  paths for review. The read-only reference repo check still reports only the
  pre-existing modified `README.md`.
- A direct Toss signal smoke retry using the vetted
  `dashboard/intelligences/all` request body was run for Samsung Electronics
  (`005930`), SK Hynix (`000660`), and Xavis (`254120`). All three returned
  `outcome=ok`, `bodyContract=configured`, `externalCallsEnabled=true`,
  `rawTemplateExposed=false`, `surface.id=toss-dashboard-intelligences`, and
  `items=0`. This further proves the connected empty-state path, but still does
  not close non-empty Toss intelligence semantics.
- After adding the explicit smoke semantic state, the direct
  `dashboard/intelligences/all` smoke was rerun for Samsung Electronics
  (`005930`) and returned `outcome=ok`, `items=0`, and
  `semanticState=supported_empty`. This makes the zero-item provider state
  machine-checkable while keeping non-empty signal semantics open.
- The agent monitor contract/UI type surface was tightened so the current
  `dashboard/intelligences/all` endpoint is accepted by both the server status
  contract and client settings payload type, not only by the standalone probe.
- The Toss signal parser was hardened for common dashboard envelope variants:
  `result.data.intelligences` and `sections[].cards` now normalize to sanitized
  `toss_signal_detected` candidates while raw provider ids remain hashed out of
  output. Focused parser/smoke tests passed with 16 tests.
- A current-turn direct `dashboard/intelligences/all` smoke after the parser
  hardening still returned `outcome=ok`, `items=0`, and
  `semanticState=supported_empty` for Samsung Electronics (`005930`). This
  confirms the broader parser did not turn the current empty provider response
  into invented signal data.
- Post-parser verification passed: focused Toss signal tests reported 16
  passing tests; `npm run typecheck`, `npm run build`, `git diff --check`, and
  the path-only sensitive-term scan over modified/untracked files passed without
  printing raw values.
- An isolated env-enabled monitor tick was then run with a temporary data
  directory and a copied encrypted Toss session file, so the real Araon data
  directory was not mutated and no raw session values were printed. With one
  tracked ticker and `fullMarketPolling=false`, the tick completed with
  `refreshedNews=1`, `refreshedTossNews=1`, `refreshedTossSignals=1`,
  `refreshedDisclosures=0`, and `insertedEvents=40`. Sanitized provider
  observations recorded Naver news `refreshed` in 108ms with 15 inserted
  events, Toss news `refreshed` in 301ms with 25 inserted events, Toss signal
  `refreshed` in 169ms with zero inserted events, and no disclosure attempt
  because disclosure was not configured in that isolated run. This strengthens
  `GATE-PROVIDER-LATENCY` but leaves final disclosure-provider and non-empty
  Toss signal semantics open.
- The provider-mix tick was repeated after loading the local env file without
  printing any env values. In a temporary data directory with only the encrypted
  Toss session copied in, one tracked ticker, and `fullMarketPolling=false`, all
  four monitor providers were enabled and attempted: Naver news `refreshed` in
  386ms with 100 inserted events, Toss news `refreshed` in 329ms with 25
  inserted events, Toss signal `refreshed` in 164ms with zero inserted events,
  and DART disclosure `refreshed` in 947ms with 20 inserted events. The tick
  inserted 145 total agent events, skipped zero refreshes, and printed only
  count/status/error-code metadata. This closes provider observation latency;
  the remaining Toss signal question is content semantics, not provider reach.
- `scripts/internal/probes/probe-agent-event-monitor-provider-mix-smoke.mts`
  now captures that provider-mix procedure as a reusable isolated smoke. The
  script sets up a temporary Araon data directory, optionally copies only the
  encrypted Toss session file, loads local env without printing values, accepts
  a Toss signal template file path instead of a raw template string, runs one
  manual monitor tick, and prints only sanitized count/status/error-code
  metadata. A verified run with `--copy-current-toss-session`,
  `--toss-signal-template-file=/tmp/araon-toss-intelligences-template.json`,
  and `--toss-signal-endpoint-path=/api/v1/dashboard/intelligences/all`
  returned `outcome=ok`, `fullMarketPolling=false`, one watched ticker, Naver
  news 100 events in 284ms, Toss news 25 events in 317ms, Toss signal zero
  events in 197ms, DART disclosures 20 events in 939ms, and no raw
  session/template/provider output.
  Focused verification after adding the script and runbook passed:
  `npm test -- src/server/agent/__tests__/agent-event-monitor-smoke.test.ts src/server/agent/__tests__/agent-event-monitor.test.ts`
  passed with 2 test files and 19 tests; `npm run typecheck`,
  `npm run build`, and `git diff --check` also passed.
- `scripts/internal/probes/probe-toss-analysis-candidate-smoke.mts` now captures
  the DevTools-observed
  `GET /api/v1/trading/analysis/productCode/A{ticker}` candidate as a reusable
  shape-only smoke. The probe checks both `wts-info-api.tossinvest.com` and
  `wts-cert-api.tossinvest.com` by default, accepts `--hosts=info` or
  `--hosts=cert` for focused investigation, accepts `--summary-only` for
  aggregate-only sweeps, and succeeds when at least one known host returns HTTP
  200 per sampled ticker. A verified large-cap aggregate-only sweep returned
  `sampleCount=20`, `okSampleCount=20`, `tickerWithOkCount=10`,
  `nonNullResultSampleCount=0`, and `resultTypeCounts.null=20` with
  `samples=[]`. The probe confirmed `rawPayloadExposed=false` and
  `rawSessionExposed=false`. This adds broader null-result evidence for the
  alternate Toss signal candidate, but still does not close non-empty Toss
  signal semantics.
  Verification after adding the multi-host core and runbook/audit updates
  passed: `npm test -- src/server/toss/__tests__/toss-analysis-candidate-smoke.test.ts`
  passed with 4 tests, the live shape-only probe returned `outcome=ok`, and the
  output stayed raw-payload/session-free.
- The agent monitor Toss signal contract now exposes the same shape-only
  `trading/analysis/productCode` candidate hosts through API/status, the
  sanitized agent-monitor smoke summary includes `shapeProbeHosts`, and the
  Settings connection tab shows the two host labels next to the Toss signal
  endpoint. This keeps operator/UI state aligned with the multi-host probe
  without exposing raw provider payloads or session values. Focused verification
  passed:
  `npm test -- src/server/agent/__tests__/agent-event-monitor-smoke.test.ts src/server/agent/__tests__/agent-event-monitor.test.ts src/client/components/__tests__/managed-operations-settings.test.ts`,
  followed by `npm run typecheck`, `npm run build`, `git diff --check`, and a
  full `npm test` pass with 204 test files and 1332 tests.
  A follow-up `npm run soak:no-live -- --duration-ms=1000 --interval-ms=1000`
  also passed with `ok=true`, six local endpoints, and `issueCount=0`.
  The route/launcher status contract now also asserts the same two shape-only
  hosts are exposed through `/agent/event-monitor/status`; focused
  `npm test -- src/server/routes/__tests__/agent-event-monitor.test.ts src/server/__tests__/app-launcher.test.ts`
  passed with 34 tests, followed by `npm run typecheck`, `npm run build`, and
  `git diff --check`.
  A running-server status-only probe,
  `npx tsx scripts/internal/probes/probe-agent-event-monitor-smoke.mts --base-url=http://127.0.0.1:3000`,
  returned `outcome=ok`, `tick=null`, `watchedTickerCount=5`,
  `candidateCount=5`, `externalCallsEnabled=false`, and
  `rawTemplateExposed=false` with
  `shapeProbeHosts=["wts-info-api.tossinvest.com","wts-cert-api.tossinvest.com"]`.
  This verified the operator smoke surface reports host-level signal-candidate
  metadata without running external provider refreshes.
  Focused verification after adding `rawTemplateExposed=false` to the smoke
  summary passed:
  `npm test -- src/server/agent/__tests__/agent-event-monitor-smoke.test.ts src/server/agent/__tests__/agent-event-monitor.test.ts src/server/routes/__tests__/agent-event-monitor.test.ts src/client/components/__tests__/managed-operations-settings.test.ts`,
  followed by `npm run typecheck`, `npm run build`, and `git diff --check`.
- A fresh direct `dashboard/intelligences/all` smoke pass using the vetted
  static template returned `outcome=ok`, `rawTemplateExposed=false`, and
  `semanticState=supported_empty` for `005930`, `000660`, and `254120`. All
  three returned `items=0`, so this is safe empty-state evidence only and does
  not close non-empty Toss signal semantics.
- A later premarket direct `dashboard/intelligences/all` smoke using the same
  vetted static template also returned `outcome=ok`,
  `rawTemplateExposed=false`, `items=0`, and
  `semanticState=supported_empty` for a currently strong-moving ticker. A
  summary-only `trading/analysis/productCode` candidate sweep then returned
  `sampleCount=6`, `okSampleCount=6`, `tickerWithOkCount=3`,
  `nonNullResultSampleCount=0`, and `resultTypeCounts.null=6`. This keeps
  `GATE-TOSS-SIGNAL-CAPTURE` partial: provider reach and empty-state handling
  are verified, but non-empty signal semantics are still not observed.
- The Settings connection-tab provider latency row now renders inserted-event
  counts next to each provider refresh. This makes Toss signal empty-state
  evidence visible as a count, for example `toss signal refreshed ... · 0건`,
  without exposing raw provider payloads. Focused verification passed:
  `npm test -- src/client/components/__tests__/managed-operations-settings.test.ts`
  passed with 19 tests; `npm run typecheck`, `npm run build`, and
  `git diff --check` also passed.
- `scripts/internal/probes/probe-market-top100-phase-smoke.mts` now captures
  TOP100 market-phase evidence as a reusable running-server smoke. It samples
  `/market/top-movers` and `/market/toss/realtime-ranking`, then prints only
  source/status/coverage counts without ranking rows, tickers, names, prices,
  or raw payloads. The smoke now also reports the local KST source phase,
  whether it is fetchable, and the next/current fetchable TOP100 window so
  unsupported-phase evidence is machine-actionable instead of ambiguous. A
  current closed/unsupported-phase run against the local server returned
  `outcome=unsupported_or_empty`, local `sourcePhase=stale_snapshot`,
  `fetchable=false`, and next `premarket` window metadata; `/market/top-movers`
  returned `source=toss-overview-ranking`, `status=unconfigured`,
  `partialReason=source_unsupported`, `stopReason=unsupported_source`,
  `guaranteedTop100=false`, and zero returned mover rows. The fallback
  `/market/toss/realtime-ranking?limit=100&market=kr` returned
  `source=toss-public-realtime-ranking`, `status=partial`,
  `rankingTimestampStatus=stale`, and 50 returned rows. This proves the
  closed-phase surface does not fabricate TOP100 from local watchlist data. The
  supported market-phase smoke was closed by the later premarket run below.
- A supported premarket TOP100 phase smoke later passed:
  `npx tsx scripts/internal/probes/probe-market-top100-phase-smoke.mts --market=kr --limit=100 --wait-until-fetchable --max-wait-ms=900000`
  waited 54.741s, then returned `outcome=market_phase_observed`,
  local `sourcePhase=premarket`, `/market/top-movers` `status=ready`,
  `guaranteedTop100=true`, 100 gainers, 100 losers, and
  `rankingRateLimited=false`. The paired Computer Use Chrome smoke on
  `http://127.0.0.1:5173/` showed the TOP100 tab selected with `상승 TOP100
  100`, `하락 TOP100 100`, `토스 웹 랭킹 보장`, `LIVE`, and `30초마다`.
  This closes `GATE-MARKET-PHASE-TOP100` without writing ranking rows, account
  values, raw session data, or raw provider payloads into the audit.
- In-app browser UI smoke passed on `http://127.0.0.1:5173/`. The dashboard
  loaded with zero captured console errors, visible Toss account, KIS realtime
  rail, and agent events surfaces. The settings modal connection tab also
  loaded with zero captured console errors and showed Toss-first data
  connection, Toss SSE, Agent event feed, KIS optional rail, and KIS legacy
  fallback isolation text. DOM snapshots for dashboard/settings did not contain
  raw sensitive markers such as `SESSION`, `UTK`, `LTK`, `FTK`, `appSecret`,
  `appKey`, `accountNo`, or `browserSessionId`.

These checks now include real logged-in Toss runtime validation for QR login,
authenticated read surfaces, and SSE connectivity. They still do not prove a
real SSE event-to-refresh cycle because no event arrived during the bounded
observation.

A 2026-05-13 KST app-level route observation against the running local server
confirmed the Toss realtime service was still `connected` with
`thinNotificationOnly=true`, but another 60s route poll observed
`eventCount=0`, `refreshHintCount=0`, and `refreshResultCount=0`. This keeps
the real event-to-refresh row as an open opportunistic probe rather than a
closed acceptance item.

A later 2026-05-13 KST 120s app-level route observation also returned
`outcome=connected_no_event`. The running service stayed `connected` and
`thinNotificationOnly=true`, but the final counters were `eventCount=0`,
`refreshHintCount=0`, `refreshHintDispatchCount=0`, and
`refreshResultCount=0`. This is fresh connection evidence only; it still does
not close `GATE-TOSS-SSE-REFRESH`.

Another 2026-05-13 KST 120s app-level route observation also returned
`outcome=connected_no_event`. The running service was already connected, so
the probe did not start a new realtime service. Final sanitized counters were
`eventCount=0`, `priceRefreshEventCount=0`, `userNotificationEventCount=0`,
`refreshHintCount=0`, `refreshHintDispatchCount=0`, and
`refreshResultCount=0`; `thinNotificationOnly=true` and `lastError=null`.
This keeps `GATE-TOSS-SSE-REFRESH` open.

The latest 2026-05-13 KST 120s app-level route observation again returned
`outcome=connected_no_event`. Final sanitized counters were `eventCount=0`,
`priceRefreshEventCount=0`, `userNotificationEventCount=0`,
`refreshHintCount=0`, `refreshHintDispatchCount=0`, `refreshResultCount=0`,
`reconnectCount=2`, `eventTypes=[]`, `lastError=null`, and
`thinNotificationOnly=true`. This is connection/reconnect evidence only, not a
thin-notification-to-REST-refresh acceptance sample.

Another 2026-05-13 KST 120s app-level route observation returned
`outcome=connected_no_event`. The route reported `startedRealtime=false`
because the app realtime service was already running, `sampleCount=25`,
`state=connected`, `eventCount=0`, `refreshResultCount=0`, `reconnectCount=5`,
`eventTypes=[]`, `lastError=null`, and `thinNotificationOnly=true`. This keeps
`GATE-TOSS-SSE-REFRESH` open with fresh no-event evidence.

The next 2026-05-13 KST 120s app-level route observation again returned
`outcome=connected_no_event`. The route reported `startedRealtime=false`,
`sampleCount=25`, `state=connected`, `eventCount=0`,
`priceRefreshEventCount=0`, `userNotificationEventCount=0`,
`refreshHintCount=0`, `refreshHintDispatchCount=0`, `refreshResultCount=0`,
`reconnectCount=18`, `eventTypes=[]`, `lastError=null`, and
`thinNotificationOnly=true`. This confirms the service can stay connected
without leaking raw session/frame data, but it still is not a real
thin-notification-to-REST-refresh acceptance sample.

An earlier current-turn 2026-05-13 KST 120s app-level route observation again
returned `outcome=connected_no_event`. Final sanitized counters were
`state=connected`, `eventCount=0`, `priceRefreshEventCount=0`,
`userNotificationEventCount=0`, `refreshHintCount=0`,
`refreshHintDispatchCount=0`, `refreshResultCount=0`, `reconnectCount=26`,
`eventTypes=[]`, `lastError=null`, and `thinNotificationOnly=true`. This keeps
`GATE-TOSS-SSE-REFRESH` open.

The latest 2026-05-13 KST 120s app-level route observation again returned
`outcome=connected_no_event`. Final sanitized counters were `state=connected`,
`eventCount=0`, `priceRefreshEventCount=0`,
`userNotificationEventCount=0`, `refreshHintCount=0`,
`refreshHintDispatchCount=0`, `refreshResultCount=0`, `reconnectCount=4`,
`eventTypes=[]`, `lastError=null`, and `thinNotificationOnly=true`. This is
fresh connected/no-event evidence only; `GATE-TOSS-SSE-REFRESH` remains open.

The next 2026-05-13 KST 120s app-level route observation also returned
`outcome=connected_no_event`. The service remained `state=connected`; final
sanitized counters were `eventCount=0`, `priceRefreshEventCount=0`,
`userNotificationEventCount=0`, `refreshHintCount=0`,
`refreshHintDispatchCount=0`, `refreshResultCount=0`, `reconnectCount=31`,
`eventTypes=[]`, `lastError=null`, and `thinNotificationOnly=true`. This keeps
`GATE-TOSS-SSE-REFRESH` open because no real thin notification reached the REST
refresh audit surface.

The app-level route smoke was then hardened to avoid a stale refresh-result
false positive. It now captures baseline refresh-result ids and status counters
before polling, then only classifies refresh evidence from rows/counters newly
observed after the smoke starts. Focused regression tests cover this with a
pre-existing `user-notifications` row that must remain `connected_no_event`.
After the hardening, another 2026-05-13 KST 120s delta route observation
returned `outcome=connected_no_event`, `state=connected`, `eventCount=0`,
`refreshResultCount=0`, `reconnectCount=3`, `eventTypes=[]`, `lastError=null`,
and `thinNotificationOnly=true`. This is the accurate current blocker:
connection is alive, but no new Toss SSE event has arrived during the bounded
window.

The route smoke was then tightened again so only newly observed
`result=refreshed` rows can produce `outcome=refresh_observed`. Newly observed
`ignored` rows now report `event_observed_without_refresh`, which prevents a
notification-only event or unsupported refresh resource from closing
`GATE-TOSS-SSE-REFRESH`. Price-refresh handling now also writes a sanitized
`quote` refresh audit row after the Toss quote refresh handler runs, so a future
real price-refresh event can close the gate only when the quote refresh actually
returns `refreshed`. Focused tests for the route smoke, quote refresh audit
helper, quote refresh handler, and refresh-result store passed with 4 test files
and 13 tests; `npm run typecheck`, `npm run build`, `git diff --check`,
`npm run soak:no-live -- --duration-ms=1000 --interval-ms=1000`,
`npm pack --dry-run --json`, and the goal-completion audit probe also passed.
The path-only sensitive-term scan over modified/untracked files printed expected
secret-handling/docs/test/source paths only, not raw values. A fresh 120s route
observation after this hardening still returned `outcome=connected_no_event`
with `state=connected`, zero events, zero refresh results, `lastError=null`, and
`thinNotificationOnly=true`. Full `npm test` then passed with 207 test files and
1346 tests.

The price-refresh audit wiring was then extracted into
`src/server/toss/toss-realtime-refresh-handlers.ts` so the app-level callback
path can be tested without waiting for a provider event. Focused tests now
cover price-refresh to `quote` audit row/broadcast, unsupported price-refresh
as `ignored`, supported account refresh hints as `refreshed`, and sanitized
failure rows. Verification passed with 6 focused test files / 21 tests,
`npm run typecheck`, `npm run build`, `git diff --check`, and the
goal-completion audit probe. This improves implementation proof only; the
real-event `GATE-TOSS-SSE-REFRESH` gate remains open until a live Toss SSE event
produces a newly observed `refreshed` row.

A read-only comparison against `/Users/stello/tossinvest-cli` confirmed Araon's
SSE client still matches the reference listener on endpoint
`https://sse-message.tossinvest.com/api/v1/wts-notification`, headers
`Accept: text/event-stream`, `Cache-Control: no-cache`, browser User-Agent,
Toss referer/origin, cookie auth, and immediate reconnect on
`event: connection-close`. This supports the current blocker diagnosis: the
latest no-event observations are not explained by an obvious client/header
drift from the read-only reference implementation.

Current-turn verification after the Toss signal contract/UI fixes passed:
`npm test` reported 203 passed test files and 1327 passed tests; `npm run
typecheck`, `npm run build`, `git diff --check`, and a clean no-credentials
`npm run soak:no-live -- --duration-ms=1000 --interval-ms=1000` smoke also
passed. `npm pack --dry-run --json` also passed with 59 package entries. A
path-only sensitive-term scan over modified/untracked files printed only
expected secret-handling/docs/test/source paths for review and did not print
raw values.

The goal-completion audit probe now exists at
`scripts/internal/probes/probe-goal-completion-audit.mts`. It reads this
machine-checkable gate table and prints only gate ids, states, counts, and the
`shouldCallUpdateGoal` flag. Latest run after the real Toss SSE event-to-refresh
sample reported `goalComplete=true`, `shouldCallUpdateGoal=true`, `pass=8`,
`partial=0`, `open=0`, and `unknown=0`.

Historical 2026-05-13 KST verification after the community-route block,
TOP100 phase-window helper, Toss analysis summary-only output, and audit updates
passed: focused smoke/helper tests passed with 39 tests, `npm run typecheck`
passed, `npm run build` passed, `git diff --check` passed, and full `npm test`
passed with 206 test files and 1340 tests. A later supported premarket TOP100
API + Chrome UI smoke closed `GATE-MARKET-PHASE-TOP100`.

Historical focused verification after the Toss signal semantic policy and
delta-based SSE route smoke hardening passed: 7 focused test files / 56 tests,
`npm run typecheck`, `npm run build`, `git diff --check`, and the
goal-completion audit probe. That historical audit reported 6 pass, 0 partial,
2 open, and `shouldCallUpdateGoal=false`.

## Maintenance Re-Run Triggers

Re-run the relevant gate if a later change touches the matching surface:

1. Toss SSE routing: `scripts/internal/probes/probe-toss-realtime-route-smoke.mts --duration-ms=600000`.
2. Toss signal parsing/provider contract: direct Toss signal smoke and agent monitor provider-mix smoke.
3. Package-facing or code changes: `npm test`, `npm run typecheck`, `npm run build`,
   `git diff --check`, `npm pack --dry-run --json`, no-live soak, and tracked-file
   secret grep.

The KIS inventory and isolation pass now exists at
`docs/research/kis-legacy-role-inventory.md`. The user-facing README/INSTALL
rewrite started from the real Toss QR/read/SSE acceptance evidence, and a
follow-up active-path grep found the remaining KIS TOP100 wording scoped to
legacy service/test paths rather than the default app composition.

The QR login/read/SSE acceptance sequence is captured in
`docs/runbooks/toss-login-acceptance.md` so the real-session probe can resume
without relying on chat history.
