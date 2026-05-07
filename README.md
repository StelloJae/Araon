# Araon

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.png">
    <img src="public/logo.png" alt="Araon logo" width="104" height="104">
  </picture>
</p>

<p align="center">
  <strong>A local Korean stock monitoring dashboard for KIS OpenAPI users.</strong>
</p>

<p align="center">
  <a href="README.ko.md">한국어 README</a>
  ·
  <a href="INSTALL.md">Install Guide</a>
  ·
  <a href="https://github.com/StelloJae/Araon/releases/tag/v1.1.0">Latest Release</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-339933">
  <img alt="Version" src="https://img.shields.io/badge/npm-v1.1.0-111827">
</p>

Araon is a **single-user, localhost-first dashboard** for watching Korean stocks
through KIS OpenAPI. It is built for people who trade elsewhere, but want a calm
local screen for realtime prices, charts, alerts, news, and disclosure links.

Araon is read-only. It does **not** place orders, execute trades, manage
accounts, or provide financial advice.

---

## What You Can Do With Araon

- Watch your tracked and favorite Korean stocks in one local dashboard.
- Use KIS integrated realtime quotes for up to 40 stocks after credentials are
  configured.
- Keep REST polling as a fallback when realtime is quiet or unavailable.
- Open a stock detail view with live price movement, candles, news, disclosures,
  and data-quality status.
- View local intraday candles and KIS daily/weekly/monthly candle history.
- Automatically fill daily candle history for tracked/favorite stocks outside
  market hours.
- Fetch today-minute candles for a selected ticker when the guarded route allows
  it.
- Receive local alerts, desktop alerts, sound alerts, and optional Telegram
  phone alerts.
- Enrich news/disclosure feeds with optional Naver Search and OpenDART API keys.
- Keep all credentials and market data on your own machine.

---

## Quick Start

You need:

- Node.js 20 or newer
- npm
- A live KIS OpenAPI app key and app secret

Run Araon:

```bash
npx @stellojae/araon
```

Araon starts a local server, prints a `http://127.0.0.1:<port>` URL, and opens
your browser.

You can also install it globally:

```bash
npm install -g @stellojae/araon
araon
```

On first run, Araon shows a local setup screen for your KIS app key and app
secret. Until credentials are configured, Araon makes no external KIS calls.

---

## First Run Checklist

1. Install Node.js 20 or newer.
2. Run `npx @stellojae/araon`.
3. Open the printed localhost URL if your browser does not open automatically.
4. Enter your live KIS OpenAPI app key and app secret.
5. Add stocks from search or the master catalog.
6. Favorite the stocks you want Araon to prioritize.
7. Leave Araon running while you monitor the market.

After credentials are configured, Araon automatically manages:

```txt
Integrated realtime quotes: ON
REST polling fallback: ON
Daily candle backfill: ON, outside market hours
```

You can pause realtime or daily backfill from Settings if needed.

---

## Optional Setup

Araon works without these optional keys. Add them only if you want the extra
features.

```bash
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
DART_API_KEY=
ARAON_TELEGRAM_BOT_TOKEN=
ARAON_TELEGRAM_CHAT_ID=
```

What they enable:

- **Naver Search API**: richer stock news search results.
- **OpenDART API**: recent disclosure feed enrichment.
- **Telegram Bot**: phone alerts from Araon's local alert engine.

Araon stores news/disclosure titles, timestamps, provider snippets, and links.
It does not store full article bodies or generate news summaries.

---

## Where Your Data Lives

Araon stores runtime data locally.

CLI data directory priority:

```txt
1. --data-dir
2. ARAON_DATA_DIR
3. OS default user-data directory
```

Default locations:

```txt
macOS:   ~/Library/Application Support/Araon
Windows: %APPDATA%/Araon
Linux:   ~/.local/share/araon
```

Source-development data usually lives under `data/`.

Never commit or share:

- `.env`
- `data/`
- `credentials.enc`
- SQLite databases
- KIS app keys or app secrets
- access tokens or approval keys

---

## Desktop App

GitHub Releases include macOS desktop artifacts for convenience:

- `Araon-1.1.0-arm64.dmg`
- `Araon-1.1.0-arm64-mac.zip`

The desktop app is unsigned for public distribution. macOS may show a Gatekeeper
warning. Windows desktop validation is still manual-pending, so the npm/CLI path
is the recommended first path for most users.

---

## Common Commands

Run without opening a browser:

```bash
araon --no-open
```

Use a specific port:

```bash
araon --port 3910
```

Use a specific data directory:

```bash
araon --data-dir ~/AraonData
```

Stop Araon:

```txt
Press Ctrl+C in the terminal running Araon.
```

---

## Development

Clone and install:

```bash
git clone https://github.com/StelloJae/Araon.git
cd Araon
npm install
cp .env.example .env
```

Run the development server:

```bash
npm run dev:server
```

In a second terminal:

```bash
npm run dev:client
```

Open:

```txt
http://127.0.0.1:5173
```

Verify changes:

```bash
npm test
npm run typecheck
npm run build
```

---

## Important Limitations

- Araon is optimized for one person on one local machine.
- Araon is not a hosted SaaS service.
- Araon does not trade for you.
- Full-watchlist historical minute backfill is intentionally not automatic.
- Daily candle backfill is guarded and does not run during the KRX/NXT trading
  window.
- Volume-surge ratios appear only after enough local baseline samples exist.
- External providers such as KIS, Naver, OpenDART, and Telegram can have their
  own quotas, outages, or policy limits.

---

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
