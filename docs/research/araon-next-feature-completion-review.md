# Araon next feature completion review

Date: 2026-05-07 KST

This document summarizes the seven feature/hardening items completed after the
beta desktop work. It is written as a compact review packet for GPT 5.5 Pro.

## Verdict

Implementation status: **DONE**

Release status: **not released in this task**

Live-call status:

- KIS token issuance: 0
- KIS approval-key issuance: 0
- WebSocket/cap test: 0
- daily/minute backfill live call: 0

## Completed items

### 1. Candle Coverage Ledger + Gap-Aware Backfill

Commit: `df403f9 feat(chart): track candle coverage ledger`

What changed:

- Added `candle_coverage_segments`.
- Recorded successful selected-ticker coverage windows.
- `ensure-coverage` skips repeated exact window fetches when the ledger already
  has a complete segment.
- Candle API coverage can include ledger metadata.

Product value:

- Chart range changes no longer blindly repeat backfill calls for the same
  already-covered window.

### 2. Chart Data Inspector

Commit: `85902f9 feat(chart): show candle data inspector`

What changed:

- Candle coverage now reports visible bucket gaps.
- Stock candle chart includes a compact data inspector for source mix, gaps,
  partial candles, and coverage ledger state.

Product value:

- Users can see why a chart looks sparse instead of assuming the app is broken.

### 3. Signal Outcome Dashboard

Commit: `61062ff feat(signals): summarize signal outcome performance`

What changed:

- Added `GET /runtime/signals/outcomes`.
- Summarizes signal outcomes across 5m, 15m, and 30m horizons.
- Data health panel surfaces evaluated/pending signal outcome counts.
- Missing candle coverage stays pending; no synthetic return is created.

Product value:

- Araon can start judging whether its realtime signal stream is useful.

### 4. Watch Thesis / Observation Plan

Commit: `ed9786b feat(notes): add stock observation plans`

What changed:

- Added `stock_observation_plans`.
- Added per-ticker plan API and StockDetailModal panel.
- Stores thesis, trigger, invalidation, and status.

Product value:

- A tracked stock can now have a concrete observation plan instead of just a
  passive note list.

### 5. Structured Disclosure Feed

Commit: `fd57abb feat(news): add structured disclosure links`

What changed:

- Added `stock_disclosure_items`.
- Added `GET /stocks/:ticker/disclosures`.
- Generates structured DART/KIND search-link items without scraping or
  summarizing filings.
- Stock detail news panel shows structured disclosure links separately from
  news links.

Product value:

- Users get a clean path to official disclosure search surfaces without Araon
  pretending to analyze filings.

### 6. Backup / Export / Restore

Commit: `0bf1132 feat(backup): add local export and restore`

What changed:

- Added `GET /runtime/backup/export`.
- Added `POST /runtime/backup/restore`.
- Added Settings connection-tab backup panel.
- Added repository restore helpers for notes and observation plans.
- Added runbook: `docs/runbooks/local-backup-restore.md`.

Included:

- tracked stocks
- favorites
- observation notes
- observation plans

Excluded:

- KIS credentials
- tokens
- approval keys
- account identifiers
- candles
- raw ticks
- runtime state

Product value:

- Local user intent can be moved or backed up without leaking credentials or
  wasting historical market-data storage.

### 7. Long-run Reliability Soak

Commit: `f0e84de chore(soak): add no-live reliability harness`

What changed:

- Added `npm run soak:no-live`.
- Added `scripts/soak-araon.mts`.
- Added evaluator tests for non-2xx, non-JSON, and sensitive-looking values.
- Added runbook: `docs/runbooks/long-run-soak.md`.

Short local proof:

- Command: `npm run soak:no-live -- --duration-ms 3000 --interval-ms 1000`
- Result: `ok=true`
- Endpoints sampled: `/credentials/status`, `/runtime/realtime/status`,
  `/runtime/data-health`, `/runtime/signals/outcomes`,
  `/runtime/backup/export`
- Samples: 20
- Issues: 0

Product value:

- Araon now has a repeatable no-live stability harness before future beta
  releases.

## Verification already run during the work

Focused tests:

- stock news/disclosure routes + DB migration tests: pass
- runtime backup routes + managed settings component tests: pass
- soak evaluator tests: pass

Typecheck:

- `npm run typecheck`: pass after each implementation checkpoint

Short soak:

- `npm run soak:no-live -- --duration-ms 3000 --interval-ms 1000`: pass

Final full validation is expected after this document commit:

- `npm test`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- raw secret/token/key leak grep
- browser smoke, if local server validation is available

## Remaining risks

- Disclosure feed is link-based. It is not filing parsing, filing alerting, or
  disclosure summarization.
- Signal outcome quality depends on candle coverage. Pending outcomes are
  expected when post-signal candles are unavailable.
- Backup/restore intentionally excludes candles; market data should be
  regenerated from persisted local collection and approved KIS backfill flows.
- Soak harness is no-live. It does not replace long market-hours observation.
- Windows desktop execution remains separate from this feature set.

## Suggested GPT 5.5 Pro review prompt

```txt
Araon next feature completion review 요청.

아래 문서와 현재 HEAD를 기준으로 PM/architecture review를 해주세요:

- docs/research/araon-next-feature-completion-review.md
- commits:
  - df403f9 feat(chart): track candle coverage ledger
  - 85902f9 feat(chart): show candle data inspector
  - 61062ff feat(signals): summarize signal outcome performance
  - ed9786b feat(notes): add stock observation plans
  - fd57abb feat(news): add structured disclosure links
  - 0bf1132 feat(backup): add local export and restore
  - f0e84de chore(soak): add no-live reliability harness

Review focus:
1. 제품적으로 이 7개가 Araon의 “관찰 도구” 방향에 맞는가?
2. 너무 넓힌 기능이나 위험한 기본값이 있는가?
3. raw credentials/token/account/candle/raw tick boundary가 잘 지켜졌는가?
4. chart coverage / signal outcome / backup / soak의 remaining risk는 beta에서 허용 가능한가?
5. 다음에 기능을 더 추가한다면 무엇이 가장 ROI가 높은가?

중요:
- 이번 작업 중 live KIS/token/approval/WebSocket/backfill 호출은 0회.
- release/npm publish는 하지 않았음.
- disclosure/news는 요약/분석이 아니라 외부 링크 기반.
- backup은 user-authored local state만 포함하고 credentials/candles/raw ticks는 제외.
- soak는 no-live reliability harness이며 market-hours long-run observation 대체물이 아님.

원하는 출력:
- GO / CONDITIONAL GO / NO-GO
- P0/P1/P2 리스크
- 추가 기능 추천 우선순위
- release 전 필수 검증
```
