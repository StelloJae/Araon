# Araon complete analysis: commit slices, market-hours verification, product icons, and agent readiness

> Date: 2026-05-19 KST
> Status: analysis artifact for the next execution goal
> Scope: no code changes, no live orders, no account mutation, no synthetic financial data

## 0. 결론

현재 Araon은 **Toss-first watchlist / TOP100 / fast quote / chart / account rail / agent safety shell**까지는 제품 형태가 잡혀 있다. 다만 지금 더티 트리가 너무 크고, 기능들이 여러 goal에서 이어 붙은 상태라서 다음 단계는 구현을 더 밀기 전에 반드시 다음 네 가지를 분리해야 한다.

1. **커밋 슬라이스 분리**
   - 현재 tracked 변경만 90개 파일, 약 5.7k lines 추가 수준이다.
   - A-G 커밋 슬라이스로 나누지 않으면 리뷰, 회귀 추적, 릴리즈 노트 작성이 어려워진다.

2. **장중 동작 증거 확보**
   - 현재 런타임은 Toss TOP100 0.5초, Toss fast quote 0.1초, KIS optional WS rail이 살아 있다.
   - 하지만 "최근 급상승 row 생성 -> 클릭 -> selected ticker/chart 변경 -> 중복 알림 억제"는 장중 장시간 관찰 증거가 더 필요하다.

3. **종목 아이콘 파이프라인 최종 QA**
   - Toss account/watchlist/portfolio icon pipeline은 safe URL sanitize, shared in-memory cache, ProductAvatar까지 구현되어 있다.
   - Toss SSE의 `icons` refresh hint는 icon cache clear 후 portfolio metadata refresh로 이어진다.
   - 1600x1000 browser QA에서 product image 로드와 broken image 0건을 확인했다.

4. **Agent 기능의 정의 재정렬**
   - Agent는 현재 live trading bot이 아니라 **decision-support + simulated preview + live lock** 상태다.
   - 감지/후보/미리보기/승인 challenge/audit은 일부 구현되어 있다.
   - 모의 매수/매도 기준, live-lock risk policy, paper ledger preview, locked dry-run execution readiness contract는 생겼지만, 실제 Toss order adapter와 reconciliation executor는 아직 없다.

## 1. 분석 기준

### 1.1 확인한 현재 상태

이번 분석은 다음 근거를 기준으로 한다.

- Dirty tree: `git status --short`
- 변경 규모: `git diff --stat`
- 기존 closeout 문서:
  - `docs/research/araon-pre-release-product-100-completion-audit.md`
  - `docs/research/araon-watchlist-realtime-account-agent-alignment-completion-audit.md`
  - `docs/research/araon-agent-function-upgrade-completion-audit.md`
  - `docs/research/araon-remaining-ux-risk-layout-scale-lock-completion-audit.md`
  - `docs/research/araon-release-readiness-live-watchlist-agent-roadmap.md`
- 현재 API snapshot:
  - `/runtime/data-health`
  - `/watchlist`
  - `/market/top-movers`
  - `/runtime/realtime/kis-ws-slots`
  - `/agent/event-monitor/status`
  - `/agent/order-intents/live-policy`
- 주요 코드:
  - `src/server/agent/order-intent-service.ts`
  - `src/server/agent/agent-event-monitor.ts`
  - `src/server/agent/market-movement-agent-event.ts`
  - `src/client/lib/agent-candidate-view-model.ts`
  - `src/server/agent/agent-event-store.ts`
  - `src/client/components/TossAccountRail.tsx`
  - `src/server/toss/toss-portfolio-client.ts`
  - `src/server/toss/toss-sse-refresh-executor.ts`
  - `src/server/watchlist/araon-watchlist-service.ts`
  - `src/server/toss/toss-fast-quote-lane.ts`

### 1.2 안전 경계

이번 분석과 다음 goal 문서는 아래를 전제로 한다.

- 실제 주문, 주문 취소, 주문 정정, 계좌 변경 mutation 금지.
- live auto-buy / live auto-sell 금지.
- broad destructive Toss watchlist cleanup 금지.
- Toss/KIS/session/account/order/watchlist raw 값 출력 금지.
- 합성 금융 데이터, fake candle, fake sparkline 금지.
- full-market 0.1초 polling 금지.
- 기존 dirty worktree 및 사용자 변경 보존.

## 2. 현재 런타임 요약

### 2.1 Toss-first market data

현재 `/runtime/data-health` 기준:

- Toss fast quote lane은 running 상태다.
- interval은 100ms다.
- target cap은 200, hard cap은 400으로 올라가 있다.
- 현재 후보 약 50개 수준을 요청하고, 전부 반환받고 있다.
- unchanged quote는 dedupe되고 있다.
- 연속 실패나 lastError는 없다.

TOP100:

- source는 Toss overview ranking이다.
- source phase는 regular다.
- 상승/하락 각각 100 rows를 받는다.
- cache TTL과 refresh interval은 500ms다.
- local fallback으로 TOP100을 채우지 않는다.
- coverage는 guaranteedTop100=true다.

판단:

- "Toss를 보수적으로 잡지 말자"는 방향은 런타임에 반영되어 있다.
- 단, UI에서 이 상태가 지나치게 내부 지표처럼 보이면 product bar에서는 줄이고 diagnostics로 보내야 한다.

### 2.2 Watchlist / holdings

현재 `/watchlist` 기준:

- primary source는 Toss다.
- Toss watchlist, Toss holdings, local fallback이 병합되어 사용자-facing watch surface를 만든다.
- sample KR 종목들은 `productCode`, `krTicker`, `tossEligible`, `kisEligible`, `quoteEligible`, `holding`, `last`, `changePct`를 가진다.

판단:

- 가격/등락률 hydrate는 상당히 안정화되었다.
- 다만 UI sparkline은 `/watchlist` 자체가 직접 내려주는 값이 아니라 client/history hook과 price-history/candle seed에 의존한다.
- 그래서 "가격과 등락률은 있는데 sparkline이 없는 row"는 watchlist membership 문제가 아니라 **history key / seed / persisted price history 문제**일 가능성이 높다.

### 2.3 KIS

현재 KIS 상태:

- KIS REST quote/polling/chart fallback은 기본 suppressed다.
- KIS는 optional `kis-ws-only` realtime rail로 남아 있다.
- KIS WS slot cap은 40이다.
- active slot은 현재 약 20개 후반이다.
- slot source는 holding, user pin, manual watchlist, top100 rotation이 섞여 있다.

판단:

- 설계 방향은 "KIS = 필수 데이터 소스"가 아니라 "Toss fast quote보다 낮은 지연을 줄 수 있는 optional WS 보조 rail"이다.
- TOP100은 Toss만으로 충분해야 한다.
- 즐겨찾기/보유종목이 0.1초 Toss fast quote로 이미 커버된다면, KIS는 selected high-priority KR ticker의 초저지연 보정에만 쓰는 편이 맞다.

### 2.4 Agent

현재 `/agent/order-intents/live-policy` 기준:

- liveExecutionEnabled=false
- policyApproved=false
- killSwitch=engaged
- missing constraints:
  - policy approval
  - allowed tickers
  - max order amount
  - max daily loss
  - trading hours
  - allowed order types
  - cooldown
  - kill switch release

readiness gaps:

