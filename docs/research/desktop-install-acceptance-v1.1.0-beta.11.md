# Desktop Install Acceptance — v1.1.0-beta.11

Date: 2026-05-06 22:04 KST
Environment: macOS arm64, Darwin 25.3.0
Verdict: CONDITIONAL GO

## Scope

This acceptance checked the `v1.1.0-beta.11` GitHub Release desktop assets from
the perspective of a user downloading and opening the desktop app.

It did not rebuild Electron artifacts, mutate the GitHub Release, publish npm,
enter real KIS credentials, issue KIS tokens, request approval keys, open
WebSocket sessions, run cap tests, or run live backfill.

## Release Assets

GitHub Release:

```txt
https://github.com/StelloJae/Araon/releases/tag/v1.1.0-beta.11
```

Observed assets:

- `Araon-1.1.0-beta.11-arm64-mac.zip`
- `Araon-1.1.0-beta.11-arm64.dmg`
- `latest-mac.yml`
- `Araon.1.1.0-beta.11.exe`
- `Araon.Setup.1.1.0-beta.11.exe`
- `latest.yml`
- corresponding blockmap files

Downloaded assets for this pass:

| Asset | Size | SHA-256 |
|---|---:|---|
| `Araon-1.1.0-beta.11-arm64-mac.zip` | 116 MB | `a73bade6a034b1f17ffcf0ce8cafa6e7d1d4e8ba59e84007b1c65d47b2a6d9b0` |
| `Araon-1.1.0-beta.11-arm64.dmg` | 121 MB | `50cd87829c9b6b84dab938b8a5471893671e2896e4fbcbfa71f4d3b726324308` |
| `Araon.1.1.0-beta.11.exe` | 103 MB | `4a4631ce709ab72d93c20b28782d865cc623c6ff91313d23e40e7e476ad3d9cf` |
| `Araon.Setup.1.1.0-beta.11.exe` | 104 MB | `2f273fd56391089473f660a4806e344fe3767bdbf248dbba3ace407fdadefb66` |

The hashes matched the GitHub Release asset digests.

## macOS DMG Validation

Asset:

```txt
Araon-1.1.0-beta.11-arm64.dmg
```

Result:

- DMG mounted successfully.
- Mounted volume: `/Volumes/Araon 1.1.0-beta.11-arm64`
- `Araon.app` was present.
- `/Applications` symlink was present.
- The app executable launched from the mounted DMG.
- First-run window displayed.
- No real credentials were entered.
- App shutdown completed and left no `Araon` process or localhost listener.

Computer Use confirmed the first-run window:

- Window title: `아라온 · Araon — Korean Market Watchlist`
- Heading: `KIS 앱키 등록`
- App Key field visible.
- App Secret secure field visible.
- Register button visible.
- Copy states:
  - Araon is localhost-only.
  - Araon is a read-only monitoring tool.
  - No order/trading feature exists.
  - After credentials are configured, realtime quotes and daily backfill are
    managed automatically.
  - Up to 40 integrated realtime tickers.
  - REST polling fallback remains.
  - Emergency stop is available from Settings.

API checks from the desktop runtime:

```json
{
  "credentialsConfigured": false,
  "settings": {
    "websocketEnabled": true,
    "applyTicksToPriceStore": true,
    "backgroundDailyBackfillEnabled": true,
    "rateLimiterMode": "live"
  },
  "runtime": {
    "runtimeStatus": "unconfigured",
    "state": "disabled",
    "subscribedTickerCount": 0,
    "approvalKeyStatus": "none"
  },
  "masterRefreshWithoutCredentials": "MASTER_REFRESH_REQUIRES_CREDENTIALS"
}
```

The startup log included:

```txt
master cache refresh deferred until credentials are configured
```

No `credentials.enc` file was created.

### macOS Signature / Gatekeeper

Both `codesign --verify --deep --strict` and `spctl -a -vv` failed for the DMG
app with:

```txt
code has no resources but signature indicates they must be present
```

