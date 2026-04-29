# Araon

Araon is a localhost-first Korean stock watchlist dashboard for people who want
fast, readable KRX/NXT market monitoring without sending brokerage credentials to
a hosted service.

It uses Node.js, Fastify, React, SQLite, and KIS OpenAPI. REST polling is always
kept as a fallback, while integrated KRX+NXT realtime prices use the KIS
`H0UNCNT0` WebSocket feed when enabled.

> Araon is not financial advice. It is a local monitoring tool. You are
> responsible for your own brokerage credentials, API quota, trading decisions,
> and compliance with KIS OpenAPI terms.

## Features

- Local Korean stock watchlist dashboard
- KIS OpenAPI credential setup through the local UI
- AES-256-GCM encrypted credential storage in `data/credentials.enc`
- REST polling fallback for tracked stocks
- Integrated KRX+NXT realtime ticks via `H0UNCNT0`
- Favorites-aware realtime subscription tiering with a hard cap of 40 tickers
- Server-Sent Events for live UI updates
- Session/operator controls for realtime status and rollback
- KST market scheduler for NXT-aware trading hours
- Real cumulative volume display
- Trustworthy volume-surge baseline foundation
  - no fake multiplier without baseline data
  - shows `기준선 수집 중` until enough same-session/time-bucket samples exist

## Current realtime status

Araon has been validated locally through controlled cap40 realtime acceptance.
For open-source/fresh installs, realtime remains conservative by default:

```txt
websocketEnabled=false
applyTicksToPriceStore=false
```

You can enable realtime from the local Settings UI after adding KIS credentials.
REST polling remains available as a fallback.

## Requirements

- Node.js 20 or newer
- npm
- A KIS OpenAPI app key/app secret pair
  - live or paper credentials may be used
  - paper support can differ by KIS endpoint

## Quick start

```bash
git clone https://github.com/StelloJae/Araon.git
cd Araon
npm install
cp .env.example .env
```

Edit `.env` and set a private `KIS_CRED_KEY`:

```bash
KIS_CRED_KEY=replace-with-a-long-random-local-secret
```

Then run the server and client in separate terminals:

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

The Fastify server listens on `127.0.0.1:3000`; Vite proxies API and SSE routes
from the client dev server.

## KIS credential setup

1. Start the server and client.
2. Open the app in your browser.
3. Enter your KIS `appKey`, `appSecret`, and paper/live mode in the local setup
   screen.
4. Araon stores credentials encrypted at `data/credentials.enc`.

Do not commit `data/`, `.env`, or any brokerage credential material. The default
`.gitignore` excludes these paths.

## Development commands

```bash
npm test
npm run typecheck
npm run build
```

Useful dev commands:

```bash
npm run dev:server
npm run dev:client
```

## Project layout

```txt
src/server/      Fastify server, KIS runtime, polling, realtime, SQLite
src/client/      React UI, stores, SSE handling, operator controls
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

## Data and security model

Araon is designed for a single-user localhost deployment.

- Credentials are encrypted locally in `data/credentials.enc`.
- The encryption seed comes from `KIS_CRED_KEY` when provided.
- Runtime settings and SQLite data live under `data/`.
- `data/` is ignored by git.
- Raw `appKey`, `appSecret`, access tokens, and approval keys should never appear
  in logs, docs, fixtures, or commits.

Before publishing changes, run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

## Volume surge ratio policy

Araon does not invent a `거래량 5.2x` style multiplier from current volume alone.

The approved baseline is:

```txt
current cumulative volume
/
recent 20 trading days average cumulative volume for the same KST session and HH:mm bucket
```

Until enough baseline samples exist, the UI shows `기준선 수집 중` instead of a
ratio. See `docs/research/volume-surge-baseline-v1.md` for the implementation
contract.

## Realtime operations

Fresh installs start with realtime disabled. After credentials are configured,
the local operator can enable realtime and inspect status from the Settings UI.

Safety principles:

- Never subscribe to more than 40 tickers.
- Keep REST polling alive as fallback.
- Keep raw secrets out of logs and docs.
- Preserve the ability to disable realtime from the UI/settings.

The rollout runbook is in `docs/runbooks/nxt-ws-rollout.md`.

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.
