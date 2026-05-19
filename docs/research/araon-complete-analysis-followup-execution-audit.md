# Araon complete-analysis follow-up execution audit

> Date: 2026-05-19 KST
> Status: current-state audit for the active complete-analysis goal
> Scope: analysis/documentation only. No staging, no commit, no live trading, no account mutation.

## 1. Summary

This audit updates the active complete-analysis goal against the current worktree and running app.

Current conclusion:

- The product direction remains correct: Toss is the primary market/account/watchlist/chart source, and KIS is optional realtime acceleration.
- The current dirty tree is too large for one commit. It must be cut into Slice A/F/G/B/C/E/D plus cross-slice verification.
- Market-hours evidence exists for TOP100, fast quote, quote movement, and chart bucket progression, but the generated evidence report is not final-completion evidence by itself.
- Browser evidence confirms layout scale lock at 1600x1000, 1440x900, and 900px, and confirms recent-surge row click can change the selected ticker/chart.
- Product icon work now has a safe shared-cache pipeline: Toss `logoImageUrl`/`imageUrl` is sanitized server-side, portfolio/watchlist clients share an in-memory icon cache, account/watchlist payloads expose `iconUrl`, and the UI renders product icons through a shared fallback-safe avatar component. Icon refresh invalidation and 1600x1000 browser image QA are complete.
- Agent is still decision-support + simulated preview + live lock. It now classifies candidates as buy/sell/observe/ignore in both the server public event payload and the client view model, but it is not an autonomous trading engine.

## 2. Current dirty-tree slice map

Snapshot basis:

- `git status --short`
- `git diff --stat`
- Current tracked diff: 90 modified files, about 5.7k insertions and 1.1k deletions.
- Current untracked set includes docs, evidence, screenshots, internal probes/soak scripts, new agent/client/server files, and DB migrations.

This classification is for review planning only. Do not stage or commit until the user explicitly approves.

### Slice A: docs/evidence/artifacts

Count: 36 entries.

Representative files:

- `docs/research/araon-complete-analysis-commit-market-agent-readiness.md`
- `docs/research/araon-complete-analysis-followup-execution-audit.md`
- `docs/archive/complete-analysis-market-evidence-20260519.json`
- `docs/archive/complete-analysis-market-evidence-20260519.md`
- `docs/research/araon-*-goal.md`
- `docs/research/araon-*-completion-audit.md`
- `scripts/internal/probes/probe-pre-release-product-100-audit.mts`
- `scripts/internal/probes/probe-toss-watchlist-live-smoke.mts`
- local screenshot artifacts such as `araon-agent-detail-*.png`, `araon-ui-scale-*.png`, `araon-sector-after.png`

Review notes:

- Keep `docs/archive/complete-analysis-market-evidence-20260519.*` as evidence.
- Screenshot files should not be committed by default unless the final review plan explicitly marks them as evidence artifacts.
- Internal probes should stay under `scripts/internal/**` and out of the npm package.

### Slice F: CLI/package

Count: 2 entries by coarse classifier.

Files:

- `package.json`
- `src/client/components/__tests__/status-bar.test.ts`

Review notes:

- `package.json` belongs here.
- `status-bar.test.ts` is probably not CLI/package; it should likely move to Slice D or cross-slice during hunk-level staging. The coarse classifier only flags it because bottom-bar product labels touch release/package diagnostics.

### Slice G: KIS containment

Count: 8 entries.

Files:

- `src/server/realtime/kis-ws-slot-allocator.ts`
- `src/server/realtime/kis-ws-slot-candidates.ts`
- `src/server/realtime/kis-ws-slot-session-rebalancer.ts`
- `src/server/routes/kis-ws-slots.ts`
- related tests under `src/server/realtime/__tests__/` and `src/server/routes/__tests__/`

Review notes:

- KIS remains optional realtime tracking.
- KIS must not be the account/watchlist/TOP100/chart truth source.
- TOP100 rotation should be last-resort capacity, not a primary KIS slot consumer.

### Slice B: Toss backend/product identity/watchlist

Count: 28 entries.

Representative files:

- `src/server/toss/toss-fast-quote-lane.ts`
- `src/server/toss/toss-watchlist-client.ts`
- `src/server/watchlist/araon-watchlist-service.ts`
- `src/server/routes/watchlist.ts`
- `src/server/routes/toss-auth.ts`
- `src/server/routes/stocks.ts`
- `src/shared/product-identity.ts`
- `src/server/db/repositories.ts`
- `src/server/db/migrations/022-watchlist-sync-provenance.sql`
- watchlist/product identity/Toss tests

Review notes:

- This slice owns Toss-first watchlist/holdings/local fallback merging.
- It also owns product identity separation: `productCode`, `krTicker`, quote key, chart key.
- Hunk-level review is needed because `toss-fast-quote-lane.ts` also belongs partly to Slice C.

### Slice C: realtime/chart/surge

Count: 10 entries.

Representative files:

- `src/client/components/StockCandleChart.tsx`
- `src/client/components/SurgeBlock.tsx`
- `src/client/hooks/usePersistedPriceHistory.ts`
- `src/client/lib/surge-aggregator.ts`
- `src/server/market/market-top-movers-service.ts`
- candle/price-history/stock-timeline route tests

Review notes:

- This slice owns TOP100 cadence, recent surge, current candle progression, and sparkline/history behavior.
- It must preserve the no-synthetic-financial-data rule.

### Slice E: agent safety/decision-support

Count: 18 entries.

Representative files:

- `src/server/agent/order-intent-service.ts`
- `src/server/agent/market-movement-agent-event.ts`
- `src/client/lib/agent-candidate-view-model.ts`
- `src/client/components/AgentEventsRail.tsx`
- `src/client/components/AgentDecisionSummary.tsx`
- `src/client/components/OrderIntentSafetyRail.tsx`
- `src/server/db/migrations/020-agent-event-lifecycle-types.sql`
- `src/server/db/migrations/021-stock-signal-events-detach-stock-fk.sql`
- related agent tests

Review notes:

- This slice must preserve live execution lock.
- It should improve decision-support clarity, not imply autonomous trading readiness.

### Slice D: frontend product UI

Count: 31 entries.

Representative files:

