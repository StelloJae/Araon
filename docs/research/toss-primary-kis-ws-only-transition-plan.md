# Toss Primary + KIS WS-Only Transition Plan

Date: 2026-05-14

This document is the execution brief for reducing Araon to a clean Toss-first
data model while keeping KIS only as an optional low-latency Korean-stock
WebSocket acceleration rail.

It is not a live-trading approval. It does not authorize Toss account mutation,
Toss watchlist mutation, KIS order APIs, or automated live execution.

## Decision

Araon should use Toss as the product's primary data source and KIS as an
optional fast-tick rail.

| Surface | Primary source | KIS role |
|---|---|---|
| Search | Toss search + local cache | Optional legacy universe fallback only |
| Product identity | Toss `productCode` + normalized local metadata | `krTicker` eligibility check only |
| Quote/current price | Toss REST refresh | Fast tick overlay for selected KR tickers |
| Sparkline | Toss quote refresh + local price history | Fast subscribed tick overlay only |
| Mini/full chart | Toss c-chart/daily/minute candle REST | No default chart fallback |
| Historical candle/backfill | Toss chart REST | Explicit legacy fallback only, then remove |
| TOP100/ranking | Toss ranking/provider data | No ranking source |
| Sector/theme | Toss-first normalized classification | Legacy/local fallback only |
| Watchlist/favorites | Toss account watchlist when logged in; local fallback otherwise | Candidate source for WS slots only |
| Account/portfolio/orders/transactions/cash | Toss authenticated read APIs | No role |
| News/disclosures/signals | Toss/Naver/OpenDART normalized providers | Candidate source for WS slots only |
| Realtime market pulse | Toss SSE thin notification + REST refresh | Optional low-latency WS for up to 40 KR tickers |

## Core Principle

Toss is the truth source. KIS is a speed layer.

KIS must not decide account state, portfolio truth, order truth, watchlist truth,
chart history, TOP100 membership, sector truth, or long-term price history in
the default product path.

KIS WebSocket ticks may improve the latest price and the currently forming
candle for a bounded set of `kisEligible=true` Korean tickers. They must not
become a second competing truth source.

## Product Identity Model

The old model treats `ticker` as the universal stock identity. That is no longer
enough because Toss can expose product codes that are not six-digit KRX tickers,
for example Toss-only or non-KIS-eligible codes.

Introduce or converge on this normalized product contract:

```ts
interface AraonProductIdentity {
  productCode: string;        // Toss product code, for example A005930 or 0011T0
  krTicker: string | null;    // six-digit KRX ticker when available
  symbol: string;             // display/search symbol
  name: string;
  market: 'KOSPI' | 'KOSDAQ' | 'US' | 'TOSS_ONLY' | 'UNKNOWN';
  currency: 'KRW' | 'USD' | 'UNKNOWN';
  tossEligible: boolean;
  kisEligible: boolean;       // true only when KIS WS can subscribe safely
  chartEligible: boolean;
  quoteEligible: boolean;
  source: 'toss' | 'local' | 'kis-legacy' | 'unknown';
}
```

Rules:

- `productCode` is the durable Toss-side identity.
- `krTicker` is optional and only exists for six-digit Korean stocks.
- KIS WS allocation only uses `krTicker` when `kisEligible=true`.
- Toss-only products may still be searchable, viewable, and chartable if Toss
  quote/chart endpoints support them.
- A Toss-only product must not be sent to KIS WS, KIS REST quote, KIS chart, or
  KIS master paths.
- UI must not show Toss-only products as broken addable rows. Until full
  product identity support exists, show them as `Toss 전용` / `지원 대기`.

## Sector And Theme Model

Sector/theme should be normalized instead of tied to KIS metadata.

```ts
interface AraonClassification {
  sector: string | null;
  theme: string | null;
  source: 'toss' | 'local' | 'kis-legacy' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  updatedAt: string | null;
}
```

Priority:

1. Toss-provided sector/theme/signal surface when available and verified.
2. Local curated classification.
3. KIS legacy industry metadata as fallback only.
4. Unknown.

UI copy must avoid implying that KIS is the primary sector source. If a value is
from KIS legacy metadata, it should be visibly secondary or hidden behind
diagnostics/settings.

## Price, Sparkline, And Chart Model

### Quote

Default quote refresh should come from Toss. If KIS WS is active for the same
`krTicker`, KIS may update the latest visible price faster.

Conflict rule:

- Toss refresh is the durable baseline.
- KIS WS tick is a temporary low-latency overlay.
- If Toss later returns a different authoritative value, Toss wins.

### Sparkline

Sparkline should be based on local price history produced from Toss quote
refresh plus optional KIS WS tick overlays for subscribed KR tickers.

