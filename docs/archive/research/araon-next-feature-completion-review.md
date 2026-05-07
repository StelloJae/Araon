# Araon next feature completion review

Date: 2026-05-07 KST

This document summarizes the seven product hardening items completed after the
desktop beta work. It is written as a compact review packet for GPT 5.5 Pro.

## Verdict

Implementation status: **DONE**

Release status: **not released in this task**

Live-call status:

- KIS token issuance: 0 during this feature batch
- KIS approval-key issuance: 0 during this feature batch
- WebSocket/cap test: 0 during this feature batch
- daily/minute backfill live call: 0 during this feature batch

## Completed items

### 1. Chart visible-range repair

Commit: `13ab4ad feat(chart): add visible range repair control`

What changed:

- `POST /stocks/:ticker/candles/ensure-coverage` accepts an explicit `force`.
- `StockCandleChart` exposes a small `차트 재검사` control.
- Forced repair bypasses stale coverage ledger state only for the selected
  ticker/range.

Product value:

- If a chart range looks wrong, the user can repair that visible range without
  pretending missing data exists.

### 2. Background daily backfill transparency

Commit: `a53454a feat(backfill): surface recent daily backfill activity`

What changed:

- Background daily backfill snapshots include a compact recent ticker history.
- `/runtime/data-health` exposes recent success/failure attempts.
- Settings data-health panel shows recent ticker activity.

Product value:

- The user can see that daily filling is waiting, running, succeeding, or
  failing for actual tickers instead of guessing from a vague banner.

### 3. Signal outcome dashboard visibility

Commit: `546a14b feat(signals): show outcome dashboard in data health`

What changed:

- Data-health now shows 5m/15m/30m average signal outcomes when candle coverage
  exists.
- Missing post-signal candles remain pending; no synthetic return is created.

Product value:

- Araon starts answering whether its realtime signal stream is useful, while
  staying honest about missing candle coverage.

### 4. Observation plan readiness

Commit: `5521450 feat(observation): clarify plan readiness before save`

2026-05-07 update: the observation-plan editor was removed from the product
surface. This historical note is retained only as prior context.

Removal status:

- The former observation-plan editor is no longer part of the stock detail
  modal.
- Current builds should keep the modal focused on realtime movement, chart
  coverage, news/disclosure links, and data health.

### 5. News link change marker

Commit: `ebd9e26 feat(news): mark newly discovered feed links`

What changed:

- News refresh compares parsed Naver Finance URLs against cached URLs.
- Newly discovered links are returned with `isNew=true`.
- The detail panel marks them as `새 링크`.

Product value:

- The user can spot fresh external news links without Araon claiming news
  analysis, summarization, or filing interpretation.

### 6. Per-stock data quality score

Commit: `37e2cb8 feat(data): show per-stock data quality score`

What changed:

- Stock detail modal now shows a compact data quality panel.
- The score combines live/snapshot price state, 1m candle presence, daily candle
  presence, and volume-baseline readiness.
- Candle checks are read-only local API reads.

Product value:

- Sparse charts and collecting states become explainable per ticker.

### 7. No-live operational observation harness update

Commit: pending in this stage

What changed:

- `npm run soak:no-live` now samples `GET /stocks` in addition to runtime and
  backup health endpoints.
- `docs/runbooks/long-run-soak.md` documents the new data-health scope:
  backfill attempts, signal outcomes, candle retention, news/note/signal growth,
  and volume baseline readiness.

Product value:

- Future beta candidates have a repeatable no-live guard before release prep.

## Verification run during the work

Focused tests:

- candle ensure-coverage and chart repair UI: passed
- background backfill scheduler/runtime/settings visibility: passed
- signal outcome data-health display: passed
- observation plan readiness display: passed
- news feed change marker and routes: passed
- per-stock data quality panel: passed

Final full validation for this batch should include:

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run soak:no-live -- --duration-ms 3000 --interval-ms 1000`
- `git diff --check`
- raw secret/token/key leak grep
- Browser/Computer UI smoke against the local app

## Remaining risks

- News remains link-based and parser-dependent. It is not article analysis or
  filing summarization.
- Signal outcome quality depends on stored candle coverage.
- Per-stock data quality is a user-facing diagnostic score, not a trading
  signal.
- No-live soak does not replace long market-hours observation.
- Windows desktop execution and signed/notarized desktop release remain outside
  this feature batch.

## Suggested GPT 5.5 Pro review prompt

```txt
Araon next feature completion review 요청.

아래 문서와 현재 HEAD를 기준으로 PM/architecture review를 해주세요:

- docs/research/araon-next-feature-completion-review.md
- 최근 7개 작업:
  1. chart visible-range repair
  2. background daily backfill transparency
  3. signal outcome dashboard visibility
  4. observation plan readiness
  5. news link change marker
  6. per-stock data quality score
  7. no-live operational observation harness update

Review focus:
1. 제품적으로 이 7개가 Araon의 “자동 관찰 도구” 방향에 맞는가?
2. 지금도 사용자가 불신할 만한 빈 상태/불투명 상태가 남아 있는가?
3. raw credentials/token/account/raw tick boundary가 잘 지켜졌는가?
4. chart coverage / signal outcome / news marker / data quality score의 remaining risk는 beta에서 허용 가능한가?
5. 이제 새 기능을 더 넣는다면 무엇이 가장 ROI가 높은가?

중요:
- 이번 기능 배치 중 live KIS/token/approval/WebSocket/backfill 호출은 0회.
- release/npm publish는 하지 않았음.
- news는 요약/분석이 아니라 외부 링크 기반.
- per-stock data quality score는 진단용이며 trading signal이 아님.
- soak는 no-live reliability harness이며 market-hours long-run observation 대체물이 아님.

원하는 출력:
- GO / CONDITIONAL GO / NO-GO
- P0/P1/P2 리스크
- 추가 기능 추천 우선순위
- release 전 필수 검증
```
