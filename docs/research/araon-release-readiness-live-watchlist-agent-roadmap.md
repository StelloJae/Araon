# Araon Release Readiness, Live Watchlist Smoke, and Agent Roadmap Brief

Date: 2026-05-17

This document is the execution brief for the current Araon follow-up lane:

1. Turn the large dirty worktree into release-reviewable slices.
2. Verify npm/CLI/PATH packaging readiness.
3. Prepare a narrow Toss watchlist live smoke without leaking raw account/session/watchlist data.
4. Define the next minimum agent-trading foundation goal.

It intentionally excludes live market-quality observation. That should happen
after the next Korean market open in a separate lane.

## Safety Boundaries

Hard stops:

- No live order placement.
- No order cancel/amend.
- No account mutation.
- No automatic live trading.
- No raw Toss session/cookie/storage/account/order/watchlist identifiers in UI,
  logs, docs, stdout, screenshots, fixtures, or git diff.
- No raw KIS app key, app secret, approval key, access token, account number, or
  raw WebSocket frame in UI, logs, docs, stdout, screenshots, fixtures, or git
  diff.
- No synthetic financial data.

Toss watchlist mutation is allowed only as a narrow smoke after all of these are
true:

1. The exact product and exact action are selected.
2. The mutation gate is enabled only for that smoke run.
3. The command/API call is limited to watchlist add/remove.
4. The result is verified through sanitized `/watchlist` state.
5. If the smoke adds a product, cleanup/remove is attempted in the same lane.
6. Evidence records only safe status/action/count/state values.

The user has given a general fresh GO for the smoke lane, but the implementation
must still name the concrete product and action before executing mutation. This
prevents accidental mutation of the wrong watchlist item.

## Current Verified Shape

Current repository state is large and dirty. It should not be treated as one
monolithic change.

Observed working tree:

- 115 tracked files changed.
- Many untracked docs, tests, routes, clients, stores, and frontend components.
- `git diff --stat` currently reports about 15k inserted lines and 1.4k deleted
  lines in tracked files.

Main functional lanes already represented in the worktree:

- Toss auth/session/account/portfolio/orders/transactions/watchlist surfaces.
- Toss-primary TOP100/search/quote/chart work.
- Bounded fast quote lane and recent-surge calibration.
- KIS optional realtime tracking slot allocator.
- Araon v7 frontend layout, account rail, chart expansion, agent panel, bottom
  status bar, and visual polish.
- Agent event queue, order-intent preview/risk/approval/audit foundation.
- CLI/PATH package readiness with `araon`, `doctor`, `status`, `open`, and
  `reset`.
- Documentation and completion audits for the Toss-primary transition.

## Commit-Ready Slice Map

Use this map to review or commit later. Do not squash these mentally into one
feature.

### Slice A: Product And Design Documentation

Purpose:

- Preserve the product direction and design foundation.
- Make future sessions resilient to compaction.

Likely files:

- `docs/design.md`
- `docs/frontend-redesign-brief.md`
- `docs/frontend-v7-final-gap-plan.md`
- `docs/frontend-v7-followup-quality-plan.md`
- `docs/research/araon-final-product-*.md`
- `docs/research/toss-primary-*.md`
- `docs/research/toss-fast-quote-surge-lane-goal.md`
- `docs/research/realtime-surge-chart-watchlist-sync-*.md`

Review focus:

- Does the documentation match actual code behavior?
- Does it keep Toss-first + optional KIS realtime tracking clear?
- Does it avoid raw account/session/watchlist/order values?

### Slice B: Toss-Primary Backend Data Surfaces

Purpose:

- Make Toss the primary source for user-facing account, portfolio, watchlist,
  search, quote, chart, ranking, news/signal, and realtime-refresh semantics.

Likely files:

- `src/server/toss/*`
- `src/server/routes/toss-*`
- `src/server/routes/watchlist.ts`
- `src/server/watchlist/*`
- `src/shared/product-identity.ts`
- `src/shared/price-source.ts`

Review focus:

- Product identity must keep Toss `productCode` and six-digit KRX `krTicker`
  separate.