- `src/client/App.tsx`
- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/TopMoversBoard.tsx`
- `src/client/components/TossAccountRail.tsx`
- `src/client/components/StatusBar.tsx`
- `src/client/components/SettingsModal.tsx`
- `src/client/components/StockRow.tsx`
- `src/client/styles/global.css`
- related UI tests

Review notes:

- This is the visually largest slice.
- It should be committed after backend/realtime/agent slices so UI can be reviewed against real data contracts.
- Layout scale lock must remain stable across Chrome/Safari and light/dark.

### Cross-slice/shared

Count: 14 entries.

Representative files:

- `src/server/app.ts`
- `src/server/routes/runtime.ts`
- `src/shared/types.ts`
- `scripts/internal/soak/pre-release-market-evidence*.mts`
- `src/server/soak/pre-release-market-evidence*.ts`
- `src/server/audit/pre-release-product-100-audit.ts`

Review notes:

- These require hunk-level splitting.
- The evidence harness and runtime API changes may need their own small integration slice if they cannot be cleanly assigned.

## 3. Market-hours and browser evidence

### 3.1 Evidence file

Evidence file:

- `docs/archive/complete-analysis-market-evidence-20260519.json`
- summary: `docs/archive/complete-analysis-market-evidence-20260519.md`
- fast quote recheck: `docs/archive/complete-analysis-fast-quote-harness-recheck-20260519.json`
- fast quote recheck summary: `docs/archive/complete-analysis-fast-quote-harness-recheck-20260519.md`

Observed:

- KST regular market heuristic: true.
- API sampling completed successfully.
- TOP100 observed.
- TOP100 rank reorder observed.
- Quote movement observed.
- Chart bucket progression observed.
- Endpoint latency was within supporting range.

Not final-complete:

- The evidence summary still marks `marketEvidenceReady=false` and `completionReady=false`.
- The original archived 2026-05-19 report still contains the old fast-quote verdict because it is a saved report artifact, not raw samples.
- The follow-up fast quote recheck generated after the criterion fix reports `marketEvidenceReady=true`, `completionReady=true`, `fastQuoteLane.ok=true`, 100ms interval, target cap 200, hard cap 400, and no blockers. This is a short read-only harness pass, not final product-goal completion.
- Browser/Computer Use visual QA is still required for final release-quality closure.

### 3.2 Runtime API snapshot

Redacted current-state summary:

- `/runtime/data-health`
  - Toss fast quote configured/running/enabled.
  - Interval: 100ms.
  - Target cap: 200.
  - Hard cap: 400.
  - Current requested/returned candidate count is bounded, not full-market.
  - No current last error in the fast quote lane.
- `/watchlist`
  - Primary source: Toss.
  - Toss watchlist, Toss holdings, and local fallback are merged.
  - Current returned rows are quote-hydrated for last price and change percent.
- `/market/top-movers`
  - Source: Toss overview ranking.
  - Gainers and losers are both 100 rows.
  - Local fallback is not used to fake TOP100 coverage.
- `/runtime/realtime/kis-ws-slots`
  - KIS realtime tracking remains optional and capped.
  - Active sources include holdings, user pins/manual watchlist, and some TOP100 rotation.
- `/agent/order-intents/live-policy`
  - Live execution disabled.
  - Policy not approved.
  - Kill switch engaged.
  - Multiple readiness gaps remain.
- `/agent/event-monitor/status`
  - Monitor disabled by default.
  - News/disclosure provider shell exists.
  - Toss signal provider still needs request-body contract capture.

### 3.3 Browser evidence

Browser target:

- `http://127.0.0.1:5173/`

Observed at 1600x1000:

- body/app shell use 14px base font and no body overflow.
- status bar height is 36px and uses compact 11px text.
- account rail is 334px panel + 48px icon rail.
- home agent panel body remains 2 columns.
- recent-surge panel had rows, and clicking a different recent-surge row changed selected ticker/chart from the previous selected ticker to the clicked ticker.
- TOP100 browser sampling over a short live window saw multiple signatures, which supports that the board is updating in the rendered app. The longer evidence file remains the stronger source for rank-reorder proof.
- The selected mini chart rendered multiple canvases with non-blank sampled pixels after the recent-surge click. This proves the browser chart surface was rendering the newly selected ticker rather than only updating text.

Observed at 1440x900:

- body/app shell remain 14px base.
- no body overflow.
- home grid is 2 columns.
- account rail is 300px panel + 48px icon rail.
- agent body remains 2 columns.
- status bar remains 36px.

Observed at 900x900:

- body/app shell remain 14px base.
- no body overflow.
- account rail collapses to the 48px icon rail.
- agent body collapses to 1 column, which is expected for narrow layout.
- status bar remains 36px.

### 3.4 Full chart expansion browser evidence

Additional Browser/Playwright pass:

- Viewport: 1600x1000.
- Action: click the selected ticker panel `차트 확장` icon button.
- Result:
  - UI switched to the `확장 차트` workspace.
  - The selected ticker header and chart controls stayed in the expanded workspace.
  - `document.documentElement.scrollHeight` and `document.body.scrollHeight` both remained equal to viewport height.
  - `body` overflow was `hidden`.
  - The large chart canvas rendered inside the viewport, with the main canvas around 1084x556 CSS px.
  - Account rail and right icon rail remained present and stable.

Conclusion:

- Full chart expansion behavior is now browser-verified for no page scroll and viewport-fit rendering.
- This closes the previous "full chart expansion visual QA" blocker for expansion/no-scroll behavior.
- Current-candle progression now has stronger data-level proof:
  - Added a focused candle route test proving a stored Toss minute candle is overlaid by later real `toss-fast-quote` observations in the same minute bucket.
  - The route now keeps the stored candle `open`/`volume`, updates `high`/`low`/`close`, increments `sampleCount`, marks the candle partial, and reports mixed source coverage.
  - Verification: `npm test -- src/server/routes/__tests__/candles.test.ts` passed with 24 tests.
- Browser-verifiable current-candle evidence path is now in place:
  - `StockCandleChart` exposes non-visual `data-*` QA attributes on the chart host: candle count, latest candle bucket time, close, sample count, source, and partial state.
  - These values are derived from the displayed real candle items, not from synthetic data.
  - Verification: `npm test -- src/client/components/__tests__/stock-candle-chart.test.ts` passed with 21 tests.