- decision engine: not ready
- strategy policy: not ready
- risk policy: not ready
- paper trading ledger: preview-only persistent ledger/API ready; performance/result loop not ready
- simulation result view: not ready
- Toss order execution: locked, dry-run contract ready
- live approval executor: locked executor contract ready; blocks after confirmed approval and before Toss order adapter.
- execution reconciliation: partial, read-only state model planned
- agent performance audit: not ready
- intent explanation: partial
- provider freshness: not ready
- event dedupe: not ready

현재 `/agent/event-monitor/status` 기준:

- monitor enabled=false
- running=false
- provider interval 기본 30초
- max tickers per cycle 기본 5
- news/disclosure provider는 준비되어 있으나, Toss signal은 request body template이 없어 disabled 상태다.
- auto polling은 opt-in 전제다.

판단:

- Agent는 "감지된 이벤트를 후보로 정리하고, 모의 주문 preview를 만들며, 실거래는 잠그는" 수준까지 와 있다.
- 사용자가 기대하는 "알아서 매수/매도 판단"은 아직 구현되어 있지 않다.
- 다음 Agent goal은 coding 전에 strategy/risk/paper/live boundary를 먼저 문서화해야 한다.

## 3. 기능별 완성도

퍼센트는 "사용자에게 제품 기능으로 내보내도 되는 정도"를 기준으로 한 분석 추정치다. 릴리즈 인증 수치가 아니라, 다음 작업 우선순위를 정하기 위한 기준이다.

| 영역 | 완성도 | 근거 | 남은 핵심 작업 |
|---|---:|---|---|
| Toss TOP100 상승/하락 | 94% | 2026-05-19 장중 evidence에서 Toss ranking, 100/100 rows, rank reorder 관찰 | 더 긴 장중 browser QA와 diagnostics/product UI 분리 |
| Toss fast quote lane | 96% | 현재 런타임 100ms interval, target 200/hard 400, bounded 후보 처리, evidence harness 기준도 현재 제품 계약에 맞게 수정됨, 짧은 read-only recheck 통과 | 장시간 UI 렉 관찰 |
| Watchlist/holdings merge | 93% | Toss watchlist + holdings + local fallback merge, `/watchlist` 사용자-facing surface 안정화, held-only rows render as locked filled-star rows, and store-level remove now keeps held rows visible while only dropping watchlist membership | live browser star/unstar UX and bounded live-mutation smoke remain |
| Favorites row price/percent | 94% | 현재 browser/API에서 favorite/holding row price/changePct hydrate 확인, watchlist-only row도 quote percent가 비어 있으면 real history 기반 session direction을 계산 | stale/market pause copy와 longer browser evidence |
| Sparkline/history identity | 94% | product identity refactor, Toss candle seed, current KR favorite-row coverage probe, and browser DOM sparkline proof | future unsupported/Toss-only route/cache audit and long-session regression evidence |
| Mini/full chart | 93% | 장중 evidence에서 current candle bucket/count progression 관찰, TOP100/recent surge click chart 변경, full chart no-scroll expansion 확인, same-minute live quote가 close/high/low/volume/sampleCount를 갱신하는 focused proof 추가 | market-hours browser proof와 interval/range polish |
| Product identity model | 86% | `productCode`, `krTicker`, quote/chart key 분리 진행 | 모든 route/store/cache/event persistence까지 audit |
| KIS containment | 94% | KIS REST는 optional fallback으로 억제되고 WS는 optional 실시간 추적 rail, TOP100 rotation은 watchlist/agent/current/news 뒤 last-resort 테스트로 고정, footer KIS/REST/ranking copy는 실시간 추적 제품 언어로 정리 | runtime diagnostics 최종 정리와 장중 slot browser QA |
| Toss account rail | 92% | account summary, sort, current/evaluation toggle, row click chart, shared product avatar 적용, expired session no-probe browser proof | Safari/Chrome density final QA, icon fallback edge QA |
| Product icons | 100% | Toss `logoImageUrl`/`imageUrl` sanitize, shared in-memory icon cache, portfolio/watchlist cache sharing, account/watchlist payload `iconUrl`, shared `ProductAvatar`, KR static fallback, icon-refresh cache invalidation, 1600x1000 browser image QA 완료 | 유지보수: 새 surface가 생기면 `ProductAvatar` 재사용 |
| News/disclosure surface | 65% | DB에 news/disclosure data, selected ticker panel 존재 | 자동 refresh cadence, 뉴스/공시 분리, agent input freshness 연결 |
| Toss signal | 25% | provider flag는 있으나 request body template missing | Toss signal endpoint contract research, normalized event model |
| Agent event queue | 65% | in-memory event queue, dedupe, view model, UI summary 있음 | persistent store에 displayName/product identity/freshness 확장 |
| Agent candidate scoring | 72% | deterministic score/view model, buy/sell/observe/ignore 분류, 모의 strategy evaluation, browser 2-column 후보 UI 확인 | 실제 strategy policy와 market-state gating 필요 |
| Agent order preview/safety | 97% | simulated buy/sell preview, approval challenge, audit, live lock, risk policy shell, explicit live-precondition risk checks, preview-only persistent paper ledger/API/store, preview-only performance-review API/UI surface, safety modal/rail UI, Agent summary paper-ledger/performance surface, server/client candidate score/strategy/risk/evaluation/readiness/explanation labels, locked execution readiness copy, approval challenge order summary/hash/kill-switch evidence 있음 | richer strategy-policy outcome loop |
| Agent live trading readiness | 89% | live execution intentionally locked, missing constraints/readiness gaps/API/UI/audit shell, locked strategy/risk/paper preview lane, preview-only paper ledger, preview-only performance review, Toss dry-run contract, fresh approval gate, order summary + intent hash + kill-switch state on approval challenge, confirm 후 locked execution proof 생성, network-before-blocked locked executor, live approval executor locked contract, read-only reconciliation executor contract와 snapshot API, explicit live-precondition risk checks, data freshness gate 명시 | live Toss order adapter, real fill reconciliation loop |
| CLI/local operation | 85% | CLI/package lane 완료 기록 있음 | 현재 dirty tree 기준 재검증 및 README/INSTALL release pass |
| UI layout scale lock | 89% | Chrome/Safari/light/dark guardrail 문서와 QA 있음, footer fast-price/KIS risk copy가 큰 pill/internal wording로 커지는 회귀를 focused test로 방지 | 새 변경 때 크기 회귀 방지 테스트/visual baseline 강화 |
| Commit readiness | 91% | 사용자 승인 후 A/F/G/B/C/E/D/cross-slice 순서로 9개 reviewable commit stack을 생성했고, 전체 테스트/build/package/soak 검증까지 통과 | 루트 visual evidence screenshot 12개 보존/삭제/archive 결정, push/PR/release lane은 별도 |
| GitHub/npm release readiness | 45% | pre-release 기능은 진행, 배포는 별도 lane | release notes, README, npm pack, public hygiene, final QA |

## 3.1 100% closure plan by area

아래 항목은 다음 goal들이 "어디까지 가면 100%"인지 헷갈리지 않게 고정하는 기준이다.

### Toss TOP100: 94% -> 100%

현재:

- Toss overview ranking 기반.
- 상승/하락 각각 100 rows.
- 0.5초 refresh/TTL.
- local fallback 없이 guaranteedTop100=true.

100% 조건:

