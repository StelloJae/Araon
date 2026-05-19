# Araon Agent Function Upgrade Goal

> Status: execution brief draft
> Scope: pre-release product lane, agent decision-support upgrade
> Repo: `/Users/stello/korean-stock-follower`
> Safety posture: no live trading, no live order mutation, no raw secret exposure

## 0. Purpose

Araon의 에이전트 영역은 지금까지 “실거래 봇”이 아니라 `decision-support + safety foundation`으로 닫아왔다. 현재 화면에는 agent event queue, order intent preview, approval/audit/live lock의 뼈대가 있고, 시장 움직임 이벤트도 들어오지만, 일반 사용자가 봤을 때 다음 질문에 즉시 답하기 어렵다.

- 에이전트가 무엇을 보고 있는가?
- 어떤 종목을 후보로 올렸는가?
- 왜 후보가 되었는가?
- 지금 바로 매수/매도를 실행하는가, 아니면 모의 미리보기만 가능한가?
- 실거래를 하려면 무엇이 아직 잠겨 있거나 부족한가?
- 지금 보이는 데이터가 실제 관찰인지, mock인지, 내부 디버그 문자열인지?

이 goal의 목적은 에이전트를 live trading bot으로 만드는 것이 아니라, “거래 판단 보조 시스템”으로 제품 수준까지 끌어올리는 것이다. 사용자는 에이전트 패널을 보고 감지, 후보, 근거, 모의 미리보기, 리스크, 승인, 실행 잠금 상태를 이해할 수 있어야 한다.

GitHub Release, npm publish, 실제 주문 실행, 자동 매매 활성화는 이 goal 범위가 아니다.

## 1. Current Known State

이 문서는 다음 상태를 출발점으로 삼는다.

- Home의 agent panel은 우측 하단에 배치되어 있다.
- Agent Detail은 agent panel 우측 상단 확장 버튼으로 전체 workspace view처럼 열린다.
- `AgentEventsRail`은 agent event feed를 표시한다.
- `OrderIntentSafetyRail`은 모의 주문 preview, audit, approval challenge, live policy, readiness gap을 표시한다.
- 현재 UI copy는 이전보다 정리되었지만, 여전히 처음 보는 사용자가 “무엇을 할 수 있고 무엇을 할 수 없는지”를 바로 파악하기 어렵다.
- 일부 agent event reason은 source/payload/debug 느낌이 남아 있을 수 있다.
- 실제 주문 실행은 잠겨 있어야 한다.
- 자동거래에 필요한 strategy policy, risk policy, paper trading ledger, Toss live order adapter, reconciliation, kill-switch operator flow는 아직 제품 기능으로 닫히지 않았다.

## 2. Non-goals

이번 goal에서 하지 않는다.

- 실제 매수/매도 주문 실행
- 실제 주문 취소/정정
- 계좌 설정 변경
- live auto-buy / live auto-sell
- broad destructive watchlist cleanup
- raw Toss/KIS/session/account/order/watchlist 값 노출
- LLM이 임의로 매매 결정을 내리는 기능
- synthetic 금융 데이터 생성
- fake signal, fake candle, fake sparkline 생성
- GitHub Release / npm publish

## 3. Product Definition

### 3.1 Agent Is Decision Support

Araon Agent는 다음 역할을 한다.

1. 시장, watchlist, holdings, TOP100, recent surge, news, disclosure, Toss signal에서 의미 있는 이벤트를 감지한다.
2. 이벤트를 종목 후보로 정규화한다.
3. 후보가 된 이유와 근거를 사용자에게 설명한다.
4. 필요하면 모의 주문 preview를 만든다.
5. 리스크와 승인 상태를 확인한다.
6. 실거래 실행은 fresh explicit approval과 별도 live execution lane 없이는 항상 잠근다.

### 3.2 User-facing Flow

사용자가 보는 흐름은 항상 아래 순서로 설명되어야 한다.

```text
감지 -> 후보 -> 근거 -> 모의 미리보기 -> 리스크 확인 -> 승인 대기 -> 실거래 잠금
```

실거래가 가능하지 않은 현재 상태에서는 마지막 단계가 `실거래 잠금`으로 끝나야 한다. “자동으로 샀다”, “곧 실행한다”, “실거래 준비 완료”처럼 오해를 줄 수 있는 copy는 금지한다.

