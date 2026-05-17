# Araon CLI Command System Goal

Date: 2026-05-17 KST

This document is the execution brief for the Araon distribution CLI and PATH
command pass. It keeps the existing npm package command shape while adding
safe operational subcommands for local users.

## Current State

- Package name: `@stellojae/araon`
- PATH command: `araon`
- Package bin entry: `dist/cli/araon.js`
- CLI source: `src/cli/araon.ts`
- CLI option parser: `src/cli/options.ts`
- CLI build: `scripts/build-cli.mjs`
- Default CLI data directory:
  - macOS: `~/Library/Application Support/Araon`
  - Windows: `%APPDATA%/Araon`
  - Linux: `~/.local/share/araon`

The existing `araon` command starts a localhost server, serves the built client,
opens a browser, and prints the URL and data directory.

## Product Command Shape

Keep the public entry point simple:

```bash
araon
```

The command must continue to support:

```bash
npx @stellojae/araon@latest
npm install -g @stellojae/araon@latest && araon
npm run build && node dist/cli/araon.js
```

Existing flags must remain compatible:

```bash
araon --no-open
araon --port 3910
araon --host 127.0.0.1
araon --data-dir ~/AraonData
araon --exit-when-browser-closes
araon --log-level info
araon --version
araon --help
```

## New Subcommands

### `araon doctor`

Purpose: local no-live health check.

Checks:

- Node version meets package engine baseline.
- Package version can be read.
- Built static client exists.
- CLI bin target exists.
- DB migration directory exists.
- Data directory path is resolved.
- Data directory can be created.
- Toss session file is present or missing without exposing contents.
- Launcher state file is present or missing.

Rules:

- No external Toss/KIS/Naver/OpenDART calls.
- No raw session/account/order/credential output.
- `--no-live` is accepted and treated as the default behavior.
- Human-readable output by default.
- `--json` is allowed for automation.

### `araon status`

Purpose: summarize the last CLI-launched local runtime.

Checks:

- Read launcher state from the resolved data directory.
- Check whether the stored pid still exists.
- Fetch local launcher status from the stored URL when possible.

Rules:

- Only localhost URLs from Araon launcher state are used.
- If the server is not running, print a short actionable message.
- No external provider calls.
- No raw secrets.

### `araon open`

Purpose: open the last CLI-launched Araon URL.

Checks:

- Read launcher state.
- Ensure URL is localhost.
- Prefer opening the stored URL even if the runtime probe is unavailable, but
  warn clearly when the state looks stale.

Rules:

- No server start.
- No external calls.
- Browser open failure should not throw a raw stack trace.

### `araon reset --session`

Purpose: clear local Toss session state.

Action:

- Delete `toss-session.enc` from the selected data directory if present.

Rules:

- Must be safe to run when the file does not exist.
- Must not print raw session content.
- Must not remove unrelated local data.

### `araon reset --data`

Purpose: dangerous full local data reset.

Rules:

- Must refuse to run without explicit confirmation.
- Required confirmation form: `--confirm DELETE_LOCAL_ARAON_DATA`
- Must clearly state that the action is destructive.
- Do not implement broad deletion beyond the tested confirmation guard unless
  the implementation also has focused tests and docs.

## File Plan

- Modify `src/cli/options.ts`
  - Add command variants.
  - Keep existing run flags compatible.
  - Add command-specific flags.
- Add `src/cli/launcher-state.ts`
  - Read/write/clear launcher state.
  - Validate localhost URL and pid shape.
- Add `src/cli/doctor.ts`
  - No-live diagnostics.
  - Human and JSON output.
- Add `src/cli/reset.ts`
  - Session reset and destructive reset guard.
- Modify `src/cli/araon.ts`
  - Dispatch subcommands.
  - Write launcher state after server start.
  - Clear launcher state on clean shutdown.
  - Convert command failures to short messages.
- Add/modify CLI tests under `src/cli/__tests__/`.
- Update `README.md` and `INSTALL.md`.

## TDD Plan

1. Add parser tests for `doctor`, `status`, `open`, and `reset`.
2. Run focused tests and confirm RED.
3. Implement minimal parser support.
4. Add launcher-state tests and confirm RED.
5. Implement launcher state helpers.
6. Add doctor/reset tests and confirm RED.
7. Implement no-live diagnostics and reset guards.
8. Wire `src/cli/araon.ts`.
9. Update docs.

## Safety Requirements

- Do not place orders.
- Do not cancel or modify orders.
- Do not mutate account state.
- Do not perform live Toss watchlist add/remove.
- Do not print Toss/KIS/session/account/order/watchlist raw values.
- Do not call external Toss/KIS/Naver/OpenDART services from `doctor`,
  `status`, `open`, or `reset`.
- Preserve existing dirty worktree changes.

## Verification

Required before completion:

```bash
npm test -- src/cli/__tests__/options.test.ts src/cli/__tests__/launcher-state.test.ts src/cli/__tests__/doctor.test.ts src/cli/__tests__/reset.test.ts
npm test
npm run typecheck
npm run build
node dist/cli/araon.js --help
node dist/cli/araon.js --version
node dist/cli/araon.js doctor --no-live
npm pack --dry-run --json
git diff --check
```

Also run tracked-file secret grep for non-test code/docs.

## Completion Standard

Complete only when:

- `araon` remains the PATH command.
- Existing run flags remain compatible.
- `doctor/status/open/reset` are implemented and documented.
- `doctor` is no-live and secret-safe.
- `reset --session` clears only Toss session state.
- `reset --data` is blocked without explicit confirmation.
- Package dry-run includes CLI output and required runtime files without
  shipping internal probe/log/screenshot artifacts.
- Required verification passes.
