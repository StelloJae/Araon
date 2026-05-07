# Managed Defaults Acceptance

Date: 2026-05-06 12:24-12:26 KST

Baseline:

```txt
implementation_head: bd7dbe8
scope: no-live acceptance for managed realtime/backfill defaults
verdict: CONDITIONAL GO
```

## Goal

Validate the policy introduced in `bd7dbe8`:

```txt
credentials absent:
- no external KIS calls
- runtime remains unconfigured

credentials configured:
- cap40 integrated realtime is managed by default
- daily historical backfill is managed by default
- REST polling fallback remains available
- emergency disable paths remain available
```

No live KIS historical call, WebSocket session, cap test, or background live batch
was executed during this acceptance.

## Fresh No-Credentials Acceptance

Command shape:

```txt
npx tsx -e "<create temp dataDir, createAraonServer, app.inject /settings /credentials/status /runtime/realtime/status>"
```

Result:

```json
{
  "settings": {
    "websocketEnabled": true,
    "applyTicksToPriceStore": true,
    "backgroundDailyBackfillEnabled": true,
    "rateLimiterMode": "live"
  },
  "credentials": {
    "configured": false,
    "isPaper": null,
    "runtime": "unconfigured"
  },
  "realtime": {
    "configured": false,
    "runtimeStatus": "unconfigured",
    "state": "disabled",
    "canApplyTicksToPriceStore": false,
    "subscribedTickerCount": 0
  },
  "credentialsFileCreated": false
}
```

Interpretation:

- Fresh defaults are managed ON.
- Credentials are absent.
- Runtime remains unconfigured.
- No `credentials.enc` file was created.
- Realtime cannot apply ticks while runtime is unconfigured.
- Background backfill cannot run because market phase is `unknown` without a
  started KIS runtime.

External KIS calls: 0.

## First-Run UI Copy

Verified by `src/client/components/__tests__/credentials-setup-copy.test.ts`.

The first-run copy now states:

- Araon is localhost-only and read-only.
- There is no order/trading function.
- After KIS credentials are registered, realtime prices and daily backfill are
  managed automatically.
- Integrated realtime is capped at 40 tickers.
- REST polling fallback remains available.
- Emergency pause is available from Settings.

## Fresh Settings Default Shape

Verified by the temp dataDir app.inject acceptance and regression tests.

Expected and observed:

```txt
websocketEnabled=true
applyTicksToPriceStore=true
backgroundDailyBackfillEnabled=true
rateLimiterMode=live
```

Important boundary:

```txt
default ON does not mean external calls before credentials exist
```

## Persisted False Compatibility

Command shape:

```txt
write temp settings.json with websocketEnabled=false,
applyTicksToPriceStore=false, backgroundDailyBackfillEnabled=false
then createAraonServer and app.inject /settings /runtime/realtime/status
```

Result:

```json
{
  "settings": {
    "websocketEnabled": false,
    "applyTicksToPriceStore": false,
    "backgroundDailyBackfillEnabled": false
  },
  "realtime": {
    "configured": false,
    "runtimeStatus": "unconfigured",
    "state": "disabled",
    "canApplyTicksToPriceStore": false
  }
}
```

Interpretation:

- Explicit persisted `false` values are not overwritten by the new defaults.
- Emergency-disabled user intent is preserved.
- REST polling fallback policy is unchanged.

## Existing Local Data Smoke

Current time was 2026-05-06 12:24 KST, inside the integrated trading window.
Starting the user's existing local dataDir could intentionally auto-start live
realtime. To keep this acceptance no-live, the existing dataDir server was not
started.

Read-only settings-store load:

```json
{
  "websocketEnabled": true,
  "applyTicksToPriceStore": true,
  "backgroundDailyBackfillEnabled": true,
  "backgroundDailyBackfillRange": "3m",
  "rateLimiterMode": "live"
}
```

Interpretation:

- The existing local dataDir is live-capable under the new managed policy.
- UI runtime smoke against the existing dataDir remains pending for a controlled
  live window or explicit user-supervised run.
