# Integrated TOP100 Source Routing

## Scope

This note documents Araon's integrated TOP100 routing policy after the 2026-05-11
intraday observation. It is intentionally conservative: TOP100 should feel like
one continuous surface across premarket, regular market, and after-hours, but it
must not fabricate a full-market TOP100 from local watchlist rows.

## Observation Basis

- Regular-market KIS ranking was observed as partial/stale, not fully reliable.
- Final observed TOP100 coverage was around gainers 29-30 and losers 21.
- Ranking traffic naturally hit `EGW00201` / `KIS_RATE_LIMIT_SECOND_WINDOW`.
- Realtime stayed healthy and foreground queue pressure was not observed.

Treat these as local observations, not a permanent KIS guarantee.

## Source Phases

Araon now models TOP100 with explicit source phases:

- `premarket`: 08:00-08:50 KST, KIS expected transaction ranking.
- `opening_freeze`: 08:50-09:00 KST, last premarket snapshot is held.
- `regular`: 09:00-15:30 KST, KIS regular fluctuation ranking.
- `after_hours`: 15:30-20:00 KST, KIS overtime fluctuation ranking.
- `stale_snapshot`: outside fetchable windows or retained last-good data.
- `unsupported`: no usable source and no last-good snapshot.

The UI keeps the TOP100 surface stable while showing a small source/status label
such as `장전`, `본장`, `시간외`, `고정`, `직전`, or `미지원`.

## Ranking Rate-Limit Policy

- Ranking stays under the shared KIS governor and does not bypass foreground
  protection.
- Ranking refresh defaults to a slower 30-second interval.
- KIS continuation pages are spaced by a conservative delay before the next page.
- If a refresh returns fewer rows than the current best partial snapshot, Araon
  keeps the larger last-good snapshot and marks it as `stale_snapshot`.
- If KIS returns `EGW00201`, Araon keeps the last-good snapshot when available,
  marks `rankingRateLimited=true`, and avoids retry hammering.

## Honesty Rules

- `coverage.guaranteedTop100=true` only when both gainers and losers reach the
  requested limit.
- `coverage.includesLocalFallback=false` must remain true unless a future feature
  explicitly and honestly labels a local/watchlist-only view.
- Partial or stale data must be visible through `/runtime/data-health` and the UI.
- Raw KIS response bodies, credentials, tokens, and account identifiers must never
  be exposed in status payloads, logs, docs, or committed files.

## Remaining Limitations

- KIS-only full-market TOP100 is still not guaranteed under live rate pressure.
- NXT-specific full-market TOP100 behavior is not proven by this change.
- Future live validation should be short read-only observation, not stress tests
  or long usability-disrupting soaks.