- Browser current-candle progression evidence:
  - Viewport: 1600x1000, local dev server at `http://127.0.0.1:5173/`.
  - 15-second chart-host sample on the selected ticker showed the latest candle bucket advance from `08:21` to `08:22` UTC and candle count increase from 389 to 390 without page reload.
  - TOP100 row click changed the selected ticker to `진원생명과학`; the selected chart host initially reported source `toss-fast-quote`.
  - A 20-second follow-up sample on that selected ticker showed the latest candle bucket advance from `08:23` to `08:24` UTC and candle count increase from 381 to 382 without page reload.
  - In both samples the close value stayed unchanged during the observation window, so this proves live bucket progression and selected ticker chart change, but not an intra-minute price-close move.
- Remaining evidence need: longer browser/pixel evidence that the visible mini/full chart updates close/sampleCount when the selected ticker receives changing live samples during an active market window.

### 3.5 Duplicate toast browser evidence

Additional Browser/Playwright pass:

- Viewport: 1600x1000.
- Observation window: 18 samples over about 17 seconds.
- Result:
  - max visible toast count: 0.
  - simultaneous duplicate toast samples: 0.
  - repeated visible toast text: none.

Conclusion:

- No duplicate market-movement toast was present during this live observation window.
- This is useful runtime evidence, but it is not a forced duplicate suppression proof.
- A stronger completion proof would require either a real repeated same-semantic event during market hours or a focused non-financial UI/store-level duplicate event test.

### 3.6 Fast quote status browser evidence

Additional Browser/Playwright pass:

- Viewport: 1600x1000.
- Observation window: 8 samples over about 7 seconds after returning to the home workspace.
- Result:
  - Bottom status bar consistently showed `빠른 가격 정상`.
  - `마지막 업데이트` advanced once per second from 13:45:01 to 13:45:08.
  - The selected ticker panel timestamp also advanced in the same window.
  - Page height stayed locked to the viewport and body overflow stayed hidden.

Conclusion:

- Browser UI confirms that the fast quote/product status surface is alive and updating during market hours.
- This does not replace the longer API/evidence harness, but it gives direct rendered-app evidence for the goal's "fast quote in browser" requirement.

### 3.7 Fast quote harness criterion fix

Implementation evidence:

- `src/server/soak/pre-release-market-evidence.ts` now treats the intended fast Toss quote product contract as bounded:
  - minimum interval: 75ms
  - maximum interval: 750ms
  - target cap: up to 200
  - hard cap: up to 400
  - candidate/requested counts must remain within the hard cap.
- `src/server/soak/__tests__/pre-release-market-evidence.test.ts` now proves both sides:
  - 100ms + target 200 + hard 400 + accepted movement is accepted as healthy bounded evidence.
  - target 250 / hard 500 / requested 401 remains blocked as an unbounded lane.

Verification:

- `npm test -- src/server/soak/__tests__/pre-release-market-evidence.test.ts src/server/soak/__tests__/pre-release-market-evidence-summary.test.ts` passed.
- `npm run typecheck` passed.
- `npm run soak:pre-release-market -- --url http://127.0.0.1:3000 --duration-ms 3500 --interval-ms 500 --out docs/archive/complete-analysis-fast-quote-harness-recheck-20260519.json` produced a short read-only pass with no blockers.
- `npm run soak:pre-release-market:summary -- docs/archive/complete-analysis-fast-quote-harness-recheck-20260519.json --out docs/archive/complete-analysis-fast-quote-harness-recheck-20260519.md` produced the markdown summary.

Remaining need:

- A longer market-hours/browser responsiveness soak is still needed before treating the full product goal as complete.

Open browser blockers:

- Current-candle visual progression still needs stronger candle-level evidence.
- Duplicate toast suppression now has forced same-semantic proof at the agent-event-to-toast-store level.
- Longer live cadence observation is still needed before marking the final product goal complete.

## 4. Product icon source/cache/API/UI design

Current Araon state:

- `ProductAvatar` renders safe Toss static icon URLs and falls back to deterministic initials on error.
- `toss-product-icon.ts` sanitizes Toss static securities icon URLs and keeps a shared in-memory icon cache keyed by normalized product identity.
- `toss-portfolio-client.ts` parses `logoImageUrl`/`imageUrl`, exposes `iconUrl`, and seeds the shared icon cache.
- `toss-watchlist-client.ts` exposes direct `iconUrl` when present and can reuse cached portfolio/account icons when watchlist payloads omit icon fields.
- `app.ts` wires the same icon cache into portfolio and watchlist clients.
- `toss-sse-refresh-router.ts` maps `icon-refresh` to `icons`, and `toss-sse-refresh-executor.ts` clears the product icon cache before refreshing portfolio metadata.

External source evidence from the local `tossinvest-cli` repo:

- Public stock metadata fixture includes `logoImageUrl`.
- Authenticated asset-section fixture includes repeated `logoImageUrl` fields for positions/products.
- Reverse-engineering docs list:
  - `/api/v2/stock-infos/{code}` for product metadata.
  - `/api/v1/stock-infos?codes=...` for bulk metadata lookup.
  - `/api/v1/product/stock-prices?meta=true&productCodes=...` as a metadata-capable companion to quote batch.
- Push-event notes mention `icon-refresh`, but live icon refresh semantics are not fully captured.

Recommended implementation:

1. Add a `ProductIcon` read model:
   - `productCode`
   - `krTicker`
   - `market`
   - `iconUrl`
   - `source`
   - `fetchedAt`
   - `expiresAt`
   - `fallbackLabel`
2. Keep the current in-memory cache as the default product-safe baseline.
3. Decide whether icons need persistence; if yes, store only sanitized Toss static URLs and normalized product keys.
4. Connect `icons` refresh hints to cache invalidation or a bounded refresh queue.
5. Preserve the current payload-based API surface unless a bounded `/market/product-icons` endpoint becomes necessary.
6. Continue using the shared `ProductAvatar` component for account rail, favorites/watchlist, selected ticker, and optional TOP100 rows.
7. Preserve fallback avatar when icon fetch fails.

Required tests:

- parser/cache test for `logoImageUrl`.
- allowlist/sanitization test for icon URLs.
- portfolio -> watchlist shared-cache test.
- broken-image fallback test.
- UI render test for ProductAvatar fallback and icon mode.
- secret scan to ensure no Toss session/cookie/account/order data is stored in icon output.

