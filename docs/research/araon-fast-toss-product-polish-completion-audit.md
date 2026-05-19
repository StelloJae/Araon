# Araon Fast Toss Product Polish Completion Audit

Date: 2026-05-18
Status: PASS for 08:01 KST heartbeat verification window; regular-session rerun optional if stricter 09:00+ evidence is required

This audit tracks `docs/research/araon-fast-toss-product-polish-goal.md`.

## Summary

Implemented the first product polish pass for fast Toss quote behavior and
normal-user status UI:

- Toss fast quote lane defaults now target 100ms with target cap 200 and hard
  cap 400.
- Bottom status bar no longer exposes normal-user confusing counters such as
  total catalog count, general refresh count, general price count, raw cap
  labels, or calm KIS budget state.
- Favorites rows that have a real price but missing change fields now show an
  honest compact transient state instead of leaving the percent area blank.

The scheduled 08:01 KST heartbeat pass closed the pending browser evidence for
recent-surge row creation/click behavior, duplicate-toast suppression,
favorites hydration, bottom-bar labels, and current-candle progression in the
pre-open/장전 runtime.

## Verification

Automated checks:

- Focused tests: PASS.
  - `src/server/toss/__tests__/toss-fast-quote-lane.test.ts`
  - `src/client/components/__tests__/status-bar.test.ts`
  - `src/client/components/__tests__/favorites-block.test.ts`