### 3.3 Agent Readiness Labels

에이전트 준비도는 다음 세 가지 층으로 표시한다.

- `관찰 가능`: 이벤트 감지와 후보 생성이 가능하다.
- `모의 가능`: 주문 미리보기와 리스크 점검이 가능하다.
- `실거래 잠금`: 실제 주문 실행은 승인/전략/리스크/정산/주문 adapter 준비 전까지 잠겨 있다.

## 4. Data Model Requirements

### 4.1 Normalized Agent Event

Agent event는 최소한 다음 필드를 UI 또는 adapter에서 다룰 수 있어야 한다.

- `id`
- `type`
- `productCode`
- `krTicker`
- `displayName`
- `market`
- `source`
- `reason`
- `confidence`
- `freshnessMs`
- `firstSeenAt`
- `lastSeenAt`
- `dedupeKey`
- `severity`
- `candidateState`
- `previewState`
- `riskState`
- `executionState`

현재 API가 위 필드를 모두 갖고 있지 않다면, backend/API 계약을 깨기보다 frontend adapter 또는 server-side normalized view를 둔다.

### 4.2 Event Types

최소 이벤트 유형:

- `market_movement_detected`
- `news_detected`
- `disclosure_detected`
- `toss_signal_detected`
- `watchlist_changed`
- `position_changed`
- `order_intent_created`
- `order_intent_skipped`
- `preview_created`
- `risk_check_completed`
- `approval_requested`
- `approval_granted`
- `approval_denied`
- `execution_locked`

### 4.3 Product Identity

Agent path도 Araon의 product identity 규칙을 따라야 한다.

- Toss canonical identity: `productCode`
- KR eligible identity: six-digit `krTicker`
- UI display: `displayName`
- KIS에는 `kisEligible=true`인 KR ticker만 보낸다.
- Toss-only/US product를 KIS 또는 six-digit-only route로 보내지 않는다.

## 5. Candidate Scoring Requirements

### 5.1 Deterministic First

이번 goal에서는 LLM 기반 매매 판단을 넣지 않는다. 후보 점수는 deterministic rule로 계산한다.

초기 scoring 후보:

- recent surge threshold crossing
- TOP100 상승/하락 rank movement
- Toss watchlist membership
- Toss holdings membership
- 선택 종목
- news/disclosure freshness
- signal confidence
- volume/momentum freshness
- duplicate event suppression
- risk readiness

### 5.2 Explainability

점수는 반드시 설명 가능해야 한다.

UI에는 다음 식으로 보여준다.

- `왜 후보인가`: 급상승, 보유, 관심, 뉴스, 공시, TOP100 변화 등
- `무엇을 봤나`: source와 freshness를 사용자-friendly copy로 표시
- `무엇이 부족한가`: 가격 대기, 뉴스 없음, 승인 없음, 리스크 정책 미완성 등

내부 raw payload, source enum, debug hash, raw dedupe string은 normal UI에 노출하지 않는다.

## 6. UI Requirements

### 6.1 Home Agent Panel

Home agent panel은 작은 요약 패널이어야 한다.

필수 표시:

- 현재 단계 pill: `관찰 가능`, `모의 가능`, `실거래 잠금`
- 최신 후보 2~3개
- 각 후보의 종목명, 이유, freshness
- “모의 미리보기” 버튼이 있다면 실제 주문으로 오해되지 않게 표시
- 확장 버튼

금지:

- raw payload
- debug source string
- 너무 긴 영어 enum
- live trading 가능처럼 보이는 copy
- mock 데이터처럼 보이는 placeholder

### 6.2 Agent Detail

Agent Detail은 전체 workspace 확장 화면으로 보인다.

권장 구조:

1. 상단 summary
   - 현재 상태: `관찰 가능 / 모의 가능 / 실거래 잠금`
   - 후보 수
   - 미리보기 수
   - 승인 대기 수
   - readiness gap 수
2. 후보 리스트
   - 종목명
   - 이유
   - freshness
   - confidence
   - source type
   - chart 이동 action
3. 후보 상세 / 근거
   - market movement
   - news
   - disclosure
   - signal
   - watchlist/holding context
4. 모의 주문 preview
   - side
   - quantity/cash amount
   - requested mode
   - live lock notice
