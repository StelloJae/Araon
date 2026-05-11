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
- Bulk quote rows through Toss stock-prices.

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

The next migration stage is Toss login/session support:

- Browser-assisted QR login using Chrome/Playwright.
- Persistent session capture only after the user confirms "이 기기 로그인 유지".
- Encrypted local storage of required cookies and browser storage values.
- Session status, logout, and extension/renewal behavior.
- No raw `SESSION`, `UTK`, `LTK`, `FTK`, `browserSessionId`, `deviceId`, account
  numbers, or raw upstream response bodies in logs, docs, status payloads, UI, or
  git diffs.

Toss account, order, transfer, and trading mutation endpoints remain out of
scope.

## Toss Realtime Phase

Toss authenticated realtime remains unproven in Araon. The likely direction is a
read-only STOMP/WebSocket client against the Toss web realtime socket, using the
authenticated Toss web session. This must be verified with a minimal live probe
before it becomes the default realtime source.

If realtime subscribe, receipt, or message parsing cannot be proven, keep Toss
REST quote polling as fallback and document the blocker.

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
