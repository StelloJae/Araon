# Araon

![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.png">
    <img src="public/logo.png" alt="Araon logo" width="96" height="96">
  </picture>
</p>

**KIS OpenAPI 기반 한국 주식 관심종목 실시간 대시보드.**

Araon is a localhost-first Korean stock watchlist dashboard for people who want
fast, readable KRX/NXT market monitoring without sending brokerage credentials
to a hosted service. It combines KIS REST polling with the integrated
`H0UNCNT0` WebSocket realtime feed, while keeping REST polling available as a
fallback.

> Araon is a read-only monitoring tool. It does not place orders, execute
> trades, or provide financial advice. You are responsible for your brokerage
> credentials, API quota, trading decisions, and compliance with KIS OpenAPI
> terms.

## Highlights

- 관심종목 중심의 한국 주식 대시보드
- KIS REST polling fallback for tracked stocks
- KIS `H0UNCNT0` integrated KRX+NXT WebSocket realtime feed
- cap40 controlled realtime acceptance completed for the v1 release
- Session-scoped realtime controls with rollback from the local UI
- KIS master catalog for searchable KOSPI/KOSDAQ universe data
- KIS-derived `autoSector` classification with manual sector override support
- 한국어 초성 검색 for stock names
- Server-Sent Events for live UI updates
- Real cumulative volume display
- Trustworthy volume-surge baseline foundation
  - no fake multiplier without baseline data
  - shows `기준선 수집 중` until enough same-session/time-bucket samples exist

## What Araon Is For

Araon is designed for a **single-user localhost setup**:

- You run the server and browser UI on your own machine.
- KIS credentials are entered in the local UI.
- Runtime state is stored under `data/`, which is ignored by git.
- Fresh installs start with realtime disabled for safety.

This is not a hosted SaaS app, a trading bot, or an order-entry system.

## Realtime Defaults

Fresh installs are conservative:

```txt
websocketEnabled=false
applyTicksToPriceStore=false
```

After credentials are configured, you can enable realtime from the Settings UI.
REST polling remains available as a fallback.

The original development environment has been validated for always-on local
operation, but the open-source default remains OFF so new users opt in
intentionally.

## Requirements

- Node.js 20 or newer
- npm
- A KIS OpenAPI app key/app secret pair
  - live or paper credentials may be used
  - paper support can differ by endpoint

## Quick Start

Run the npm beta directly:

```bash
npx @stellojae/araon@beta
```

During the beta period, use the explicit `@beta` tag.

Or install the CLI globally:

```bash
npm install -g @stellojae/araon@beta
araon
```

For local development from source:

```bash
git clone https://github.com/StelloJae/Araon.git
cd Araon
npm install
cp .env.example .env
```

Set a private local encryption seed in `.env`:

```bash
KIS_CRED_KEY=replace-with-a-long-random-local-secret
```

Run the server and client in separate terminals:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

Open:

```txt
http://127.0.0.1:5173
```

For a fuller first-run walkthrough, see [INSTALL.md](INSTALL.md).

## CLI Launcher

Araon can run as a single localhost command from the npm beta:

```bash
npx @stellojae/araon@beta
```

Or after a production build:

```bash
npm run build
node dist/cli/araon.js
```

When installed globally, the binary name is:

```bash
npm install -g @stellojae/araon@beta
araon
```

The launcher starts Fastify on `127.0.0.1`, serves the built React frontend,
prints the local URL, and opens the default browser. `Ctrl+C` owns shutdown:
Araon stops realtime/session resources, persists snapshots, checkpoints SQLite,
and closes the server.

Useful CLI options:

```bash
araon --no-open
araon --port 3910
araon --data-dir ~/AraonData
araon --exit-when-browser-closes
araon --log-level info
```

CLI runtime data does not default to the repository `data/` directory. The
priority is `--data-dir`, then `ARAON_DATA_DIR`, then the OS user-data default:

```txt
macOS:   ~/Library/Application Support/Araon
Windows: %APPDATA%/Araon
Linux:   ~/.local/share/araon
```

Fresh installs still start with realtime disabled, and Araon remains a
localhost-only read-only monitoring tool.

## Desktop Beta

Araon also has an unsigned desktop beta packaging path for macOS and Windows.
This channel wraps the same local Fastify server and React UI in Electron.

The desktop beta is not code-signed or notarized yet:

- macOS may show a Gatekeeper warning.
- Windows may show a SmartScreen warning.

Desktop runtime data is stored under the OS app user-data directory rather than
inside the app bundle. Credentials, settings, and SQLite state must never be
committed. Fresh installs still keep realtime disabled until the user enables it
from Settings.

Useful desktop build commands:

```bash
npm run build:desktop
npm run dist:mac
npm run dist:win
```

`dist:mac` should be run on macOS and `dist:win` should be run on Windows,
especially because Araon uses the native `better-sqlite3` dependency.

## First Run

1. Start the server and client.
2. Open Araon in your browser.
3. Enter your KIS credentials in the local setup screen.
4. Choose paper/live mode according to your KIS app configuration.
5. Add or favorite stocks from the dashboard.
6. Enable realtime from Settings only when you are ready.

Araon stores encrypted credentials at `data/credentials.enc`. Do not commit
`data/`, `.env`, or any brokerage credential material.

## Development Commands

```bash
npm test
npm run typecheck
npm run build
```

Useful local commands:

```bash
npm run dev:server
npm run dev:client
```

## Project Layout

```txt
src/server/      Fastify server, KIS runtime, polling, realtime, SQLite
src/client/      React UI, stores, SSE handling, operator controls
src/cli/         `araon` browser launcher
src/shared/      Shared types, constants, logger, volume baseline helpers
docs/runbooks/   Operational runbooks
docs/research/   Validation reports and implementation notes
public/          Static assets including the Araon favicon
```

Key runtime files:

- `src/server/bootstrap-kis.ts` wires the KIS runtime.
- `src/server/kis/` contains REST, auth, approval-key, WebSocket, and parser code.
- `src/server/realtime/` contains tiering, operator status, and apply-path guards.
- `src/server/polling/` contains REST polling fallback.
- `src/server/sse/` emits live UI events.
- `src/client/components/SettingsModal.tsx` contains realtime operator controls.

## Data And Security Model

Araon is a local personal tool. Its security model assumes your machine is the
trust boundary.

- Credentials are encrypted locally in `data/credentials.enc`.
- The encryption seed comes from `KIS_CRED_KEY` when provided.
- Runtime settings and SQLite data live under `data/`.
- `data/` is ignored by git.
- Raw `appKey`, `appSecret`, access tokens, account identifiers, and approval
  keys should never appear in logs, docs, fixtures, or commits.

Before publishing changes, run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

## Volume Surge Ratio Policy

Araon does not invent a `거래량 5.2x` style multiplier from current volume alone.

The approved baseline is:

```txt
current cumulative volume
/
recent 20 trading days average cumulative volume for the same KST session and HH:mm bucket
```

Until enough baseline samples exist, the UI shows `기준선 수집 중` instead of a
ratio. See
[docs/research/volume-surge-baseline-v1.md](docs/research/volume-surge-baseline-v1.md)
for the implementation contract.

## Troubleshooting

### Port 3000 or 5173 is already in use

Stop the existing local dev server, or change the port before starting Araon.
The default setup expects:

```txt
Fastify API: http://127.0.0.1:3000
Vite client: http://127.0.0.1:5173
```

### KIS credentials are rejected

Check that your KIS app key/app secret pair matches the selected paper/live mode.
KIS endpoints can differ between paper and live accounts.

### Realtime is enabled but no ticks arrive

Some tickers have little or no activity outside liquid market windows. REST
polling should continue to keep the dashboard usable.

### Volume ratio does not show yet

This is expected on a fresh install. Araon waits for enough same-session,
same-time-bucket baseline samples before showing a volume-surge ratio.

## Known Limitations

- Fresh installs keep realtime OFF until the user enables it.
- Volume-surge ratios appear only after enough local baseline samples exist.
- Desktop beta artifacts are unsigned and may trigger OS security warnings.
- Docker Compose packaging is planned after v1.0.0.
- Windows service / task scheduler packaging is planned after v1.0.0.
- Araon is currently optimized for a single-user localhost workflow.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
