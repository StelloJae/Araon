# KIS Legacy Role Inventory

Date: 2026-05-12

This inventory records the current KIS footprint during the Toss-first
migration. It is not a completion claim. The goal is to keep KIS useful only as
an optional low-latency Korean stock realtime rail, while Toss becomes the
primary user account, quote, chart, ranking, watchlist, and event source.

## Target Role

KIS is no longer the product's primary data model.

- KIS may provide optional low-latency KR market-data ticks through WebSocket.
- KIS must not be the account, order, portfolio, or trading truth source.
- KIS REST-heavy behavior should be disabled by default, isolated as fallback,
  or removed after Toss parity is verified.
- A clean install with no KIS credentials must still start without KIS token,
  approval, master refresh, WebSocket, polling, or backfill calls.
- If KIS credentials exist, WebSocket subscriptions must stay within
  `WS_MAX_SUBSCRIPTIONS` per profile and should be selected by the smart slot
  allocator rather than broad watchlist coverage.

## Current Evidence

### Already Aligned

| Area | Evidence | Current state |
|---|---|---|
| Runtime optionality | `src/server/bootstrap-kis.ts` exposes `unconfigured`, `starting`, `started`, and `failed` states. The composition root starts KIS only after stored credentials are found. | KIS can stay absent while Toss public/auth routes exist. |
| KIS WS cap | `src/shared/kis-constraints.ts` defines the cap and `src/server/realtime/kis-ws-slot-allocator.ts` normalizes any requested cap back to that limit. | Smart allocation is bounded by the documented cap. |
| Slot priority model | `src/server/realtime/kis-ws-slot-candidates.ts` builds candidates from Toss holdings, current view, recent news/disclosures/Toss signals, agent order-intent candidates, favorites, and TOP100 rotation samples. | This matches the target "high-value ticker" rail. |
| Churn control | `src/server/realtime/kis-ws-slot-allocator.ts` keeps sticky previous slots when cooldown/sticky windows apply. | Rebalance does not need full resubscribe churn for every score change. |
| Diff application | `src/server/realtime/kis-ws-slot-session-rebalancer.ts` calls `bridge.applyDiff(plan.diff)` and then replaces session tickers. | Subscriptions are updated by diff. |
| User/API visibility | `src/server/routes/kis-ws-slots.ts`, `src/client/components/KisWsSlotRail.tsx`, and Settings KIS WS controls expose active/fallback states and reasons. | Users can see why a ticker is realtime or fallback. |
| Toss-first data-health policy | `src/server/routes/runtime.ts` reports KIS legacy surfaces with Toss primary providers, fallback reasons, activation mode, automatic/manual state, and any env gate. | The runtime status has a dedicated legacy fallback surface that distinguishes suppressed-by-default, conditional fallback, explicit opt-in, manual-only, and credentials-required paths. |

### Still Legacy Or Transitional

| Area | Evidence | Required follow-up |
|---|---|---|
| KIS quote/polling fallback | Foreground KIS quote fallback is disabled by default and only runs when `ARAON_KIS_QUOTE_FALLBACK_ENABLED=1` is set. Watchlist KIS REST polling fallback is also disabled by default and only runs when `ARAON_KIS_POLLING_FALLBACK_ENABLED=1` is set; even then Toss quote polling must be disabled or repeatedly failing before KIS polling opens. `/runtime/data-health` reports these surfaces as `suppressed_by_default` or `conditional_fallback`, with `automatic` and `envGate` fields. | Keep both REST quote and polling fallback paths as explicit opt-in legacy fallbacks only. |
| KIS chart fallback | `src/server/app.ts` tries Toss daily/minute chart sources first. KIS chart fallback is now disabled by default and only runs when `ARAON_KIS_CHART_FALLBACK_ENABLED=1` is set. `/runtime/data-health` reports the chart fallback surfaces as `suppressed_by_default` unless the env gate is explicitly enabled. | Keep as an explicit legacy fallback only while Toss chart acceptance continues; remove when no longer useful. |
| KIS master refresh | `src/server/services/master-stock-service.ts` still supports KIS MST refresh, but app boot and post-credential hooks now leave auto refresh disabled unless `ARAON_KIS_MASTER_AUTO_REFRESH=1` is set. `/runtime/data-health` marks it `manual_only` with `automatic=false` unless the env gate is enabled. | Keep as manual/legacy maintenance while local cached master + Toss search remain the default model. |
| KIS watchlist import | `src/server/routes/import.ts` registers `POST /import/kis-watchlist`; successful responses now label the source as `kis-legacy-watchlist-import`, role as `optional_migration_helper`, and primary provider as `toss-watchlist`. Route logs record group count, not raw group names, and KIS failure logs/responses use bounded diagnostics instead of raw upstream error objects or payloads. `/runtime/data-health` marks it `manual_only` with no env gate. | Keep as optional migration helper only. Toss watchlist should be the primary watchlist source after login. |
| KIS REST profile/governor | `src/server/kis/kis-rest-profile-router.ts`, `src/server/kis/kis-outbound-limiter.ts`, and governor status UI still exist. | Retain while KIS fallback surfaces remain, but keep them labelled as legacy fallback plumbing. |
| KIS credential-first copy | `README.md`, `INSTALL.md`, install acceptance, KIS setup guides, and Settings copy now frame KIS as optional realtime rail material. | Continue checking new UI/docs surfaces so KIS does not reappear as the primary onboarding path. |
| KIS account/watchlist vocabulary | Some route names and UI controls still say KIS watchlist/import/setup. | Keep only where the feature is specifically a KIS migration/helper feature. Do not use KIS wording for the primary product flow. |