Current completion estimate:

- Product icons: 100%.
- Source, safe shared-cache implementation, icon-refresh invalidation, fallback-safe UI, and browser image evidence are present. Cache persistence remains intentionally out of scope; runtime in-memory cache is the safer default before release.

## 5. Agent decision-support and trading readiness

Current implementation evidence:

- `order-intent-service.ts` rejects live mode and keeps previews simulated/local.
- Live policy snapshot keeps live execution disabled, policy not approved, and kill switch engaged.
- Approval challenge can be created/confirmed, but confirmation still returns locked/no execution.
- `market-movement-agent-event.ts` ignores TOP100 non-gainers for gainer-based market movement events.
- `agent-candidate-view-model.ts` converts events into user-facing stage/reason/freshness/confidence labels and removes raw provider/debug wording from normal UI.
- `agent-event-store.ts` persists event fields, but product identity/displayName/freshness are still partial.

What is ready:

- event queue shell,
- candidate view model,
- deterministic candidate scoring as a ranking aid,
- simulated preview shell,
- preview-only paper ledger persistence/API,
- approval/audit shell,
- live lock UI and backend policy,
- browser-visible home agent panel in 2-column desktop layout.

What is not ready:

- production strategy engine beyond the deterministic buy/sell/observe/ignore decision-support classifier,
- strategy policy,
- risk policy,
- paper trading result evaluation,
- Toss order adapter,
- live approval executor locked contract,
- execution reconciliation,
- agent performance audit,
- provider freshness gate,
- Toss signal request contract,
- full persistent event identity/displayName model.

Recommended next implementation order:

1. Extend normalized agent event identity:
   - preserve displayName/productCode/krTicker/market/freshness/source category.
2. Decision classification:
   - implemented in the client view model as `buy` / `sell` / `observe` / `ignore`.
   - upward/strong positive candidates render as `매수 검토`.
   - downward/risk candidates render as `매도 검토` and map to simulated sell preview.
   - weak/non-actionable candidates render as `관찰` or `제외`.
3. Add strategy policy v1:
   - momentum watchlist strategy.
   - sell-risk strategy for holdings.
4. Add risk policy v1:
   - allowed universe.
   - max order amount.
   - max daily loss.
   - cooldown.
   - market-hours/stale-data guard.
   - kill switch.
5. Add paper ledger before any live adapter.
   - preview-only persistent schema/API is implemented.
   - performance/result loop is still not implemented.
6. Keep Toss live order adapter behind a separate fresh approval lane.

Current completion estimates:

- Agent decision-support: 96%.
- Agent live trading readiness: 87%.

Latest implementation evidence:

- `src/server/agent/agent-event-public-payload.ts` now adds a redacted `decisionSupport` object to agent event payloads, with buy/sell/observe/ignore decision, policy version, deterministic score, strategy label, risk label, evaluation labels, readiness labels, explanation labels, and `liveExecutionLocked=true`.
- `src/client/lib/agent-candidate-view-model.ts` now exposes `buy` / `sell` / `observe` / `ignore` decision labels without exposing raw provider internals, and it prefers server-provided `decisionSupport` score and labels when present.
- `src/client/lib/agent-candidate-view-model.ts` now also exposes candidate strategy/risk/evaluation/readiness/explanation labels for user-facing decision support.
- `src/client/lib/agent-event-order-intent.ts` maps downward market movement to a simulated sell preview and keeps all previews non-live.
- `src/client/components/AgentEventsRail.tsx` and `src/client/components/AgentDecisionSummary.tsx` render the decision-support labels in the product UI.
- `src/server/agent/order-intent-service.ts` now emits deterministic strategy evaluation, live-lock risk policy, and paper ledger preview delta for simulated/paper previews.
- `src/server/agent/order-intent-service.ts` now emits a `previewImpact` explanation for expected position/cash impact, PnL non-calculation, and live-lock state without adding any live order path.
- `src/client/components/OrderIntentSafetyRail.tsx` and `src/client/components/OrderSafetyModal.tsx` render strategy/risk/paper-preview copy while hiding internal intent/audit/ledger ids.
- `src/client/components/OrderSafetyModal.tsx` renders the preview impact and PnL explanation in user-facing Korean copy.
- `src/server/agent/order-intent-service.ts` now exposes a locked `executionReadiness` contract for the Toss dry-run order adapter, network-before-blocked executor, fresh approval gate, and read-only reconciliation executor.
- `src/client/components/OrderSafetyModal.tsx` renders that contract as Korean product copy: Toss dry-run contract ready, network order blocked before request, fresh approval required, live execution locked, and read-only reconciliation planned. Internal enum values stay hidden from normal UI.
- `src/server/db/migrations/023-agent-order-intent-paper-ledger.sql` adds a preview-only paper ledger table. It records simulated preview deltas with `booked=false`; it does not record fills, PnL, or live order execution.
- `/agent/order-intents/paper-ledger` exposes a redacted preview-only paper ledger snapshot for UI/API clients.
- Focused agent tests passed:
  - `src/client/lib/__tests__/agent-candidate-view-model.test.ts`
  - `src/client/lib/__tests__/agent-event-order-intent.test.ts`
  - `src/client/components/__tests__/agent-events-rail.test.ts`
  - `src/client/components/__tests__/agent-decision-summary.test.ts`
  - `src/server/agent/__tests__/order-intent-service.test.ts`
  - `src/server/routes/__tests__/agent-order-intents.test.ts`
- `npm run typecheck` passed after fixing optional `iconUrl` propagation in `src/server/watchlist/araon-watchlist-service.ts`.
- Additional focused agent/order-intent safety tests passed after the execution readiness contract:
  - `src/client/components/__tests__/order-safety-modal.test.ts`
  - `src/client/components/__tests__/order-intent-safety-rail.test.ts`
  - `src/client/components/__tests__/agent-decision-summary.test.ts`
  - `src/client/lib/__tests__/api-client-order-intents.test.ts`
  - `src/server/agent/__tests__/order-intent-service.test.ts`
  - `src/server/agent/__tests__/order-intent-audit-store.test.ts`
- Additional locked executor/read-only reconciliation executor check passed:
  - `npm test -- src/server/agent/__tests__/order-intent-service.test.ts src/server/routes/__tests__/agent-order-intents.test.ts src/client/components/__tests__/order-safety-modal.test.ts`
