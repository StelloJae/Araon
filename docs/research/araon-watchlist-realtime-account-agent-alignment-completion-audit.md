# Araon Watchlist, Realtime, Account, Agent Alignment Completion Audit

Date: 2026-05-18
Status: IN PROGRESS - account/watchlist/browser verification refreshed; market-hours recent-surge row evidence still pending

This audit tracks the goal in
`docs/research/araon-watchlist-realtime-account-agent-alignment-goal.md`.

## Verification Summary

Automated checks completed:

- Focused regression tests: PASS for recent-surge `0~30초` copy, recent-surge row click wiring, surge aggregator, Toss account rail session probing, and Toss account rail UI behavior.
- `npm test`: PASS, 226 files / 1502 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS, 18 samples, 0 issues.
- Tracked-file secret scan: PASS with expected code/test identifier hits only. No live Toss/KIS/session/account/order/watchlist raw value was found in the checked output.
- 2026-05-18 follow-up after the shared ticker-open error copy cleanup: focused tests PASS, `npm run typecheck` PASS, `npm run build` PASS, `git diff --check` PASS.

Browser QA completed:

- `1920x1080`: PASS for no document-level horizontal or vertical overflow, `0~30초` copy, clean account rail states, and no legacy pending-price copy.
- `1600x1000`: PASS for home layout, TOP100 split, favorites/recent surge block, selected chart, agent rail, account rail, bottom status bar.
- `1440x900`: PASS for no document-level horizontal or vertical overflow, `0~30초` copy, account rail controls, and no legacy pending-price copy.
- `900x900`: PASS for responsive collapse; account rail collapses to icon rail and the main workspace expands.
- Account rail open/collapse width: PASS. Icon rail remained `48px` across collapsed/open/reopened states.
- Account rail controls: PASS. Browser verified sort control, current/evaluation display toggle, circular refresh action, and no `읽기 전용` pill.
- Account rail row click: PASS. Clicking an account row chart action changed the selected ticker/chart.
- TOP100 row click: PASS. Clicking a TOP100 row changed the selected ticker header/chart.
- SurgeBlock row click path: PASS for the same row component with real Toss data. During after-hours QA, switching SurgeBlock to `오늘 강세` exposed real rows; clicking `비투엔` changed the selected chart to `비투엔`.
- Recent surge browser row click: BLOCKED in live UI because the market was after-hours and the recent-surge list had no row at the time of QA. Focused component test covers the recent-surge click wiring.

Current live account/watchlist evidence:

- Toss account session is usable again for portfolio/watchlist reads.
- Redacted API evidence after QR refresh:
  - Toss positions: 8.
  - `/watchlist` counts: Toss watchlist 18, positions 8, local fallback 10, returned 21.
  - `/watchlist/reconcile` dry-run: add 0, remove 0 after the bounded live reconcile.
  - Visible pending-price states in normalized watchlist API: 0.
  - Toss fast quote lane: target 64, hard 100, requested/returned 46, no last error.
- Earlier bounded live reconcile evidence in this lane: positions 8, dry-run add 5/remove 0, apply add 5/remove 0, follow-up dry-run add 0/remove 0. Output was count-only/redacted.

Current blocker:

- Live browser row-click evidence for recent surge remains pending because the current after-hours runtime did not expose a real recent-surge row. This should be rechecked during market hours or with a non-fake deterministic runtime event harness.

## Completion Criteria Evidence

1. Toss watchlist, Toss holdings, and Araon favorites behave as one coherent `즐겨찾기` product surface.
   - Status: PASS by runtime/API; browser recheck pending for final gate.
   - Evidence: normalized `/watchlist` model now merges Toss watchlist, portfolio positions, and Araon local fallback with explicit membership provenance.
   - Runtime evidence: Toss positions 8, watchlist counts Toss 18 / positions 8 / local 10 / returned 21.

2. Held positions appear in favorites without requiring a manual Araon favorite.
   - Status: PASS by implementation/tests/API; browser recheck pending for final gate.
   - Evidence: service/store tests cover held-position visibility and filled star behavior.
   - Runtime evidence: `/watchlist` includes positions source count 8 and reconcile add/remove 0 after sync.

3. Held items do not show empty star just because Toss watchlist sync has not run yet.
   - Status: PASS by implementation/tests/API; browser recheck pending for final gate.
   - Evidence: watchlist store and favorites component tests cover held auto rows as visible/fill-star rows.
   - Runtime evidence: bounded holdings-to-watchlist reconcile completed; follow-up dry-run add/remove 0.

4. Araon star/unstar is product-aware Toss watchlist sync intent.
   - Status: PASS by implementation/tests.
   - Evidence: product-aware watchlist route/client flow is covered by focused tests.
   - Safety: live broad destructive cleanup remains forbidden.

5. Toss watchlist auto-add/remove uses safe provenance and redacted evidence.
   - Status: PASS by tests and bounded live add evidence; remove path remains covered by tests only because no auto-removal candidate is present.
   - Evidence: provenance repository and reconciliation tests cover bounded add/remove candidates and manual-item protection.
   - Live evidence: count-only reconcile applied 5 add candidates and follow-up dry-run returned add 0/remove 0.