- 장중 10분 이상 관찰에서 상승/하락 rank reorder가 최신 percent snapshot 기준으로 안정적으로 반영된다.
- 상승 TOP100과 하락 TOP100의 direction semantics가 UI, recent surge, agent event에서 섞이지 않는다.
- TOP100 row 클릭 시 selected ticker/chart가 즉시 바뀐다.
- stale/pause/opening 상태를 오류처럼 보이지 않게 표시한다.

필요 작업:

- market-hours evidence script/browser QA로 rank reorder cadence 기록.
- TOP100 row click -> selected ticker/chart flow 테스트 보강.
- 하락 TOP100이 `급상승` candidate로 들어가지 않는 회귀 테스트 유지.
- TOP100 diagnostics는 product UI와 dev diagnostics로 분리.

검증:

- 장중 Browser/Computer Use 영상/스크린샷 또는 evidence JSON.
- `top100-view.test.ts`
- `market-movement-agent-event.test.ts`
- focused row click test.

### Toss fast quote lane: 96% -> 100%

현재:

- Toss fast quote lane running.
- interval 100ms.
- target cap 200, hard cap 400.
- single in-flight, stale guard, unchanged dedupe, backoff 방향 반영.
- evidence harness는 100ms / target 200 / hard 400 bounded lane을 정상으로 인정하고, target 250 / hard 500 / requested 401 같은 unbounded lane은 계속 blocked 처리한다.
- `docs/archive/complete-analysis-fast-quote-harness-recheck-20260519.*`에서 짧은 read-only recheck가 `fastQuoteLane.ok=true`, blockers 0으로 통과했다.

100% 조건:

- 즐겨찾기/보유종목/선택종목/agent hot 후보가 0.1초 target으로 갱신된다.
- UI 렉 없이 render coalescing이 동작한다.
- 429/5xx/지연 응답에서 자동 backoff 후 회복한다.
- full-market 0.1초 polling은 발생하지 않는다.

필요 작업:

- 10분 장중 soak로 request cadence, accepted/dropped/latency, UI responsiveness 기록.
- fast quote candidate priority audit:
  1. holdings/watchlist/favorites
  2. selected ticker/full chart
  3. agent candidates
  4. spare TOP100 companion
- status bar는 내부 cap/count를 과하게 노출하지 않게 정리.

검증:

- `toss-fast-quote-lane.test.ts`
- `pre-release-market-evidence.test.ts`
- no-live soak.
- browser FPS/interaction sanity.
- tracked-file secret scan.

### Watchlist/holdings merge: 93% -> 100%

현재:

- Toss watchlist + Toss holdings + local fallback merge.
- Toss가 primary truth.
- holdings가 사용자-facing surface에 자동 포함.
- held-only rows keep their data provenance (`watchlistMember=false`) but render as
  locked filled-star rows, so owned products no longer look removable or
  missing from favorites.
- legacy store-level remove also preserves held rows on the watch surface while
  dropping only watchlist membership, so accidental helper use cannot hide a
  holding.

100% 조건:

- Toss watchlist > Toss holdings > Araon local fallback 우선순위가 모든 route/UI에서 일관된다.
- 보유 종목은 즐겨찾기에서 빈 별표로 보이지 않는다.
- 보유 때문에 자동 추가된 항목만 보유 사라질 때 자동 제거 가능하다.
- 사용자가 직접 watchlist에 넣은 항목은 자동 삭제하지 않는다.
- star/unstar가 Toss watchlist sync intent로 동작한다.

필요 작업:

- live browser star/unstar UX 회귀 확인.
- bounded Toss watchlist mutation은 fresh GO 범위 안에서만, idempotent/redacted 방식으로 검증.
- local fallback은 normal UI에서 primary처럼 보이지 않게 유지.

검증:

- `araon-watchlist-service.test.ts`
- `watchlist-store.test.ts`
- `favorites-block.test.ts`
- `/watchlist` snapshot.
- Browser에서 star/unstar UX 확인.

### Favorites 가격/등락률: 94% -> 100%

현재:

- KR eligible 대부분 price/changePct hydrate.
- quote percent가 비어 있어도 real history가 있으면 첫/마지막 실제 가격으로
  session direction을 계산한다.
- 일부 row는 장 준비/중단 상태 copy와 longer browser evidence가 남아 있다.

100% 조건:

- 모든 quoteEligible favorite/holding row는 가격, 방향, 등락률을 보여준다.
- fake percent 없이 real history 기반 fallback direction만 사용한다.
- 장 준비/중단 상태는 "오류"가 아니라 stale/market pause로 표시한다.
- unsupported/Toss-only는 "지원 대기"처럼 정직하게 보이되, KR eligible 정상 종목에는 남지 않는다.

필요 작업:

- watchlist row view model에서 `last`, `changePct`, stale status 우선순위 정리.
- 가격만 있고 changePct 없는 경우의 원인 분리:
  - provider missing
  - product identity mismatch
  - stale quote
  - unsupported product
- UI copy를 `가격 확인 중` 남발 대신 상태별로 좁힌다.

검증:

- `favorites-block.test.ts`
- `/watchlist` sample audit.
- Browser favorite rows visual QA.

### Sparkline/history identity: 94% -> 100%

현재:

- productCode/krTicker/quoteKey/chartKey 분리 진행.
- 현재 KR user-facing 즐겨찾기/보유 row는 read-only coverage probe 기준 모두 renderable history를 가진다.
- 1600x1000 browser DOM에서 favorites block 9 rows와 9 stock-row sparkline 렌더링을 확인했다.

100% 조건:

- Sparkline key가 product identity와 일관된다.
- KR 종목은 persisted price-history -> Toss 1m candle seed -> live quote overlay 순으로 real data만 사용한다.
- Toss-only/US product는 KR-only route로 가지 않는다.
- synthetic flat line/fake movement 없음.

필요 작업:

- future unsupported/Toss-only row가 생겨도 KR-only route로 흐르지 않는지 regression evidence를 유지한다.
- current coverage probe를 release checklist에 포함한다.
- long-session에서 history eviction/cache alias 회귀가 없는지 확인한다.

검증:

- `product-identity.test.ts`
- `price-history.test.ts`
- `npx tsx scripts/internal/probes/probe-favorite-sparkline-coverage.mts --require-complete`
- 2026-05-19 current runtime: checked=9, renderable=9, flat=0, missing=0, failed=0, rawWatchlistValuesExposed=false.
- Browser 1600x1000 DOM QA: favorites block rowCount=9 and stock-row sparkline count=9.
- unsupported Toss-only route negative test.

### Chart: 93% -> 100%

현재:

- Toss historical candle primary + local cache + live quote overlay 구조.
- current candle 진행 일부 동작.
- data-level current candle progression proof added: same-minute `toss-fast-quote` observations now overlay an existing stored minute candle and advance high/low/close/sampleCount without synthetic data.
- DOM-level browser QA path added: the chart host now exposes displayed latest candle count/time/close/sampleCount/source/partial state as non-visual `data-*` attributes, so a browser pass can prove live progression without scraping canvas pixels only.
- 2026-05-19 focused component proof: sequential same-minute real live quotes now advance close, high/low, volume, sampleCount, source, and partial state; rendered chart host exposes the resulting `data-latest-candle-close` and `data-latest-candle-sample-count`.
- 1600x1000 browser pass proved no-reload candle bucket/count progression: selected ticker chart advanced from one minute bucket to the next, and a TOP100 click changed the selected chart to `진원생명과학` with an initial `toss-fast-quote` source.

100% 조건:

- mini/full chart current candle이 새로고침 없이 real quote sample로 진행된다.
- 봉/범위 변경 시 Toss chart/candle primary fetch.
- 장외/야간 non-trading gap을 synthetic candle 없이 숨긴다.
- chart selected ticker 변경이 TOP100/recent surge/watchlist/account rail 모두에서 일관된다.

필요 작업:

- chartKey/productCode/krTicker contract final audit.
- market-hours browser proof for intra-minute close/sampleCount progression.
- full chart interval/range UI final QA.
- no-scroll/auto-resize visual regression 확인.

검증:

- `stock-candle-chart.test.ts`
- Browser read of `data-testid="stock-candle-chart-host"` latest-candle QA attributes during live quote movement.
- `candles.test.ts` (`overlays live quote observations onto an existing current minute candle`)
- `stock-timeline.test.ts`
- 장중 Browser current candle progression evidence.

### KIS containment: 91% -> 100%

현재:

- KIS REST quote/polling/chart fallback suppressed by default.
- KIS는 optional WS rail.
- active slots는 holdings/user_pin/manual_watchlist/top100_rotation 혼합.

100% 조건:

- KIS는 account/order/watchlist/TOP100/chart truth source가 아니다.
- KIS WS slot priority:
  1. holdings/watchlist/favorites
  2. agent candidates
  3. selected ticker/full chart
  4. news/disclosure/signal companion
  5. TOP100 last-resort
- TOP100이 KIS slot을 필요 이상 차지하지 않는다.
- no credentials startup에서 KIS 외부 호출 없음.

필요 작업:

- slot allocator priority final audit.
- status bar/product UI에서 KIS 내부 용어 제거.
- diagnostics route에만 KIS detail 유지.

검증:

- `kis-ws-slot-candidates.test.ts`
- `kis-ws-slot-allocator.test.ts`
- `/runtime/realtime/kis-ws-slots` redacted snapshot.
- no-credentials startup smoke.

### Toss account rail: 82% -> 100%

현재:

- summary, positions, sort, 현재가/평가금 toggle, row click chart 변경 구현.
- 아이콘은 한글 첫 글자 fallback.

100% 조건:

- 실제 가능한 종목 아이콘 표시.
- row hover affordance 명확.
- row click selected ticker/chart 변경.
- sort/toggle이 Toss 느낌에 가깝되 Araon design density 유지.
- open/collapse 시 icon sidebar width jitter 0px.
- Safari/Chrome/light/dark 크기 동일.

필요 작업:

- ProductAvatar 공통 컴포넌트.
- icon source/cache 연동.
- account rail visual regression baseline.
- hover/focus state QA.

검증:

- `toss-account-rail.test.ts`
- Browser Safari/Chrome visual QA.
- account rail open/collapse measurement.
- 2026-05-19 1600x1000 fresh browser tab after Vite restart: clearly expired Toss session stayed login-gated and did not call `/toss/account/summary`.

### Product icons: 100%

현재:

- Toss `logoImageUrl` / `imageUrl`를 서버에서 sanitize한다.
- portfolio/watchlist client가 shared in-memory icon cache를 사용한다.
- watchlist payload가 icon field를 생략해도 portfolio/account metadata에서 seed된 cache를 재사용할 수 있다.
- Toss `icons` / `icon-refresh` hint는 icon cache clear 후 portfolio metadata refresh로 이어진다.
- session clear 시 portfolio/watchlist snapshot과 함께 icon cache도 비운다.
- client는 shared `ProductAvatar`로 safe Toss static icon URL과 fallback avatar를 모두 처리한다.

100% 조건:

- Toss account/watchlist/portfolio/selected ticker에서 가능한 종목 아이콘을 표시한다.
- icon source가 실패해도 깨진 이미지 없이 fallback.
- icon URL/cache에 Toss session/cookie/raw 값이 묻지 않는다.
- icon refresh hint가 icon cache invalidation 또는 refresh queue로 연결된다.

완료 증거:

- focused tests가 URL sanitize, normalized cache lookup, portfolio cache seeding, watchlist cache reuse, icon refresh invalidation을 검증한다.
- 1600x1000 browser QA에서 12개 image element가 로드됐고 broken image는 0건이었다.
- fallback row는 `ProductAvatar` 컴포넌트의 render/fallback tests로 보강한다.
- persistence는 아직 기본 요구가 아니다. 현 단계 기본 정책은 "세션/runtime scoped in-memory cache"이며, persistence가 필요해지면 sanitized Toss static URL과 normalized product key만 저장한다.
- `ProductIcon` model 설계.
- safe cache/store/API.
- `ProductAvatar` UI.

검증:

- icon source fixture tests.
- broken image negative test.
- Browser account rail/favorites visual QA.
- secret scan.

### Agent decision-support 전체: 97% -> 100%

현재:

- event queue, candidate view model, simulated preview, live lock shell 있음.
- server public event payload와 candidate view model은 `buy` / `sell` / `observe` / `ignore` 사용자-facing 분류를 제공한다.
- 하락 market movement는 `매도 검토`, 상승/강한 호재는 `매수 검토`, 약한 근거는 `관찰`, skip/excluded 후보는 `제외`로 분류된다.
- server public event payload와 candidate view model은 각 후보에 대해 policy version, deterministic score, strategy label, risk label, evaluation labels, readiness labels, explanation labels를 제공한다.
- Agent summary는 최신 후보에 단기 모멘텀/하락 방어/정보 관찰과 `모의만 · 실거래 잠금` 같은 user-facing 정책 문구를 표시한다.
- simulated preview는 상승/하락 방향에 따라 buy/sell side를 나누되, 실제 주문 실행은 하지 않는다.
- strategy/risk/paper ledger는 모의 미리보기 단계까지 제품 UI에 연결됐다. preview-only persistent ledger/API/store, preview-only performance-review API/UI surface, Agent summary의 paper-ledger/performance surface가 구현됐다.
- order intent preview에는 수량/금액/지정가 기반 `previewImpact`가 포함되어 예상 포지션 변화, 현금 영향, PnL 미계산 사유, 실거래 잠금 사유를 설명한다.
- Toss dry-run order adapter contract, fresh approval gate, read-only reconciliation state model은 `/agent/order-intents/live-policy`와 safety modal에 노출된다.
- approval challenge에는 주문 요약, 승인 지문, kill-switch 잠금 상태가 포함되어 UI와 API에서 실거래 잠금 계약을 확인할 수 있다.
- risk policy는 fresh approval policy, allowed universe, max order amount,
  max daily loss, trading-hours guard, order-type policy, cooldown, kill-switch
  release를 별도 precondition check로 노출하고, UI는 내부 code 대신
  `n개 차단 · n개 경고 · 모의만`으로 요약한다.
- Agent summary는 최신 후보의 점수와 평가 라벨을 표시해 왜 후보인지 더 명확히 설명한다.

100% 조건:

- Agent가 감지 -> 후보 -> 방향 분류 -> 근거 -> 모의 미리보기 -> risk check -> 승인 대기 -> live lock 흐름을 안정적으로 보여준다.
- 이벤트는 `buy_candidate`, `sell_risk`, `hold_observe`, `ignore_noise`로 분류된다.
- 후보 scoring은 deterministic이고 설명 가능하다.
- 뉴스/공시/가격/차트 freshness가 candidate reason에 들어간다.
- paper-ready preview, preview-only ledger count, booked 0건, locked execution readiness 확인까지 가능하다.
- live execution은 여전히 잠긴 상태로 명확히 표시된다.

