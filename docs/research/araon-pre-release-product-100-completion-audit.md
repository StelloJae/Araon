# Araon Pre-Release Product 100% Completion Audit

Date: 2026-05-18 08:31 KST

Authoritative brief:
`docs/research/araon-pre-release-product-100-goal.md`

Progress matrix:
`docs/research/araon-pre-release-product-100-progress-audit.md`

## Status

Completion status: `PASS`

All 42 completion criteria have current implementation and evidence. The final
verification command sweep was re-run after this audit file was written and
passed.

## Explicit Scope Boundary

Closed in this lane:

1. Toss-first public market surfaces.
2. Toss QR/session/account read surfaces.
3. Toss watchlist-centered favorites foundation.
4. Product-aware search/add/star/watchlist/chart/KIS/agent identity handling.
5. Optional KIS `실시간 추적` containment.
6. TOP100/realtime ranking/recent surge/fast quote read-only market evidence.
7. Mini/full chart progression from real samples.
8. v7 home/account/chart/agent/settings/status-bar product polish.
9. News/disclosure/Toss signal normalized event foundation.
10. Agent decision-support, event queue, order-intent preview/risk/approval/audit
    foundation with live execution locked.
11. CLI/local operation surface.

Still intentionally out of scope:

1. GitHub Release.
2. npm publish.
3. public release screenshots/marketing notes.
4. live order placement, cancel, amend, or account mutation.
5. live auto-buy/live auto-sell.
6. live autonomous trading.

## Safety Boundary Result

Safety result: `PASS`

- No live order, order cancel, order amend, account mutation, or live auto-trade
  was executed.
- Toss watchlist live mutation was limited to the previously approved bounded
  add-then-remove smoke. The smoke restored count-only state and did not expose
  raw upstream identifiers.
- Raw Toss/KIS/session/account/order/watchlist values were not intentionally
  emitted in UI, docs, stdout, or git diff.
- Chart/sparkline/quote behavior remains real-sample based. No fake financial
  data, fake candles, or fake movement was introduced.
- Full-market fast polling was not introduced. The fast quote lane stays
  bounded by candidate set and cap guards.

## Key Evidence

### Market Evidence

Current strongest read-only market-window evidence:

- `docs/archive/pre-release-market-evidence-20260518-082240.json`
- `docs/archive/pre-release-market-evidence-20260518-082240.md`

Observed result:

- `marketEvidenceReady=true`
- `completionReady=true`
- `finalGoalCompletionReady=false`
- `sampleCount=600`
- sample cadence: `p95GapMs=570`, `maxGapMs=659`
- endpoint latency: `p95DurationMs=109`, `maxDurationMs=194`
- bounded fast quote lane: running, source OK, `intervalMs=500-500`,
  originally observed at `targetCap=40`, `hardCap=60`; later watchlist
  alignment work raised the product default to `targetCap=64`, `hardCap=100`
  after bounded public quote probes
- TOP100 movement observed
- TOP100 rank-order reorder observed
- quote sample movement observed
- chart progression observed with real sample buckets

`finalGoalCompletionReady=false` is expected in the harness because that report
only proves market-data evidence. Browser/Computer Use QA and this written audit
remain separate goal requirements.

### Browser Visual QA

Browser QA passed across the target surfaces:

- 1920x1080 home.
- 1600x1000 home.
- 1440x900 home.
- 900px responsive home.
- 900px account rail collapsed/expanded.
- 900px full chart workspace.
- 900px Agent Detail workspace.
- settings connection tab.
- search overlay with Toss-only/unsupported product state.
- light/dark bottom status bar.

Additional 2026-05-18 live-window QA after signal-route hardening:

- TOP100 timestamp/value advancement observed.
- no visible severe lag during live-window observation.
- full chart opened as workspace expansion, not URL/page navigation.
- full chart price/time advanced without refresh.
- no document scroll in home/full-chart/agent detail at 900px.
- Agent Detail showed live lock and auto-trading not-ready state.
- old/internal copy scan found no visible `KIS WS`, `WebSocket`, `등록됨`,
  `폴링`, or `내 목록` hits.
- signal route no longer produced 5xx responses during observation.

### Product Identity And Watchlist

- Toss watchlist is the primary favorites model when available.
- Local favorites are fallback/cache only.
- Toss product code and six-digit KRX ticker identity stay separated across
  search, watchlist, chart, KIS, and agent flows.
- Toss-only products are not sent to six-digit-only/KIS routes.
- UI avoids raw `400 Bad Request` for unsupported product actions.
- Live watchlist smoke proved bounded add/remove with restored redacted counts.

### KIS Containment

- Normal product copy presents KIS as `실시간 추적`.
- KIS remains optional and eligibility-gated.
- KIS REST-heavy legacy behavior is documented as manual, credential-gated, or
  explicit fallback/compatibility path, not normal product truth.
- KIS does not become account/order/watchlist/ranking/chart-history source of
  truth.

### Chart And Realtime

- TOP100 rising/falling uses provider ranking, not local filler.
- Recent surge accepts `toss-fast-quote` and `ws-integrated` realtime-like
  sources and excludes generic REST refresh.
- 3% threshold behavior and noisy-toast suppression are covered by focused
  tests.
- Mini/full chart use real stored candles and real quote samples.
- Non-trading gaps are hidden without synthetic candles.

### Agent Safety Foundation

- Agent event queue is functional.
- Public event payload preserves normalized product/source/freshness/relevance
  fields while keeping raw provider payload and dedupe keys internal.
- Order-intent preview/risk/approval/audit lifecycle is implemented as a safety
  foundation.
- Live execution remains locked and obvious.
- Missing live-autotrading pieces remain explicitly not-ready/locked.

## Criteria Summary

The progress audit currently records:

- criteria 1-41: `PASS`
- criterion 42: this completion audit file

Criterion #42 may be marked `PASS` after this file is committed to the progress
audit and the criteria guard confirms 42/42 pass.

## Final Verification

Final verification result: `PASS`

| Check | Result | Notes |
|---|---|---|
| `npm test` | PASS | 226 files / 1477 tests |
| `npm run typecheck` | PASS | server, client, electron, and CLI typechecks |
| `npm run build` | PASS | Vite large chunk warning only |
| `git diff --check` | PASS | no whitespace errors |
| `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500` | PASS | `ok=true`, `sampleCount=18`, `issueCount=0` |
| `node dist/cli/araon.js --help` | PASS | help renders |
| `node dist/cli/araon.js --version` | PASS | `1.1.4` |
| `node dist/cli/araon.js doctor --no-live` | PASS | OK, 6 pass / 1 expected no-live Toss-session warning |
| `npm pack --dry-run --json` | PASS | package includes CLI/client/electron bundle and migrations through `021-stock-signal-events-detach-stock-fk.sql` |
| `npm run audit:pre-release-product -- --audit-path=docs/research/araon-pre-release-product-100-progress-audit.md --require-complete` | PASS | 42/42 criteria pass; `goalComplete=true` |
| tracked-file secret/raw-value scan | PASS | no quoted/env-style raw secret-like values found in tracked non-test/non-archive paths; one broader path-only false positive was code variable forwarding in `src/server/kis/kis-auth.ts` |

## Final Decision

Decision state: `PRE_RELEASE_PRODUCT_100_COMPLETE`

This pre-release product lane can be marked complete. GitHub Release and npm
publish should start only in a separate release lane.
