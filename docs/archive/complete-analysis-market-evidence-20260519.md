# Pre-Release Market Evidence Summary

Source: `docs/archive/complete-analysis-market-evidence-20260519.json`

## Readiness

- ok: `true`
- marketEvidenceReady: `false`
- completionReady: `false`
- finalGoalCompletionReady: `false`
- finalGoalRemainingNeed: This report only proves read-only market data evidence. Final Araon goal completion still requires browser/Computer Use visual QA and the written completion audit.

## Window

- startedAt: `2026-05-19T04:01:35.983Z`
- finishedAt: `2026-05-19T04:02:36.237Z`
- kstStartedAt: `2026-05-19 13:01 KST`
- kstFinishedAt: `2026-05-19 13:02 KST`
- integratedLiveWindowLikely: `true`
- regularMarketLikely: `true`
- note: KST weekday regular KRX market-hours heuristic. Official holiday calendar is not checked.

## Runtime Signals

- targetUrl: `http://127.0.0.1:5173`
- intervalMs: `500`
- sampleCount: `560`
- selectedTicker: `005930`
- quoteTickers: `005930,000660,035720`
- sampleCadence: `ok=true, p95GapMs=880, maxGapMs=1508`
- latency: `ok=true, p95DurationMs=175, maxDurationMs=958`
- fastQuoteLane: `ok=false, running=true, intervalMs=100-100, targetCap=200, hardCap=400, accepted=13`

## Criterion Mapping

| # | Status | Evidence | Remaining need |
|---:|---|---|---|
| 12 | pass | liveWindowOk=true; top100Observed=true; realtimeRankingObserved=true; top100RankReorderObserved=true; realtimeRankReorderObserved=false; sampleGapP95Ms=880; endpointP95Ms=175 | none |
| 13 | blocked | fastQuoteSourceOk=true; running=true; intervalMs=100-100; maxTargetCap=200; maxHardCap=400; maxAcceptedCount=13 | Runtime data-health must show a running bounded toss-fast-quote lane with safe caps. |
| 14 | blocked | liveWindowOk=true; quoteMovementObserved=true; distinctValueStates=112; fastQuoteLaneOk=false | This harness only proves bounded quote movement input. Browser UI/toast observation must still prove threshold and cooldown behavior. |
| 16 | supporting | liveWindowOk=true; chartProgressionObserved=true; newestBucketAt=2026-05-19T04:02:00.000Z; latestSampleCount=333 | Browser visual QA must still confirm mini chart renders the progression without refresh. |
| 17 | supporting | liveWindowOk=true; chartProgressionObserved=true; newestBucketAt=2026-05-19T04:02:00.000Z; latestSampleCount=333 | Browser visual QA must still confirm full chart renders the progression without refresh. |
| 41 | supporting | liveWindowOk=true; sampleGapP95Ms=880; endpointP95Ms=175; endpointMaxMs=958 | Harness latency is supporting evidence only. Browser/Computer Use QA must still confirm no visible severe lag. |

## Blockers

- Toss fast quote lane runtime was not healthy.

## Browser / Computer Use QA Still Required

- [ ] 1600x1000 Home: TOP100 rank reorder, recent surge threshold behavior, bottom status bar alignment, no severe update lag.
- [ ] 1440x900 Home: locked 50:50 layout, favorites/recent surge readability, selected chart, agent panel density.
- [ ] Full Chart: expansion-style transition, no scroll regression, current candle/current price progression without refresh.
- [ ] Agent Detail: understandable event/safety state and clearly locked live execution.
- [ ] 900px responsive: account rail collapse/expand, chart, and status bar fit without overflow.