필요 작업:

- decision classification, policy metadata, score/evaluation/readiness labels, and preview-only performance review are implemented in server public payload/API and client view model. 다음 단계는 persistent policy/audit schema 확장과 실제 시장 결과 기반 장기 outcome review.
- strategy policy v1:
  - momentum watchlist strategy.
  - sell-risk strategy for holdings.
- risk policy v1:
  - allowed universe.
  - max order amount.
  - max daily loss.
  - cooldown.
  - market-hours guard.
  - stale data guard.
- paper ledger 실제 체결/시장 결과 기반 성과/PNL 상세 UI와 장기 성과 리뷰.
- richer candidate explanation model across detail view and performance review.
- agent event persistent store에 product identity/displayName/freshness 보존.

검증:

- agent candidate classification tests.
- order intent preview tests.
- preview impact/PnL explanation tests.
- risk policy tests.
- persistent paper ledger tests 및 Agent summary paper-ledger rendering test.
- Browser Agent Detail QA.

### Agent live trading readiness: 89% -> 100%

현재:

- live execution intentionally locked.
- approval challenge shell 있음.
- live policy API가 missing constraints와 automation readiness gaps를 안전하게 노출한다.
- confirmation challenge를 통과해도 `execution=null`, `liveExecutionLocked=true`가 유지된다.
- preview-only paper ledger와 performance review가 API/store/UI summary에 연결되어, 실제 체결 0건과 모의 변화량/시장 결과 대기 상태를 구분한다.
- approval challenge가 `intentHash`, `orderSummary`, `killSwitch='engaged'`를 저장/노출한다.
- 승인 확인 후에도 실제 실행은 `execution=null`이며, 별도 `lockedExecutionProof`가 `dry_run_locked`, `liveMutationEnabled=false`, `killSwitch='engaged'`를 증명한다.
- locked executor contract가 네트워크 주문 요청 전 차단을 명시하고, UI는 이를 `네트워크 주문 전 차단 · proof만 생성`으로 표시한다.
- live approval executor contract가 승인 확인 후에도 Toss order adapter 연결 전에 차단됨을 명시한다. UI는 이를 `승인 후에도 주문 연결 전 차단`으로 표시한다.
- read-only reconciliation executor contract가 필요한 입력과 match key를 정의한다. 아직 실제 체결/미체결/취소 대조 loop는 아니다.
- `/agent/order-intents/reconciliation` read-only snapshot API가 confirmed approval challenge를 `not_submitted_live_locked` proof로 노출한다. `liveSubmittedCount=0`, `blockedCount=n`, `execution=null`을 유지한다.
- live precondition risk checks는 fresh approval policy, allowed universe,
  order amount, daily loss, trading hours, order type, cooldown, kill switch를
  분리해 설명한다.
- data freshness gate가 quote, chart, news/disclosure, watchlist membership
  freshness를 요구하고, future live lane을 실행 전 차단하는 locked contract로
  API/UI에 표시된다.
- 실제 Toss order adapter 없음.

100% 조건:

- live trading을 바로 켠다는 뜻이 아니다.
- 100%는 "실거래 lane을 켤 준비가 코드/정책/감사/승인 절차상 완성"이라는 뜻이다.
- live order adapter는 별도 fresh GO 전까지 실제 실행하지 않는다.

필요 작업:

1. Strategy policy 완성.
2. Risk policy 완성.
3. Paper trading ledger와 result evaluation.
4. Approval flow:
   - intent hash. 구현됨.
   - order summary. 구현됨.
   - explicit user confirmation. 구현됨.
   - kill switch state. 구현됨.
   - live approval executor locked contract. 구현됨.
5. Toss order adapter live implementation.
6. Live adapter gated implementation.
7. Execution reconciliation:
   - submitted.
   - accepted/rejected.
   - partial fill.
   - filled.
   - canceled.
8. Real fill reconciliation loop.
9. Audit trail:
   - input event.
   - decision.
   - policy result.
   - user approval.
   - execution result.

검증:

- no-live tests first.
- paper trading simulation.
- locked executor/read-only reconciliation snapshot tests.
- live mutation only with separate fresh GO.

### Commit readiness: 91% -> 100%

현재:

- 사용자 승인 후 reviewable commit stack이 생성됐다.
- Commit order:
  1. A docs/evidence
  2. F CLI/package/audit scripts
  3. G KIS containment
  4. B Toss backend/product identity/watchlist
  5. B supplemental watchlist provenance repository
  6. C realtime/chart/surge
  7. E agent safety/decision-support
  8. D frontend product UI
  9. cross-slice product readiness probes
- `scripts/internal/probes/probe-commit-slice-coverage.mts`는 현재 남은
  dirty/untracked entry가 root visual artifact 12개뿐임을 확인한다.
- `npm test`, `npm run typecheck`, `npm run build`, `npm pack --dry-run --json`,
  `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`,
  `git diff --check`, secret-like scan이 통과했다.

100% 조건:

- 모든 dirty/untracked 파일이 Slice A/F/G/B/C/E/D/cross-slice 중 하나로 분류된다.
- screenshots/evidence files는 keep/archive/remove 후보가 분리된다.
- 각 slice마다:
  - purpose.
  - file list.
  - review risk.
  - verification commands.
  - commit message draft.
- 사용자 승인 후 생성된 commit stack이 review 가능한 상태다.

필요 작업:

- 루트 screenshot/visual artifact 12개를 보존, archive, 또는 삭제할지 결정.
- PR/release 전 필요하면 commit stack을 squash/reorder/reword한다.
- GitHub/npm release lane에서 README/release note/public packaging을 최종 검수한다.

검증:

- `git diff --check`
- per-slice focused tests.
- final `npm test`
- `npm run typecheck`
- `npm run build`
- secret scan.

## 4. 커밋 단위 분리안

현재 더티 트리는 하나의 커밋으로 묶으면 안 된다. 기존 roadmap의 Slice A-G를 유지하되, 이번 분석에서는 다음 순서가 가장 안전하다.

### Slice A: Product/design/research docs

목적:

- 지금까지 만든 goal/audit/research 문서 정리.
- 어떤 문서가 authoritative인지 정리.
- 오래된 중간 progress 문서와 최종 audit 문서를 구분.

포함 후보:

- `docs/research/araon-*-goal.md`
- `docs/research/araon-*-completion-audit.md`
- `docs/archive/pre-release-market-evidence-*`
- 이번 문서

주의:

- screenshot PNG는 전부 자동 포함하지 않는다.
- evidence screenshot으로 남길 것과 제거할 것을 분류한다.

### Slice F: CLI/PATH/package

목적:

- CLI/PATH/package 변경을 기능 변경과 분리.
- npm package에 들어갈 파일과 빠질 파일 확인.

포함 후보:

- `package.json`
- CLI 관련 docs/tests/scripts가 있으면 해당 파일.

검증:

- `node dist/cli/araon.js --help`
- `node dist/cli/araon.js --version`
- `npm pack --dry-run --json`

### Slice G: KIS containment / optional realtime tracking

목적:

- KIS REST를 default path에서 빼고 optional fallback/WS rail로 격리한 변경을 독립 커밋으로 묶는다.

포함 후보:

- `src/server/realtime/kis-ws-slot-*`
- `src/server/routes/kis-ws-slots.ts`
- 관련 tests
- runtime diagnostics 중 KIS containment 관련 부분

