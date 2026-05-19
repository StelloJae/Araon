# Installing Araon

This guide walks through the first-run install paths for Araon users. If you
are trying Araon for the first time, use the npm path below before trying the
desktop or source-code paths.

Araon is a single-user localhost dashboard. It uses Toss-first market data,
supports optional Toss QR login for read-only account surfaces, and does not
provide live trading or order-entry features. KIS credentials are optional and
only enable the low-latency Korean-stock realtime rail.

## Requirements

- Node.js 20 or newer
- npm
- A browser that can open `http://127.0.0.1:<port>`
- Optional: a Toss account for QR login-backed account/portfolio/watchlist views
- Optional: a live KIS OpenAPI app key/app secret pair for the KIS WebSocket
  realtime rail

## Run From npm

The easiest path is one command:

```bash
npx @stellojae/araon@latest
```

Araon starts a local server, prints a `http://127.0.0.1:<port>` URL, and opens
your default browser.

Or install the CLI globally:

```bash
npm install -g @stellojae/araon@latest
araon
```

The CLI starts Araon on `127.0.0.1`, serves the built browser UI, and opens the
default browser. Node.js 20 or newer is required.

On first run, Araon can operate without brokerage credentials. Toss public
market data powers the core watchlist, search, chart, and mover surfaces. Use
Settings to complete Toss QR login when you want account summary, portfolio,
watchlist, orders, transactions, cash overview, and authenticated notification
triggers. Araon remains read-only: it does not place, cancel, or amend orders.

Until KIS credentials are configured, Araon makes no external KIS calls. If you
add KIS credentials, KIS is treated as an optional low-latency WebSocket rail
for high-priority Korean-stock ticks, not as the account/order truth source.

If you want the optional KIS realtime rail and do not have a KIS app key yet,
follow
[KIS OpenAPI setup guide](docs/guides/kis-openapi-setup.md) or
[KIS OpenAPI 키 발급 가이드](docs/guides/kis-openapi-setup.ko.md).

For a non-developer first run, this is the expected flow:

```txt
Terminal command → localhost page → search first stock → optional Toss QR login → monitor
```

## Install From Source

```bash
git clone https://github.com/StelloJae/Araon.git
cd Araon
npm install
cp .env.example .env
```

Edit `.env` and set a private local encryption seed for locally stored
credentials and session metadata:

```bash
KIS_CRED_KEY=replace-with-a-long-random-local-secret
```

Do not put your KIS app key, KIS app secret, or Toss session material in
`.env`. Enter credentials or start QR login through the local browser UI.

Optional news/disclosure providers can be configured in `.env`:

```bash
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
DART_API_KEY=
ARAON_TELEGRAM_BOT_TOKEN=
ARAON_TELEGRAM_CHAT_ID=
```

These are not brokerage credentials. Leave them blank if you only want the
default no-key Naver Finance feed, external disclosure search links, and local
browser alerts.

To get the optional keys:

- Naver: create an application in Naver Developers and enable the Search API.
  Araon uses the News Search API.
- DART: create an OpenDART API key. Araon uses the corp-code catalog and
  disclosure-list APIs to map tickers to recent filings.
- Telegram: create a Telegram bot and set `ARAON_TELEGRAM_BOT_TOKEN` plus the
  target `ARAON_TELEGRAM_CHAT_ID`. This enables optional phone alerts from
  Araon's local alert engine.

## Verify The Checkout

```bash
npm test
npm run typecheck
npm run build
```

These checks do not require Toss QR login or live KIS WebSocket sessions.

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

From npm:

```bash
npx @stellojae/araon@latest
```

From source, build Araon, then start the production localhost app from one
terminal:

```bash
npm run build
node dist/cli/araon.js
```

If Araon is installed as a package, use:

```bash
npm install -g @stellojae/araon@latest
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

Operational commands:

```bash
araon doctor --no-live
araon status
araon open
araon reset --session
araon reset --data --confirm DELETE_LOCAL_ARAON_DATA
```

`doctor` checks the local Node version, packaged frontend, CLI bundle, migration
files, data directory, Toss session presence, and launcher state. It is no-live:
it does not call Toss, KIS, Naver, or OpenDART.

`status` and `open` use the local launcher state written by the last `araon`
run. `reset --session` clears local Toss session/cache state only. `reset --data`
removes the selected local Araon data directory and requires the exact
confirmation string shown above.

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

Credentials, Toss session metadata, settings, and SQLite state are stored under
the selected data directory. Fresh installs have no credentials and make no
external KIS calls or authenticated Toss calls. Toss public market-data calls
may occur for the watchlist/search/chart surfaces. After optional KIS
credentials are configured, Araon can use the capped realtime rail while Toss
remains the primary account and market-data path.

## Desktop App

The desktop app packages Araon as an unsigned Electron app for macOS and
Windows. It is intended for early local testing, not frictionless public
installation.

Download the installers from the GitHub Release page:

```txt
macOS:   Araon-1.2.0-arm64.dmg
Windows: Araon-Setup-1.2.0-x64.exe
Windows: Araon-1.2.0-x64-portable.exe
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

The Windows release script builds x64 artifacts explicitly. Araon uses the
native `better-sqlite3` dependency, so run the generated installer on Windows
before treating a desktop release as fully validated.

