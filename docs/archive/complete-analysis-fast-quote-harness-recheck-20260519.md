# Pre-Release Market Evidence Summary

Source: `docs/archive/complete-analysis-fast-quote-harness-recheck-20260519.json`

## Readiness

- ok: `true`
- marketEvidenceReady: `true`
- completionReady: `true`
- finalGoalCompletionReady: `false`
- finalGoalRemainingNeed: This report only proves read-only market data evidence. Final Araon goal completion still requires browser/Computer Use visual QA and the written completion audit.

## Window

- startedAt: `2026-05-19T08:07:40.030Z`
- finishedAt: `2026-05-19T08:07:43.533Z`
- kstStartedAt: `2026-05-19 17:07 KST`
- kstFinishedAt: `2026-05-19 17:07 KST`
- integratedLiveWindowLikely: `true`
- regularMarketLikely: `false`
- note: KST weekday integrated live window, but outside regular KRX market-hours evidence window. Official holiday calendar is not checked.

## Runtime Signals

- targetUrl: `http://127.0.0.1:3000`
- intervalMs: `500`
- sampleCount: `35`
- selectedTicker: `005930`
- quoteTickers: `005930`
- sampleCadence: `ok=true, p95GapMs=733, maxGapMs=741`
- latency: `ok=true, p95DurationMs=215, maxDurationMs=234`
- fastQuoteLane: `ok=true, running=true, intervalMs=100-100, targetCap=200, hardCap=400, accepted=30`

## Criterion Mapping

| # | Status | Evidence | Remaining need |
|---:|---|---|---|
| 12 | pass | liveWindowOk=true; top100Observed=true; realtimeRankingObserved=true; top100RankReorderObserved=true; realtimeRankReorderObserved=false; sampleGapP95Ms=733; endpointP95Ms=215 | none |
| 13 | supporting | fastQuoteSourceOk=true; running=true; intervalMs=100-100; maxTargetCap=200; maxHardCap=400; maxAcceptedCount=30 | Client surge tests still prove source filtering; market-hours UI must show realtime surge behavior from moving prices. |
| 14 | supporting | liveWindowOk=true; quoteMovementObserved=true; distinctValueStates=7; fastQuoteLaneOk=true | This harness only proves bounded quote movement input. Browser UI/toast observation must still prove threshold and cooldown behavior. |
| 16 | supporting | liveWindowOk=true; chartProgressionObserved=true; newestBucketAt=2026-05-19T08:07:00.000Z; latestSampleCount=544 | Browser visual QA must still confirm mini chart renders the progression without refresh. |
| 17 | supporting | liveWindowOk=true; chartProgressionObserved=true; newestBucketAt=2026-05-19T08:07:00.000Z; latestSampleCount=544 | Browser visual QA must still confirm full chart renders the progression without refresh. |
| 41 | supporting | liveWindowOk=true; sampleGapP95Ms=733; endpointP95Ms=215; endpointMaxMs=234 | Harness latency is supporting evidence only. Browser/Computer Use QA must still confirm no visible severe lag. |

## Blockers

- none

## Browser / Computer Use QA Still Required

- [ ] 1600x1000 Home: TOP100 rank reorder, recent surge threshold behavior, bottom status bar alignment, no severe update lag.
- [ ] 1440x900 Home: locked 50:50 layout, favorites/recent surge readability, selected chart, agent panel density.
- [ ] Full Chart: expansion-style transition, no scroll regression, current candle/current price progression without refresh.
- [ ] Agent Detail: understandable event/safety state and clearly locked live execution.
- [ ] 900px responsive: account rail collapse/expand, chart, and status bar fit without overflow.
