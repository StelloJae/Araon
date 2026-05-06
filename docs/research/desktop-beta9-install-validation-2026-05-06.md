# Desktop Beta.9 Install Validation

Date: 2026-05-06 16:55 KST
Tooling: GitHub Release artifact + Computer Use
Commit target: `docs(release): record desktop beta9 install validation`

## Goal

Validate the macOS desktop beta artifact without overwriting an existing
installation and without using real KIS credentials.

## Artifact

Downloaded from GitHub Release `v1.1.0-beta.9`:

```txt
Araon-1.1.0-beta.9-arm64-mac.zip
```

Extracted app:

```txt
/tmp/araon-desktop-beta9/Araon.app
```

Run command:

```txt
ARAON_DATA_DIR=/tmp/araon-desktop-smoke-data \
  /tmp/araon-desktop-beta9/Araon.app/Contents/MacOS/Araon
```

## Computer Use Result

Computer Use attached to app bundle `io.github.stellojae.araon`.

Observed first-run window:

- Title: `아라온 · Araon — Korean Market Watchlist`
- First-run heading: `KIS 앱키 등록`
- App Key field present.
- App Secret secure field present.
- Register button present.
- Copy states:
  - Araon is localhost-only.
  - Araon is read-only monitoring.
  - No order/trading feature.
  - After KIS credentials are configured, realtime quotes and daily backfill are
    managed automatically.
  - Up to 40 integrated realtime tickers.
  - REST polling fallback remains.
  - Emergency pause is available from Settings.

## API Checks

The desktop app listened on a random localhost port for the smoke.

Redacted API shape:

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
  }
}
```

The temp data directory did not create `credentials.enc`.

## Shutdown

The desktop process was terminated after the smoke. No existing `/Applications`
installation was modified.

## Verdict

`CONDITIONAL GO` for macOS arm64 desktop beta.9 first-run validation.

Not executed in this pass:

- Drag-to-Applications DMG install flow.
- Windows EXE install flow.
- Credentials entry through desktop GUI.