Retention:

- Keep intraday sparkline points through premarket, regular, and after-hours.
- Keep the last useful 24h window so after-hours/closed periods do not flatten
  the row immediately.
- Start a new trading-day series when the next market session starts.
- Do not synthesize missing prices.

### Chart

Mini chart and full chart should use Toss candle endpoints as the default.

KIS WS may update the active candle only when:

- the product has `kisEligible=true`,
- the ticker is currently subscribed,
- the tick passes market/session validation,
- and the update does not require persisting raw tick frames.

Non-trading gaps should be hidden by chart time-scale handling rather than
filled with synthetic candles.

## KIS Target Scope

Keep:

- KIS credential setup only as optional realtime rail setup.
- KIS approval key flow required for WebSocket.
- KIS WebSocket client.
- KIS tick parser.
- KIS WS smart slot allocator/state/rebalancer.
- Sanitized KIS WS status UI/API.

Remove or isolate behind explicit legacy gates:

- KIS REST quote fallback.
- KIS polling fallback.
- KIS chart fallback.
- KIS ranking/TOP100.
- KIS daily/minute backfill.
- KIS master auto refresh/import as a default startup path.
- KIS watchlist import as anything other than a manual migration helper.
- KIS governor/AIMD surfaces once no KIS REST fallback remains.

## KIS WS Slot Allocation

KIS WS remains capped to `WS_MAX_SUBSCRIPTIONS=40` per profile.

Candidate sources:

1. Toss holdings.
2. User-pinned realtime tickers.
3. Current selected chart/ticker.
4. Recent news/disclosure/Toss signal tickers.
5. Agent watch/order-intent candidates.
6. Toss/local favorites.
7. TOP100 or recent momentum rotation samples.

Only candidates with normalized six-digit `krTicker` and `kisEligible=true`
may enter the KIS plan.

All other products stay on the Toss quote/chart/SSE refresh lane.

UI should summarize KIS as a compact state, for example:

- `KIS 20/40`
- row-level tiny status dot or tooltip
- reason in diagnostics/settings, not large row pills

Avoid visible copy like `폴링40` when it actually means Toss REST refresh or
legacy fallback. Use `Toss refresh`, `REST refresh`, `비실시간`, or `대기`
depending on the actual lane.

## Implementation Order

### Phase 0 - Audit And Freeze Current Semantics

- Inventory all user-visible `polling`, `fallback`, `registered`, `tracked`,
  `KIS realtime`, and `sector` labels.
- Identify every path that still sends normal quote/chart/search/ranking work
  to KIS by default.
- Confirm clean no-credential startup does not call KIS token, approval,
  WebSocket, polling, chart, backfill, master, or ranking paths.

### Phase 1 - Product Identity Split

- Add or adapt a product identity layer that can represent Toss `productCode`
  separately from six-digit KRX `krTicker`.
- Update search result normalization so Toss-only products are not treated as
  invalid KRX tickers.
- Keep KIS eligibility explicit.
- Add tests for:
  - `A005930 -> krTicker=005930, kisEligible=true`
  - `0011T0 -> krTicker=null, kisEligible=false, tossEligible=true`
  - US/non-KR products never enter KIS WS allocation

### Phase 2 - Toss-First Search And Registration

- Search should prefer Toss results and merge with local cache.
- Six-digit KR products can be added to Araon local view immediately.
- Toss-only products can be opened as Toss-supported products only after quote
  and chart support is verified.
- Before full support, UI must show `Toss 전용` / `지원 대기`, not `+ 추가`.

### Phase 3 - Toss-First Sector/Theme

- Investigate Toss surfaces for sector, theme, category, signal reason, and
  related-stock metadata.
- Normalize those into `AraonClassification`.
- Keep local classification as fallback.
- Keep KIS industry metadata as legacy fallback only.

### Phase 4 - Toss Quote/Sparkline/Chart Authority

- Ensure quote refresh, price history, sparkline, mini chart, and full chart all
  use Toss as the default source.
- KIS WS tick may update latest price/current candle only for subscribed KR
  tickers.
- Remove or hide KIS polling labels from normal UI.
- Ensure non-trading gaps are skipped visually without synthetic candles.

### Phase 5 - KIS REST Fallback Cleanup

- Keep KIS REST fallbacks disabled by default.
- Remove UI/status copy that makes KIS polling look like a normal lane.
- If a fallback remains, expose it only in diagnostics/settings with:
  - disabled/suppressed/manual state,
  - env gate,
  - reason,
  - no raw secret/upstream payload.

### Phase 6 - Verification And Docs

- Update README/INSTALL/runbooks after implementation.
- Keep `docs/design.md` aligned with Toss-primary/KIS-speed-layer language.
- Run focused tests, `npm test`, `npm run typecheck`, `npm run build`,
  `git diff --check`, and a tracked-file secret grep for sensitive changes.
