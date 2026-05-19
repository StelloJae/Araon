# Araon Commit Slice Plan

Date: 2026-05-17

Authoritative basis: `docs/research/araon-release-readiness-live-watchlist-agent-roadmap.md`

Status: executed after explicit user approval on 2026-05-19. The original
planning details remain below for review context.

## 0. 2026-05-19 current-state update

This document remains useful for the high-level commit order, but its original
file counts are stale. The current active complete-analysis goal re-audited the
dirty tree on 2026-05-19.

Use this latest document as the current slice map before staging:

- `docs/research/araon-complete-analysis-followup-execution-audit.md`

Current recommended order remains unchanged:

1. Slice A - docs/evidence/artifacts
2. Slice F - CLI/package
3. Slice G - KIS containment
4. Slice B - Toss backend/product identity/watchlist
5. Slice C - realtime/chart/surge
6. Slice E - agent safety/decision-support
7. Slice D - frontend product UI
8. Cross-slice/shared integration

Important current notes:

- The latest coarse classification is in the follow-up audit, not in the
  original 2026-05-17 file list below.
- 2026-05-19 product-100 continuation added product icon and agent decision
  changes that must be staged with the correct slices, not as a single mixed
  commit.
  - `src/server/toss/toss-product-icon.ts` and its test belong to Slice B.
  - `src/client/components/ProductAvatar.tsx` belongs to Slice D.
  - `src/client/components/AgentDecisionSummary.tsx`,
    `src/client/lib/agent-candidate-view-model.ts`, and agent decision tests
    belong to Slice E.
  - `src/client/lib/agent-event-order-intent.ts` now maps downward movement to
    simulated sell previews and remains Slice E.
  - `src/server/db/migrations/023-agent-order-intent-paper-ledger.sql`,
    `/agent/order-intents/paper-ledger`, and related client/server tests belong
    to Slice E. They are preview-only paper trading ledger plumbing, not live
    execution.
  - `src/server/db/migrations/024-agent-order-intent-approval-readiness.sql`,
    approval challenge order summary/hash/kill-switch fields, and the
    `OrderIntentSafetyRail` display belong to Slice E. This is locked-readiness
    evidence only, not live execution.
  - `ConfirmOrderIntentApprovalChallengePayload.lockedExecutionProof` and
    service/route tests belong to Slice E. It proves confirmation still produces
    a blocked dry-run result, with `execution=null`.
  - `OrderIntentExecutionReadiness.lockedExecutor`,
    `reconciliation.executor`, and the `OrderSafetyModal` Korean safety copy
    belong to Slice E. They prove the live lane is blocked before any network
    order request and only creates locked proof/read-only reconciliation
    contracts.
  - `/agent/order-intents/reconciliation`,
    `getAgentOrderIntentReconciliation`, and related service/route/client tests
    belong to Slice E. They expose confirmed approval challenges as
    `not_submitted_live_locked` read-only snapshots with `execution=null` and
    `liveSubmittedCount=0`.
  - `src/client/App.tsx` has mixed hunks. The order-intent paper-ledger fetch
    and `AgentDecisionSummary` wiring belong to Slice E; account rail, chart,
    favorites, and layout hunks belong to Slice D/cross-slice.
  - `src/client/components/StatusBar.tsx` has mixed hunks. Footer fast-price
    product copy belongs to Slice D; KIS/REST/ranking wording containment in
    `KisBudgetPill` belongs to Slice G.
  - `src/client/components/FavoritesBlock.tsx` held-only filled-star behavior
    belongs to Slice D with watchlist/holdings merge review context from Slice B.
- `scripts/internal/probes/probe-favorite-sparkline-coverage.mts` belongs to
  Slice C as internal read-only evidence tooling for sparkline/history
  coverage. It must stay out of npm package output and must not print raw
  watchlist values.
- `scripts/internal/probes/probe-commit-slice-coverage.mts` belongs to the
  cross-slice commit-readiness tooling lane. It is a no-mutation probe that
  classifies current dirty/untracked paths and fails if any entry is unknown.
- `status-bar.test.ts` was flagged by the coarse classifier as Slice F, but
  likely belongs to Slice D or cross-slice during hunk-level staging.
- Screenshot artifacts should not be committed by default unless explicitly
  selected as evidence artifacts.
- No staging or commit has been performed.

## 0.1 2026-05-19 executable staging manifest

This section is a proposed staging manifest only. Do not run these commands
until the user explicitly approves staging/committing.

Snapshot:

- `git status --short -uall`: 178 entries after the latest
  commit-readiness probe and Agent performance-review slice.
- `git diff --stat`: 107 tracked files changed, 9652 insertions, 1232 deletions.
- Root screenshot PNGs remain untracked and excluded by default.
- No `dist/` build output is dirty in the current snapshot.
- No staging or commit has been performed.
- `npx tsx scripts/internal/probes/probe-commit-slice-coverage.mts`: PASS,
  unknown=0 across all 178 dirty/untracked entries.

### Slice A - docs/evidence/artifacts

Stage:

- `docs/research/araon-*.md`
- `docs/research/toss-fast-quote-surge-lane-goal.md`
- `docs/archive/complete-analysis-*.md`
- `docs/archive/complete-analysis-*.json`
- `docs/archive/pre-release-market-evidence-20260518-*.md`
- `docs/archive/pre-release-market-evidence-20260518-*.json`

Proposed command after approval:

```bash
git add -- docs/research/araon-*.md docs/research/toss-fast-quote-surge-lane-goal.md \
  docs/archive/complete-analysis-*.md docs/archive/complete-analysis-*.json \
  docs/archive/pre-release-market-evidence-20260518-*.md \
  docs/archive/pre-release-market-evidence-20260518-*.json
```

Exclude by default:

- Repo-root visual QA screenshots such as `araon-*.png`.
- They can be archived separately if the user wants screenshot evidence in git.

Draft commit:

- `docs: record Araon product-100 evidence and commit plan`

### Slice F - CLI/package

Stage:

- `package.json`
- Any CLI files only if they still appear dirty in the final pre-stage status.

Current command is intentionally narrow:

