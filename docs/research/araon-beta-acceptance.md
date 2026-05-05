# Araon Beta Acceptance

Date: 2026-05-06 04:30 KST

## Verdict

```txt
verdict: CONDITIONAL GO
accepted_code_head: 16324fa
acceptance_report_commit: 69d8fce
package_version_during_acceptance: @stellojae/araon@1.1.0-beta.7
scope: beta user-flow acceptance, not a new feature pass
```

Araon is usable as a beta from the CLI/npx path and the current local dashboard
flow. The beta remains conditional because unsigned desktop GUI install/run was
not manually exercised in this pass, and live signal frequency was not observed
during an open market window.

This pass did not execute a new KIS live probe, WebSocket cap test, background
backfill, full watchlist backfill, historical minute backfill, npm release, tag,
Electron build, or Docker work.

## Release Consistency Note

Follow-up audit on 2026-05-06 found that the accepted local code and the
published npm/GitHub beta were not the same product build.

```txt
accepted_code_head: 16324fa
acceptance_report_commit: 69d8fce
published_npm_beta: 1.1.0-beta.7
published_beta_tag: v1.1.0-beta.7
published_beta_tag_head: 148d61f
published_beta_contains_chart_backfill: false
prepared_next_beta: 1.1.0-beta.8
```

So this document is a `local main` acceptance record for the product state that
includes signal explanations, persisted candles, chart/backfill, and the
acceptance docs. It is not proof that users installing the already-published
`@stellojae/araon@beta` package receive those post-beta.7 changes.

Release action required:

```txt
v1.1.0-beta.8 release needed before this accepted product state is available
through npm @beta or new GitHub prerelease assets.
```

## Current Baseline

- Chart/backfill MVP is closed at single-ticker daily live probe plus UI
  acceptance.
- Realtime cap40 controlled acceptance is already recorded separately.
- Fresh installs keep realtime OFF by default.
- The current local data directory is a user operation profile and can have
  realtime settings enabled.
- Full watchlist backfill, background live backfill, and historical minute
  backfill remain HOLD.

## Clean DataDir Acceptance

Command path:

```txt
node dist/cli/araon.js --no-open --port 43920 --data-dir <temp> --log-level warn
```

Result:

```txt
server: started on 127.0.0.1:43920
credentials/status: configured=false, isPaper=null, runtime=unconfigured
settings: websocketEnabled=false, applyTicksToPriceStore=false,
          backgroundDailyBackfillEnabled=false
credentials.enc: not created
browser console errors: 0
```

Observed first-run screen:

- `KIS 앱키 등록`
- KIS OpenAPI app key / app secret guidance
- localhost-only read-only monitoring notice
- explicit no order/trading copy
- fresh install realtime OFF notice
- REST polling fallback copy
- app key and app secret inputs

Clean dataDir did not receive real credentials. No live KIS quote, token,
approval key, WebSocket session, or cap test was executed.

## Existing Local DataDir Acceptance

The existing local server was already running on `127.0.0.1:3000` with stored
credentials and user-local settings. This means it is a live-capable runtime and
is not equivalent to a fresh install.

Read-only runtime check:

```txt
credentials/status: configured=true, isPaper=false, runtime=started
settings.rateLimiterMode: live
settings.websocketEnabled: true
settings.applyTicksToPriceStore: true
settings.backgroundDailyBackfillEnabled: false
runtime state: manual-disabled
subscribedTickerCount: 0
session.enabled: false
session.applyEnabled: false
verifiedCaps: 1, 3, 5, 10, 20, 40
```

The status response exposed approval-key state metadata only
(`status`/`issuedAt`), not a raw approval key. Browser network inspection did not
show a `POST /runtime/realtime/session-enable` or
`POST /stocks/:ticker/candles/backfill` request during this acceptance pass.

Dashboard flow:

- dashboard entered successfully
- stock count displayed as 107
- search input visible
- sector / tag / mixed view controls visible
- sector grouping visible, including semiconductor and other KIS industry groups
- favorites panel visible
- Recent Surge / Today strength surface visible
- Settings dialog opened
- realtime/status text visible in Settings

Stock detail flow:

- `005930` opened `삼성전자 상세`
- `실시간` tab showed the memory-only realtime price trend area
- observation reasons were visible
- `차트` tab opened successfully
- TradingView Lightweight Charts canvas rendered
- no synthetic/sample chart copy was shown