5. risk/approval/audit
   - risk result
   - approval challenge
   - audit trail
   - kill-switch state
6. readiness gaps
   - strategy policy
   - risk policy
   - Toss order adapter
   - reconciliation
   - paper/live separation

### 6.3 Copy Tone

사용자-facing copy는 다음 기준을 따른다.

- “감지”, “후보”, “근거”, “모의 미리보기”, “승인 대기”, “실거래 잠금”을 기본 vocabulary로 사용한다.
- `KIS WS`, `fallback`, `polling`, `dedupe`, `raw`, `payload`, `intent hash` 같은 내부 용어는 normal UI에서 제거한다.
- source는 `Toss 가격`, `Toss 랭킹`, `뉴스`, `공시`, `실시간 추적`처럼 사용자에게 의미 있는 표현으로 바꾼다.

### 6.4 Typography

Agent UI는 `docs/design.md`의 Araon desktop density를 따른다.

- Panel title: 14~16px / 800~900
- Row primary: 12~13px / 800
- Row meta: 10~11px / 700
- Pill: 10~11px / 800~900
- Large readiness metric: 16~20px / 900 only when 정말 중요한 숫자

에이전트 영역만 과도하게 커지거나, 반대로 디버그 패널처럼 작아지면 실패다.

## 7. Backend Requirements

### 7.1 Agent Event Normalization

현재 agent event source가 분산되어 있다면, UI가 직접 raw reason을 해석하지 않도록 normalized display layer를 둔다.

가능한 구현 위치:

- server-side normalized route
- shared helper
- client-side adapter

우선순위는 다음과 같다.

1. API 계약을 크게 바꾸지 않는 adapter
2. 테스트 가능한 shared helper
3. 필요할 때만 route payload 확장

### 7.2 Order Intent Preview

Order intent preview는 local/simulated only여야 한다.

필수:

- mode가 `simulated`인지 명확히 표시
- live mode는 blocked
- risk check 결과 표시
- audit 기록 표시
- approval challenge가 있더라도 live execution은 locked

### 7.3 Readiness Gap Model

실거래 자동화에 아직 부족한 항목을 structured gap으로 유지한다.

기본 gap:

- strategy policy not configured
- risk policy not configured
- live Toss order adapter disabled
- order reconciliation missing
- paper trading ledger incomplete
- kill-switch/operator approval flow incomplete
- live execution dry-run evidence missing

## 8. Implementation Order

### Phase 0. Baseline Audit

읽을 파일:

- `src/client/components/AgentEventsRail.tsx`
- `src/client/components/OrderIntentSafetyRail.tsx`
- `src/client/App.tsx`
- `src/client/lib/agent-event-toast.ts`
- `src/client/lib/agent-event-order-intent.ts`
- `src/server/agent/market-movement-agent-event.ts`
- `src/server/agent/order-intent-service.ts`
- `src/server/routes/*agent*`
- 관련 tests

산출물:

- 현재 agent event type/source/copy inventory
- UI에 남은 raw/internal copy list
- API 계약 변경이 필요한지 여부

### Phase 1. Display Adapter

목표:

- agent event를 UI용 `AgentCandidateViewModel`로 바꾼다.
- displayName/product identity/freshness/source/reason/confidence를 정리한다.
- raw reason string cleanup을 한 곳으로 모은다.

검증:

- `agent-events-rail` focused test
- product identity 관련 test
- 중복 이벤트 dedupe test

### Phase 2. Candidate State and Scoring

목표:

- 후보 상태를 `observed`, `candidate`, `preview_ready`, `approval_pending`, `locked` 등으로 정리한다.
- deterministic score와 reason breakdown을 만든다.
- score가 UI에 직접 과장되어 보이지 않게, `높음/중간/낮음` 또는 짧은 reason으로 표현한다.

검증:

- scorer unit test
- source/reason coverage test
- threshold/dedupe test

### Phase 3. Agent Home Panel Redesign

목표:

- Home agent panel을 “감지된 거래 후보 + 실거래 잠금”으로 명확하게 만든다.
- 최신 후보 2~3개만 보여준다.
- 모의 미리보기 버튼은 action과 risk copy가 분명해야 한다.

검증:

- component test
- browser visual QA at 1600x1000, 1440x900