- Additional focused realtime/chart/settings tests: PASS.
- `npm test`: PASS, 226 files / 1504 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`: PASS, 18
  samples / 0 issues.
- Diff secret scan: PASS. A broad first scan hit code identifiers only
  (`profileAppKey` / `profileAppSecret`); the stricter raw-literal scan found
  no raw secret-like values in the git diff.

Clean visual QA:

- Started a temporary clean local Araon server with an isolated data directory.
- Browser screenshot check at 1600x1000: PASS for no obvious layout breakage.
- DOM text check: PASS; the page did not contain `총 종목`, `일반 갱신`,
  `일반 가격`, raw `64/64`, or `폴링`.
- Bottom bar product text observed: market tape, `즐겨찾기 0`, `빠른 가격 정상`,
  and `마지막 업데이트 ...`.
- The clean screenshot was not committed because it is a disposable QA artifact.

## 2026-05-19 08:01 KST Heartbeat Verification

Runtime and browser checks were run against the already-running local Araon
dev server while preserving the dirty worktree. The visible app state showed
`PRE · 장전`; no synthetic financial data was introduced.

API/runtime evidence:

- Toss fast quote lane: PASS. `/runtime/data-health` reported the fast lane
  running at 100ms with target cap 200 and hard cap 400. The latest summarized
  cycle returned all requested hot quote items.
- Toss general quote polling: PASS. The slower general lane returned all
  requested tracked quote items.
- Watchlist/favorites hydration: PASS. `/watchlist` returned 21 items with
  price and percent fields available for all 21 items. The visible favorites
  block also showed 21 rows, 21 rows with prices, 21 rows with percent, 0
  waiting rows, and 43 visible sparkline nodes.
- Candle progression storage: PASS. For the selected recent-surge ticker, the
  latest 1m candle remained real `toss-fast-quote` data while `sampleCount` and
  `close` changed over a 6 second observation window.

Browser evidence:

- Recent surge row creation: PASS. The visible recent-surge panel showed real
  rows during the 08:01 KST heartbeat window, including 0~30초 / >=3% copy.
- Recent surge row click: PASS. Clicking the first recent-surge row changed the
  selected chart panel from the prior ticker to the clicked ticker.
- Duplicate movement toast suppression: PASS for the observed window. No active
  duplicate movement toasts were present before or after the row-click check.
- Bottom bar product labels: PASS. The visible status bar showed product-facing
  labels such as market tape, `즐겨찾기 21`, `빠른 가격 정상`, and `마지막 업데이트`.
  It did not show `총 종목`, `일반 갱신`, `일반 가격`, `64/64`, `폴링`, or `KIS WS`.
- Full chart current candle progression: PASS. Opening the chart expansion kept
  the page non-scrolling (`body` overflow hidden, viewport height equaled page
  scroll height), and the full chart panel text changed over a 6 second
  observation as the selected ticker price, volume, timestamp, and visible
  candle count updated.
- Raw value exposure scan: PASS for visible DOM text. The page text did not
  contain raw Toss/KIS/session/account/order secret-like tokens checked during
  the browser pass.

Residual note:

- This evidence is from the 08:01 KST pre-open/장전 window that the automation
  was scheduled for. If the acceptance bar is interpreted as strict regular
  session evidence, rerun the same checks after 09:00 KST.

## Acceptance Criteria

1. Hot quote lane supports 100ms target cadence for favorites/holdings/current
   chart without broad full-market polling.
   - Status: PASS by implementation/tests.
   - Evidence: fast quote lane default test now asserts interval 100ms, target
     cap 200, hard cap 400.

2. Toss fast quote target cap is raised from conservative defaults toward
   product target 200/hard 400 or an equivalent measured configuration.
   - Status: PASS by implementation/tests.
   - Evidence: `createTossFastQuoteLane()` defaults changed to 100/200/400 and
     focused tests pass.

3. Favorites/holdings are first in hot quote priority.
   - Status: PASS by prior implementation/tests; unchanged in this pass.
   - Evidence: existing fast quote candidate ordering tests still pass.

4. TOP100 does not displace favorites/holdings in fast quote or KIS slots.
   - Status: PASS by prior implementation/tests; unchanged in this pass.
   - Evidence: existing KIS slot and fast quote tests still pass.

5. KIS remains optional `실시간 추적`, max 40, KR eligible only.
   - Status: PASS by prior implementation/tests; unchanged in this pass.
   - Evidence: existing KIS slot allocator tests still pass.

6. Favorites header no longer shows confusing KIS/polling internals.
   - Status: PASS for the 08:01 KST logged-in runtime.
   - Evidence: visible favorites header used Toss-facing copy and `추적 16/16`;
     no KIS/polling wording appeared in the normal favorites surface.

7. KR eligible favorite rows show price, direction, percent, and sparkline when
   enough real samples exist.
   - Status: PASS for the visible logged-in runtime.
   - Evidence: visible favorites block showed 21 rows, 21 rows with prices, 21
     rows with percent, 0 waiting rows, and 43 sparkline nodes.

8. Rows with price but blank percent are fixed.
   - Status: PASS for the immediate blank-percent regression.
   - Evidence: `FavoritesBlock` now shows `등락률 수집 중` when a real price is
     present but change fields are not available; focused regression test
     covers this state.

9. Unsupported products show honest support state.
   - Status: PASS by prior implementation/tests; unchanged in this pass.
   - Evidence: existing unsupported watchlist tests still pass.

10. Bottom bar removes normal-user confusing counters and moves diagnostics out
    of the main tape.
    - Status: PASS.
    - Evidence: status bar tests reject `총 종목`, `일반 갱신`, `일반 가격`,
      `비실시간`, and `폴링`; clean browser DOM check also found none.

11. Chart uses Toss history primary, local candle cache, and live quote overlay.
    - Status: PASS for the observed 08:01 KST runtime.
    - Evidence: selected ticker 1m candle API returned `toss-fast-quote` latest
      candle data, and the full chart panel updated from real quote changes.

12. Current candle progresses from real samples without refresh.
    - Status: PASS for the observed 08:01 KST runtime.
    - Evidence: selected ticker 1m candle `sampleCount` and `close` changed over
      a 6 second observation window without page refresh; the full chart panel
      also updated price, volume, timestamp, and candle count.

13. No synthetic financial data is used in product UI.
    - Status: PASS for this pass.
    - Evidence: no fake candle/fake movement code was added; tests use fixtures
      only.

14. Market-hours browser QA proves recent surge row click changes selected
    chart.
    - Status: PASS for the 08:01 KST heartbeat window.
    - Evidence: real recent-surge rows appeared, clicking the first row changed
      the selected ticker/chart, and no duplicate movement toast was active
      during the observed window.

15. Verification results are recorded in the active completion audit.
    - Status: PASS.
    - Evidence: this file records the current implementation, verification,
      and 08:01 KST heartbeat evidence.

## Remaining Market-Hours Checks

The scheduled 08:01 KST heartbeat window covered the following checks with the
user's normal Araon runtime:

1. Favorites/holdings hot quote cadence: PASS by fast-lane runtime snapshot and
   visible favorites hydration.
2. KR eligible favorites do not settle into `등락률 수집 중`: PASS in the visible
   favorites block.
3. Recent-surge row appears from real movement: PASS.
4. Recent-surge row click changes selected ticker/chart: PASS.
5. Duplicate surge toast suppression: PASS for the observed active toasts.
6. Mini/full chart current candle progresses from real quote samples without
   refresh: PASS by candle API and full chart browser evidence.
7. Bottom bar remains product-facing in logged-in runtime: PASS.

Optional follow-up:

- If a stricter distinction is needed between 장전 and 정규장, rerun the same
  browser pass after 09:00 KST and append the result here.

Automation note:

- The existing `araon` thread heartbeat was updated on 2026-05-18 to resume
  this verification at the next 08:01 KST market-hours window.
- The 08:01 KST heartbeat verification ran on 2026-05-19 and this audit was
  updated with the result.
