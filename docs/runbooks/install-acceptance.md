# Araon Install Acceptance

This runbook is the lightweight checklist for validating a public Araon install.
It avoids live KIS credentials, WebSocket sessions, cap tests, and raw secret
capture unless a separate validation explicitly asks for them.

Current public baseline: `v1.1.3`.

## Acceptance Paths

| Path | Required result |
|---|---|
| `npx @stellojae/araon@latest` | `--help` and `--version` work; clean startup reaches first-run credentials screen. |
| `npm install -g @stellojae/araon@latest && araon` | Global CLI launches the local server and prints the local URL/data directory. |
| GitHub Release source archive | Archive extracts cleanly; package metadata matches the release. |
| macOS desktop app | App opens to first-run credentials screen; unsigned/notarization warnings are recorded honestly. |
| Windows desktop app | Installer or portable EXE opens to first-run credentials screen; SmartScreen warnings are recorded honestly. |

## Clean DataDir Checks

Use a fresh temporary data directory.

Expected:

- credentials setup screen is shown.
- `/credentials/status` returns `configured=false`.
- runtime is `unconfigured`.
- no `credentials.enc` is created before the user saves credentials.
- no token, approval key, WebSocket, quote, master refresh, or backfill call is
  made before credentials are configured.
- user copy explains Araon is read-only and does not place orders.
- user copy explains that managed realtime/backfill starts only after credentials
  are configured.

## CLI Smoke Commands

```bash
npm test
npm run typecheck
npm run build
node dist/cli/araon.js --help
node dist/cli/araon.js --version
npm pack --dry-run --json
```

## Desktop Checks

Record the exact OS, asset name, checksum status, and result.

- macOS DMG mount or ZIP extract.
- app launch to first-run screen.
- no credentials entered.
- app shutdown leaves no Araon server/listener process behind.
- app bundle does not receive user credentials or SQLite data.
- `codesign` / `spctl` outcome is recorded without overstating unsigned builds.
- Windows execution is `not executed` unless actually run on Windows.

## Not Part Of Install Acceptance

- live KIS credential save.
- WebSocket/cap smoke.
- daily or minute backfill live run.
- full watchlist backfill.
- npm publish or GitHub Release mutation.

Those belong in separate controlled validation notes.