## Keep / Isolate / Remove Decision

| Component | Decision | Rationale |
|---|---|---|
| KIS WebSocket client, tick parser, approval issuer | Keep | Required for optional low-latency KR market-data rail. |
| KIS WS smart slot allocator/state/rebalancer/routes/UI | Keep | Implements the desired cap40 high-value ticker policy. |
| KIS REST quote polling | Explicit opt-in fallback | Foreground quote fallback requires `ARAON_KIS_QUOTE_FALLBACK_ENABLED=1`. Watchlist polling fallback requires `ARAON_KIS_POLLING_FALLBACK_ENABLED=1` and only opens after Toss quote polling is unavailable or unhealthy. It should not be a primary steady-state source. |
| KIS daily/today-minute chart fetchers | Explicit opt-in fallback | Toss chart REST is primary. KIS chart fallback no longer runs by default and requires `ARAON_KIS_CHART_FALLBACK_ENABLED=1`. |
| KIS master MST refresh | Manualize or replace | Search should not require KIS credentials. Cached local metadata plus Toss search is the Toss-first path. |
| KIS watchlist import | Optional helper | Useful for migration from legacy Araon/KIS users, but not part of the Toss-first core flow. |
| KIS account/order/trading semantics | Remove/avoid | Toss account surfaces are the truth source. KIS must not imply account or order control. |
| KIS governor/AIMD profile routing | Keep only while REST fallback exists | Safety plumbing is still needed for any remaining KIS REST calls. It can be deleted only after all REST fallback is gone. |

## Acceptance Gates Before Final Cleanup

1. Toss QR login smoke passes with persistent session status and no raw cookie or
   storage output.
2. `scripts/internal/probes/probe-toss-authenticated-read-smoke.mts` passes
   against a real session for account, summary, portfolio, orders,
   transactions, watchlist, and Toss asset news.
3. `scripts/internal/probes/probe-toss-realtime-sse-smoke.mts` observes bounded
   SSE counter/status metadata from a real session.
4. Toss chart/search/TOP100/quote local UI smoke passes without KIS credentials.
5. KIS WS slot rail passes with credentials and never exceeds the per-profile
   cap.
6. README, INSTALL, and runbooks are rewritten so Toss login is the primary
   first-run path and KIS is optional realtime acceleration/fallback.
7. Any remaining KIS REST calls are explicitly labelled as legacy fallback in
   API/status/UI, including activation mode, automatic/manual state, and env
   gate where relevant. Clean no-credential startup still makes no KIS calls.

## Current Conclusion

KIS has not been fully reduced to the final role yet. The WS allocator path is
mostly aligned with the desired architecture, and the first documentation,
master-refresh manualization, chart fallback opt-in, foreground quote fallback
opt-in, KIS watchlist import labelling/sanitized diagnostics, and KIS polling
fallback opt-in passes are now in place. Some fallback plumbing still remains
because the explicit legacy fallbacks still exist. The next safe cleanup step is
not deletion; it is to keep trimming or proving the remaining fallback plumbing
while keeping the optional WS rail intact.