- Additional read-only reconciliation snapshot API check passed:
  - `npm test -- src/server/agent/__tests__/order-intent-service.test.ts src/server/routes/__tests__/agent-order-intents.test.ts src/client/lib/__tests__/api-client-order-intents.test.ts`
  - `src/server/routes/__tests__/agent-order-intents.test.ts`
  - `src/server/db/__tests__/db.test.ts`
- Additional verification after the paper ledger slice:
  - focused agent/order-intent/db tests passed.
  - `npm run typecheck` passed.
  - `npm run build` passed.
  - `git diff --check` passed.

## 6. Updated 12-area closure checklist

| Area | Current | 100% remaining |
|---|---:|---|
| Toss TOP100 | 94% | longer market-hours browser evidence, product/diagnostic UI split |
| Toss fast quote lane | 96% | harness health criterion fixed and short read-only recheck passed for 100ms/200/400 bounded lane; longer UI responsiveness soak still needed |
| Watchlist/holdings merge | 93% | held-only favorite rows render as locked filled-star rows, and store-level remove keeps held rows visible while dropping only watchlist membership; live browser star/unstar QA remains |
| Favorites price/percent | 94% | watchlist-only rows with real history now derive session direction when quote percent is missing; stale/market-pause copy and longer browser evidence remain |
| Sparkline/history identity | 94% | read-only coverage probe and browser DOM proof now show current KR favorite rows have real renderable history; remaining work is broader route/cache audit for future unsupported/Toss-only rows |
| Chart | 93% | same-minute live quote merge now advances close/high/low/volume/sampleCount and exposes the resulting close/sampleCount through chart host QA attributes; market-hours browser proof and interval/range polish remain |
| KIS containment | 94% | TOP100 is fixed as a last-resort slot source behind watchlist/agent/current/news candidates, and footer KIS/REST/ranking internals are translated to 실시간 추적 product copy |
| Toss account rail | 92% | expired-session no-probe browser proof added; icon fallback edge QA and final cross-browser density QA remain |
| Product icons | 100% | safe cache/source pipeline, icon refresh invalidation, fallback-safe UI, browser image QA complete |
| Agent decision-support | 97% | deterministic strategy evaluation, server public event `decisionSupport`, policy version, score, buy/sell/observe/ignore client view model, candidate strategy/risk/evaluation/readiness/explanation labels, Agent summary policy surface, risk policy shell, explicit live-precondition risk checks, preview-only persistent paper ledger/API/store, preview-only performance-review API/UI surface, safety UI copy, locked execution-readiness contract, approval challenge order summary/hash/kill-switch evidence, and preview impact/PnL explanation now exist; richer strategy-policy outcome loop remains |
| Agent live trading readiness | 89% | locked readiness lane now has a Toss dry-run adapter contract, fresh approval gate, approval challenge intent hash/order summary/kill-switch state, confirm-time locked execution proof, network-before-blocked locked executor, live approval executor locked contract, read-only reconciliation executor contract, read-only reconciliation snapshot API, explicit live-precondition risk checks, preview-only paper ledger, preview-only performance review, and a locked data freshness gate in API/UI summary, but live Toss adapter and real fill reconciliation loop are not complete |
| Commit readiness | 74% | latest status/stat refreshed, Agent locked-readiness migration and API/UI/test ownership assigned to Slice E, locked executor/read-only reconciliation snapshot tests are green, an executable staging manifest maps A/F/G/B/C/E/D/cross-slice ownership, and the commit-slice coverage probe classifies all 178 dirty/untracked entries with zero unknowns; actual staging, screenshots decision, and commit messages still require user approval |

## 7. Current blockers

- Product icon pipeline has a safe shared-cache implementation, icon-refresh cache invalidation, fallback-safe UI, and browser image evidence.
- Toss account rail now keeps clearly expired Toss sessions login-gated without probing account summary. Focused loader tests pass, and a fresh 1600x1000 browser tab after Vite restart recorded `summaryRequestCount=0` for `/toss/account/summary` while showing the login-needed state.
- Watchlist/holdings merge now keeps held-only rows visually inside the favorite
  surface: the UI preserves `watchlistMember=false` provenance, but renders a
  locked filled star with "보유 종목은 자동 유지됩니다" instead of an empty star.
  Store-level remove now also keeps held rows on the watch surface while only
  dropping watchlist membership, preventing legacy helper use from hiding a
  holding. Focused tests pass for the component, store, server service, route,
  and product-aware UI helper.
- KIS containment now has focused proof that `top100_rotation` never displaces
  watchlist, agent, current-view, or fresh event candidates within the cap.
  StatusBar KIS/REST/ranking/provider-class copy is also translated into
  product-facing "실시간 추적" copy.
- Sparkline/history identity has a new read-only coverage probe: `npx tsx scripts/internal/probes/probe-favorite-sparkline-coverage.mts --require-complete` checked the current user-facing KR watchlist/holding surface without exposing raw watchlist values and returned complete=true, checked=9, renderable=9, flat=0, missing=0, failed=0. A 1600x1000 browser DOM pass also found the favorites block with 9 rows and 9 stock-row sparklines rendered.
- Agent live trading readiness is intentionally not complete; the current implementation stops at simulated/paper preview, preview-only paper ledger persistence/API/UI summary, preview-only performance review, visible live lock, approval challenge order summary/hash/kill-switch evidence, confirm-time locked execution proof, network-before-blocked locked executor contract, live approval executor locked contract, read-only reconciliation snapshot API, and a locked data freshness gate. It still has no live order adapter or real fill reconciliation loop.
- Fast quote harness health criterion has been reconciled in code/tests, and a short read-only recheck passed. Longer browser responsiveness soak remains.
- Duplicate toast suppression has short live-browser evidence and a forced same-semantic test proof.

## 8. 2026-05-19 product icon cache retry evidence

The stuck edit was retried as a small product-icon cache slice.

Implemented evidence:

- `toss-product-icon.ts` now keeps a sanitized in-memory Toss static icon cache keyed by normalized product identity.
- `toss-portfolio-client.ts` seeds the cache from portfolio `logoImageUrl`/`imageUrl`.
- `toss-watchlist-client.ts` can reuse that cache when watchlist rows omit icon fields.
- `app.ts` wires one shared cache into both clients.
- `icon-refresh` / `icons` hints now clear the shared cache before refreshing portfolio metadata.
- Toss session clear now also clears the shared icon cache.
- Focused tests cover URL sanitization, normalized cache lookup, portfolio cache seeding, and watchlist cache reuse.

Verification:

- `npm test -- src/server/toss/__tests__/toss-sse-refresh-executor.test.ts src/server/toss/__tests__/toss-product-icon.test.ts src/server/toss/__tests__/toss-portfolio-client.test.ts src/server/toss/__tests__/toss-watchlist-client.test.ts`: PASS, 23 tests.
- `npm test -- src/client/lib/__tests__/agent-event-toast.test.ts src/client/stores/__tests__/toast-store.test.ts`: PASS, 19 tests. This proves equivalent realtime momentum agent events with different event ids share one semantic `0-30s` cooldown key and replace the visible toast instead of stacking.
- `npm test`: PASS, 230 files / 1550 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS before and after this documentation update.
- Browser QA at 1600x1000: 12 image elements loaded, 0 broken images, Toss static product icons rendered through the normal UI.
- Full chart expansion/no-scroll behavior is browser-verified; current-candle DOM progression is browser-verified for bucket/count advancement. Focused component proof now confirms same-minute live quotes advance close/sampleCount without synthetic candles; market-hours browser proof still remains.
- Commit slicing now has an executable staging manifest, but no staging/commit has been performed because user approval is required.

## 9. 2026-05-19 live approval executor locked-contract evidence

Implemented evidence:

- `OrderIntentExecutionReadiness.liveApprovalExecutor` now explicitly models the post-confirmation live approval executor as `ready_locked`.
- The executor blocks after a confirmed approval challenge and before any Toss order adapter connection.
- `liveMutationEnabled=false` remains part of the API contract.
- The safety modal now shows this in Korean product copy as `승인 후에도 주문 연결 전 차단`.
- This narrows the previous live readiness blocker from "live approval executor missing" to "live Toss order adapter and real fill reconciliation loop are not complete".

Verification:

- `npm test -- src/server/agent/__tests__/order-intent-service.test.ts src/server/routes/__tests__/agent-order-intents.test.ts src/client/components/__tests__/order-safety-modal.test.ts src/client/lib/__tests__/api-client-order-intents.test.ts`: PASS, 4 files / 20 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, with the existing Vite chunk-size warning only.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS, issueCount=0.
- Non-doc/non-test changed-file secret-pattern scan: PASS, 0 matches. Broad full-tree scan still reports expected test fixtures and sanitizer/redaction regexes.

## 10. 2026-05-19 chart current-candle sample proof

Implemented evidence:

- Same-minute live quote merge now increments the current candle `sampleCount`.
- The same real quote sample updates current candle close, high/low, volume, source, and partial state.
- The rendered chart host exposes the updated `data-latest-candle-close`, `data-latest-candle-sample-count`, `data-latest-candle-source`, and `data-latest-candle-partial` attributes for browser QA.
- No synthetic candle or fake movement was introduced.

Verification:

- `npm test -- src/client/components/__tests__/stock-candle-chart.test.ts`: PASS, 22 tests.
- `npm run typecheck`: PASS.
- `git diff --check`: PASS.

## 11. 2026-05-19 agent preview impact explainability proof

Implemented evidence:

- `OrderIntentPreview` now includes a `previewImpact` block derived only from the order intent input: quantity, cash amount, limit price, side, and market.
- The impact block explains estimated notional, position effect, cash effect, why PnL is not computed before fills/average-cost reconciliation, and why live execution remains locked.
- `OrderSafetyModal` now surfaces the impact and PnL explanation in Korean product copy, instead of only showing a terse paper-ledger delta.
- No live order, order cancel/amend, account mutation, or auto-trading path was added.

Verification:

- `npm test -- src/server/agent/__tests__/order-intent-service.test.ts src/server/agent/__tests__/order-intent-audit-store.test.ts src/server/routes/__tests__/agent-order-intents.test.ts src/client/components/__tests__/order-safety-modal.test.ts src/client/components/__tests__/order-intent-safety-rail.test.ts src/client/lib/__tests__/api-client-order-intents.test.ts`: PASS, 6 files / 26 tests.
- `npm test -- src/server/db/__tests__/db.test.ts src/server/agent/__tests__/order-intent-service.test.ts src/server/agent/__tests__/order-intent-audit-store.test.ts src/server/routes/__tests__/agent-order-intents.test.ts src/client/components/__tests__/order-safety-modal.test.ts`: PASS, 5 files / 28 tests.
- `npm test`: PASS, 230 files / 1566 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, with the existing Vite chunk-size warning only.
- `git diff --check`: PASS.

Updated completion estimate:

- 12-area average: 91.7%.
- Excluding commit readiness: 93.6%.
- Agent decision-support: 90% -> 93%.

## 12. 2026-05-19 watchlist held-remove provenance proof

Implemented evidence:

- `useWatchlistStore.removeFavorite()` now preserves held rows in the Araon
  watch surface.
- For held rows, remove drops `watchlistMember` and `manualWatchlist`, then
  restores `membershipSource='holding_auto'` and `autoSyncedFromHolding=true`.
- This matches the product rule: a user may remove Toss watchlist membership,
  but a currently held product must stay visible while the account position
  exists.
- No live Toss watchlist mutation was run.

Verification:

- `npm test -- src/server/watchlist/__tests__/araon-watchlist-service.test.ts src/client/components/__tests__/favorites-block.test.ts src/client/stores/__tests__/watchlist-store.test.ts`: PASS, 3 files / 37 tests.
- `git diff --check`: PASS before this documentation update.

## 13. 2026-05-19 favorite price/percent real-history fallback proof

Implemented evidence:

- `FavoritesBlock` now derives a watchlist-only row direction from real local
  price history when the quote payload has a price but no `changePct`.
- The fallback uses only first/last real history prices. It does not create fake
  movement, fake candles, or synthetic financial data.
- SSR/browser first render is more stable because the row can use the current
  price-history snapshot when the subscribed hook value is still empty.
- This reduces the visible "price only / 등락률 수집 중" state for rows that
  already have real sparkline history.

Verification:

- `npm test -- src/client/components/__tests__/favorites-block.test.ts src/client/stores/__tests__/watchlist-store.test.ts src/server/watchlist/__tests__/araon-watchlist-service.test.ts`: PASS, 3 files / 38 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, with the existing Vite chunk-size warning only.
- `git diff --check`: PASS before this documentation update.

## 14. 2026-05-19 agent risk-policy explainability proof

Implemented evidence:

- `buildOrderIntentRiskChecks()` now exposes the locked live lane as separate
  precondition checks instead of one opaque lock.
- The current locked readiness contract now distinguishes fresh approval policy,
  allowed universe, maximum order amount, maximum daily loss, trading-hours
  guard, order-type policy, cooldown, and kill-switch release.
- `OrderSafetyModal` summarizes those checks as user-facing counts, for example
  `7개 차단 · 1개 경고 · 모의만`.
- Normal UI still does not render internal risk-check codes.
- No live order, order cancel/amend, account mutation, Toss watchlist mutation,
  or auto-trading path was added.

Verification:

- TDD red proof: `npm test -- src/server/agent/__tests__/order-intent-service.test.ts src/client/components/__tests__/order-safety-modal.test.ts` failed before implementation because only one risk check existed and the modal did not summarize multiple checks.
- `npm test -- src/server/agent/__tests__/order-intent-service.test.ts src/client/components/__tests__/order-safety-modal.test.ts`: PASS, 2 files / 8 tests.
- `npm test -- src/server/agent/__tests__/order-intent-service.test.ts src/server/agent/__tests__/order-intent-audit-store.test.ts src/server/routes/__tests__/agent-order-intents.test.ts src/client/components/__tests__/order-safety-modal.test.ts src/client/components/__tests__/order-intent-safety-rail.test.ts src/client/lib/__tests__/api-client-order-intents.test.ts`: PASS, 6 files / 27 tests.
- `npm test`: PASS, 230 files / 1567 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, with the existing Vite chunk-size warning only.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS, issueCount=0.
- Changed/untracked high-confidence secret assignment scan: only existing test fixture placeholders matched; non-test/non-doc changed-file scan returned 0.

Updated completion estimate:

- 12-area average: 91.9%.
- Excluding commit readiness: 93.9%.
- Agent decision-support: 96%.
- Agent live trading readiness: 87%.

## 15. 2026-05-19 agent candidate explanation proof

Implemented evidence:

- `AgentCandidateViewModel` now exposes user-facing `strategyLabel`,
  `riskLabel`, and `explanationLabels`.
- Upward market movement candidates show `단기 모멘텀` and a locked simulated
  risk lane.
- Downward market movement candidates show `하락 방어`, not a misleading
  급상승 interpretation.
- Low-confidence news/disclosure/signal candidates stay in `정보 관찰`.
- Skipped candidates stay in `제외` and keep the sanitized skip reason.
- `AgentDecisionSummary` now renders the latest candidate's strategy/risk
  policy line without exposing provider source, payload, or dedupe internals.
- No live order, order cancel/amend, account mutation, Toss watchlist mutation,
  or auto-trading path was added.

Verification:

- TDD red proof: `npm test -- src/client/lib/__tests__/agent-candidate-view-model.test.ts`
  failed before implementation because `strategyLabel`, `riskLabel`, and
  `explanationLabels` were missing.
- TDD red proof: `npm test -- src/client/components/__tests__/agent-decision-summary.test.ts`
  failed before UI implementation because the latest candidate did not render
  the policy labels.
- `npm test -- src/client/lib/__tests__/agent-candidate-view-model.test.ts src/client/components/__tests__/agent-decision-summary.test.ts`: PASS, 2 files / 12 tests.

Updated completion estimate:

- 12-area average: 91.9%.
- Excluding commit readiness: 93.9%.
- Agent decision-support: 96%.
- Agent live trading readiness: 87%.

## 16. 2026-05-19 server decision-support payload proof

Implemented evidence:

- `AgentEventNotificationPayload` now has optional `decisionSupport`.
- `agentEventToPublicPayload()` always emits a redacted decision-support object
  for browser/API agent events.
- Upward movement events classify as `buy` with `단기 모멘텀`.
- Downward movement events classify as `sell` with `하락 방어`, so TOP100 하락
  does not masquerade as upside surge.
- Skipped events classify as `ignore` and preserve only a sanitized skip reason.
- Client candidate view models now prefer server-provided decision-support labels
  when present, keeping API and UI policy language aligned.
- No live order, order cancel/amend, account mutation, Toss watchlist mutation,
  or auto-trading path was added.

Verification:

- TDD red proof: `npm test -- src/server/agent/__tests__/agent-event-public-payload.test.ts`
  failed before implementation because `decisionSupport` was missing.
- TDD red proof: `npm test -- src/client/lib/__tests__/agent-candidate-view-model.test.ts`
  failed before implementation because the client ignored server-provided
  decision-support labels.
- `npm test -- src/client/lib/__tests__/agent-candidate-view-model.test.ts src/server/agent/__tests__/agent-event-public-payload.test.ts`: PASS, 2 files / 16 tests.
- `npm run typecheck`: PASS.

Updated completion estimate:

- 12-area average: 91.9%.
- Excluding commit readiness: 93.9%.
- Agent decision-support: 96%.
- Agent live trading readiness: 87%.

## 17. 2026-05-19 decision-support policy metadata proof

Implemented evidence:

- `AgentEventDecisionSupportPayload` now carries `policyVersion`, deterministic
  `score`, `evaluationLabels`, and `readinessLabels` in addition to
  buy/sell/observe/ignore, strategy/risk/explanation labels, and
  `liveExecutionLocked=true`.
- Server public agent events now expose a redacted policy metadata contract such
  as `araon-agent-decision-v1`, `점수 n`, `시장 움직임 후보`, `신선도 높음`,
  and locked-readiness labels.
- Client candidate view models now prefer the server-provided decision score and
  policy labels when present, keeping API and UI explainability aligned.
- `AgentDecisionSummary` renders the latest candidate score/evaluation labels in
  the product UI without exposing provider source, payload, dedupe keys, or raw
  ids.
- No live order, order cancel/amend, account mutation, Toss watchlist mutation,
  or auto-trading path was added.

Verification:

- TDD red proof: `npm test -- src/server/agent/__tests__/agent-event-public-payload.test.ts src/client/lib/__tests__/agent-candidate-view-model.test.ts`
  failed before implementation because policy metadata was missing and the
  client ignored the server score.
- TDD red proof: `npm test -- src/client/components/__tests__/agent-decision-summary.test.ts`
  failed before implementation because the summary did not render score/evaluation
  labels.
- `npm test -- src/client/components/__tests__/agent-decision-summary.test.ts src/client/lib/__tests__/agent-candidate-view-model.test.ts src/server/agent/__tests__/agent-event-public-payload.test.ts src/server/routes/__tests__/agent-events.test.ts src/server/sse/__tests__/sse-manager.test.ts`:
  PASS, 5 files / 31 tests.
- `npm run typecheck`: PASS.

Updated completion estimate:

- 12-area average: 91.9%.
- Excluding commit readiness: 93.9%.
- Agent decision-support: 96%.
- Agent live trading readiness: 87%.

## 18. 2026-05-19 preview-only performance review proof

Implemented evidence:

- Added `/agent/order-intents/performance-review` as a read-only, preview-only
  performance review snapshot.
- The snapshot is derived only from the paper-preview ledger. It does not invent
  fills, execution results, PnL, or market outcomes.
- Each review item is marked `pending_market_result`, `booked=false`, and
  `liveMutationEnabled=false`.
- `snapshotLivePolicy()` now marks `agent_performance_audit` as `partial`
  instead of `not_ready`, because the agent can review preview-only decisions
  while live/fill outcome review remains locked.
- `AgentDecisionSummary` now renders a compact `성과 리뷰` surface with pending
  review count and `시장 결과 대기` copy.
- No live order, order cancel/amend, account mutation, Toss watchlist mutation,
  or auto-trading path was added.

Verification:

- TDD red proof: `npm test -- src/server/routes/__tests__/agent-order-intents.test.ts src/client/components/__tests__/agent-decision-summary.test.ts`
  failed before implementation because the performance-review route did not
  exist and the Agent summary did not render `성과 리뷰`.
- `npm test -- src/server/routes/__tests__/agent-order-intents.test.ts src/client/components/__tests__/agent-decision-summary.test.ts`:
  PASS, 2 files / 12 tests.
- `npm test -- src/server/routes/__tests__/agent-order-intents.test.ts src/server/agent/__tests__/order-intent-service.test.ts src/server/agent/__tests__/order-intent-audit-store.test.ts src/client/lib/__tests__/api-client-order-intents.test.ts src/client/components/__tests__/agent-decision-summary.test.ts src/client/components/__tests__/order-safety-modal.test.ts src/client/components/__tests__/order-intent-safety-rail.test.ts`:
  PASS, 7 files / 31 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, with the existing Vite chunk-size warning only.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS,
  issueCount=0.

Updated completion estimate:

- 12-area average: 92.1%.
- Excluding commit readiness: 94.1%.
- Agent decision-support: 97%.
- Agent live trading readiness: 88%.

## 19. 2026-05-19 commit-slice coverage probe proof

Implemented evidence:

- Added `scripts/internal/probes/probe-commit-slice-coverage.mts` as an internal
  no-mutation probe for the current dirty tree.
- The probe reads `git status --short -uall`, classifies every dirty/untracked
  path into Slice A/F/G/B/C/E/D, cross-slice hunk review, or excluded visual
  artifact, and fails if any path is unknown.
- This does not stage or commit anything. It only proves that the current dirty
  tree has no unclassified file before the user approves commit slicing.

Verification:

- `npx tsx scripts/internal/probes/probe-commit-slice-coverage.mts`: PASS.
- Current result: 178 dirty/untracked entries, unknown=0.
- Counts:
  - A docs/evidence: 30
  - F CLI/package: 1
  - G KIS containment: 8
  - B Toss identity/watchlist: 26
  - C realtime/chart/surge: 29
  - E agent safety: 33
  - D frontend UI: 28
  - cross-slice hunk review: 11
  - excluded visual artifact: 12

Updated completion estimate:

- 12-area average: 92.4%.
- Excluding commit readiness: 94.1%.
- Commit readiness: 74%.

Remaining commit-readiness blockers:

- No staging/commit before explicit user approval.
- Cross-slice files still need hunk-level staging review.
- Screenshot artifacts still need final include/exclude decision.
- Per-slice focused tests must be rerun after actual staged slices are created.

## 20. 2026-05-19 data freshness gate locked-readiness proof

Implemented evidence:

- `OrderIntentExecutionReadiness` now includes a `dataFreshnessGate` contract.
- The gate requires quote, chart, news/disclosure, and watchlist membership
  freshness before any future live execution lane can proceed.
- The gate is `ready_locked`, `blocksLiveExecution=true`, and
  `liveMutationEnabled=false`.
- `provider_freshness` moved from `not_ready` to `partial`, because the locked
  readiness contract now exists while live freshness validation remains locked.
- `OrderSafetyModal` renders the gate in Korean product copy as
  `데이터 신선도` and `가격/차트/뉴스·공시 확인 전 차단`.
- No live order, order cancel/amend, account mutation, Toss watchlist mutation,
  or auto-trading path was added.

Verification:

- TDD red proof:
  `npm test -- src/server/routes/__tests__/agent-order-intents.test.ts src/server/agent/__tests__/order-intent-service.test.ts src/client/components/__tests__/order-safety-modal.test.ts`
  failed before implementation because the live policy did not expose the
  freshness gate and the safety modal did not render it.
- After implementation, the same command passed: 3 files / 18 tests.

Updated completion estimate:

- 12-area average: 92.5%.
- Excluding commit readiness: 94.2%.
- Agent live trading readiness: 89%.

Remaining live-readiness blockers:

- No live Toss order adapter.
- No real fill reconciliation loop.
- No live strategy/risk policy approval lane.
- Data freshness is now a locked contract, not a live runtime unlock.

## 21. Recommended next actions

1. Do not stage yet.
2. Review this audit with the authoritative complete-analysis doc.
3. Decide whether the next goal should be:
   - commit slicing only,
   - product icons implementation,
   - agent decision policy foundation,
   - or another market-hours evidence pass.
4. If commit slicing is approved, start with Slice A docs/evidence, then F/G/B/C/E/D, then cross-slice verification.