No Gatekeeper dialog appeared in this pass because the app was launched from the
downloaded artifact path and the downloaded file did not carry a quarantine
attribute in this CLI-driven flow. This acceptance therefore does not prove a
normal browser-downloaded, quarantined Finder launch.

## macOS ZIP Validation

Asset:

```txt
Araon-1.1.0-beta.11-arm64-mac.zip
```

Result:

- ZIP extraction succeeded.
- Extracted app: `/tmp/araon-beta11-desktop-acceptance/zip/Araon.app`
- `CFBundleIdentifier`: `io.github.stellojae.araon`
- `CFBundleShortVersionString`: `1.1.0-beta.11`
- The app launched both by direct executable path and by `open -n`.
- First-run window displayed through Computer Use.
- No real credentials were entered.
- App shutdown completed and left no `Araon` process or localhost listener.

API checks matched the DMG path:

- `configured=false`
- `runtimeStatus=unconfigured`
- `state=disabled`
- `approvalKey.status=none`
- managed defaults were true in settings
- `POST /master/refresh` returned `MASTER_REFRESH_REQUIRES_CREDENTIALS`

No `credentials.enc` file was created.

### macOS Signature / Gatekeeper

The ZIP app had the same code-signing verification failure:

```txt
code has no resources but signature indicates they must be present
```

Since the artifact was downloaded through `gh release download`, this pass did
not reproduce the full browser-download quarantine path.

## Windows EXE Validation

Assets:

- `Araon.1.1.0-beta.11.exe`
- `Araon.Setup.1.1.0-beta.11.exe`

Result:

- Asset existence confirmed.
- Download and checksum validation succeeded.
- Windows execution was not available in this macOS environment.

Status:

```txt
not executed — manual Windows validation pending
```

## User Data / DataDir

Desktop runtime used:

```txt
/Users/stello/Library/Application Support/@stellojae/araon/data
```

This pass attempted to launch the app with `ARAON_DATA_DIR`, but the desktop app
still used the Electron userData-derived application support path. The directory
contained:

- `watchlist.db`
- `background-backfill-state.json`

It did not contain:

- `credentials.enc`
- token files
- approval-key files
- account files

This should be treated as a desktop behavior note, not as a release blocker for
first-run safety.

## Safety Result

- Real KIS credentials entered: `0`
- Credentialed KIS token issuance: `0`
- Approval key issuance: `0`
- WebSocket sessions: `0`
- Cap tests: `0`
- Daily/minute backfill live runs: `0`
- Raw credential/token/account output: `0`
- `credentials.enc` created: `0`

Desktop no-credentials external fetch was not instrumented with the npm-path
fetch guard. However, runtime logs showed master refresh deferment, API state
remained unconfigured, `lsof` showed only localhost Araon connections for the
runtime process, and no credentialed or backfill path was triggered.

## Not Executed

- Drag-to-Applications DMG install.
- Browser-downloaded quarantine/Gatekeeper path.
- Windows setup or portable EXE execution.
- Credentials entry through desktop GUI.
- Existing local credentials/data dashboard smoke.

## Verdict

macOS first-run executable smoke: GO

- DMG and ZIP artifacts open to the expected first-run UI.
- No credentials were entered.
- No `credentials.enc` was created.
- Realtime and backfill remained disabled/unconfigured before credentials.
- Manual master refresh was blocked before credentials.
- App shutdown cleaned up the process and listener.

Full desktop release: CONDITIONAL GO

- macOS code-signing verification fails.
- Browser-downloaded quarantine/Gatekeeper path remains unverified.
- Windows EXE execution remains pending.

## Remaining Work

P0:

- None found in the macOS direct-run first-run path.

P1:

- Fix or formally decide the macOS code-signing/notarization posture.
- Validate browser-downloaded quarantined DMG/ZIP launch.
- Run Windows EXE and setup validation on Windows.
- Confirm whether desktop should honor `ARAON_DATA_DIR` or document the
  Electron userData path as the only desktop data path.

P2:

- Add clearer desktop release notes around unsigned beta artifacts.
- Continue desktop first-run smoke after each beta release.
