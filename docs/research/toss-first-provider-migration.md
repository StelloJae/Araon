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
- Foreground quote refresh tries Toss public quotes first, then falls back to KIS
  only when the Toss quote is unavailable or fails.

The quote batch currently maps Toss rows into Araon's existing `Price` contract
with `source='rest'` for compatibility. A future provider-neutral source label
can split `toss-rest` from legacy KIS REST once the client/history surfaces are
ready for that wider contract change.

## KIS Legacy Phase

KIS remains in place for:

- Current realtime WebSocket.
- Existing polling fallback.
- Chart/backfill paths.
- KIS watchlist import and master metadata.
- Rollback while Toss parity is still unproven.

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

Before it becomes the default realtime source, it still needs a minimal live
probe with an authenticated Toss session. If price refresh events are not
observed or do not cover watchlist movement, keep Toss REST quote polling as the
primary replacement for KIS polling and document the blocker.

## Completion Criteria

The full KIS removal goal is not complete until:

- TOP100 defaults to Toss and remains honest about partial/stale coverage.
- Watchlist quote refresh works through Toss public or authenticated data.
- Realtime ticks work through Toss authenticated realtime, or a clear blocker and
  fallback are documented.
- Chart/search/master metadata have Toss coverage or documented alternatives.
- KIS settings and runtime are removed or explicitly retained as a documented
  legacy fallback.
- Full test/typecheck/build and secret grep pass.
