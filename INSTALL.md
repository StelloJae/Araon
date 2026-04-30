# Installing Araon

This guide walks through the first-run install paths for Araon beta users.

Araon is a single-user localhost dashboard. It requires your own KIS OpenAPI
credentials and does not provide trading or order-entry features.

## Requirements

- Node.js 20 or newer
- npm
- A KIS OpenAPI app key/app secret pair
- A browser that can open `http://127.0.0.1:5173`

## Run The npm Beta

The easiest beta path is:

```bash
npx @stellojae/araon@beta
```

During the beta period, use the explicit `@beta` tag. Araon starts a local
server, prints a `http://127.0.0.1:<port>` URL, and opens your default browser.

Or install the CLI globally:

```bash
npm install -g @stellojae/araon@beta
araon
```

The CLI starts Araon on `127.0.0.1`, serves the built browser UI, and opens the
default browser. Node.js 20 or newer is required.

On first run, expect the KIS credentials setup screen. Araon needs your own KIS
OpenAPI app key/app secret pair, but it is still a read-only monitoring tool: it
does not place orders or execute trades.

## Install From Source

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

## Run With The CLI Launcher

From npm beta:

```bash
npx @stellojae/araon@beta
```

From source, build Araon, then start the production localhost app from one
terminal:

```bash
npm run build
node dist/cli/araon.js
```

If Araon is installed as a package, use:

```bash
npm install -g @stellojae/araon@beta
araon
```

The CLI starts the server, serves the built frontend, opens the default browser,
and prints the URL. Use `Ctrl+C` to stop the app gracefully.

Common options:

```bash
araon --no-open
araon --port 3910
araon --data-dir ~/AraonData
araon --exit-when-browser-closes
araon --log-level info
```

`--exit-when-browser-closes` is off by default. When enabled, the browser UI
sends a short heartbeat to the local server. If heartbeats disappear, Araon
shuts down gracefully. Do not combine it with `--no-open`.

CLI data directory priority:

```txt
1. --data-dir
2. ARAON_DATA_DIR
3. OS default user-data directory
```

OS defaults:

```txt
macOS:   ~/Library/Application Support/Araon
Windows: %APPDATA%/Araon
Linux:   ~/.local/share/araon
```

Credentials, settings, and SQLite state are stored under the selected data
directory. Fresh installs keep realtime disabled until you enable it from
Settings.

## Desktop Beta

The desktop beta packages Araon as an unsigned Electron app for macOS and
Windows. It is intended for early local testing, not frictionless public
installation.

Download the beta installers from the GitHub Release page:

```txt
macOS:   Araon-1.1.0-beta.6-arm64.dmg
Windows: Araon.Setup.1.1.0-beta.6.exe
```

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

1. Start Araon with `npx @stellojae/araon@beta`, `araon`, or a desktop beta app.
2. Open the printed localhost URL if your browser did not open automatically.
3. Use the local setup screen to enter your KIS app key/app secret.
4. Select the KIS mode that matches your credentials.
5. Add stocks from the dashboard or master catalog.
6. Use Settings to inspect runtime status.

Credentials are encrypted locally in the selected data directory:

```txt
credentials.enc
```

For source development this is usually `data/`. For the CLI it is `--data-dir`,
`ARAON_DATA_DIR`, or the OS default user-data directory. For desktop beta apps it
is the OS app user-data directory. Runtime data must not be committed.

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

For the CLI launcher, omit `--port` to let Araon choose an available port, or
pick a specific one with:

```bash
araon --port 3910
```

### Browser does not open from the CLI

The server still runs even if the OS browser command fails. Copy the printed
`http://127.0.0.1:<port>` URL into your browser manually.

### Credentials setup appears every time

Check that you are using the same data directory on each run. If you pass a new
`--data-dir`, Araon treats it as a fresh install.

### Reset CLI credentials or data

Stop Araon, then remove the selected data directory. This removes encrypted
credentials, settings, SQLite state, and local volume baseline history.

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