- Toss-only products must not flow into KIS or six-digit-only routes.
- Toss watchlist mutation must stay behind
  `ARAON_ENABLE_TOSS_WATCHLIST_MUTATION=1`.
- Normal no-session startup must not unexpectedly call authenticated Toss APIs.

### Slice C: Realtime, TOP100, Surge, Chart Progression

Purpose:

- Keep TOP100/ranking/provider data honest.
- Feed recent surge from meaningful realtime-like inputs only.
- Update current chart/candle without fake movement.

Likely files:

- `src/server/market/*`
- `src/server/price/*`
- `src/server/realtime/*`
- `src/server/routes/market.ts`
- `src/server/routes/runtime.ts`
- `src/server/toss/toss-fast-quote-lane.ts`
- `src/client/lib/realtime-*`
- `src/client/lib/surge-aggregator.ts`
- `src/client/components/StockCandleChart.tsx`

Review focus:

- No full-market 0.5s quote polling.
- Fast quote candidate set remains bounded.
- General REST quote refresh is not treated as realtime surge.
- Threshold 3% must not alert on 0.x/1.x/2.x moves.
- Chart gaps must be hidden by time-scale compaction, not synthetic candles.

### Slice D: Frontend V7 Product UI

Purpose:

- Apply the locked home information architecture while preserving Araon visual
  DNA.

Likely files:

- `src/client/App.tsx`
- `src/client/components/*`
- `src/client/lib/api-client.ts`
- `src/client/lib/watchlist-ui.ts`
- `src/client/stores/*`
- `src/client/styles/global.css`

Review focus:

- Existing Araon design system wins over raw mock output.
- Home uses the 50:50 layout.
- Account rail is narrow, visually separate, and collapsible.
- KIS wording appears to users as `실시간 추적`.
- Bottom status bar remains visible and aligned.
- Search/add failures do not expose raw 400s.

### Slice E: Agent Event And Order-Intent Safety Foundation

Purpose:

- Support future autonomous trading decisions without enabling live execution.

Likely files:

- `src/server/agent/*`
- `src/server/audit/*`
- `src/server/routes/agent-*`
- `src/server/db/migrations/014-*.sql` through `019-*.sql`
- `src/client/components/AgentEventsRail.tsx`
- `src/client/components/OrderIntentSafetyRail.tsx`
- `src/client/components/OrderSafetyModal.tsx`
- `src/client/lib/agent-*`

Review focus:

- Event contracts exist for news, disclosure, Toss signal, market movement,
  watchlist change, position change, order intent, approval, and execution lock.
- Preview/risk/approval/audit can exist.
- Live execution remains locked.
- Missing agent-trading pieces are explicit, not implied done.

### Slice F: CLI, PATH, Packaging

Purpose:

- Let users run Araon through the npm package command.

Likely files:

- `src/cli/*`
- `src/cli/__tests__/*`
- `package.json`
- `README.md`
- `INSTALL.md`
- `docs/runbooks/install-acceptance.md`

Review focus:

- `araon` bin points to `dist/cli/araon.js`.
- `araon --help`, `--version`, `doctor`, `status`, `open`, `reset` work.
- npm package files stay narrow.
- Internal probes, live screenshots, logs, and local data do not ship.

### Slice G: KIS Legacy Containment And Optional Tracking

Purpose:

- Keep KIS useful only as optional low-latency realtime tracking and migration
  helper, not product truth.

Likely files:

- `src/server/kis/*`
- `src/server/realtime/kis-ws-slot-*`
- `src/server/routes/kis-ws-slots.ts`
- `scripts/internal/probes/probe-kis-*`
- `docs/guides/kis-openapi-setup*.md`

Review focus:

- KIS REST-heavy polling/ranking/chart/watchlist import does not become normal
  product flow.
- KIS slot cap remains profile-aware and bounded.
- User-facing copy says `실시간 추적`, not `KIS WS`.

## Release Readiness Verification Plan