Chart/backfill user flow:

```txt
005930 1D: 20 candles
005930 1W: 5 candles
005930 1M: 2 candles
canvas count in modal: 7
empty ticker checked: 010620 / HD현대미포
empty state: chart data collecting / no synthetic chart
browser console errors: 0
```

The `GET /stocks/005930/candles` API returned `coverage.backfilled=true`,
`coverage.localOnly=false`, `sourceMix=["kis-daily"]`, and
`status.state=ready` for 1D/1W/1M.

## CLI / npx Acceptance

Package state:

```txt
local package.json: 1.1.0-beta.7
npm dist-tag beta: 1.1.0-beta.7
npm dist-tag latest: 1.1.0-beta.3
```

`latest` was not promoted in this pass.

Checked:

```txt
npx @stellojae/araon@beta --version: 1.1.0-beta.7
npx @stellojae/araon@beta --help: ok
global araon path: /opt/homebrew/bin/araon
global araon --version: 1.1.0-beta.7
global araon --help: ok
global npm package: @stellojae/araon@1.1.0-beta.7
```

npx server smoke:

```txt
npx @stellojae/araon@beta --no-open --port 43921 --data-dir <temp>
credentials/status: configured=false, isPaper=null, runtime=unconfigured
settings.websocketEnabled: false
settings.applyTicksToPriceStore: false
created files: watchlist.db, watchlist.db-shm, watchlist.db-wal
credentials.enc: not created
```

The npx smoke was stopped after the first-run API check.

## Desktop / Release Assets

GitHub Release `v1.1.0-beta.7` exists as a prerelease and is not a draft.

Assets observed:

- `Araon-1.1.0-beta.7-arm64.dmg`
- `Araon-1.1.0-beta.7-arm64-mac.zip`
- `Araon.1.1.0-beta.7.exe`
- `Araon.Setup.1.1.0-beta.7.exe`
- `stellojae-araon-1.1.0-beta.7.tgz`
- `araon-v1.1.0-beta.7-source.tar.gz`
- blockmaps, update metadata, and checksums

Manual desktop GUI install/run was not executed:

```txt
macOS DMG GUI launch/install: not executed
Windows EXE GUI launch/install: not executed
Gatekeeper/SmartScreen path: pending manual validation
```

During this pass, `INSTALL.md` desktop asset examples were corrected from
beta.6 names to beta.7 names.

## Surge / Explanation Flow

Observed in the existing dashboard:

- Recent Surge and Today strength surfaces are visually separated by controls.
- Today strength entries include explicit `오늘` labels.
- explanation lines include deterministic reasons such as today strength,
  sector co-movement, favorite status, and volume-baseline caveats.
- volume multiplier is not fabricated when the baseline is still collecting.

Market state during this pass was snapshot/closed, so live signal frequency and
actual intraday surge cadence were not executed.

## Known Limitations

- Desktop DMG/EXE GUI install and launch remain manually pending.
- Desktop artifacts are unsigned.
- Existing local dataDir is live-capable; fresh install defaults remain safer
  and OFF.
- Full watchlist daily backfill remains HOLD.
- Background live backfill remains HOLD.
- Historical minute backfill remains out of scope.
- Live surge frequency was not observed during this closed-market acceptance.
- Volume-surge ratios depend on local baseline sample accumulation.
- News/disclosure feed remains unimplemented.

## Backlog

P0:

- none found in this pass

P1:

- manual macOS DMG install/run validation
- manual Windows installer/portable EXE validation
- signed desktop release path
- background backfill safety hardening before any live operation
- longer user-runtime observation for volume baseline accumulation
- open-market live surge frequency observation

P2:

- chart tooltip/crosshair polish
- clearer chart source/coverage microcopy if user testing shows confusion
- ETF/ETN grouping
- news/disclosure tab
- observation memo/log
- Docker compose

## Final Assessment

```txt
first-run UX: pass
dashboard UX: pass
chart/backfill UX: pass
CLI/npx beta path: pass
desktop asset existence: pass
desktop GUI install/run: not executed
secret leak observed: no
release readiness: CONDITIONAL GO for beta usage, not stable promotion
```

The beta is ready for continued user testing through npx/global CLI and the
existing local app flow. Stable promotion should wait until desktop GUI install
acceptance and a short open-market usage pass are recorded.