```bash
git add -- package.json
```

Draft commit:

- `chore: update Araon package scripts for product checks`

### Slice G - KIS containment / optional realtime tracking

Stage:

- `src/server/realtime/kis-ws-slot-allocator.ts`
- `src/server/realtime/kis-ws-slot-candidates.ts`
- `src/server/realtime/kis-ws-slot-session-rebalancer.ts`
- `src/server/realtime/__tests__/kis-ws-slot-allocator.test.ts`
- `src/server/realtime/__tests__/kis-ws-slot-candidates.test.ts`
- `src/server/realtime/__tests__/kis-ws-slot-session-rebalancer.test.ts`
- `src/server/routes/kis-ws-slots.ts`
- `src/server/routes/__tests__/kis-ws-slots.test.ts`
- KIS wording hunks in `src/client/components/StatusBar.tsx` only if split from product UI hunks.

Proposed command after approval:

```bash
git add -- src/server/realtime/kis-ws-slot-allocator.ts \
  src/server/realtime/kis-ws-slot-candidates.ts \
  src/server/realtime/kis-ws-slot-session-rebalancer.ts \
  src/server/realtime/__tests__/kis-ws-slot-allocator.test.ts \
  src/server/realtime/__tests__/kis-ws-slot-candidates.test.ts \
  src/server/realtime/__tests__/kis-ws-slot-session-rebalancer.test.ts \
  src/server/routes/kis-ws-slots.ts \
  src/server/routes/__tests__/kis-ws-slots.test.ts
```

Draft commit:

- `refactor: contain KIS as optional realtime tracking`

### Slice B - Toss backend / identity / watchlist

Stage:

- `src/shared/product-identity.ts`
- `src/shared/types.ts`
- `src/shared/__tests__/product-identity.test.ts`
- `src/server/watchlist/araon-watchlist-service.ts`
- `src/server/watchlist/__tests__/araon-watchlist-service.test.ts`
- `src/server/toss/toss-watchlist-client.ts`
- `src/server/toss/toss-portfolio-client.ts`
- `src/server/toss/toss-product-icon.ts`
- `src/server/toss/toss-cdp-login-service.ts`
- `src/server/toss/toss-login-capture-smoke.ts`
- Toss watchlist/portfolio/icon/login tests.
- `src/server/routes/watchlist.ts`
- `src/server/routes/toss-auth.ts`
- `src/server/routes/__tests__/watchlist.test.ts`
- `src/server/routes/__tests__/toss-auth.test.ts`
- Product identity/watchlist DB migrations that are not agent-only.
- Watchlist/account API hunks in `src/server/app.ts`, `src/server/routes/stocks.ts`, and `src/client/lib/api-client.ts` only after hunk review.

Draft commit:

- `feat: make Toss watchlist and product identity primary`

### Slice C - realtime / TOP100 / surge / chart

Stage:

- `src/server/toss/toss-fast-quote-lane.ts`
- `src/server/toss/toss-quote-polling-service.ts`
- `src/server/toss/toss-sse-refresh-executor.ts`
- Matching Toss fast quote / quote polling / SSE refresh tests.
- `src/server/market/market-top-movers-service.ts`
- `src/server/routes/stocks.ts` realtime/chart hunks.
- `src/server/routes/runtime.ts`
- `src/server/routes/__tests__/candles.test.ts`
- `src/server/routes/__tests__/price-history.test.ts`
- `src/server/routes/__tests__/runtime.test.ts`
- `src/server/routes/__tests__/stock-timeline.test.ts`
- `scripts/internal/probes/probe-favorite-sparkline-coverage.mts`
- `scripts/internal/soak/pre-release-market-evidence*.mts`
- Chart/realtime client hunks in `StockCandleChart`, `SurgeBlock`, `TopMoversBoard`,
  `usePersistedPriceHistory`, `surge-aggregator`, and related tests.

Draft commit:

- `feat: stabilize Toss realtime quote, surge, and chart paths`

### Slice E - agent safety / decision-support

Stage:

- `src/server/agent/**`
- `src/server/routes/agent-order-intents.ts`
- `src/server/routes/__tests__/agent-order-intents.test.ts`
- Agent DB migrations `020`, `023`, and `024`.
- `src/client/components/AgentDecisionSummary.tsx`
- `src/client/components/AgentEventsRail.tsx`
- `src/client/components/OrderIntentSafetyRail.tsx`
- `src/client/components/OrderSafetyModal.tsx`
- `src/client/lib/agent-candidate-view-model.ts`
- `src/client/lib/agent-event-order-intent.ts`
- `src/client/lib/agent-event-toast.ts`
- Agent/order-intent/toast tests.
- Agent hunks in `src/client/App.tsx` and `src/client/lib/api-client.ts` only after hunk review.

Draft commit:

- `feat: add locked agent decision-support and paper preview lane`

### Slice D - frontend product UI

Stage:

- `src/client/components/ProductAvatar.tsx`
- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/TossAccountRail.tsx`
- `src/client/components/StatusBar.tsx` product UI hunks.
- `src/client/components/SettingsModal.tsx`
- `src/client/components/StockRow.tsx`
- `src/client/components/DashboardFocusPanel.tsx`
- `src/client/components/SectionStack.tsx`
- `src/client/components/StockNewsDisclosurePanel.tsx`
- `src/client/components/SSEIndicator.tsx`
- `src/client/styles/global.css`
- UI-focused client tests, product display-name hooks/stores, and product avatar tests.
- Layout/account/favorites hunks in `src/client/App.tsx`.

Draft commit:

- `feat: polish Araon v7 product UI surfaces`

### Cross-slice hunk-review list

These files must not be staged blindly:

- `src/client/App.tsx`
- `src/client/lib/api-client.ts`
- `src/client/components/StatusBar.tsx`
- `src/client/styles/global.css`
- `src/server/app.ts`
- `src/server/routes/stocks.ts`
- `src/server/routes/runtime.ts`
- `src/server/routes/watchlist.ts`
- `package.json`
- `scripts/internal/probes/probe-commit-slice-coverage.mts`

Rule:

- Prefer `git add -p` or split patches by slice.
- If hunk boundaries are too coarse, create a temporary patch file and apply
  slice-specific hunks manually.
- Run focused tests for the staged slice before commit.

## 1. Snapshot

The current worktree is intentionally large and must not be reviewed as one giant change.

- Dirty/untracked entries from `git status --short -uall`: 174 on 2026-05-19 after the latest Agent locked-readiness slice.
- Tracked diff stat from `git diff --stat`: 104 files changed, 8239 insertions, 1220 deletions.
- No dirty `dist/` build output appeared in the status snapshot.
- Local screenshot artifacts remain untracked and should not be committed by default unless selected as explicit visual evidence.
- `src/client/components/ViewToggle.tsx` is a tracked deletion and belongs to the frontend v7 UI cleanup slice, not an immediate removal candidate.
- `scripts/internal/probes/**` entries are internal probe/smoke tools. Keep them out of the npm package unless package policy is explicitly changed.

Important safety constraints:

- Do not revert user changes.
- Do not run additional live Toss watchlist mutation.
- Do not run order/cancel/amend/account mutations.
- Do not expose raw Toss/KIS/session/account/order/watchlist values in docs, stdout, or diffs.

## 2. Recommended Commit Order

This order keeps review load small while preserving dependency flow.

1. **Slice A - Product/design/research docs**
   - Commit first because it explains the rest of the release.
   - Pure documentation/research should be easiest to review.

2. **Slice F - CLI/PATH/packaging**
   - Commit early because it has separate acceptance criteria and packaging risk.
   - Verification is mostly CLI help/version/doctor/package dry-run.

3. **Slice G - KIS containment/optional realtime tracking**
   - Commit before Toss-primary backend if routes or runtime status depend on the new KIS role language.
   - Keep this focused on optional "실시간 추적" rather than data truth.

4. **Slice B - Toss-primary backend data surfaces**
   - Commit the Toss-auth/session/account/portfolio/watchlist/search/product identity surfaces together.
   - The previous Toss watchlist remove fallback patch and its tests belong here.

5. **Slice C - realtime/TOP100/surge/chart progression**
   - Commit after Slice B because it depends on Toss quote/ranking surfaces and product identity.
   - Keep realtime-like fast quote distinct from broad REST polling.

6. **Slice E - agent event/order-intent safety foundation**
   - Commit after data/realtime surfaces because agent events consume those normalized events.
   - Safety and audit boundaries should be reviewed separately from frontend layout.

7. **Slice D - frontend v7 product UI**
   - Commit after backend/agent routes so UI review can map to real APIs.
   - This is visually large and should have its own browser QA evidence.

8. **Cross-slice integration seams**
   - Either commit as a final integration slice or split individual hunks into the relevant prior commits.
   - Files here need hunk-level review before staging.

## 3. Slice A - Product/design/research docs

Purpose:

- Preserve the product direction, design system, v7 frontend plan, and release-readiness audit trail.
- Provide the review context for why Toss-primary, KIS realtime-only, agent safety, and v7 UI changes exist.

Files:

- `M  docs/research/toss-first-provider-migration.md`
- `?? docs/design.md`
- `?? docs/frontend-redesign-brief.md`
- `?? docs/frontend-v7-final-gap-plan.md`
- `?? docs/frontend-v7-followup-quality-plan.md`
- `?? docs/research/araon-final-product-completion-audit.md`
- `?? docs/research/araon-final-product-execution-goal.md`
- `?? docs/research/araon-final-product-progress-audit.md`
- `?? docs/research/araon-release-readiness-live-watchlist-agent-roadmap.md`
- `?? docs/research/frontend-redesign-completion-audit.md`
- `?? scripts/internal/probes/probe-goal-completion-audit.mts`

Review points:

- `docs/design.md` should be treated as the Araon design-system source of truth.
- Goal/audit docs must not contain raw session, account, order, or watchlist identifiers.
- `probe-goal-completion-audit.mts` is a diagnostic/probe artifact. Keep it internal and out of package output.

Verification:

- `git diff --check`
- Tracked-file secret scan
- `npm pack --dry-run --json` if package file rules are changed in the same commit

Risk: Low for runtime, medium for review clarity because docs are now the map for later commits.

## 4. Slice F - CLI/PATH/packaging

Purpose:

- Make the npm/PATH command surface release-ready.
- Preserve `@stellojae/araon` package name and `araon` bin entry while adding operator-friendly subcommands.

Files:

- `M  .gitignore`
- `M  INSTALL.md`
- `M  README.md`
- `M  docs/README.md`
- `M  docs/guides/share-araon.ko.md`
- `M  docs/runbooks/install-acceptance.md`
- `M  package.json`
- `M  scripts/internal/soak/soak-araon.mts`
- `M  src/cli/__tests__/options.test.ts`
- `M  src/cli/araon.ts`
- `M  src/cli/options.ts`
- `?? docs/research/cli-command-system-goal.md`
- `?? src/cli/__tests__/doctor.test.ts`
- `?? src/cli/__tests__/launcher-state.test.ts`
- `?? src/cli/__tests__/reset.test.ts`
- `?? src/cli/__tests__/status.test.ts`
- `?? src/cli/doctor.ts`
- `?? src/cli/launcher-state.ts`
- `?? src/cli/reset.ts`
- `?? src/cli/status.ts`

Review points:

- `araon` default command should still serve the built frontend and open the browser.
- `doctor`, `status`, `open`, and `reset` should be safe and user-readable.
- `reset --data` must remain guarded by explicit confirmation.
- CLI output must not include raw credentials, Toss session values, account numbers, or watchlist raw identifiers.
- Package `files` should stay narrow. Internal probes, archives, local data, and screenshots should not ship.

Verification:

- `npm test`
- `npm run typecheck`
- `npm run build`
- `node dist/cli/araon.js --help`
- `node dist/cli/araon.js --version`
- `node dist/cli/araon.js doctor --no-live`
- `npm pack --dry-run --json`
- `git diff --check`
- Tracked-file secret scan

Risk: Medium. Packaging and CLI behavior affect first-run experience.

## 5. Slice G - KIS containment/optional realtime tracking

Purpose:

- Redefine KIS as optional low-latency "실시간 추적" only.
- Keep KIS out of account/watchlist/ranking/chart truth-source roles.
- Preserve the 40-slot cap and product eligibility guards.

Files:

- `M  docs/guides/kis-openapi-setup.ko.md`
- `M  docs/guides/kis-openapi-setup.md`
- `M  docs/runbooks/nxt-ws-rollout.md`
- `M  scripts/internal/probes/probe-kis-approval.mts`
- `M  scripts/internal/probes/probe-kis-ws-apply-one-ticker.mts`
- `M  scripts/internal/probes/probe-kis-ws-favorites-smoke.mts`
- `M  scripts/internal/probes/probe-kis-ws-one-ticker.mts`
- `M  scripts/internal/probes/probe-kis-ws-runtime-cap10.mts`
- `M  scripts/internal/probes/probe-kis-ws-runtime-cap5.mts`
- `M  scripts/internal/probes/probe-kis-ws-runtime-favorites.mts`
- `M  scripts/internal/probes/probe-kis-ws-runtime-one-ticker.mts`
- `M  src/server/__tests__/bootstrap-kis.test.ts`
- `M  src/server/bootstrap-kis.ts`
- `M  src/server/kis/__tests__/kis-watchlist-api.test.ts`
- `M  src/server/kis/kis-watchlist-api.ts`
- `M  src/server/realtime/__tests__/runtime-operator.nxt5c.test.ts`
- `?? docs/research/kis-legacy-role-inventory.md`
- `?? src/client/lib/__tests__/api-client-kis-ws-slots.test.ts`
- `?? src/server/kis/kis-legacy-fallback-policy.ts`
- `?? src/server/realtime/__tests__/kis-ws-slot-allocator.test.ts`
- `?? src/server/realtime/__tests__/kis-ws-slot-candidates.test.ts`
- `?? src/server/realtime/__tests__/kis-ws-slot-session-rebalancer.test.ts`
- `?? src/server/realtime/__tests__/kis-ws-slot-state.test.ts`
- `?? src/server/realtime/kis-ws-slot-allocator.ts`
- `?? src/server/realtime/kis-ws-slot-candidates.ts`
- `?? src/server/realtime/kis-ws-slot-session-rebalancer.ts`
- `?? src/server/realtime/kis-ws-slot-state.ts`
- `?? src/server/routes/__tests__/kis-ws-slots.test.ts`
- `?? src/server/routes/kis-ws-slots.ts`

Review points:

- Confirm KIS slot allocator never exceeds 40 per profile.
- Confirm only `kisEligible=true` tickers can be sent to KIS WS.
- Normal UI copy should say "실시간 추적", not "KIS WS".
- KIS REST polling/ranking/chart/master paths should be opt-in legacy or isolated fallback, not default.
- Probe scripts must not print secrets or raw WS frames.

Verification:

- `npm test -- kis-ws`
- `npm test -- bootstrap-kis`
- `npm test -- runtime-operator`
- `npm run typecheck`
- `npm run build`
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`
- `git diff --check`
- Tracked-file secret scan

Risk: Medium-high. Runtime role changes can regress no-credentials startup or realtime state reporting.

## 6. Slice B - Toss-primary backend data surfaces

Purpose:

- Make Toss the primary source for auth/session, account, portfolio, orders, transactions, watchlist, search, quote/ranking-facing product identity, news, and signals.
- Keep Toss watchlist as Araon favorites truth while live mutation remains gated by fresh approval.

Files:

- `M  src/client/components/GlobalSearch.tsx`
- `M  src/client/lib/__tests__/stock-search.test.ts`
- `M  src/client/lib/stock-search.ts`
- `M  src/client/stores/__tests__/watchlist-store.test.ts`
- `M  src/client/stores/watchlist-store.ts`
- `M  src/server/news/__tests__/news-feed-service.test.ts`
- `M  src/server/news/news-feed-service.ts`
- `M  src/server/routes/__tests__/master.test.ts`
- `M  src/server/routes/__tests__/stock-news.test.ts`
- `M  src/server/routes/__tests__/stock-timeline.test.ts`
- `M  src/server/routes/__tests__/toss-auth.test.ts`
- `M  src/server/routes/__tests__/toss-realtime.test.ts`
- `M  src/server/routes/import.ts`
- `M  src/server/routes/master.ts`
- `M  src/server/routes/stocks.ts`
- `M  src/server/routes/toss-auth.ts`
- `M  src/server/routes/toss-realtime.ts`
- `M  src/server/services/master-stock-service.ts`
- `M  src/server/toss/__tests__/toss-browser-session.test.ts`
- `M  src/server/toss/__tests__/toss-public-client.test.ts`
- `M  src/server/toss/__tests__/toss-realtime-service.test.ts`
- `M  src/server/toss/__tests__/toss-session-store.test.ts`
- `M  src/server/toss/toss-browser-session.ts`
- `M  src/server/toss/toss-cdp-login-service.ts`
- `M  src/server/toss/toss-public-client.ts`
- `M  src/server/toss/toss-realtime-service.ts`
- `M  src/server/toss/toss-session-store.ts`
- `?? docs/research/toss-primary-agent-platform-completion-audit.md`
- `?? docs/research/toss-primary-agent-platform-migration.md`
- `?? docs/research/toss-primary-kis-ws-only-completion-audit.md`
- `?? docs/research/toss-primary-kis-ws-only-transition-plan.md`
- `?? docs/research/watchlist-api-spec.md`
- `?? docs/runbooks/toss-login-acceptance.md`
- `?? scripts/internal/probes/probe-toss-acceptance-smoke.mts`
- `?? scripts/internal/probes/probe-toss-analysis-candidate-smoke.mts`
- `?? scripts/internal/probes/probe-toss-authenticated-read-smoke.mts`
- `?? scripts/internal/probes/probe-toss-login-capture.mts`
- `?? scripts/internal/probes/probe-toss-realtime-route-smoke.mts`
- `?? scripts/internal/probes/probe-toss-realtime-sse-smoke.mts`
- `?? scripts/internal/probes/probe-toss-signal-capture.mts`
- `?? scripts/internal/probes/probe-toss-signal-smoke.mts`
- `?? scripts/internal/probes/probe-toss-signal-template-candidate.mts`
- `?? src/client/components/__tests__/toss-account-rail.test.ts`
- `?? src/client/lib/__tests__/api-client-toss-auth.test.ts`
- `?? src/client/lib/__tests__/toss-account-rail.test.ts`
- `?? src/client/lib/__tests__/toss-login-flow.test.ts`
- `?? src/client/lib/__tests__/toss-refresh-result-event.test.ts`
- `?? src/client/lib/__tests__/toss-user-notification-toast.test.ts`
- `?? src/client/lib/__tests__/watchlist-ui.test.ts`
- `?? src/client/lib/toss-account-rail.ts`
- `?? src/client/lib/toss-login-flow.ts`
- `?? src/client/lib/toss-refresh-result-event.ts`
- `?? src/client/lib/toss-user-notification-toast.ts`
- `?? src/client/lib/watchlist-ui.ts`
- `?? src/server/db/migrations/016-toss-sse-refresh-results.sql`
- `?? src/server/disclosures/disclosure-identity.ts`
- `?? src/server/routes/__tests__/toss-account-summary.test.ts`
- `?? src/server/routes/__tests__/toss-account.test.ts`
- `?? src/server/routes/__tests__/toss-orders.test.ts`
- `?? src/server/routes/__tests__/toss-portfolio.test.ts`
- `?? src/server/routes/__tests__/toss-transactions.test.ts`
- `?? src/server/routes/__tests__/toss-watchlist.test.ts`
- `?? src/server/routes/__tests__/watchlist.test.ts`
- `?? src/server/routes/toss-account-summary.ts`
- `?? src/server/routes/toss-account.ts`
- `?? src/server/routes/toss-orders.ts`
- `?? src/server/routes/toss-portfolio.ts`
- `?? src/server/routes/toss-read-route-error.ts`
- `?? src/server/routes/toss-transactions.ts`
- `?? src/server/routes/toss-watchlist.ts`
- `?? src/server/routes/watchlist.ts`
- `?? src/server/toss/__tests__/toss-acceptance-smoke.test.ts`
- `?? src/server/toss/__tests__/toss-account-client.test.ts`
- `?? src/server/toss/__tests__/toss-account-summary-client.test.ts`
- `?? src/server/toss/__tests__/toss-analysis-candidate-smoke.test.ts`
- `?? src/server/toss/__tests__/toss-authenticated-read-smoke.test.ts`
- `?? src/server/toss/__tests__/toss-login-capture-smoke.test.ts`
- `?? src/server/toss/__tests__/toss-news-client.test.ts`
- `?? src/server/toss/__tests__/toss-orders-client.test.ts`
- `?? src/server/toss/__tests__/toss-portfolio-client.test.ts`
- `?? src/server/toss/__tests__/toss-product-icon.test.ts`
- `?? src/server/toss/__tests__/toss-realtime-refresh-handlers.test.ts`
- `?? src/server/toss/__tests__/toss-realtime-route-smoke.test.ts`
- `?? src/server/toss/__tests__/toss-realtime-smoke.test.ts`
- `?? src/server/toss/__tests__/toss-session-extension-service.test.ts`
- `?? src/server/toss/__tests__/toss-signal-capture-smoke.test.ts`
- `?? src/server/toss/__tests__/toss-signal-client.test.ts`
- `?? src/server/toss/__tests__/toss-signal-smoke.test.ts`
- `?? src/server/toss/__tests__/toss-sse-refresh-executor.test.ts`
- `?? src/server/toss/__tests__/toss-sse-refresh-result-store.test.ts`
- `?? src/server/toss/__tests__/toss-sse-refresh-router.test.ts`
- `?? src/server/toss/__tests__/toss-transactions-client.test.ts`
- `?? src/server/toss/__tests__/toss-watchlist-client.test.ts`
- `?? src/server/toss/toss-acceptance-smoke.ts`
- `?? src/server/toss/toss-account-client.ts`
- `?? src/server/toss/toss-account-summary-client.ts`
- `?? src/server/toss/toss-analysis-candidate-smoke.ts`
- `?? src/server/toss/toss-authenticated-read-smoke.ts`
- `?? src/server/toss/toss-login-capture-smoke.ts`
- `?? src/server/toss/toss-product-icon.ts`
- `?? src/server/toss/toss-news-client.ts`
- `?? src/server/toss/toss-orders-client.ts`
- `?? src/server/toss/toss-portfolio-client.ts`
- `?? src/server/toss/toss-realtime-refresh-handlers.ts`
- `?? src/server/toss/toss-realtime-route-smoke.ts`
- `?? src/server/toss/toss-realtime-smoke.ts`
- `?? src/server/toss/toss-session-extension-service.ts`
- `?? src/server/toss/toss-signal-capture-smoke.ts`
- `?? src/server/toss/toss-signal-client.ts`
- `?? src/server/toss/toss-signal-smoke.ts`
- `?? src/server/toss/toss-sse-refresh-executor.ts`
- `?? src/server/toss/toss-sse-refresh-result-store.ts`
- `?? src/server/toss/toss-sse-refresh-router.ts`
- `?? src/server/toss/toss-transactions-client.ts`
- `?? src/server/toss/toss-watchlist-client.ts`
- `?? src/server/watchlist/__tests__/araon-watchlist-service.test.ts`
- `?? src/server/watchlist/araon-watchlist-service.ts`
- `?? src/shared/__tests__/product-identity.test.ts`
- `?? src/shared/product-identity.ts`

Review points:

- Product identity must keep Toss `productCode` separate from six-digit KRX `krTicker`.
- Unsupported/Toss-only products must not be routed to KIS or six-digit-only routes.
- Search/add should never surface a raw `400 Bad Request` to the user.
- Toss watchlist mutation implementation must stay mock/tested by default. No new live add/remove without fresh approval.
- Previous live-smoke remove fallback patch belongs here:
  - `src/server/toss/toss-watchlist-client.ts`
  - `src/server/toss/__tests__/toss-watchlist-client.test.ts`
- Toss session/cookie/storage values and account/order/watchlist raw payloads must be redacted from logs and docs.

Verification:

- `npm test -- toss`
- `npm test -- watchlist`
- `npm test -- product-identity`
- `npm run typecheck`
- `npm run build`
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`
- `git diff --check`
- Tracked-file secret scan

Risk: High. This is the core source-of-truth transition.

## 7. Slice C - realtime/TOP100/surge/chart progression

Purpose:

- Stabilize Toss TOP100/ranking, fast quote pseudo-tick, recent surge, chart progression, and bottom status behavior.
- Keep realtime-like updates bounded and avoid full-market fast polling.

Files:

- `M  src/client/components/StatusBar.tsx`
- `M  src/client/components/StockCandleChart.tsx`
- `M  src/client/components/TopMoversBoard.tsx`
- `M  src/client/components/__tests__/stock-candle-chart.test.ts`
- `M  src/client/lib/__tests__/realtime-momentum-feed.test.ts`
- `M  src/client/lib/__tests__/realtime-momentum.test.ts`
- `M  src/client/lib/__tests__/surge-aggregator.test.ts`
- `M  src/client/lib/realtime-momentum-feed.ts`
- `M  src/client/lib/realtime-momentum.ts`
- `M  src/client/lib/surge-aggregator.ts`
- `M  src/client/stores/__tests__/price-history-store.test.ts`
- `M  src/server/market/__tests__/market-top-movers-service.test.ts`
- `M  src/server/market/market-top-movers-service.ts`
- `M  src/server/price/__tests__/candle-aggregator.test.ts`
- `M  src/server/price/__tests__/price-history-recorder.test.ts`
- `M  src/server/price/__tests__/price-store.test.ts`
- `M  src/server/price/candle-aggregator.ts`
- `M  src/server/price/snapshot-store.ts`
- `M  src/server/routes/__tests__/candles.test.ts`
- `M  src/server/routes/__tests__/market.test.ts`
- `M  src/server/routes/__tests__/runtime.test.ts`
- `M  src/server/routes/market.ts`
- `M  src/server/routes/runtime.ts`
- `M  src/shared/price-source.ts`
- `?? docs/research/realtime-surge-chart-watchlist-sync-calibration.md`
- `?? docs/research/realtime-surge-chart-watchlist-sync-goal.md`
- `?? docs/research/toss-fast-quote-surge-lane-goal.md`
- `?? scripts/internal/probes/probe-market-top100-phase-smoke.mts`
- `?? src/server/market/__tests__/market-top-movers-phase.test.ts`
- `?? src/server/market/market-top-movers-phase.ts`
- `?? src/server/toss/__tests__/toss-fast-quote-lane.test.ts`
- `?? src/server/toss/__tests__/toss-price-refresh-audit.test.ts`
- `?? src/server/toss/toss-fast-quote-lane.ts`
- `?? src/server/toss/toss-price-refresh-audit.ts`
- `?? src/shared/__tests__/price-source.test.ts`

Review points:

- Bounded Toss fast quote lane should not become full-market 0.5s polling.
- `toss-fast-quote` and `ws-integrated` may feed realtime surge; broad `rest` refresh must not.
- Recent-surge threshold must not alert for sub-threshold moves.
- KIS raw tick updates should not create noisy user toasts.
- Chart should progress from real samples only. No fake candle or fake movement.
- Non-trading gaps should be omitted visually rather than filled with synthetic data.

Verification:

- `npm test -- market-top-movers`
- `npm test -- realtime-momentum`
- `npm test -- surge-aggregator`
- `npm test -- candle`
- `npm run typecheck`
- `npm run build`
- Browser QA for TOP100, recent surge, mini chart, full chart, bottom status bar
- `git diff --check`
- Tracked-file secret scan

Risk: High. This slice affects UI responsiveness, update cadence, and operator trust.

## 8. Slice E - agent event/order-intent safety foundation

Purpose:

- Add agent-facing event queue, market-movement normalization, order-intent preview, approval gate, and audit foundation.
- Keep live execution locked until separately approved.

Files:

- `?? scripts/internal/probes/probe-agent-event-alert-delivery-smoke.mts`
- `?? scripts/internal/probes/probe-agent-event-monitor-provider-mix-smoke.mts`
- `?? scripts/internal/probes/probe-agent-event-monitor-smoke.mts`
- `?? src/client/components/OrderIntentSafetyRail.tsx`
- `?? src/client/components/AgentDecisionSummary.tsx`
- `?? src/client/components/OrderSafetyModal.tsx`
- `?? src/client/components/__tests__/agent-events-rail.test.ts`
- `?? src/client/components/__tests__/order-intent-safety-rail.test.ts`
- `?? src/client/lib/__tests__/agent-event-browser-event.test.ts`
- `?? src/client/lib/__tests__/agent-event-order-intent.test.ts`
- `?? src/client/lib/__tests__/agent-candidate-view-model.test.ts`
- `?? src/client/lib/__tests__/agent-event-toast.test.ts`
- `?? src/client/lib/__tests__/api-client-agent-events.test.ts`
- `?? src/client/lib/__tests__/api-client-order-intents.test.ts`
- `?? src/client/lib/agent-event-browser-event.ts`
- `?? src/client/lib/agent-event-order-intent.ts`
- `?? src/client/lib/agent-candidate-view-model.ts`
- `?? src/client/lib/agent-event-toast.ts`
- `?? src/server/agent/__tests__/agent-event-alert-delivery-smoke.test.ts`
- `?? src/server/agent/__tests__/agent-event-alert-delivery-store.test.ts`
- `?? src/server/agent/__tests__/agent-event-monitor-smoke.test.ts`
- `?? src/server/agent/__tests__/agent-event-monitor.test.ts`
- `?? src/server/agent/__tests__/agent-event-queue.test.ts`
- `?? src/server/agent/__tests__/market-movement-agent-event.test.ts`
- `?? src/server/agent/__tests__/order-intent-audit-store.test.ts`
- `?? src/server/agent/__tests__/order-intent-service.test.ts`
- `?? src/server/agent/agent-event-alert-delivery-smoke.ts`
- `?? src/server/agent/agent-event-alert-delivery-store.ts`
- `?? src/server/agent/agent-event-monitor-smoke.ts`
- `?? src/server/agent/agent-event-monitor.ts`
- `?? src/server/agent/agent-event-public-payload.ts`
- `?? src/server/agent/agent-event-queue.ts`
- `?? src/server/agent/agent-event-store.ts`
- `?? src/server/agent/market-movement-agent-event.ts`
- `?? src/server/agent/order-intent-audit-store.ts`
- `?? src/server/agent/order-intent-service.ts`
- `?? src/server/audit/__tests__/goal-completion-audit.test.ts`
- `?? src/server/audit/goal-completion-audit.ts`
- `?? src/server/db/migrations/014-agent-order-intents.sql`
- `?? src/server/db/migrations/015-agent-events.sql`
- `?? src/server/db/migrations/017-agent-event-alert-deliveries.sql`
- `?? src/server/db/migrations/018-order-intent-confirm-gate.sql`
- `?? src/server/db/migrations/019-agent-event-alert-dispatch-latency.sql`
- `?? src/server/db/migrations/023-agent-order-intent-paper-ledger.sql`
- `?? src/server/db/migrations/024-agent-order-intent-approval-readiness.sql`
- `?? src/server/routes/__tests__/agent-event-alert-deliveries.test.ts`
- `?? src/server/routes/__tests__/agent-event-monitor.test.ts`
- `?? src/server/routes/__tests__/agent-events.test.ts`
- `?? src/server/routes/__tests__/agent-order-intents.test.ts`
- `?? src/server/routes/agent-event-alert-deliveries.ts`
- `?? src/server/routes/agent-event-monitor.ts`
- `?? src/server/routes/agent-events.ts`
- `?? src/server/routes/agent-order-intents.ts`

Review points:

- Agent event payloads should be public/safe, not raw provider payload dumps.
- `news_detected`, `disclosure_detected`, `toss_signal_detected`, and `market_movement_detected` should be normalized contracts.
- Order intent must stop at preview/approval/confirm/audit foundation. Live execution remains locked.
- Paper ledger entries are preview-only and must keep `booked=false`; no fills,
  PnL, or live order effects belong in this slice.
- Approval challenges carry order summary, intent hash, and kill-switch state
  for no-live readiness evidence. They must still return `execution=null`.
- Confirmed challenges also return a locked execution proof. This is not an
  execution result and must keep `liveMutationEnabled=false`.
- Locked executor/read-only reconciliation executor contracts are readiness
  contracts only. They are not live Toss order execution, fills, or account
  mutation.
- Read-only reconciliation snapshots are proof artifacts for the locked lane
  only. They must not be represented as submitted, filled, canceled, or live
  Toss order results.
- Audit logs should record decisions and skip reasons without secrets.
- Migrations must be packaged and idempotent.

Verification:

- `npm test -- agent`
- `npm test -- order-intent`
- `npm test -- audit`
- `npm run typecheck`
- `npm run build`
- Browser QA for agent panel and safety modal
- `git diff --check`
- Tracked-file secret scan

Risk: High because it is the future trading safety surface, even though live execution remains locked.

## 9. Slice D - frontend v7 product UI

Purpose:

- Rebuild the product UI around the locked v7 information architecture while preserving Araon design system tone.
- Keep the visible product aligned with Toss-primary account/watchlist/realtime/trading-safety direction.

Files:

- `M  src/client/App.tsx`
- `M  src/client/__tests__/vite-proxy.test.ts`
- `M  src/client/components/BackfillStatusStrip.tsx`
- `M  src/client/components/CredentialsSetup.tsx`
- `M  src/client/components/FavoritesBlock.tsx`
- `M  src/client/components/Header.tsx`
- `M  src/client/components/SSEIndicator.tsx`
- `M  src/client/components/SectionStack.tsx`
- `M  src/client/components/SettingsModal.tsx`
- `M  src/client/components/StockDataQualityPanel.tsx`
- `M  src/client/components/StockDetailModal.tsx`
- `M  src/client/components/StockRow.tsx`
- `M  src/client/components/SurgeBlock.tsx`
- `M  src/client/components/ToastStack.tsx`
- `D  src/client/components/ViewToggle.tsx`
- `M  src/client/components/__tests__/backfill-status-strip.test.ts`
- `M  src/client/components/__tests__/credentials-setup-copy.test.ts`
- `M  src/client/components/__tests__/managed-operations-settings.test.ts`
- `M  src/client/components/__tests__/status-bar.test.ts`
- `M  src/client/components/__tests__/stock-data-quality-panel.test.ts`
- `M  src/client/components/__tests__/top100-view.test.ts`
- `M  src/client/hooks/useSSE.ts`
- `M  src/client/lib/__tests__/realtime-session-control.test.ts`
- `M  src/client/lib/api-client.ts`
- `M  src/client/lib/icons.tsx`
- `M  src/client/lib/realtime-session-control.ts`
- `M  src/client/stores/toast-store.ts`
- `M  src/client/styles/global.css`
- `M  vite.config.ts`
- `?? src/client/components/AgentEventsRail.tsx`
- `?? src/client/components/DashboardFocusPanel.tsx`
- `?? src/client/components/ProductAvatar.tsx`
- `?? src/client/components/TossAccountRail.tsx`
- `?? src/client/components/TradingViewAdvancedChart.tsx`
- `?? src/client/components/__tests__/favorites-block.test.ts`
- `?? src/client/components/__tests__/order-safety-modal.test.ts`
- `?? src/client/components/__tests__/tradingview-advanced-chart.test.ts`
- `?? src/client/hooks/__tests__/useSSE.test.ts`

Review points:

- Home should keep the 50:50 layout:
  - left top: TOP100 up/down
  - left bottom: favorites and recent surge
  - right top: selected ticker/chart
  - right bottom: agent/safety area
- Toss account rail should be narrow, visually separate, and collapsible.
- KIS should appear as user-facing "실시간 추적", not a large technical KIS rail.
- Full chart and agent detail should feel like workspace expansion, not abrupt unrelated navigation.
- Bottom status bar must be present, centered, theme-correct, and non-janky.
- Text scale must be consistent with `docs/design.md`.
- Avoid dead UI copy such as legacy tracked-list/polling language in normal flow.

Verification:

- `npm test -- client`
- `npm run typecheck`
- `npm run build`
- Browser/Computer Use visual QA:
  - 1920x1080
  - 1600x1000
  - 1440x900
  - around 900px responsive width
- Check home, TOP100/sector state, account rail collapse, full chart expansion, agent expansion, settings modal, search add error handling
- `git diff --check`
- Tracked-file secret scan

Risk: High for visual QA and review size. This should be reviewed with screenshots or live browser evidence.

## 10. Cross-slice integration seams

Purpose:

- These files connect many slices and should not be staged blindly.
- Prefer hunk-level staging into the commit that owns the behavior. If that becomes too tangled, use a final integration commit.

Files:

- `M  src/server/__tests__/app-launcher.test.ts`
- `M  src/server/app.ts`
- `M  src/server/db/__tests__/db.test.ts`
- `M  src/server/sse/__tests__/sse-manager.test.ts`
- `M  src/server/sse/sse-manager.ts`
- `M  src/shared/types.ts`

Manual-review file:

- `M  src/server/realtime/runtime-operator.ts`

Likely ownership:

- `src/server/app.ts`: routes from Slice B, E, G, and CLI/runtime wiring from Slice F.
- `src/shared/types.ts`: product identity/watchlist/agent/realtime/UI contract changes from B, C, E, D.
- `src/server/sse/**`: Toss SSE refresh, agent events, runtime notifications from B, C, E.
- `src/server/db/**`: migrations from B/E plus app initialization checks.
- `src/server/realtime/runtime-operator.ts`: likely Slice G plus Slice C. Inspect hunks before deciding.

Review points:

- Confirm no route registration accidentally enables live mutation by default.
- Confirm no no-credentials startup regression.
- Confirm SSE public payloads are sanitized.
- Confirm DB migrations remain package-included and clean-install safe.

Verification:

- `npm test -- app-launcher`
- `npm test -- db`
- `npm test -- sse`
- `npm test -- runtime-operator`
- `npm run typecheck`
- `npm run build`
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`
- `git diff --check`
- Tracked-file secret scan

Risk: High because these files can silently couple slices.

## 11. Untracked File Policy

Keep for review:

- All untracked source, test, migration, docs, and runbook files listed in Slices A-G.

Keep internal / do not package unless explicitly intended:

- `scripts/internal/probes/**`
- `docs/research/**`
- `docs/archive/**`
- local smoke/audit helper scripts

No immediate deletion candidates:

- No obvious temp logs, DB files, screenshots, or generated release assets appeared in `git status --short -uall`.

Needs explicit human confirmation before deletion:

- Any probe script that was only used once but still documents a live-smoke boundary.
- Any research/goal/audit doc that looks superseded by the release roadmap.
- `src/client/components/ViewToggle.tsx` deletion should be reviewed as part of Slice D, not auto-reverted.

## 12. Package/Artifact Notes

Current packaging intent:

- Ship the CLI bundle, built client, Electron main, DB migrations, README, INSTALL, selected guides, and release notes.
- Do not ship internal probes, local data, screenshots, raw logs, or credential/session artifacts.

Previous package dry-run evidence from the current release-readiness lane:

- `npm pack --dry-run --json` passed.
- Package candidate had 48 entries.
- Internal probe/log/local data files were not included.

Before committing Slice F or any package file change, rerun:

```bash
npm pack --dry-run --json
```

## 13. Verification Snapshot

Current verification after this document was added:

- `npm run typecheck`: pass
- `npm test`: pass, 221 files / 1443 tests
- `npm run build`: pass, with Vite chunk-size warning only
- `npm pack --dry-run --json`: pass, 48 package entries
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: pass, `issueCount=0`
- `git diff --check`: pass
- Refined non-test/non-archive/non-probe secret-like scan: pass, no hits
- Dirty `dist/` output check after build: pass, no dirty `dist/` entries

Related CLI/package verification from the current release-readiness lane:

- temp npm-prefix global install smoke: pass
- `araon --version`: 1.1.4
- `araon --help`: pass and listed doctor/status/open/reset
- `araon doctor --no-live`: pass with warnings only

Required rerun before real commits:

- At minimum, rerun the relevant focused tests for each slice.
- Before the final commit stack is considered release-reviewable, rerun:

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm pack --dry-run --json
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

Also run a tracked-file secret scan after any security-sensitive or provider-session change.

## 14. Commit Readiness Decision

Current state:

- User approved staging/commits.
- Reviewable commit stack was created in the planned A/F/G/B/C/E/D/cross-slice
  order.
- Final stack:
  1. `acf7630 docs: record Araon product 100 evidence and commit plan`
  2. `e4c8f38 chore: add Araon product audit scripts`
  3. `7c76300 refactor: contain KIS realtime tracking slots`
  4. `b484935 feat: make Toss watchlist and product identity primary`
  5. `64d1d1e fix: add watchlist provenance repository`
  6. `7a5f837 feat: stabilize Toss realtime surge and chart paths`
  7. `d76e230 feat: add locked agent decision support`
  8. `6a9b0eb feat: polish Araon product UI surfaces`
  9. `5e112b6 test: add Araon product readiness probes`

Post-stack verification:

- `npm test`: PASS, 230 files / 1573 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, Vite chunk-size warning only.
- `npm pack --dry-run --json`: PASS, 53 package entries.
- `npm run audit:pre-release-product`: PASS, 42/42 criteria.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS.
- `git diff --check`: PASS.
- refined tracked-file secret-like scan: PASS.

Remaining decision:

- 12 root-level visual evidence artifacts are still untracked and intentionally
  excluded from the commit stack until the user chooses archive/keep/delete.