검증:

- KIS REST fallback suppressed.
- KIS WS slot priority가 보유/즐겨찾기/agent 우선, TOP100 last-resort.
- no credentials startup에서 외부 호출 없음.

### Slice B: Toss backend data surfaces

목적:

- Toss watchlist/account/search/quote/chart/product identity backend 변경을 묶는다.

포함 후보:

- `src/server/toss/*`
- `src/server/watchlist/*`
- `src/server/routes/watchlist.ts`
- `src/server/routes/toss-auth.ts`
- `src/shared/product-identity.ts`
- DB migrations for watchlist provenance/product identity.

검증:

- `/watchlist` normalized read model.
- Toss watchlist/holdings/local fallback merge.
- productCode와 krTicker 분리.
- Toss-only product가 KIS/six-digit route로 가지 않음.

### Slice C: Realtime / TOP100 / surge / chart progression

목적:

- fast quote, TOP100 cadence, recent surge, chart live overlay를 묶는다.

포함 후보:

- `src/server/toss/toss-fast-quote-lane.ts`
- `src/server/market/market-top-movers-service.ts`
- `src/client/lib/surge-aggregator.ts`
- `src/client/hooks/usePersistedPriceHistory.ts`
- `src/client/components/StockCandleChart.tsx`
- price-history/candles/timeline routes/tests.

검증:

- 0.1초 hot quote lane.
- TOP100 0.5초.
- threshold 3% 미만 알림 억제.
- current candle 새로고침 없이 진행.
- fake candle/synthetic sparkline 없음.

### Slice E: Agent event/order-intent safety foundation

목적:

- Agent decision-support + simulated preview + live lock을 독립 커밋으로 묶는다.

포함 후보:

- `src/server/agent/*`
- `src/server/routes/agent-*`
- `src/client/lib/agent-candidate-view-model.ts`
- `src/client/components/AgentEventsRail.tsx`
- `src/client/components/AgentDecisionSummary.tsx`
- `src/client/components/OrderIntentSafetyRail.tsx`
- 관련 tests.

검증:

- liveExecutionEnabled=false.
- live order request는 locked.
- simulated preview만 생성.
- raw payload/debug copy가 normal UI에 나오지 않음.
- readiness gaps가 명확히 표시됨.

### Slice D: Frontend product UI

목적:

- v7 home, layout scale lock, account rail, favorites/recent surge/sector/bottom bar 등 UI 변경을 묶는다.

포함 후보:

- `src/client/App.tsx`
- `src/client/components/FavoritesBlock.tsx`
- `src/client/components/TopMoversBoard.tsx`
- `src/client/components/SurgeBlock.tsx`
- `src/client/components/TossAccountRail.tsx`
- `src/client/components/StatusBar.tsx`
- `src/client/components/SettingsModal.tsx`
- `src/client/styles/global.css`
- UI tests.

검증:

- Chrome/Safari light/dark scale parity.
- 1600x1000, 1440x900, 900px responsive.
- account rail open/collapse icon rail width jitter 없음.
- sector row overlap 없음.

### Cross-slice integration

목적:

- 전체 검증, package hygiene, secret scan, screenshots 처리.

검증:

- `npm test`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- `npm run soak:no-live -- --duration-ms=1500 --interval-ms=500`
- `npm pack --dry-run --json`
- tracked-file secret scan
- Browser/Computer Use QA

## 5. 장중 동작 확인 계획

장중 확인은 한 번으로 끝내기보다 최소 3개 구간을 나눠야 한다.

### 5.1 장전 / opening 준비 구간

확인할 것:

- 08:50-08:59처럼 장이 멈추거나 준비 상태일 때 "추적 오류"로 오표시하지 않는지.
- quote stale 상태가 error가 아니라 pause/stale/market preparing으로 표시되는지.
- favorites가 가격 대기/지원 대기로 불필요하게 흔들리지 않는지.

완료 기준:

- 사용자가 봐도 "망가짐"이 아니라 "장 준비/일시 정지"로 이해된다.

### 5.2 장중 regular 구간

확인할 것:

- TOP100 상승/하락 rank reorder가 0.5초 수준으로 반영되는지.
- Favorites/holdings가 0.1초 hot quote lane으로 price/percent/sparkline 업데이트되는지.
- Recent surge row가 실제 threshold crossing에서 생성되는지.
- Recent surge row click이 selected ticker/chart를 바꾸는지.
- Duplicate movement toast가 하나로 dedupe되는지.
- Selected mini/full chart current candle이 새로고침 없이 진행되는지.

완료 기준:

- 사용자가 "폰 토스처럼 계속 움직인다"고 느낄 수준이어야 한다.
- 렉이 생기면 request cap을 낮추는 게 아니라 render coalescing / stale response guard / unchanged dedupe를 먼저 봐야 한다.

### 5.3 장후 / after-hours 구간

확인할 것:

- 실제 거래 없는 구간을 차트에서 긴 공백으로 보여주지 않는지.
- non-trading gap을 synthetic candle 없이 숨기는지.
- 마지막 real sample 기반으로 sparkline이 유지되는지.

완료 기준:

- 새 데이터를 만들지 않고, 없는 구간을 정직하게 숨긴다.

## 6. 종목 아이콘 분석

### 6.1 현재 상태

현재 Toss account rail, favorites/watchlist, selected ticker 계열 UI는 shared `ProductAvatar`를 사용한다.

`TossPortfolioPosition`과 Toss watchlist item payload는 safe `iconUrl`을 받을 수 있고, `toss-portfolio-client` / `toss-watchlist-client`는 Toss `logoImageUrl` 또는 `imageUrl`을 sanitize한 뒤 shared in-memory icon cache에 연결한다.

Toss SSE의 `icons` / `icon-refresh` refresh hint는 `toss-sse-refresh-executor`에서 icon cache를 먼저 clear한 뒤 portfolio metadata refresh로 이어진다.

현재 product icon lane은 제품 기준으로 닫혔다.

1. 실제 browser QA에서 product image 12개가 로드됐고 깨진 이미지는 0개였다.
2. 일부 product에 Toss static icon이 없거나 요청 실패하면 `ProductAvatar` fallback avatar가 나온다.
3. cache persistence는 의도적으로 넣지 않았다. raw Toss/session 값이 저장되는 일을 피하기 위해 runtime-scoped in-memory cache를 기본으로 둔다.

### 6.2 필요한 구현 방향

현재 기본 product icon lane은 구현되어 있다.

1. Toss 응답의 `logoImageUrl` / `imageUrl`만 safe source로 사용한다.
2. 서버 cache는 normalized product identity와 sanitized Toss static icon URL만 가진다.
3. `/watchlist`와 `/toss/account/portfolio`는 safe `iconUrl`만 내려준다.
4. 클라이언트는 `ProductAvatar` 컴포넌트로 통일한다.
5. icon fetch 실패 시 첫 글자 fallback을 유지한다.
6. raw Toss session/cookie가 icon URL/log에 묻어나지 않게 한다.
7. `icons` refresh hint는 cache clear + portfolio metadata refresh로 처리한다.

### 6.3 완료 기준

- Toss account rail에서 보유 종목 아이콘이 가능한 범위에서 표시된다.
- Favorites/Top100/selected ticker에서도 같은 avatar 컴포넌트를 쓴다.
- 1600x1000 browser QA에서 깨진 이미지 아이콘이 보이지 않는다.
- icon source를 못 찾은 종목은 일관된 fallback을 쓴다.