6. Manual Toss/Araon watchlist items are not auto-deleted just because holdings disappear.
   - Status: PASS by tests.
   - Evidence: reconciliation tests cover manual watchlist survival when holdings are absent.

7. Normal favorites UI does not show steady `가격 확인 중`.
   - Status: PASS.
   - Evidence: browser body text check returned no `가격 확인 중`; latest normalized watchlist API reported 0 visible pending-price states.

8. Favorites/holdings are first-priority price hydration candidates.
   - Status: PASS by tests.
   - Evidence: Toss fast quote lane tests cover favorites/holdings priority above agent/current/TOP100.

9. KIS slots prioritize watchlist/holdings, then agent, then lower-priority sources; TOP100 does not displace higher-priority rows.
   - Status: PASS by tests.
   - Evidence: KIS slot allocator/session rebalancer tests were updated to the new goal priority and pass.

10. KIS fallback/full-slot behavior is covered by Toss fast quote, not a broken price state.
    - Status: PASS by implementation/tests.
    - Evidence: fast quote candidate lane prioritizes favorites/holdings and KIS companion rows without relying on TOP100 slots first.
    - 2026-05-18 follow-up: `64` is an Araon default coverage size, not a Toss limit. Public quote probes passed 10 rps x 64 for 10 minutes and 300 rps x 64 as a short burst; 500 rps x 64 degraded latency and is not a product target.
    - Runtime evidence: fast quote target 64 / hard 100, requested 46 / returned 46, no last error.

11. TOP100 remains Toss-primary and does not depend on KIS.
    - Status: PASS.
    - Evidence: browser showed Toss web ranking copy and live TOP100 split; API/UI kept TOP100 independent from KIS slot truth.

12. Recent surge copy and logic use `0~30초`.
    - Status: PASS.
    - Evidence: browser body text contained `0~30초` and did not contain `10~30초`; focused regression test asserts the new copy and rejects the old copy.

13. Recent surge row click changes selected chart.
    - Status: PARTIAL.
    - Evidence: focused component regression test invokes the recent-surge row click handler and verifies it emits the clicked ticker; browser QA verified the same `SurgeRow` component path with real Toss `오늘 강세` data by clicking `비투엔` and observing the selected chart change to `비투엔`; TOP100 row click was also browser-verified.
    - Blocker: live recent surge block had no row at the moment of QA, so row-click visual evidence still needs a real surge event or a focused non-fake runtime event harness.

14. Duplicate visible movement toasts remain suppressed.
    - Status: PASS by tests.
    - Evidence: existing alert/toast dedupe tests pass; no duplicate toast was observed during the short browser QA window.

15. Toss account rail supports sort order selection.
    - Status: PASS.
    - Evidence: component tests cover the sort selector; Browser QA verified the live account rail exposes the sort control.

16. Toss account rail supports current price / evaluation amount toggle.
    - Status: PASS.
    - Evidence: component tests cover display mode behavior; Browser QA verified the live account rail exposes the current/evaluation toggle.

17. Toss account rail row click changes selected chart when supported.
    - Status: PASS.
    - Evidence: account rail now receives `onOpenTicker`; component tests cover row click wiring; Browser QA clicked a populated account row chart action and observed selected ticker/chart text change.

18. Toss account rail refresh is a circular icon button and `읽기 전용` pill is removed.
    - Status: PASS.
    - Evidence: browser body text did not contain `읽기 전용`; UI shows login button when unauthenticated.

19. Toss account rail open/collapse causes no sidebar width jitter.
    - Status: PASS.
    - Evidence: browser measurement showed icon rail width fixed at `48px` before/collapsed/reopened.

20. UI typography/density is consistent with `docs/design.md`.
    - Status: PASS with minor follow-up risk.
    - Evidence: 1920/1600/1440/900 browser checks showed no document overflow and no large text outlier in the verified home/account viewports.
    - Risk: any later account rail copy expansion should be rechecked visually because this area is text-dense.

21. Agent UI explains decision-support readiness and live-trading lock honestly.
    - Status: PASS.
    - Evidence: browser showed decision-support wording and `실거래 잠금`; no live-trading bot promise was visible.

22. No raw Toss/KIS/session/account/order/watchlist payload leaks into UI, logs, docs, stdout, or git diff.
    - Status: PASS for automated scan scope.
    - Evidence: broad and narrow tracked-file scans found only identifier/test-code hits, not live raw secret/session values.

23. Completion audit document is written.
    - Status: PASS.
    - Evidence: this document.

24. Required tests/build/diff/no-live soak pass, or remaining blockers are explicitly documented with next minimal probe.
    - Status: PARTIAL.
    - Evidence: focused tests, full `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`, no-live soak, tracked-file secret scan, and Browser QA pass.
    - Blocker: live recent-surge row-click evidence is still unavailable after-hours.

## Next Minimal Probe

1. If a real recent surge row appears during market hours, click it and verify selected ticker/chart changes.
2. If no live row appears, add a deterministic non-fake runtime event harness that feeds a real-shaped surge event through the UI path without synthetic financial movement.
3. Re-run final automated gates after the recent-surge live evidence is captured.