Run these checks before considering the worktree release-ready:

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
npm pack --dry-run --json
```

For package/PATH acceptance, use a temporary npm prefix rather than changing the
user's real global install:

```bash
tmpdir="$(mktemp -d)"
packdir="$tmpdir/pack"
prefix="$tmpdir/prefix"
mkdir -p "$packdir" "$prefix"
npm pack --pack-destination "$packdir" --json
npm install -g --prefix "$prefix" "$packdir"/*.tgz
"$prefix/bin/araon" --version
"$prefix/bin/araon" --help
"$prefix/bin/araon" doctor --no-live
```

For clean no-credentials acceptance:

```bash
tmpdata="$(mktemp -d)"
node dist/cli/araon.js --no-open --host 127.0.0.1 --port 0 --data-dir "$tmpdata"
```

If a server command keeps running, stop it after verifying startup behavior. Do
not leave background processes open.

## Secret And Raw Payload Grep

Run a tracked-file grep after security-sensitive or packaging changes. Use
patterns that catch accidental leaks but expect benign source-code identifiers
such as `appSecret` field names.

Minimum useful check:

```bash
git grep -n -E 'SESSION=|UTK=|LTK=|FTK=|browserSessionId|deviceId|approval_key|appSecret|accountNumber|CANO|ACNT_PRDT_CD' -- .
```

Interpretation:

- Source-code field names can be expected.
- Real values, raw cookies, account numbers, order IDs, watchlist refs, and
  captured payloads are failures.
- Do not paste raw matches into docs or chat if they include sensitive data.

## Toss Watchlist Live Smoke Protocol

Goal: verify Araon can add/remove a Toss watchlist item through the normalized
watchlist path without exposing raw identifiers.

Default state:

- `ARAON_ENABLE_TOSS_WATCHLIST_MUTATION` is unset.
- Normal UI can show `sync_pending`, `local_only`, or `sync_unavailable`.
- Normal UI must not perform live Toss add/remove.

Smoke-only state:

- Start a local server with `ARAON_ENABLE_TOSS_WATCHLIST_MUTATION=1`.
- Use the same data dir that contains the user's valid Toss session.
- Use one explicit target product.
- Use one explicit action plan.

Recommended reversible flow:

1. Read `/watchlist`.
2. Pick a target product that is safe to add and later remove.
3. `POST /watchlist/items` for that product.
4. Read `/watchlist` and verify sanitized `toss_synced`/presence state.
5. `DELETE /watchlist/items/:productCode`.
6. Read `/watchlist` and verify sanitized absence/removal state.
7. Stop the mutation-enabled server.
8. Record only product label, action, HTTP status, safe sync state, and counts.

Do not record:

- Toss session/cookie/storage values.
- Account keys.
- Upstream watchlist IDs or item refs.
- Raw request/response bodies.

If the target product already exists in Toss watchlist, do not blindly remove it
as cleanup. Use a dedicated temporary target or stop and ask for a better target.

## Agent Trading Foundation Roadmap

Current state:

- Agent events exist.
- Order-intent preview/risk/approval/audit foundation exists.
- Live execution remains locked.
- UI can expose observation, candidate, preview, approval, and locked execution
  states.

Still missing before autonomous trading can be considered operational:

1. Decision engine
   - Inputs: normalized market movement, news, disclosure, Toss signal,
     watchlist, position, account/cash, and user policy.
   - Output: `skip`, `observe`, `paper_order_intent`, or
     `approval_required_order_intent`.

2. Strategy policy
   - Explicit user-selected strategies.
   - Time windows.
   - Candidate universe.
   - Position sizing model.
   - Cooldown model.

3. Risk policy
   - Max order amount.
   - Max daily loss.
   - Max open exposure.
   - Per-symbol cap.
   - Kill switch.
   - No-trade states.

4. Paper trading ledger
   - Simulated orders.
   - Simulated fills.
   - PnL snapshots.
   - Reason/skip audit.
   - Replayable evidence.

5. Toss order adapter
   - Preview first.
   - Confirm token / fresh approval.
   - Live execution disabled by default.
   - Sanitized result storage.

6. Reconciliation
   - Compare order intents, simulated/live orders, Toss order history,
     transactions, and positions.
   - Detect mismatch and mark unsafe.

7. Agent performance audit
   - Decision latency.
   - Signal-to-action latency.
   - Skipped opportunities.
   - False positives.
   - Paper/live divergence.

Next minimum agent goal should be:

> Build the paper-trading ledger plus decision/risk-policy skeleton, still with
> live execution locked.

Do not jump directly to Toss live order execution. That would skip the evidence
layer needed to decide whether the agent is safe.

## Execution Snapshot

This snapshot records the sanitized outcome of this lane on 2026-05-17.

### Watchlist Live Smoke

Fresh GO was given for a narrow Toss watchlist mutation smoke. The selected
target was:

- Product label: `채비`
- Product code: `A0011T0`
- Flow: add, verify presence through normalized watchlist state, remove, verify
  absence through normalized watchlist state.

First attempt:

- Path used: full Araon server route with
  `ARAON_ENABLE_TOSS_WATCHLIST_MUTATION=1`.
- Add result: succeeded and the item became visible in normalized watchlist
  state.
- Remove result: initially returned `unchanged`; normalized state still showed
  the item as present.
- Root cause: Toss `new-watchlists/groups/simple?includeItemInfo=true` can omit
  item information for an item that is visible through
  `new-watchlists?includeItemInfo=true`.
- Cleanup: performed immediately through the full watchlist endpoint and
  verified the item was absent again.
- Side finding: using full `createAraonServer` with the user's normal data dir
  can initialize existing KIS credentials. Future watchlist mutation smokes
  should prefer the direct watchlist service/client path, or a data dir prepared
  specifically for the smoke, so KIS runtime startup is not an accidental side
  effect.

Patch applied:

- `src/server/toss/toss-watchlist-client.ts` now falls back to the full
  `new-watchlists?includeItemInfo=true` endpoint when the simple groups endpoint
  does not expose the target item.
- `src/server/toss/__tests__/toss-watchlist-client.test.ts` includes the
  fallback remove scenario.

Second attempt after the patch:

- Path used: direct Araon watchlist service with Toss mutation enabled, avoiding
  full server/KIS runtime startup.
- Before add: target absent.
- Add result: `added`, `toss_synced`.
- After add: target present.
- Remove result: `removed`, `toss_synced`.
- After remove: target absent.

The Toss watchlist was returned to its pre-smoke state for the selected target.

### Verification Results

Commands completed after the watchlist fallback patch:

- `npm run typecheck`: pass.
- `npm test`: pass, 221 files and 1443 tests.
- `npm run build`: pass. Vite emitted only the existing chunk-size warning.
- `npm pack --dry-run --json`: pass. Package contains the CLI bundle, built
  client, Electron main bundle, migrations, README/INSTALL, guides, and release
  notes; internal probes/logs/local data are not included.
- Temporary npm-prefix install smoke: pass. Installed package exposes
  `araon`, `araon --version` prints `1.1.4`, help lists `doctor`, `status`,
  `open`, and `reset`, and `araon doctor --no-live` reports no failures.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: pass with
  `issueCount=0`; clean temp data dir had no credentials and master refresh was
  deferred until credentials are configured.
- `git diff --check`: pass.
- Secret-value scan:
  - non-test tracked files: 0 value-shaped hits.
  - package candidate files: 0 value-shaped hits.
  - all tracked files: one test fixture value-shape hit in an existing KIS test;
    this is not shipped as package runtime/docs evidence.

## Completion Criteria For This Lane

This lane is complete only when:

1. This document exists and matches the current code direction.
2. Dirty tree is classified into release-reviewable slices.
3. Packaging and CLI readiness are verified.
4. Temporary-prefix PATH acceptance is verified or a concrete blocker is
   documented.
5. Clean no-credentials/no-live startup behavior is verified or a concrete
   blocker is documented.
6. Toss watchlist live smoke path is ready, with mutation gate and sanitized
   evidence rules documented.
7. Actual live Toss watchlist mutation is either completed with a named target
   and cleanup evidence, or left explicitly pending because no concrete target
   product/action was selected.
8. Agent roadmap states what exists, what is locked, and the next minimum goal.
9. No required server process is left running.
10. No raw Toss/KIS/session/account/order/watchlist values are written to docs,
    logs, stdout summary, or git diff.
