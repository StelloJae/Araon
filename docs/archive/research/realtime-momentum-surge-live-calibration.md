# Realtime Momentum Surge Live Calibration

Date: 2026-04-29

## Goal

Observe the new rolling-momentum "recent surge" feed in a live runtime without
changing thresholds.

This calibration checks whether the Phase 3+4 wiring behaves like a scalp
signal feed:

- `최근 급상승`: 10s / 20s / 30s realtime momentum crossings
- `오늘 강세`: existing previous-close `changePct`
- `전체`: realtime momentum, short trend, and today-strong rows

No threshold tuning, new feature work, WebSocket smoke, or cap test was
performed in this calibration pass.

## Observation Window

- Start: 2026-04-29 17:48:13 KST
- End: 2026-04-29 18:08:18 KST
- Duration: about 20 minutes
- Market window: NXT after-market
- UI: `http://127.0.0.1:5173/`
- WebSocket source: `H0UNCNT0` integrated
- Effective realtime subscriptions: 6 current favorites
- Tracked stocks: 107
- REST polling fallback: active

The runtime is capable of cap40, but this pass intentionally observed the
current local user state rather than adding a temporary favorite overlay.

Subscribed tickers:

- `005930`
- `000660`
- `042700`
- `277810`
- `017510`
- `027360`

## Runtime Counters

Status endpoint samples were collected once per minute from
`GET /runtime/realtime/status`.

| Metric | Result |
|---|---:|
| Samples | 21 |
| Parsed tick delta | 9,796 |
| Applied tick delta | 4,323 |
| Stale/equal ignored delta | 5,473 |
| Reconnect attempts | 0 -> 0 |
| Parse errors | 0 -> 0 |
| Apply errors | 0 -> 0 |
| Final state | connected |
| Final lastTickAt | 2026-04-29T09:08:43.345Z |

The stale/equal count rose materially near the end of the window, but it stayed
inside the intended policy: same-timestamp or older WS ticks did not overwrite
newer price state.

## UI Observation

`SurgeBlock` was checked in the browser during the run.

Observed UI state:

- Market badge: `LIVE`
- SSE badge: `실시간`
- Favorite lane: `WS · 6`
- Footer: `총 종목 107`, `즐겨찾기 (WS) 6`, `폴링 101`
- Recent surge card: `최근 급상승`, `10~30초`
- Recent surge count: `0종목`
- Empty copy: `최근 10~30초 급상승 종목 없음`

This is the desired behavior for the old false-positive problem: stocks that
were already strong on a previous-close basis did not repeatedly reappear in the
recent-surge feed just because new ticks arrived.

## Signal Metrics

The browser UI showed no realtime momentum rows during this 20 minute
after-market observation.

| Signal type | Count |
|---|---:|
| scalp | 0 |
| strong_scalp | 0 |
| overheat | 0 |
| trend-only visible in recent tab | 0 |
| duplicate row observed | 0 |
| exit warning observed | 0 |

Cooldown suppress count and exact level-escalation count are not currently
exposed as runtime counters, so they were not measured directly. No duplicate
rows were visible in the UI.

## Interpretation

This calibration did not prove that the thresholds are optimally sensitive.
The run happened in the NXT after-market and only the current 6 favorite tickers
were subscribed.

What it did prove:

- The recent-surge feed no longer behaves like a previous-close `+3%` replay
  list.
- REST polling and snapshots did not create visible recent-surge rows.
- Runtime realtime remained stable under live tick flow.
- No reconnect loop, parse error, apply error, or UI row explosion was observed.
- The current thresholds are conservative in this observed condition.

## Verdict

GO for current threshold retention.

No immediate threshold change is recommended from this observation alone.
The next tuning decision should be based on a more liquid regular-market window
and, ideally, a wider realtime subscription set.

## Follow-up Tuning Candidates

Only consider these after another live observation with enough liquidity:

- If signals remain too sparse in regular hours:
  - consider lowering 30s scalp from `+1.8%` to `+1.5%`
  - keep 10s `+0.8%` and 20s `+1.2%` unchanged first
- If signals become too noisy:
  - consider raising 10s to `+1.0%`
  - consider raising 20s to `+1.5%`
  - consider increasing cooldown from 90s to 120s

Do not tune from after-market evidence alone.

## Validation Plan

After this documentation-only report:

- `npm test`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- targeted credential leak grep
