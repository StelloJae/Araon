# NXT9a - cap20 readiness preview

**Run date**: 2026-04-29 KST  
**Starting HEAD**: `cdbefa7`  
**Result**: DONE - non-live cap20 readiness model and preview wiring

> Superseded by `docs/research/nxt9-cap20-cap40-live-smoke.md`: cap20 and
> cap40 are now verified for controlled, session-scoped SettingsModal UI smoke.
> This file remains as the pre-live readiness checkpoint.

## Scope

NXT9a does not widen live realtime subscriptions.

No KIS approval key was issued, no WebSocket connection was opened, and no
`H0UNCNT0` subscription was made in this step. Cap 20 and cap 40 remain
unavailable in `session-enable` and in the operator UI.

## Current Evidence

- cap 1 / 3 / 5 / 10 UI live hard-limit smoke is verified.
- NXT8e proved the cap 10 SettingsModal button path with
  `sessionAppliedTickCount=50` and `endReason=applied_tick_limit_reached`.
- REST polling remains the fallback lane.
- `websocketEnabled=false` and `applyTicksToPriceStore=false` remain defaults.

## Cap20 Readiness State

```txt
cap10: verified
cap20: not_ready
cap40: not_ready
```

Blockers:

- `cap20_live_smoke_not_performed`
- `operator_approval_required`
- `cap20_not_verified`
- `cap40_not_verified`

Warnings:

- `requires_liquid_market_window`
- `do_not_enable_outside_explicit_live_smoke`

## Cap20 Session Limit Design

These values are readiness-preview design values only. They are not accepted by
`session-enable` yet.

```txt
cap20 maxAppliedTicks: 100
cap20 maxParsedTicks: 2000
cap20 maxSessionMs: 90000
```

## Cap20 Preview

`previewRealtimeCandidates({ requestedCap: 20 })` uses favorites only.

It reports:

- `requestedCap`
- `effectiveCap`
- `candidateCount`
- `shortage`
- `tickers`
- `usesFavoritesOnly=true`

Non-favorites are not promoted by the preview, and no DB tier/session state is
changed.

## Operator Surfaces

- `GET /runtime/realtime/status` now includes:
  - `readiness.verifiedCaps`
  - `readiness.nextCandidateCap`
  - `readiness.cap20Readiness`
  - `readiness.cap20Preview`
  - `readiness.cap40Readiness`
- SettingsModal shows cap 20 as `준비 중` and displays current candidate
  count/shortage.
- SSEIndicator status panel shows the same cap20 readiness preview.
- Cap 20 / 40 are still not selectable.

## Guard Checks

- live KIS approval key call: 0
- WebSocket connect: 0
- `H0UNCNT0` subscribe: 0
- live frame collection: 0
- cap20 route enable: rejected
- cap40 route enable: rejected
- persisted settings change: 0
- raw approval key / app key / app secret / access token / account: not stored

## Next Track

`NXT9b` may be a cap20 UI-controlled live smoke only after separate explicit
approval. It should run in a liquid market window and must keep route/UI
rollback and leak checks from the NXT7/NXT8 series.
