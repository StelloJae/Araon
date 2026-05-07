# Araon v1.1.0-beta.10 Post-Release Acceptance

Date: 2026-05-06 KST
Verdict: CONDITIONAL GO

## Scope

This acceptance checked the published beta distribution and the first-run path
after `v1.1.0-beta.10` was released.

It did not run live KIS quote probes, WebSocket/cap smoke tests, daily
backfill, minute backfill, full watchlist backfill, Electron packaging, or
Docker work.

## Distribution Checks

- Package: `@stellojae/araon@1.1.0-beta.10`
- Published npm beta: `1.1.0-beta.10`
- Published npm beta gitHead: `f6b68ce6fb327d273a41795dba55986422266b9e`
- npm latest: `1.1.0-beta.3` unchanged
- GitHub prerelease: `https://github.com/StelloJae/Araon/releases/tag/v1.1.0-beta.10`
- `npx -y @stellojae/araon@beta --version`: `1.1.0-beta.10`
- `npx -y @stellojae/araon@beta --help`: displayed the expected Araon CLI help

## Package Contents

`npm pack --dry-run --json` reported 27 files in the package:

- CLI bundle: `dist/cli/araon.js`
- Client bundle/assets: `dist/client/**`
- SQLite migrations: `src/server/db/migrations/*.sql`
- User docs: `README.md`, `INSTALL.md`, release notes

Forbidden runtime files were not present:

- `data/`
- `credentials.enc`
- SQLite runtime databases
- `.omc/` or `.omx/`
- local logs
- token/account/appKey/appSecret runtime state

## Fresh No-Credentials Runtime

Published beta was started with a temp data directory and no credentials.

Observed API state:

- `GET /credentials/status`
  - `configured=false`
  - `isPaper=null`
  - `runtime=unconfigured`
- `GET /settings`
  - `websocketEnabled=true`
  - `applyTicksToPriceStore=true`
  - `backgroundDailyBackfillEnabled=true`
  - `rateLimiterMode=live`
- `GET /runtime/realtime/status`
  - `configured=false`
  - `runtimeStatus=unconfigured`
  - `state=disabled`
  - `approvalKey.status=none`
  - `subscribedTickerCount=0`

Temp data directory contained only local runtime files:

- `watchlist.db`
- `watchlist.db-shm`
- `watchlist.db-wal`
- `background-backfill-state.json`

It did not create `credentials.enc` or token/approval/account files.

## Browser First-Run UI

The in-app/browser acceptance opened the published beta first-run screen at
`http://127.0.0.1:<temp-port>/`.

Confirmed visible copy:

- KIS app key registration screen is shown before the dashboard.
- Araon is described as a localhost read-only monitoring tool.
- The UI states that no order/trading feature exists.
- The UI explains that after credentials are registered, realtime quotes and
  daily backfill are managed automatically.
- The UI states cap40 realtime operation and REST polling fallback.
- App Key and App Secret fields are visible.

## Important Finding And Fix

During published beta acceptance, clean no-credentials startup did not issue
credentialed KIS calls, tokens, approval keys, WebSocket sessions, cap tests, or
backfill runs.

However, the published beta did trigger the public KIS master file refresh on
startup:

- KOSPI master file download
- KOSDAQ master file download

That behavior conflicted with the stricter product policy: clean install with no
credentials should make zero external KIS calls.

Follow-up patch after the release:

- Defers background master refresh until credentials are configured.
- Starts the same non-blocking master refresh hook after successful credential
  registration.
- Blocks `POST /master/refresh` with `MASTER_REFRESH_REQUIRES_CREDENTIALS` when
  no credentials exist.
- Adds a regression test that starts the server with a clean temp dataDir and
  fails if any external `fetch` happens before credentials.

This patch is intentionally post-release and will need the next beta release if
the distribution should include it.

Local verification after the patch:

- Built CLI started with a fresh temp dataDir and no credentials.
- Startup log reported `master cache refresh deferred until credentials are configured`.
- `GET /credentials/status` returned `configured=false`.
- `GET /runtime/realtime/status` returned `runtimeStatus=unconfigured` and `state=disabled`.
- `POST /master/refresh` returned `MASTER_REFRESH_REQUIRES_CREDENTIALS`.
- No master file download was observed in the local patched path.

## Not Executed

- DMG/EXE GUI install validation
- Existing local data live UI smoke
- Live KIS quote probe
- WebSocket/cap smoke
- Daily or minute backfill live run
- Full watchlist/background backfill
- Electron/Docker packaging

## Safety Result

- Credentialed KIS token issuance: 0
- Approval key issuance: 0
- WebSocket sessions: 0
- Cap tests: 0
- Daily/minute backfill live runs: 0
- Raw credential/token/account output: 0

## Remaining Work

P0:

- None found in the first-run UI or CLI distribution path.

P1:

- Publish the post-release master-refresh guard in the next beta.
- DMG/EXE GUI install validation remains pending.
- Existing local data UI smoke should be repeated in a controlled window.

P2:

- Continue long-run observation for managed realtime/backfill behavior.
- Continue news parser/cache hardening from real usage.