## 7. Agent 기능 분석

### 7.1 현재 완성된 것

현재 Agent는 다음을 할 수 있다.

- market movement / realtime momentum / news / disclosure 계열 이벤트를 queue에 넣을 수 있다.
- 이벤트를 UI용 view model로 바꾸며 display name, reason, freshness, confidence, stage를 보여줄 수 있다.
- 후보를 deterministic score로 정렬할 수 있다.
- 후보에서 simulated order intent preview를 만들 수 있다.
- live execution은 kill switch와 policy constraint로 잠근다.
- approval challenge/audit shell이 있다.
- normal UI에서 raw payload를 직접 보여주지 않도록 정리되어 있다.

### 7.2 아직 완성되지 않은 것

중요하게, Agent는 아직 "스스로 사고 파는 기준"을 갖고 있지 않다.

아직 100%가 아닌 것:

- 매수/매도/관망 decision engine은 deterministic preview 수준이다. live strategy engine은 아직 아니다.
- 전략 정책(strategy policy)은 preview용 shell 수준이다.
- 리스크 정책(risk policy)은 live lock 중심이다. 실거래 손실/노출 한도 집행은 아직 아니다.
- paper trading ledger는 preview-only 기록 수준이다. 성과 평가 loop는 아직 아니다.
- simulated result 평가 화면은 요약 수준이다. PnL/리스크 explainability는 아직 부족하다.
- Toss live order adapter는 없다.
- live approval executor는 locked contract까지 구현됐다. 실제 live executor는 없다.
- 주문 후 체결/미체결/취소 reconciliation은 read-only snapshot 계약 수준이다. 실제 체결 대조 loop는 아직 아니다.
- agent performance audit.
- provider freshness gate.
- durable event store의 full product identity 보존.

### 7.3 현재 Agent 완성도

| Agent 하위 기능 | 완성도 | 현재 상태 |
|---|---:|---|
| Event ingestion shell | 65% | queue/monitor/provider shell 있음, monitor 기본 off |
| News/disclosure ingestion | 55% | source는 있으나 자동 cadence/freshness/product mapping 강화 필요 |
| Toss signal ingestion | 25% | request body template missing |
| Event dedupe | 65% | in-memory dedupe 있음, durable dedupe/freshness 강화 필요 |
| Candidate UI | 75% | 사용자-facing summary와 후보 row 있음 |
| Candidate scoring | 45% | deterministic score는 있으나 trading strategy는 아님 |
| Order preview | 89% | simulated preview, strategy/risk/paper preview, explicit live-precondition risk checks, preview impact/PnL 설명, preview-only persistent paper ledger/API, locked execution readiness 계약과 network-before-blocked executor 표시 가능 |
| Approval/safety lock | 85% | live lock, challenge/audit shell, fresh approval gate, safety modal 계약, impact/PnL 설명, risk-check count summary 표시 있음 |
| Paper trading | 38% | preview-only ledger persistence/API와 모의 영향 설명 있음, result loop/PnL/performance 없음 |
| Live order execution | 20% | 의도적으로 locked, Toss dry-run 계약과 network-before-blocked executor는 정의됨, live adapter 없음 |
| Reconciliation | 35% | read-only snapshot API는 confirmed locked challenge를 `not_submitted_live_locked`로 증명함, 체결/미체결/취소 executor loop 없음 |
| Agent overall product readiness | 66% | decision-support, preview-only paper ledger, explicit risk-precondition summary, impact/PnL 설명, locked readiness lane, read-only reconciliation snapshot은 가능, autonomous trading은 아님 |

### 7.4 매수/매도 기준 설계 초안

다음 Agent goal은 "매수 기준을 바로 코딩"하기보다 아래 정책을 먼저 모델링해야 한다.

#### Candidate input

- 0-30초 real momentum.
- TOP100 gainer rotation.
- Watchlist/holding fast quote movement.
- Selected ticker movement.
- News/disclosure freshness.
- Toss signal if available.
- Account/portfolio exposure.

#### Direction classification

각 이벤트는 먼저 다음 중 하나로 분류되어야 한다.

- `buy_candidate`
- `sell_risk`
- `hold_observe`
- `ignore_noise`

예시:

- TOP100 상승 + 0-30초 급등 + 거래량 급증: `buy_candidate`.
- 보유 종목 급락 + 부정 뉴스/공시: `sell_risk`.
- TOP100 하락: 기본적으로 `buy_candidate`가 아니라 `sell_risk` 또는 `hold_observe`.
- 등락률 임계값 미만: `ignore_noise`.

#### Strategy policy

처음에는 하나의 단순 전략만 두는 것이 좋다.

`momentum_watchlist_strategy_v1`

- universe: Toss watchlist + holdings + user-selected KR eligible.
- window: 0-30초.
- required signal:
  - positive movement above threshold.
  - recent quote freshness.
  - not stale/market pause.
  - liquidity/volume sanity.
  - not already in cooldown.
- optional confirmation:
  - TOP100 gainer present.
  - related news/disclosure not negative.
  - chart current candle confirms direction.

#### Risk policy

최소 필요 항목:

- allowed tickers.
- max order amount.
- max position amount.
- max daily loss.
- max trades per day.
- per ticker cooldown.
- no-trade windows.
- market pause guard.
- price slippage/spread guard.
- kill switch.
- user approval requirement.

#### Execution ladder

1. observe only.
2. simulated preview.
3. paper trading ledger.
4. manual approval dry-run.
5. live order adapter smoke with explicit fresh GO.
6. bounded live order with explicit fresh GO.

현재 Araon은 1-2 사이에 있다. 3부터가 다음 큰 작업이다.

## 8. 다음 실행 goal 후보

### 8.1 Goal A: commit slicing + release-review prep

목표:

- 현재 dirty tree를 A/F/G/B/C/E/D/cross-slice 순서로 분리한다.
- 각 slice별 포함 파일, 검증, 위험, commit message를 문서화한다.
- 사용자가 승인하기 전에는 stage/commit하지 않는다.

완료 조건:

- 모든 dirty/untracked 파일이 slice에 들어가거나 remove/archive 후보로 분류된다.
- 바로 커밋 가능한 순서와 검증 명령이 준비된다.

### 8.2 Goal B: market-hours evidence pass

목표:

- 장중 TOP100, fast quote, recent surge, chart progression을 실제 브라우저로 관찰한다.
- recent surge row click, duplicate toast suppression, current candle progression을 evidence로 남긴다.

완료 조건:

- 장전/장중/장후 중 최소 장중 regular 구간 evidence 확보.
- 실패 항목은 blocker로 명확히 기록.

### 8.3 Goal C: product icons

목표:

- Toss product/account/watchlist icon source를 조사한다.
- safe icon cache/API/UI 컴포넌트를 만든다.
- Toss account rail, favorites, selected ticker avatar가 같은 icon system을 쓴다.

완료 조건:

- 아이콘이 가능한 종목은 실제 아이콘으로 보인다.
- 불가능한 종목은 일관된 fallback으로 보인다.
- raw Toss session/cookie 노출 없음.

### 8.4 Goal D: agent decision engine preparation

목표:

- Agent를 decision-support에서 paper-ready decision engine으로 끌어올릴 설계와 첫 구현을 한다.
- buy/sell/observe/ignore classification을 만들고, simulated preview와 연결한다.
- live execution은 계속 locked로 둔다.

