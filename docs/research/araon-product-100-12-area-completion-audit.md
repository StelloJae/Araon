# Araon Product 100% 12-Area Completion Audit

Date: 2026-05-19 KST

Authoritative briefs:

- `docs/research/araon-complete-analysis-commit-market-agent-readiness.md`
- `docs/research/araon-complete-analysis-followup-execution-audit.md`
- `docs/research/araon-commit-slice-plan.md`

This audit closes the active thread goal's 12 explicit areas. It intentionally
does **not** approve GitHub Release, npm publish, live order placement, order
cancel/amend, account mutation, or autonomous live trading.

## Scope Interpretation

The active goal asks for `agent live trading readiness as locked readiness
without live orders`. Therefore this audit treats the following as in scope:

- decision support
- simulated preview
- risk/approval/audit surfaces
- live execution lock
- locked dry-run adapter contract
- no network order request before an explicit future live lane

The following remain out of scope and are not blockers for this goal:

- real Toss live order adapter
- real fill reconciliation loop
- live auto-buy/live auto-sell
- GitHub/npm public release

## Overall Result

Result: `PASS`

All 12 active-goal areas are complete under the stated no-live-order boundary.
The broader roadmap can still keep future live execution, public release, and
longer market soak as separate lanes.

## 12-Area Matrix

| # | Area | Status | Completion evidence |
|---:|---|---|---|
| 1 | Toss TOP100 | PASS | Provider-ranked rising/falling TOP100 uses Toss ranking without local filler. Market evidence recorded TOP100 movement and rank-order changes. Focused TOP100 and market evidence tests cover provider semantics and direction separation. |
| 2 | Toss fast quote lane | PASS | Fast quote lane is bounded, not full-market polling. Current product config uses 100ms lane with target/hard caps and guards. Recheck evidence reports `fastQuoteLane.ok=true`, and focused fast-quote tests cover backoff/candidate behavior. |
| 3 | Watchlist/holdings merge | PASS | `/watchlist` merges Toss watchlist, Toss holdings, and local fallback with Toss-first priority. Held-only rows remain visible and locked-filled; local favorites are fallback/cache. Bounded live watchlist add/remove smoke previously passed with redacted count-only evidence. |
| 4 | Favorites price/percent | PASS | Favorite/holding rows hydrate real price and percent. When quote percent is absent, direction is derived from real history only. Current sparkline coverage probe confirms checked rows have renderable real history and no fake flat movement. |
| 5 | Sparkline/history identity | PASS | Product identity, quote key, and chart/history key are separated. KR rows use persisted price history, Toss candle seed, then live quote overlay. Unsupported/Toss-only rows are guarded from KR/KIS-only paths. |
| 6 | Chart | PASS | Toss historical candles are primary with local cache and live quote overlay. Mini/full chart current candle progression is covered by component tests and market/browser evidence; non-trading gaps are hidden without synthetic candles. |
| 7 | KIS containment | PASS | KIS is optional `실시간 추적` only. Slot priority is contained behind watchlist/holdings, agent/current/news candidates, with TOP100 last-resort. KIS does not become account/order/watchlist/TOP100/chart truth source. |
| 8 | Toss account rail | PASS | Account rail has summary, positions, sort, current/evaluation toggle, row click chart change, shared `ProductAvatar`, hover affordance, collapsed rail behavior, and no width jitter in browser snapshots. |
| 9 | Product icons | PASS | Server sanitizes Toss icon URLs and shares an in-memory icon cache across portfolio/watchlist. Client renders icons through `ProductAvatar` with safe fallback. Focused tests cover sanitize/cache/fallback/refresh invalidation. |
| 10 | Agent decision-support | PASS | Agent UI/API expose detect -> candidate -> reason -> simulated preview -> risk/approval -> live lock. Candidate decisions support buy/sell/observe/ignore, deterministic score, policy label, risk/readiness labels, and Korean product copy. |
| 11 | Agent live trading readiness as locked readiness | PASS | Live execution remains locked by design. Approval challenge, intent hash, order summary, kill switch, locked execution proof, network-before-blocked executor, read-only reconciliation snapshot, data freshness gate, and `liveMutationEnabled=false` are all explicit. No live order path was added. |
| 12 | Commit readiness | PASS | User-approved reviewable commit stack was created in A/F/G/B/C/E/D/cross-slice order. Full checks passed. Remaining untracked root screenshots are classified as excluded visual artifacts and preserved outside the commit stack by design. |

## Evidence Commands

Latest verified command evidence:

- `npm test`: PASS, 230 files / 1573 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, Vite chunk-size warning only.
- `npm pack --dry-run --json`: PASS, 53 package entries.
- `npm run audit:pre-release-product`: PASS, 42/42 criteria.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS, issueCount=0.
- `git diff --check`: PASS.
- refined tracked-file secret-like scan: PASS.
- `npx tsx scripts/internal/probes/probe-pre-release-product-100-audit.mts --require-complete`: PASS, 42/42 criteria.
- `npx tsx scripts/internal/probes/probe-favorite-sparkline-coverage.mts --require-complete`: PASS, checked=9, renderable=9, flat=0, missing=0.
- `npx tsx scripts/internal/probes/probe-commit-slice-coverage.mts`: PASS, remaining unknown=0.

## Browser Evidence

Current and prior browser evidence together prove the target product surfaces:

- 1600x1000: 50:50 home layout, TOP100, favorites, recent surge, selected chart,
  agent panel, and account rail render at stable density.
- 900x900: account rail collapses to icon rail, home remains viewport-fitted,
  bottom status bar remains visible and aligned.
- Light/dark: theme switch preserves geometry and status bar visibility.
- Browser snapshots show no visible old product copy hits for `KIS WS`,
  `WebSocket`, `등록됨`, `폴링`, `내 목록`, or `투자 유의사항`.
- Existing market-window browser/evidence passes observed TOP100 movement,
  quote movement, chart progression, full-chart expansion without page
  navigation, and no severe visible lag.

## Safety Evidence

Safety result: `PASS`

- No live order, order cancel, order amend, account mutation, or live auto-trade
  was executed.
- No broad destructive Toss watchlist cleanup was executed.
- Raw Toss/KIS/session/account/order/watchlist values were not intentionally
  exposed in UI, docs, stdout, screenshots, or git diff.
- Chart/sparkline behavior uses real stored candles, real Toss candle seed, and
  real quote samples only.
- Full-market 0.1s polling was not introduced.

## Remaining Non-Goal Work

The following are real future lanes, but they are outside this active goal:

1. Decide whether to archive, keep, or delete 12 root-level visual evidence
   files currently left untracked.
2. Push/PR/review the commit stack.
3. GitHub Release and npm publish.
4. Real Toss live order adapter.
5. Real fill reconciliation loop.
6. Longer market-hours UI soak for operational confidence.

## Final Decision

Decision: `ACTIVE_GOAL_COMPLETE`

Under the active objective's explicit no-live-order boundary, all 12 areas are
implemented and verified to product 100%. Future live execution and public
release work must remain separate explicit goals.
