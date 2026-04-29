# Installing Araon

This guide walks through a local developer-style installation of Araon.

Araon is a single-user localhost dashboard. It requires your own KIS OpenAPI
credentials and does not provide trading or order-entry features.

## Requirements

- Node.js 20 or newer
- npm
- A KIS OpenAPI app key/app secret pair
- A browser that can open `http://127.0.0.1:5173`

## Install

```bash
git clone https://github.com/StelloJae/Araon.git
cd Araon
npm install
cp .env.example .env
```

Edit `.env` and set a private local encryption seed:

```bash
KIS_CRED_KEY=replace-with-a-long-random-local-secret
```

Do not put your KIS app key or app secret in `.env`. Enter those through the
local browser UI.

## Verify The Checkout

```bash
npm test
npm run typecheck
npm run build
```

These checks do not require live KIS WebSocket sessions.

## Run For Development

Run the API server:

```bash
npm run dev:server
```

In a second terminal, run the client:

```bash
npm run dev:client
```

Open:

```txt
http://127.0.0.1:5173
```

The Fastify server listens on `127.0.0.1:3000`. The Vite dev server proxies API
and SSE requests from `127.0.0.1:5173`.

## Desktop Beta

The desktop beta packages Araon as an unsigned Electron app for macOS and
Windows. It is intended for early local testing, not frictionless public
installation.

Build a local unpacked desktop app:

```bash
npm run build:desktop
```

Build platform installers:

```bash
npm run dist:mac
```

```bash
npm run dist:win
```

Run macOS packaging on macOS and Windows packaging on Windows. Araon uses the
native `better-sqlite3` dependency, so cross-building desktop artifacts is not
the safe path for release validation.

The desktop app stores credentials, settings, and SQLite state under the OS
app user-data directory. It does not write runtime data into the app bundle.
Fresh installs still start with realtime disabled:

```txt
websocketEnabled=false
applyTicksToPriceStore=false
```

Unsigned beta artifacts can show OS warnings:

- macOS: Gatekeeper warning or manual allow step.
- Windows: SmartScreen warning.

Code signing and notarization are planned after the unsigned beta path is
validated.

## First Run

1. Open Araon in your browser.
2. Use the local setup screen to enter your KIS app key/app secret.
3. Select the KIS mode that matches your credentials.
4. Add stocks from the dashboard or master catalog.
5. Use Settings to inspect runtime status.

Credentials are encrypted locally in:

```txt
data/credentials.enc
```

The `data/` directory is runtime state and must not be committed.

## Realtime

Fresh installs start with realtime disabled:

```txt
websocketEnabled=false
applyTicksToPriceStore=false
```

After credentials are configured, realtime can be enabled from Settings. Araon
uses the KIS `H0UNCNT0` integrated WebSocket feed for KRX+NXT realtime prices.

REST polling remains available as a fallback when realtime is disabled, inactive,
or not receiving ticks.

## Disable Realtime

Use Settings to disable the realtime session. If you need to force runtime
settings back to the conservative state, make sure these values are false:

```json
{
  "websocketEnabled": false,
  "applyTicksToPriceStore": false
}
```

Do not commit local settings files.

## Data And Security

- `data/` contains local runtime state.
- `data/credentials.enc` contains encrypted KIS credentials.
- `.env` contains local environment configuration.
- `.env.example` is safe to commit; real `.env` files are not.
- Raw app keys, app secrets, access tokens, approval keys, and account
  identifiers should never appear in commits, logs, issues, or screenshots.

## Troubleshooting

### Port 3000 or 5173 is already in use

Stop the process using the port, then restart the server/client. The defaults are:

```txt
API server: 127.0.0.1:3000
Client:     127.0.0.1:5173
```

### KIS credential invalid

Confirm that the app key/app secret pair matches your selected paper/live mode.
KIS paper and live environments can behave differently by endpoint.

### Approval key or WebSocket failure

Check your credentials, KIS service availability, and whether the selected
market window is active. Araon should keep REST polling available as fallback.

### No live ticks

Some stocks produce no ticks outside liquid market windows. This is normal,
especially around quiet pre-market or after-market periods.

### Volume baseline collecting

Araon does not show a fake volume multiplier. It waits until enough
same-session/time-bucket samples exist, then displays a trustworthy ratio.