완료 조건:

- 매수/매도 후보가 같은 "급상승" 라벨로 섞이지 않는다.
- strategy policy와 risk policy가 코드/문서/test에 존재한다.
- paper ledger 전 단계까지 준비된다.

## 9. 다음 goal용 프롬프트 초안

아래 프롬프트는 다음 실행용이다. 한 번에 너무 크면 A부터 D까지 나눠서 진행하는 것이 안전하다.

```text
[$goal] Araon complete-analysis follow-up을 진행한다: commit slicing, market-hours evidence, product icons, and agent decision foundation.

기준 repo는 /Users/stello/korean-stock-follower 이다.
반드시 /Users/stello/korean-stock-follower/docs/research/araon-complete-analysis-commit-market-agent-readiness.md 를 먼저 읽고, 이 문서를 authoritative execution brief로 따른다.

핵심 목표:
1. 현재 dirty tree를 Slice A/F/G/B/C/E/D/cross-slice 순서로 커밋 가능한 단위로 분류한다.
2. 사용자가 승인하기 전에는 stage/commit하지 않는다.
3. 장중 TOP100 0.5초, fast quote 0.1초, recent surge row 생성/클릭/chart 변경, duplicate toast suppression, current candle progression을 실제 브라우저로 확인한다.
4. Toss account/watchlist/portfolio 종목 아이콘 source를 조사하고, safe product icon cache/API/UI 설계를 준비한다.
5. Agent는 live trading bot이 아니라 decision-support + simulated preview + live lock 상태로 유지하되, buy/sell/observe/ignore decision foundation을 설계한다.
6. Agent의 남은 strategy policy, risk policy, paper ledger, Toss order adapter, reconciliation, live approval lane을 코드/문서 근거로 분류하고 퍼센트 업데이트한다.

안전 경계:
- 실제 주문, 주문 취소, 주문 정정, 계좌 변경 mutation 금지.
- live auto-buy/live auto-sell 금지.
- broad destructive Toss watchlist cleanup 금지.
- Toss/KIS/session/account/order/watchlist raw 값 노출 금지.
- 합성 금융 데이터, fake candle, fake sparkline 금지.
- 기존 dirty worktree와 사용자 변경 보존.

검증:
- focused tests where applicable
- npm run typecheck
- npm run build
- git diff --check
- tracked-file secret grep
- Browser/Computer Use visual QA

완료 조건:
1. 커밋 슬라이스 문서가 완성된다.
2. 장중 동작 evidence 또는 명확한 blocker가 문서화된다.
3. 종목 아이콘 구현/조사 계획이 코드 근거와 함께 확정된다.
4. Agent 기능별 완성도와 다음 구현 순서가 문서화된다.
5. 다음 사용자가 바로 "이 순서로 구현/커밋하자"라고 판단할 수 있다.
```

## 10. 추천 순서

가장 안전한 다음 순서는 다음이다.

1. **커밋 슬라이스 문서화**
   - 지금 변경량이 너무 커서 먼저 나누지 않으면 이후 분석이 계속 흐려진다.

2. **장중 evidence pass**
   - 현재 market-hours라면 바로 수행할 가치가 있다.
   - 단, evidence 수집은 코드를 더 고치기 전에 해야 현재 상태의 회귀를 분리할 수 있다.

3. **종목 아이콘 lane**
   - 제품 체감이 크고, account rail polish의 남은 큰 구멍이다.
   - 데이터 파이프라인이 없으므로 별도 slice가 맞다.

4. **Agent decision foundation**
   - live trading은 아직 멀다.
   - 먼저 buy/sell/observe/ignore와 strategy/risk/paper ledger를 만들어야 한다.

5. **릴리즈 문서/GitHub/npm**
   - 마지막으로 둔다.
   - 지금은 product/agent/evidence/commit 정리가 먼저다.

## 11. 2026-05-19 continuation update

현재 active goal 진행 중 추가 확인한 최신 근거는 다음 문서에 고정했다.

- `docs/research/araon-complete-analysis-followup-execution-audit.md`

이 update는 위 `3.1 100% closure plan by area`의 최신 퍼센트와 blocker를 보강한다.

핵심 변경:

- Toss TOP100, fast quote, watchlist, favorites, sparkline/history, chart, KIS containment, Toss account rail, product icons, Agent decision-support, Agent live readiness, commit readiness의 현재 퍼센트를 최신 runtime/browser/code evidence 기준으로 업데이트했다.
- 2026-05-19 장중 evidence file은 `docs/archive/complete-analysis-market-evidence-20260519.*`에 남겼다.
- Browser pass에서 1600x1000, 1440x900, 900px layout scale과 recent-surge row click -> selected ticker/chart 변경을 확인했다.
- 추가 Browser pass에서 full chart expansion이 scroll 없이 viewport 안에 렌더링되고, 1600x1000 기준 body overflow가 hidden으로 유지되는 것을 확인했다.
- 추가 Browser pass에서 home workspace의 bottom status bar가 `빠른 가격 정상`을 유지하고, `마지막 업데이트`가 13:45:01부터 13:45:08까지 매초 전진하는 것을 확인했다.
- 18초 live browser observation에서 duplicate toast는 관찰되지 않았고, status timestamp는 계속 전진했다. 추가 focused test에서 같은 의미의 realtime momentum agent event 2개가 서로 다른 event id를 가져도 하나의 `0-30s` semantic cooldown key로 visible toast를 교체함을 확인했다. 차트 host에는 최신 candle QA 속성이 추가됐고, 1600x1000 browser pass에서 selected chart의 minute bucket/count가 새로고침 없이 전진했다. 다만 intra-minute close/sampleCount change proof는 아직 별도 증거가 필요하다.
- Product icon은 safe URL sanitize, shared in-memory icon cache, portfolio/watchlist cache sharing, account/watchlist payload propagation, shared `ProductAvatar`, KR static fallback, icon refresh invalidation, focused tests, 1600x1000 browser image evidence까지 구현됐다. Persistence는 raw Toss/session 값 저장 위험을 피하기 위해 의도적으로 제외했다.
- Agent는 simulated preview + live lock 상태를 유지한다. 추가로 candidate view model에 `buy` / `sell` / `observe` / `ignore` decision-support 분류가 생겼고, downward market movement는 simulated sell preview로 매핑된다. 주문 intent preview에는 deterministic strategy evaluation, live-lock risk policy, paper ledger preview delta가 붙고, `OrderIntentSafetyRail`/`OrderSafetyModal`이 이를 사용자-facing copy로 표시한다. 또한 preview-only paper ledger table/API가 생겨 simulated preview delta를 `booked=false`로 저장한다. locked Toss dry-run adapter contract, network-before-blocked executor, fresh approval gate, live approval executor locked contract, read-only reconciliation executor contract와 snapshot API도 live policy/API/safety modal에 노출된다. live trading readiness는 별도 live Toss order adapter/reconciliation loop 전까지 완료로 보지 않는다.

남은 blocker:

- Fast quote evidence harness criterion은 코드/테스트상 reconciliation 완료. 짧은 read-only recheck도 통과했지만, 100% 판단에는 장시간 UI responsiveness soak가 남아 있다.
- Current candle visual/data progression의 더 강한 proof.
- Agent paper-ledger performance/result loop, richer risk policy, live Toss adapter, reconciliation executor loop implementation.
- User approval 전 stage/commit 금지.