- No raw credential/token/account material was read or printed.

## Emergency Disable Acceptance

Temp dataDir app.inject result:

```json
{
  "emergency": {
    "state": "manual-disabled",
    "persistedSettingsChanged": true
  },
  "afterEmergency": {
    "websocketEnabled": false,
    "applyTicksToPriceStore": false,
    "backgroundDailyBackfillEnabled": false
  }
}
```

Server regression test:

```txt
POST /runtime/realtime/emergency-disable
- disconnects realtime
- persists realtime gates false
- leaves REST polling running
```

Daily backfill emergency pause is exposed in Settings and persists
`backgroundDailyBackfillEnabled=false`.

## Backfill Guard Acceptance

Verified by `src/server/chart/__tests__/background-backfill-scheduler.test.ts`.

Observed policy:

- `backgroundDailyBackfillEnabled=false` skips execution.
- `marketPhase=open` skips execution.
- `marketPhase=unknown` skips execution, covering no-credentials/unconfigured
  runtime.
- Closed/after-hours execution targets favorites first, then tracked stocks.
- The scheduler never targets the full master catalog.
- Per-run ticker cap is enforced.
- Daily call budget is enforced.
- 429-like errors enter cooldown.
- 5xx-like failures stop the current batch and enter cooldown.

Known limitation:

```txt
daily budget and cooldown are process-local guards, not persistent restart-safe
state yet
```

## Settings UI Acceptance

Verified by `src/client/components/__tests__/managed-operations-settings.test.ts`.

Observed:

- Realtime section presents `자동 운영`.
- It names max 40 integrated realtime and REST polling fallback.
- Cap selector / session enable controls are hidden inside an advanced
  diagnostics panel by default.
- Emergency realtime disable is visible.
- Daily backfill section presents `과거 일봉 자동 보강`.
- It states that market-hours execution is blocked.
- Daily backfill emergency disable is visible.

## Docs Consistency

Reviewed and updated:

- `README.md`
- `INSTALL.md`
- `docs/runbooks/nxt-ws-rollout.md`
- `docs/research/araon-runtime-acceptance.md`
- `docs/research/chart-backfill-mvp-closeout.md`
- `docs/research/auto-operations-defaults.md`
- `docs/research/araon-beta-acceptance.md`
- `docs/release-notes/v1.1.0-beta.8.md`
- `AGENTS.md`

Current wording:

```txt
credentials가 없으면 외부 KIS 호출은 없습니다.
credentials 등록 후 Araon이 통합 실시간 시세와 일봉 보강을 자동 관리합니다.
```

Historical documents that describe older OFF-by-default phases were left as
historical records where clearly scoped to their original acceptance date.

## Validation

Executed:

```txt
npm test
npm run typecheck
npm run build
git diff --check
raw secret/token/key leak grep
git status --short
```

Results:

```txt
npm test: 81 files / 629 tests pass
typecheck: pass
build: pass
git diff --check: pass
raw secret/token/key leak grep: 0 matches for raw-value patterns
live KIS call: 0
WebSocket/cap test: 0
daily backfill live run: 0
```

## Verdict

```txt
CONDITIONAL GO
```

Rationale:

- Core no-credentials safety is verified.
- Managed default settings are verified.
- Persisted emergency-disabled settings are preserved.
- Emergency disable route/UI is verified.
- Backfill guards are verified under mock/no-live conditions.
- Existing local dataDir live UI smoke was intentionally not executed during
  market hours to avoid starting a live runtime in this acceptance.

## Backlog

P0:

- None found.

P1:

- Persistent daily backfill budget/cooldown across restarts.
- Managed defaults existing-data UI smoke in a controlled live window.
- Background backfill telemetry for last success/failure/next eligible run.
- Desktop install manual validation.

P2:

- Chart tooltip/crosshair polish.
- ETF/ETN grouping.
- News/disclosure tab.
- Observation memo/log.