The desktop app stores credentials, Toss session metadata, settings, and SQLite
state under the OS app user-data directory. It does not write runtime data into
the app bundle.
Fresh installs have no credentials, so they do not call KIS or authenticated
Toss endpoints. After optional KIS credentials are configured, managed KIS
realtime defaults are:

```txt
websocketEnabled=true
applyTicksToPriceStore=true
backgroundDailyBackfillEnabled=true
```

Desktop artifacts can show OS warnings. macOS artifacts are ad-hoc signed for
local bundle integrity, but they are not Apple Developer ID-signed or notarized:

- macOS: Gatekeeper warning or manual allow step.
- Windows: SmartScreen warning.

Code signing and notarization are planned after the unsigned beta path is
validated.

## First Run

1. Start Araon with `npx @stellojae/araon@latest`, `araon`, or a desktop app.
2. Open the printed localhost URL if your browser did not open automatically.
3. Add stocks from the dashboard search.
4. Use Settings → Connection to complete Toss QR login if you want account,
   portfolio, watchlist, order, transaction, and cash overview surfaces.
5. Add KIS credentials only if you want the optional low-latency realtime rail.
6. Use Settings to inspect Toss session, KIS slot, agent event, and safety
   status.

Credentials and Toss session metadata are stored locally in the selected data
directory:

```txt
credentials.enc
toss-session.enc
```

For source development this is usually `data/`. For the CLI it is `--data-dir`,
`ARAON_DATA_DIR`, or the OS default user-data directory. For desktop apps it is
the OS app user-data directory. Runtime data must not be committed.

## Toss Session And Realtime

Toss QR login unlocks read-only account-aware surfaces and authenticated
notification triggers. Toss upstream is handled as SSE thin notification plus
REST refresh; it is not treated as a WebSocket price-tick feed. The app keeps
Toss session/cookie/storage material out of logs, docs, status payloads, and UI.

## Optional KIS Realtime Rail

Araon does not start KIS realtime before KIS credentials exist. Once live KIS
credentials are registered, integrated realtime can be managed automatically:

```txt
websocketEnabled=true
applyTicksToPriceStore=true
```

Araon uses the KIS `H0UNCNT0` integrated WebSocket feed for up to 40
high-priority Korean-stock tickers. Slots are intended for holdings, pinned
tickers, the current screen ticker, recent news/disclosure/signal tickers,
agent candidates, and other high-value watch items.

Toss REST refresh remains the normal fallback lane when KIS realtime is
disabled, inactive, full, or not receiving ticks.

## Managed Daily Backfill

Daily historical candle backfill is guarded and Toss-first. KIS chart fallback
is disabled by default; only enable it as a legacy fallback during explicit
debugging or migration:

```txt
backgroundDailyBackfillEnabled=true
ARAON_KIS_CHART_FALLBACK_ENABLED=1
```

It only targets favorites and tracked stocks. It does not backfill the full KIS
master catalog, does not store raw ticks, and does not run automatic historical
minute backfill. The scheduler is low-priority, sequential, budgeted, and
guarded so it does not run during the KRX/NXT trading window.

KIS REST watchlist polling fallback is also disabled by default. Toss quote
polling is the normal watchlist price refresh path; only enable KIS REST polling
fallback during explicit debugging or migration:

```txt
ARAON_KIS_POLLING_FALLBACK_ENABLED=1
```

Even when enabled, it only opens after Toss quote polling is disabled or
repeatedly failing.

## Emergency Pause

Use Settings if you need to pause managed realtime or daily backfill. Realtime
emergency pause disconnects the optional KIS WebSocket path and persists:

```json
{
  "websocketEnabled": false,
  "applyTicksToPriceStore": false
}
```

Daily backfill emergency pause persists:

```json
{
  "backgroundDailyBackfillEnabled": false
}
```

Do not commit local settings files.

## Data And Security

- `data/` contains local runtime state.
- `data/credentials.enc` contains encrypted local KIS credentials.
- `data/toss-session.enc` contains encrypted Toss browser session metadata.
- `.env` contains local environment configuration.
- `.env.example` is safe to commit; real `.env` files are not.
- Raw Toss session/cookie/storage values, KIS app keys, app secrets, access
  tokens, approval keys, account identifiers, and order identifiers should never
  appear in commits, logs, issues, or screenshots.

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

Stop Araon first. To clear only local Toss session/cache state, run:

```bash
araon reset --session
```

To remove the selected local Araon data directory, including encrypted
credentials, settings, SQLite state, and local runtime history, use the guarded
command:

```bash
araon reset --data --confirm DELETE_LOCAL_ARAON_DATA
```

Without the exact confirmation string, the data reset command fails without
removing files.

### Toss QR login does not appear

Refresh the Toss login browser window once. In local acceptance, the first load
could remain blank/loading, while a refresh revealed the QR code and allowed the
login to complete.

### KIS credential invalid

Confirm that you entered a live KIS app key/app secret pair. KIS credentials are
optional and only needed for the KIS realtime rail.

### Approval key or WebSocket failure

Check your credentials, KIS service availability, and whether the selected
market window is active. Araon should keep Toss REST refresh available as
fallback.

### No live ticks

Some stocks produce no ticks outside liquid market windows. This is normal,
especially around quiet pre-market or after-market periods.

### Volume baseline collecting

Araon does not show a fake volume multiplier. It waits until enough
same-session/time-bucket samples exist, then displays a trustworthy ratio.
