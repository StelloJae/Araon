# Toss-First Provider Migration

## Scope

Araon is moving from a KIS-first market-data runtime toward a Toss-first runtime.
This is a staged migration. KIS must not be deleted before Toss can replace the
specific user-facing surfaces that currently depend on it.

## Current Provider Boundary

The first provider boundary lives at `src/server/market/market-data-provider.ts`.
It defines a provider-neutral contract for:

- TOP100 / top movers ranking.
- Quote batch retrieval.
- Realtime popularity ranking.
- Health and capability reporting.

`src/server/toss/toss-public-market-data-provider.ts` implements the first
provider, `toss-public`, using public Toss web endpoints only. It does not need
Toss login and does not call account or trading APIs.

## Toss Public Phase

The public phase covers:

- TOP100 through Toss overview ranking.
- Realtime popularity ranking metadata through Toss public ranking.
- Bulk quote rows through Toss stock-prices via `GET /market/toss/quotes`.
- Daily and selected minute candles through Toss public `c-chart` for supported
  Korean stocks. Araon uses these as the first chart backfill paths and falls
  back to KIS only if the Toss chart request fails and KIS runtime is already
  available.
- Foreground quote refresh tries Toss public quotes first, then falls back to KIS
  only when the Toss quote is unavailable or fails.
- Watchlist quote polling now has a Toss public batch-polling service. It polls
  tracked tickers in batches, writes only usable real prices into the existing
  price store, and exposes sanitized status under `/runtime/data-health` as
  `tossQuotePolling`.
- While Toss quote polling is enabled, running, and not repeatedly failing, KIS
  REST polling is suppressed so KIS remains a fallback path instead of consuming
  the primary quote-refresh budget. After repeated Toss quote failures, KIS
  polling is allowed to resume through its existing governor.
- The default dashboard can render without KIS credentials. Local stocks and
  favorites remain available, `/events` uses an app-level SSE manager, and KIS
  setup moves to an optional/fallback connection path instead of a boot gate.
- First-run search no longer auto-posts `/master/refresh` without KIS
  credentials. It reads the local master cache and waits for explicit KIS setup
  before trying the KIS MST refresh path.
- Header search now also uses Toss public stock search when the local master
  cache is incomplete. Search hits are promoted through `/stocks/from-toss-search`
  after Araon re-reads Toss stock metadata and verifies the row is a supported
  KOSPI/KOSDAQ stock. The client does not trust client-supplied market/name
  values for local catalog writes.

The quote batch currently maps Toss rows into Araon's existing `Price` contract
with `source='rest'` for compatibility. A future provider-neutral source label
can split `toss-rest` from legacy KIS REST once the client/history surfaces are
ready for that wider contract change.

## KIS Legacy Phase

KIS remains in place for:

- Current realtime WebSocket.
- Existing polling fallback when Toss quote polling is disabled or repeatedly
  failing.
- Chart/backfill paths.
- KIS watchlist import and master metadata.
- Rollback while Toss parity is still unproven.

## KIS Dependency Inventory

| Area | Current status | Toss-first decision |
| --- | --- | --- |
| App boot | No longer blocks on KIS credentials. | Keep Toss-first app render as default. |
| TOP100 | Toss overview ranking is primary. | Keep KIS ranking as historical fallback only if explicitly re-enabled. |
| Foreground quote refresh | Toss quote batch first, KIS fallback second. | Keep fallback until live Toss quote observation is stable. |
| Watchlist quote polling | Toss batch polling first; KIS REST polling suppressed while Toss is healthy. | Keep KIS as automatic fallback after repeated Toss quote failures. |
| SSE price delivery | App-level SSE manager now works without KIS runtime. | Use it for Toss polling updates and KIS/other providers alike. |
| KIS realtime WebSocket | Still KIS-only. | Retain until Toss authenticated realtime proves true price-tick coverage. |
| Daily charts/backfill | Toss public `c-chart` is primary for daily Korean stock candles. | Keep KIS daily as fallback while live stability is observed. |
| Minute charts/backfill | Toss public `c-chart` `min:1` is primary for selected today/historical minute backfill. | Keep KIS minute endpoints as fallback while live stability is observed. |
| Search/master metadata | Toss public search can add supported KOSPI/KOSDAQ stocks without KIS; KIS MST/local master cache remains for full offline universe/classification. | Keep KIS MST as optional metadata enrichment until Toss/another source covers full-market classification. |
| KIS watchlist import | Still KIS-only import convenience. | Retain as optional import, not core runtime. |