### Phase 4. Agent Detail Redesign

목표:

- Agent Detail을 summary, candidate list, evidence, preview, safety/audit, readiness gaps로 나눈다.
- 사용자가 “이 종목이 왜 후보인지”와 “왜 아직 실행되지 않는지”를 알 수 있어야 한다.

검증:

- component test
- browser visual QA
- keyboard/click flow: candidate row -> selected ticker/chart

### Phase 5. Order Intent and Safety Upgrade

목표:

- preview creation flow를 더 명확하게 만든다.
- risk check, approval challenge, audit trail, live lock을 하나의 흐름으로 보여준다.
- live execution이 잠겨 있음을 강하게 표현한다.

검증:

- order intent service tests
- safety rail component tests
- no-live mutation test

### Phase 6. Settings Integration

목표:

- Settings 안에 agent 관련 설정이 있다면, normal user에게 필요한 것만 남긴다.
- advanced/debug 항목은 dev-only 또는 diagnostics로 이동한다.

검증:

- settings component tests
- copy audit

### Phase 7. Browser QA and Completion Audit

목표:

- 실제 브라우저에서 Home agent panel과 Agent Detail을 확인한다.
- 내부 용어/placeholder/mock 느낌을 제거한다.
- completion audit 작성.

권장 audit path:

`docs/research/araon-agent-function-upgrade-completion-audit.md`

## 9. Verification Checklist

필수:

```bash
npm test -- src/client/components/__tests__/agent-events-rail.test.ts
npm test -- src/server/agent
npm run typecheck
npm run build
git diff --check
npm run soak:no-live -- --duration-ms=1500 --interval-ms=500
```

필요 시:

```bash
npm test -- src/client/components/__tests__/managed-operations-settings.test.ts
npm test -- src/server/agent/__tests__/order-intent-service.test.ts
```

Browser QA:

- Home agent panel
- Agent Detail expanded workspace
- candidate row click changes selected ticker/chart
- simulated preview button does not imply live execution
- approval/audit/live lock visible
- 1600x1000
- 1440x900
- 900px responsive

Secret/no-live scan:

- raw Toss/KIS/session/account/order/watchlist value not shown
- no live order/cancel/modify endpoint invoked
- no live auto trading

## 10. Acceptance Criteria

1. Home agent panel이 일반 사용자에게 “무엇을 감지했고 무엇을 할 수 있는지”를 설명한다.
2. Agent Detail이 감지 -> 후보 -> 근거 -> 모의 미리보기 -> 리스크/승인 -> 실거래 잠금 흐름을 보여준다.
3. Agent event row가 종목명, 이유, freshness, 상태를 명확히 보여준다.
4. raw source/payload/debug/dedupe 문자열이 normal UI에 보이지 않는다.
5. 후보 scoring/reason이 deterministic하고 테스트 가능하다.
6. duplicate market movement event가 semantic dedupe된다.
7. candidate row click이 selected ticker/chart를 바꾼다.
8. order intent preview는 simulated/local only로 표시된다.
9. live execution은 계속 locked로 표시된다.
10. approval challenge가 있어도 실제 주문 실행으로 이어지지 않는다.
11. risk/audit/readiness gap이 제품 copy로 표시된다.
12. 자동거래에 부족한 조각이 readiness gap으로 남는다.
13. Settings의 agent 관련 항목이 normal/advanced/dev-only로 정리된다.
14. UI typography/density가 `docs/design.md`와 맞는다.
15. tests/typecheck/build/diff-check/no-live soak가 통과한다.
16. 실제 브라우저 visual QA evidence가 completion audit에 남는다.

## 11. Completion Standard

이 goal은 “에이전트가 실제로 자동 매매를 한다”가 아니라, 다음 상태가 되었을 때 완료한다.

- 사용자에게 agent가 관찰 중인 이벤트와 후보가 명확히 보인다.
- 후보의 이유와 근거가 설명된다.
- 모의 주문 preview와 safety 상태가 이해된다.
- 실제 주문 실행은 잠겨 있음이 분명하다.
- 자동거래를 위해 아직 필요한 조각이 readiness gap으로 명시된다.
- 정상 UI에서 mock/debug/internal 느낌이 사라진다.
- 검증과 browser QA가 완료된다.
