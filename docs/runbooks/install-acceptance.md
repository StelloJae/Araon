# Araon Install Acceptance

This runbook tracks whether a first-time beta user can reach the first usable
screen within about five minutes. It intentionally avoids live KIS trading data,
WebSocket sessions, cap tests, and any raw credential capture.

Current baseline: `v1.1.0-beta.6`.

## Acceptance Matrix

| Path | Environment | Status | Fresh dataDir | Evidence | Notes |
|---|---|---:|---:|---|---|
| `npx @stellojae/araon@beta` | macOS 26.3 / Node 25.8.2 local shell | PASS | Yes | `--help`, `--version`, server smoke on `127.0.0.1:43910`, `/credentials/status` returned `unconfigured` | Browser auto-open not exercised because smoke used `--no-open`. |
| `npm install -g @stellojae/araon@beta && araon` | macOS 26.3 / Homebrew global npm prefix | PASS | Yes | global `araon --version`, `--help`, server smoke on `127.0.0.1:43911`, `/credentials/status` returned `unconfigured` | Global install warned that `prebuild-install` is deprecated; install still succeeded. |
| GitHub Release npm tarball | macOS 26.3 / temp npm prefix | PASS | Not started as server | Installed `stellojae-araon-1.1.0-beta.6.tgz` from the GitHub Release URL and read CLI version `1.1.0-beta.6` | Server first-run behavior is the same package entrypoint as the global install path. |
| GitHub Release source archive | macOS 26.3 / temp extraction | PARTIAL | Not executed | Downloaded and extracted `araon-v1.1.0-beta.6-source.tar.gz`; package metadata matched `@stellojae/araon@1.1.0-beta.6` | `npm install && npm run build` from the archive was not executed in this pass. |
| macOS DMG | This machine has macOS, but GUI install was not exercised from the shell | NOT EXECUTED | Not verified | Release asset exists: `Araon-1.1.0-beta.6-arm64.dmg` | Manual Gatekeeper and app-launch validation required. |
| Windows EXE | No Windows host in this environment | NOT EXECUTED | Not verified | Release asset exists: `Araon.Setup.1.1.0-beta.6.exe` | Manual SmartScreen and app-launch validation required on Windows. |

## Checked Behaviors

- CLI help and version work through `npx`.
- CLI help and version work after global install.
- CLI startup prints the local URL and selected data directory.
- A clean `--data-dir` reaches the credentials setup gate without stored
  credentials.
- Clean CLI startup triggered the normal background public KIS master catalog
  download; no credentialed quote call, token issuance, approval key, WebSocket
  session, or cap test was executed.
- `/credentials/status` returns `configured=false` and `runtime=unconfigured`
  on a clean data directory.
- `/runtime/realtime/status` reports `websocketEnabled=false`,
  `applyTicksToPriceStore=false`, and no approval key on a clean data directory.
- Fixed port conflicts fail clearly with `EADDRINUSE`.
- Runtime state is written under the selected temp data directory, not under the
  package directory.

## Not Checked

- Real KIS credential save was not executed, to avoid handling live secrets in
  an acceptance document.
- Realtime session enable, WebSocket subscription, and cap tests were not
  executed.
- Browser auto-open was not exercised because automated smokes used `--no-open`.
- `--exit-when-browser-closes` was not exercised in a real browser window in
  this pass.
- macOS DMG and Windows EXE were not launched manually.

## First-Run Risks Found

- README still used the older `autoSector` wording even though display grouping
  now uses KIS official index industry labels.
- The credentials setup screen did not explicitly say that Araon is read-only,
  has no order/trading feature, and keeps realtime OFF on fresh installs.
- INSTALL described `data/credentials.enc` too narrowly for CLI/desktop users;
  the effective location is the selected data directory.

## Follow-Up Gate For `v1.1.0-beta.7`

Before cutting `v1.1.0-beta.7`, re-run:

```bash
npm test
npm run typecheck
npm run build
npm pack --dry-run --json
node dist/cli/araon.js --help
node dist/cli/araon.js --version
```

Manual desktop validation should still be recorded separately for:

- macOS DMG open/install/run through the unsigned Gatekeeper path.
- Windows installer or portable EXE run through the unsigned SmartScreen path.
