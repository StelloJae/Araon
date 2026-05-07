# NXT8d - rollout readiness summary

**Run date**: 2026-04-28 KST
**Starting HEAD**: `804df79`
**Result**: DONE — non-live operator UX/readiness wording updated

## Scope

NXT8d does not run another live session. It records the honest current state
after NXT8b and NXT8c both verified the cap 10 SettingsModal button path but
observed zero live ticks.

No KIS approval key was issued, no WebSocket connection was opened, and no
`H0UNCNT0` subscription was made in this step.

## Readiness State

```txt
cap1Ready: true
cap3Ready: true
cap5Ready: true
cap10RouteReady: true
cap10UiPathReady: true
cap10UiHardLimitReady: false
cap10UiHardLimitConditional: true
readyForCap20: false
readyForCap40: false
```

Meaning:

- cap 1 / 3 / 5 UI live hard-limit is verified.
- cap 10 backend/session hard-limit is verified from NXT8a.
- cap 10 UI button path and status panels are verified from NXT8b/NXT8c.
- cap 10 UI hard-limit under a live tick burst remains conditional because
  NXT8b and NXT8c observed zero live ticks.
- cap 20 / 40 remain unverified and unsupported.

## UI Changes

SettingsModal now labels cap 10 as `조건부` instead of `다음 검증 예정`.

The operator copy now says that cap 10 button path and session limit structure
were verified, but recent UI live retries saw no execution ticks, so live burst
hard-limit proof remains market-liquidity conditional.

SSEIndicator also shows cap 10 readiness as:

```txt
10종목 상태: 버튼 확인 · 유동성 조건부
badge: 조건부
```

The UI still does not expose cap 20 or cap 40.

## Readiness Helper

`evaluateNxtRolloutReadiness()` now returns cap-level readiness fields and a
specific warning for the cap 10 UI hard-limit gap:

```txt
warning: cap10_ui_hard_limit_live_burst_not_observed
blocker: cap20_not_verified
blocker: cap40_not_verified
```

## Next Tracks

Recommended follow-up tracks:

- `NXT8e`: one cap 10 UI hard-limit live retry during a higher-liquidity window.
  This must use the UI button path, not route-level fallback.
- `NXT9a`: cap 20 readiness design only after the cap 10 conditional gap is
  accepted or resolved.
- `NXT9b`: cap 20 live smoke only with a separate explicit approval.

## Guard Checks

- live KIS approval key call: 0
- WebSocket connect: 0
- `H0UNCNT0` subscribe: 0
- live frame collection: 0
- cap 10 retry: 0
- cap 20 / 40 rollout: 0
- persisted settings change: 0
- `credentials.enc` change: 0
- raw approval key / app key / app secret / access token / account: not stored

## Verification

Focused checks:

```txt
npm test -- src/client/lib/__tests__/realtime-session-control.test.ts \
  src/server/realtime/__tests__/runtime-operator.nxt5c.test.ts \
  src/server/routes/__tests__/runtime.test.ts

result: 3 files / 39 tests pass
```

Final regression:

```txt
npm test: 49 files / 451 tests pass
npm run typecheck: clean
npm run build: clean
vite bundle: 316.22 kB / gzip 94.68 kB
focused leak guard: 31 tests pass
git diff --check: clean
raw secret/token grep: 0 findings
long token-like git diff grep: 0 findings
```