Do not remove KIS runtime, credentials, or governor code until Toss quote,
authenticated realtime, chart, and metadata coverage have explicit evidence.

## Toss Authenticated Phase

The next migration stage is Toss login/session support. The current foundation
includes encrypted local session storage, sanitized status/logout routes, and a
Chrome/CDP login capture service:

- `GET /toss/auth/status`
- `DELETE /toss/auth/session`
- `POST /toss/auth/login/start`
- `GET /toss/auth/login/status`
- `POST /toss/auth/login/cancel`

These routes expose only counts, timestamps, and state labels. They do not expose
cookie names, cookie values, storage values, QR payloads, or raw Toss responses.
The settings connection tab surfaces the same sanitized session/login status and
starts or cancels QR capture without rendering session values.

The login capture opens an isolated Chrome profile, waits for QR login, and saves
only a persistent session after the user confirms "이 기기 로그인 유지" on the phone.
The temporary Chrome profile is removed after completion/cancel/failure.

Remaining authenticated-session work:

- Session extension/renewal behavior.
- No raw `SESSION`, `UTK`, `LTK`, `FTK`, `browserSessionId`, `deviceId`, account
  numbers, or raw upstream response bodies in logs, docs, status payloads, UI, or
  git diffs.

Toss account, order, transfer, and trading mutation endpoints remain out of
scope.

## Toss Realtime Phase

Toss authenticated realtime is not a KIS-style 체결가 WebSocket in the current
evidence. The integrated foundation uses Toss's authenticated SSE notification
channel:

- `GET /toss/realtime/status`
- `POST /toss/realtime/start`
- `POST /toss/realtime/stop`

This stream is marked `thinNotificationOnly=true`: it can tell Araon that a
stock/account-related event happened, but it does not replace quote REST reads by
itself. For prices, Araon must pair Toss SSE events with Toss quote refresh or
continue conservative Toss REST polling.
The settings connection tab can start/stop this SSE service after a sanitized
Toss session is present, and shows only event counts, timestamps, state, and
safe error labels.
When Araon starts with a usable stored Toss session, it now requests the Toss
SSE service automatically. After QR login capture reaches `succeeded`, the
settings polling path triggers the same auto-start once. Clearing the Toss
session stops the SSE service.
The sanitized SSE status also tracks event type counts, `price-refresh` event
counts, and the latest stock code/timestamps. This remains metadata-only:
raw SSE payloads, cookies, and browser storage values are not exposed.
When a `price-refresh` notification includes a supported tracked Korean stock
code, Araon now uses it as a low-rate trigger for a Toss public quote refresh.
The trigger is ticker-throttled and only writes real Toss quote rows into the
existing PriceStore.

Before it becomes the default realtime source, it still needs a minimal live
probe with an authenticated Toss session. If price refresh events are not
observed or do not cover watchlist movement, keep Toss REST quote polling as the
primary replacement for KIS polling and document the blocker.

## Chart Evidence

The `tossinvest-cli` reverse-engineering catalog records a public chart endpoint:

- `GET https://wts-info-api.tossinvest.com/api/v1/c-chart/kr-s/{code}/day:1`
- `GET https://wts-info-api.tossinvest.com/api/v1/c-chart/kr-s/{code}/min:1`
- Query shape observed from the Toss web bundle: `count`, `from`, `session`,
  `investMode`, `useAdjustedRate`, and optional `currency`.
- The response includes `result.candles[]` with `dt`, `open`, `high`, `low`,
  `close`, `volume`, plus `nextDateTime` for older-page traversal.

Araon now maps daily rows to stored `1d` candles with source `toss-daily` and
minute rows to stored `1m` candles with source `toss-time-today` or
`toss-time-daily`.
On 2026-05-11, a minimal public read-only probe for `A005930` confirmed the
endpoint returned current daily rows and accepted `from=nextDateTime` for older
page traversal.
The same day, a minimal public read-only `min:1` probe for `A005930` confirmed
current minute rows and `nextDateTime` traversal. The Toss SSE channel remains a
thin notification stream, so it is not a direct candle or tick stream by itself.

## Completion Criteria

The full KIS removal goal is not complete until:

- TOP100 defaults to Toss and remains honest about partial/stale coverage.
- Watchlist quote refresh works through Toss public or authenticated data.
- Realtime ticks work through Toss authenticated realtime, or a clear blocker and
  fallback are documented.
- Daily chart, minute chart, and search have Toss coverage; full master metadata
  has Toss coverage or documented alternatives.
- KIS settings and runtime are removed or explicitly retained as a documented
  legacy fallback.
- Full test/typecheck/build and secret grep pass.