- Use real browser visual QA for search, watchlist, TOP100, chart, account rail,
  KIS status, and settings.

## Acceptance Criteria

The transition is complete only when all of these are true:

1. Clean install with no Toss/KIS credentials shows no surprise outbound KIS
   calls.
2. Toss login enables account, portfolio, watchlist, quote, chart, TOP100,
   news/signal surfaces without KIS credentials.
3. Search can represent both KRX and Toss-only products truthfully.
4. Sector/theme UI does not depend on KIS as the primary source.
5. Sparkline and chart default to Toss-derived data.
6. KIS WS can accelerate at most 40 eligible KR tickers.
7. Non-KIS-eligible products never enter KIS WS, KIS quote, KIS chart, or KIS
   master flows.
8. KIS REST polling/chart/ranking/master/import paths are removed from the
   default product path or isolated as explicit legacy/manual fallback.
9. UI no longer uses ambiguous labels such as `등록됨`, `폴링40`, or large
   `KIS 실시간` pills in normal rows.
10. No raw Toss/KIS/session/account/order identifiers or payloads appear in UI,
    logs, docs, stdout, or git diff.

## Goal Prompt

Use this prompt when starting the implementation goal:

```text
[$goal] Araon을 Toss-primary + optional KIS WS-only 구조로 정리한다.

기준 repo는 /Users/stello/korean-stock-follower 이다.
반드시 /Users/stello/korean-stock-follower/docs/research/toss-primary-kis-ws-only-transition-plan.md 를 먼저 읽고, 그 문서를 authoritative execution brief로 따른다.

목표:
1. Toss를 검색, quote, sparkline, chart, TOP100, sector/theme, account, portfolio, watchlist, news/signal의 기본 source of truth로 정리한다.
2. KIS는 optional low-latency WebSocket acceleration rail로만 남긴다.
3. KIS REST quote/polling/chart/ranking/backfill/master/import는 default path에서 제거하거나 명시 opt-in legacy/manual fallback으로 격리한다.
4. product identity를 Toss productCode와 six-digit KRX krTicker로 분리하고, kisEligible/tossEligible을 명시한다.
5. 채비 0011T0 같은 Toss-only product는 KIS로 보내지 않고, 지원 전에는 UI에서 Toss 전용/지원 대기로 정직하게 표시한다.
6. sparkline과 chart는 Toss-derived data를 기본으로 쓰고, KIS WS tick은 eligible KR ticker의 최신 가격/current candle 보정에만 사용한다.
7. KIS WS slot allocator는 40개 cap을 지키고, holdings/current view/news/disclosure/Toss signal/agent/favorites/TOP100 후보 중 kisEligible=true인 ticker만 구독한다.
8. UI에서 등록됨/폴링40/큰 KIS 실시간 pill 같은 legacy copy를 제거하거나 Toss-first 의미에 맞게 바꾼다.

안전 경계:
- 실제 주문, 주문 취소, 주문 정정, 계좌 변경, Toss watchlist mutation은 별도 승인 전까지 실행하지 않는다.
- Toss/KIS/session/account/order raw 값은 UI/log/docs/stdout/git diff에 노출하지 않는다.
- 합성 금융 데이터는 만들지 않는다.
- KIS REST live stress나 의도적 throttle 유도는 별도 승인 없이 하지 않는다.

진행 순서:
1. 현재 git status와 기존 미커밋 변경을 확인하고 사용자 변경을 보존한다.
2. 위 전환 문서의 Phase 0부터 순서대로 현재 코드와 UI copy를 audit한다.
3. product identity split을 먼저 설계/구현하고 테스트한다.
4. Toss-first search/register/sector/quote/sparkline/chart 순서로 default source를 정리한다.
5. KIS REST fallback/polling/chart/ranking/master/import를 default path에서 제거하거나 legacy gate 뒤로 격리한다.
6. KIS WS-only allocator와 UI status를 최종 정리한다.
7. README/INSTALL/runbook/design docs를 새 구조에 맞게 갱신한다.

검증:
- focused tests 추가/갱신
- npm test
- npm run typecheck
- npm run build
- git diff --check
- tracked-file secret grep
- 실제 브라우저 visual QA: search, TOP100, favorites/watchlist, sector/theme, mini/full chart, Toss account rail, KIS status, settings

완료 조건:
전환 문서의 Acceptance Criteria 10개가 모두 만족되고, Toss-primary no-KIS startup과 optional KIS WS-only acceleration이 실제 UI/API에서 검증됐을 때만 완료 처리한다.

[$caveman] hangul-full을 항상 사용할 것
```
