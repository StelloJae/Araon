# AGENTS.md — korean-stock-follower

> 이 파일은 **새 세션의 AI 에이전트(Codex / Claude / etc.)가 가장 먼저 읽는** 항목이다. 작업 전에 끝까지 읽어라.

## 1. 프로젝트 한 줄 요약

localhost 단일 사용자용 한국 주식 watchlist 대시보드. Node 20 + Fastify 5 + React 19 + KIS OpenAPI(한국투자증권). REST polling은 fallback으로 계속 유지하고, KIS credentials 등록 후 H0UNCNT0 통합 WebSocket 실시간 시세는 cap40 managed default(`websocketEnabled=true`, `applyTicksToPriceStore=true`)로 운영된다. 과거 일봉 자동 보강도 credentials 등록 후 managed default(`backgroundDailyBackfillEnabled=true`)다. Clean install + no credentials 상태에서는 외부 KIS 호출 0회가 유지돼야 한다.

## 2. 현재 상태 (2026-05-06 auto operations defaults 시점)

- **위치**: `/Users/stello/korean-stock-follower`
- **브랜치**: `main`
- **Functional NXT baseline**: `11ad916` (`chore(ws): NXT2b — record redacted approval key probe metadata`)
- **NXT3 시작 기준**: `de857c7` (`Keep runtime state out of repository status`)
- **테스트**: 80 files / **619 tests pass** (`npm test`)
- **타입체크**: server + client `tsc --noEmit` clean
- **빌드**: main client chunk 349.16 kB / gzip 104.65 kB + lazy Lightweight Charts chunk 168.07 kB / gzip 53.99 kB
- **Managed defaults**: clean install no credentials → KIS 호출 0회. credentials 등록 후 realtime cap40 + daily backfill 기본 ON. Explicit persisted false는 emergency disable 의도로 존중.
- **마스터 종목**: `master_stocks` 4341행 (KOSPI + KOSDAQ + KRX flags)
- **라이브 가격 수집**: REST polling cycle ~14초 / 105 tracked stocks / errorCount 0 / p95 274ms / 8.09 effectiveRps (이전 라이브 검증)
- **NXT3 라이브 WS smoke**: live approval key 1회 / WS 연결 1회 / `H0UNCNT0` + `005930` subscribe 1회 / tick frame 2개 수집 / parser 통과 / priceStore·SSE 반영 0회
- **NXT4a mock bridge integration**: `applyTicksToPriceStore=false` explicit guard 도입. mock tick → priceStore/SSE 연결은 테스트 완료, live KIS 호출 0회
- **NXT4b isolated live apply smoke**: live approval key 1회 / WS 연결 1회 / `H0UNCNT0` + `005930` subscribe 1회 / probe-local priceStore.setPrice 3회 / probe-local SSE `price-update` 3회 / production runtime 반영 0회
- **NXT5a mock favorites tier bridge**: oldest 3 favorites만 realtime 후보. overflow favorites/non-favorites는 REST polling 유지. live KIS 호출 0회
- **NXT5b limited favorites live smoke**: live approval key 1회 / WS 연결 1회 / `H0UNCNT0` subscribe 3건 (`005930`, `000660`, `042700`) / probe-local priceStore.setPrice 3회 / probe-local SSE `price-update` 3회 / production runtime 반영 0회
- **NXT5c operator guard / rollout runbook**: runtime apply는 `websocketEnabled && applyTicksToPriceStore` 두 gate가 모두 true일 때만 가능. status helper/auto-stop helper/operator disable helper/runbook 추가. live KIS 호출 0회
- **NXT6a runtime one-ticker smoke**: live approval key 1회 / WS 연결 1회 / `H0UNCNT0` + `005930` subscribe 1회 / ACK `OPSP0000` / live frame 7건 / real `PriceStore.setPrice` 3회 / real SSE `price-update` 3회 / cleanup 후 gate false / persisted settings 변경 0회
- **NXT6b runtime favorites smoke**: favorites 5개 중 tier-manager 상위 3개 (`005930`, `000660`, `042700`) subscribe / ACK 3건 / live frame 9건 / real `PriceStore.setPrice` 3회 / real SSE `price-update` 3회 / cleanup 후 gate false / persisted settings 변경 0회
- **NXT6c runtime cap5 smoke**: favorites 5개 전체 (`005930`, `000660`, `042700`, `277810`, `017510`) subscribe / ACK 5건 / live frame 13건 / real `PriceStore.setPrice` 5회 / real SSE `price-update` 5회 / cleanup 후 gate false / persisted settings 변경 0회
- **NXT6d runtime cap10 smoke**: favorites 5개 + tracked stocks 5개 smoke-only favorite overlay로 10개 후보 구성 / ACK 10건 / live frame 7건 / real `PriceStore.setPrice` 6회 / real SSE `price-update` 6회 / cleanup 후 gate false / favorites snapshot 복구 / persisted settings 변경 0회
- **NXT6e runtime status/readiness wiring**: live KIS 호출 0회 / `GET /runtime/realtime/status` 추가 / SSEIndicator 패널에 WS runtime 상태·gate·카운터 표시 / readiness helper는 cap10 증거만으로 cap20·cap40을 ready 처리하지 않음 / runbook 갱신
- **NXT7a session-scoped operator controls**: live KIS 호출 0회 / `POST /runtime/realtime/session-enable`, `POST /runtime/realtime/session-disable` 추가 / cap 1·3·5·10만 허용 / Settings 연결 탭에 “이 세션에서만 켜기” UI 추가 / persisted settings 변경 0회
- **NXT7b UI session live smoke**: SettingsModal 버튼 경로로 cap 1 live runtime apply 성공 (`005930`, parsed 89 / applied 49 / stale 40), optional cap 3은 `005930`, `000660`, `042700` 연결·구독 상태 확인 후 짧은 관찰 창에서 신규 tick 0건. cleanup 후 active subscriptions 0, gates false, persisted settings 변경 0회
- **NXT7c session safeguards**: live KIS 호출 0회 / session time limit + cap별 parsed/applied tick limit 추가 / limit 도달 시 session gate false + realtime bridge disconnect / REST polling·SSE·priceStore 유지 / SettingsModal·SSEIndicator에 제한/종료 사유 표시
- **NXT7d UI session limit live smoke**: 첫 cap 1 시도에서 runtime bridge 기본 TR_ID가 `H0STCNT0`로 남아 있던 문제를 발견하고 `H0UNCNT0` default로 수정/테스트 추가. 수정 후 SettingsModal cap 1은 `H0UNCNT0` / `005930` integrated tick parsed 53 / applied 20 / stale 33, `applied_tick_limit_reached`로 자동 cleanup. optional cap 3은 `005930`, `000660`, `042700` 구독 상태에서 신규 tick 0건, `time_limit_reached`로 자동 cleanup. persisted settings 변경 0회
- **NXT7e apply-path session hard limits**: live KIS 호출 0회 / session limit을 status polling뿐 아니라 realtime apply path에서 즉시 검사하도록 보강. cap 1 `maxAppliedTicks=5`이면 같은 multi-tick frame에서도 `priceStore.setPrice`는 최대 5회. limit 이후 tick은 `sessionLimitIgnoredCount`로 분리 집계. session cleanup은 bridge listener를 보존하는 `stopSession()` 경로 사용. status/UI/runbook 갱신
- **NXT7f cap 1 hard-limit UI live smoke**: SettingsModal 버튼 경로로 cap 1만 재검증. `H0UNCNT0` / `005930` live tick frame 7개, parsed 17 / applied 5 / stale 10 / session-limit ignored 2. `sessionAppliedTickCount=5`, `endReason=applied_tick_limit_reached`, active subscriptions 0, gates false, persisted settings 변경 0회. NXT7d의 applied limit overshoot는 재현되지 않음
- **NXT7g cap 3 hard-limit UI live smoke**: SettingsModal 버튼 경로로 cap 3만 재검증. `H0UNCNT0` / `005930`, `000660`, `042700` live tick frame 15개, parsed 44 / applied 15 / stale 27 / session-limit ignored 2. `sessionAppliedTickCount=15`, `endReason=applied_tick_limit_reached`, active subscriptions 0, gates false, persisted settings 변경 0회
- **NXT7h cap 5 hard-limit UI live smoke**: SettingsModal 버튼 경로로 cap 5만 재검증. `H0UNCNT0` / `005930`, `000660`, `042700`, `277810`, `017510` 구독 상태에서 live tick frame 25개, parsed 58 / applied 25 / stale 33 / session-limit ignored 0. `sessionAppliedTickCount=25`, `endReason=applied_tick_limit_reached`, active subscriptions 0, gates false, persisted settings 변경 0회
- **NXT7i operator UI polish**: live KIS 호출 0회 / SettingsModal·SSEIndicator 문구와 상태 라벨 정리. 당시 cap 1/3/5는 “검증됨”, cap 10은 “다음 검증 예정”, cap 20/40은 미검증/미지원 상태였음. 종료 사유 한글 라벨과 safe status fetch 실패 문구 추가
- **NXT8a cap 10 hard-limit live smoke**: in-app Browser automation에서 SettingsModal이 열리지 않아 route-level fallback 사용. favorites 5개 + tracked stocks 5개 smoke-only favorite overlay로 10개 후보 구성. `POST /runtime/realtime/session-enable` cap 10 / `H0UNCNT0` session에서 parsed 124 / applied 50 / stale 73 / session-limit ignored 1, `endReason=applied_tick_limit_reached`. active subscriptions 0, gates false, original favorites ticker set 복구, persisted settings 변경 0회
- **NXT8b cap 10 UI button smoke**: NXT8a UI failure root cause 확인(`aria-label` 중복 + footer settings no-op) 후 stable `data-testid` hooks와 StatusBar settings wiring 추가. SettingsModal UI 버튼으로 cap 10 session-enable 직접 실행(route-level fallback 0회), 10종목 session connected/subscribed 상태와 status panel 표시 확인. 60초 동안 live tick 0건으로 `time_limit_reached`; cap10 UI hard-limit 자체는 미검증/재시도 필요. active subscriptions 0, gates false, original favorites ticker set 복구, persisted settings 변경 0회
- **NXT8c cap 10 UI hard-limit retry**: latest REST snapshot volume 기준 active non-favorite 5개(`018880`, `009830`, `006360`, `028050`, `010140`)를 smoke-only overlay로 추가. SettingsModal UI 버튼으로 cap 10 session-enable 직접 실행(route-level fallback 0회), 10종목 connected/subscribed 상태 확인. 15:43~15:44 KST 60초 동안 live tick 0건으로 `time_limit_reached`; cap10 UI hard-limit live tick 검증은 여전히 미검증/유동성 조건부. active subscriptions 0, gates false, original favorites ticker set 복구, persisted settings 변경 0회
- **NXT8d operator UX/readiness 정리**: live KIS 호출 0회 / SettingsModal·SSEIndicator·readiness helper가 cap10을 “조건부”로 표시. 당시 cap20/40은 미승인/미지원으로 명시됐으나, 이후 final push에서 superseded됨
- **NXT8e cap 10 UI hard-limit live smoke**: 09:14 KST 장중 자동 실행 / SettingsModal UI 버튼 경로만 사용(route-level fallback 0회) / favorites 5개 + tracked stocks 5개 smoke-only overlay로 10개 후보 구성 / `H0UNCNT0` cap10 session에서 parsed 179 / applied 50 / stale 129 / `endReason=applied_tick_limit_reached` / active subscriptions 0 / gates false / original favorites ticker set 복구 / persisted settings 변경 0회. cap10 UI hard-limit live burst 검증 완료. 당시 cap20/40은 미승인
- **NXT9a cap20 readiness preview**: live KIS 호출 0회 / cap20 session limit 설계값과 favorites-only 후보 preview 추가. 이후 NXT final push에서 superseded됨
- **NXT final push cap20/cap40 controlled smoke**: SettingsModal UI 버튼 경로만 사용(route-level fallback 0회) / cap20은 20개 후보에서 parsed 252 / applied 100 / stale 151 / session-limit ignored 1 / `endReason=applied_tick_limit_reached` / cap40은 40개 후보에서 parsed 528 / applied 200 / stale 328 / session-limit ignored 0 / `endReason=applied_tick_limit_reached` / cap40 초과 구독 0회 / active subscriptions 0 / gates false / original favorites ticker set 복구 / persisted settings 변경 0회. cap1/3/5/10/20/40 controlled UI session hard-limit 검증 완료
- **NXT always-on promotion**: 이 사용자 로컬 `data/settings.json`을 `websocketEnabled=true`, `applyTicksToPriceStore=true`로 전환 / warmup 시 current realtime favorite assignment를 즉시 connect+subscribe / tier-manager runtime cap은 `WS_MAX_SUBSCRIPTIONS=40` / integrated market scheduler는 07:55 warmup, 08:00~20:00 open, 20:05 shutdown / REST polling fallback 유지 / StockRow와 SurgeBlock에 실제 누적 거래량 표시 복구. 거래량 배수는 기준선 없이는 표시하지 않음
- **Araon runtime acceptance**: 2026-04-29 11:10~11:41 KST / always-on `H0UNCNT0` cap40 30.3분 관찰 / parsed +141,132 / applied +78,540 / stale +62,592 / reconnect 0 / parseError 0 / applyError 0 / SSE 10초 sample에서 `price-update` 510건 / 임시 favorite overlay 원복. Browser acceptance 중 cap40 tick burst로 client render loop 발견 후 `lastUpdate` throttle + client price update batching으로 수정. 거래량 배수 P1은 same-session/time-bucket baseline foundation 구현, 기준선 부족 시 `기준선 수집 중`. favicon 404는 Araon favicon으로 해결
- **Persisted candle + historical daily backfill MVP**: `price_candles` SQLite table 추가 / canonical stored interval은 local `1m` + KIS daily `1d` / 3m~12h는 1m candle에서 재집계 / 1D·1W·1M은 1d candle에서 KST 기준 재집계 / daily backfill range는 `1m/3m/6m/1y`, 긴 범위는 100일 이하 창으로 pagination / StockDetailModal `차트` 탭은 TradingView Lightweight Charts로 표시 / raw tick 저장·historical minute backfill·full master backfill·가짜 과거 차트 없음
- **Candle chart UI acceptance**: 005930에 저장된 `kis-daily` 20개 candle이 StockDetailModal `차트` 탭에서 `1D · 1m` 20 candles로 표시됨 / `1W · 3m` 5 candles, `1M · 1y` 2 candles 확인 / 빈 종목은 "차트 데이터 수집 중" 유지 / daily 계열 봉 선택 시 너무 짧은 range는 자동 보정(`1D→1m`, `1W→3m`, `1M→1y`) / UI acceptance 중 추가 KIS historical call·WebSocket/cap/background queue 0회
- **Chart/backfill MVP closeout**: 단일 종목 KIS daily live probe + StockDetailModal UI acceptance 기준으로 제품 체크포인트 닫힘 / 이후 daily background backfill은 tracked/favorites 대상 managed default로 승격 / full master backfill·historical minute backfill은 계속 HOLD / 누락 차트 데이터 합성 금지
- **Managed defaults acceptance**: `bd7dbe8` 기준 no-live acceptance 완료 / fresh no-credentials는 defaults true여도 runtime unconfigured·KIS 호출 0회·credentials.enc 미생성 / persisted false emergency-disabled 설정 보존 / emergency disable route·Settings UI·backfill guard 검증 / existing local live UI smoke는 장중 live runtime 회피를 위해 not executed, 판정 CONDITIONAL GO
- **Restart-safe daily backfill budget/cooldown**: `background-backfill-state.json`에 `budgetDateKey`, `dailyCallCount`, `cooldownUntilMs`를 저장 / 앱 재시작 후에도 daily budget exhausted와 429/5xx cooldown이 유지됨 / missing/malformed state는 empty state fallback / live KIS 호출 0회 focused tests로 검증

### NXT 시리즈 진행도

| 단계 | 상태 | 내용 |
|---|---|---|
| NXT0 | ✅ DONE | WS reconnect supervision, `connected/degraded/stopped` 상태머신, exp backoff |
| NXT1 | ✅ DONE | `kisTickParser` slim — H0STCNT0/H0UNCNT0/H0NXCNT0 동일 46-field 인덱스 기반, fixture 합성 |
| NXT2a | ✅ DONE | `createApprovalIssuer` 추출 + leak-safe state. `secretkey` 필드명 픽스 (NOT `appsecret`) |
| NXT2b | ✅ DONE | 라이브 1회 호출로 응답 shape 확정 — 단일 필드 `approval_key` (length 36), TTL 단서 0 |
| NXT3 | ✅ DONE | 1종목 `H0UNCNT0` live smoke — `005930` 단일 ticker subscribe, redacted live fixture 수집, parser 통과. priceStore/SSE 반영 0회 |
| NXT4a | ✅ DONE | mock bridge integration: parsed ticks → guarded priceStore apply + SSE event path 테스트. `applyTicksToPriceStore=false` default |
| NXT4b | ✅ DONE | isolated live apply smoke: probe 내부에서만 guard true, probe-local priceStore/SSE 3건 확인 후 disconnect |
| NXT5a | ✅ DONE | mock favorites tier bridge: 상위 3 favorites만 WS 후보, 나머지 REST. WS_MAX_SUBSCRIPTIONS gating |
| NXT5b | ✅ DONE | live 3종목 limited smoke: favorites tier 후보만 H0UNCNT0 subscribe/apply |
| NXT5c | ✅ DONE | operator guard / status helper / auto-stop 기준 / rollout runbook. live KIS 호출 0회 |
| NXT6a | ✅ DONE | runtime 1종목 limited enable: `005930` 실제 PriceStore/SSE 3건 반영 후 cleanup |
| NXT6b | ✅ DONE | favorites 상위 3종목 runtime enable: ACK 3건, 실제 PriceStore/SSE 3건 반영 후 cleanup |
| NXT6c | ✅ DONE | cap 5 runtime smoke: ACK 5건, 실제 PriceStore/SSE 5건 반영 후 cleanup |
| NXT6d | ✅ DONE | cap 10 runtime smoke: 임시 favorite overlay로 ACK 10건, 실제 PriceStore/SSE 6건 반영 후 cleanup/복구 |
| NXT6e | ✅ DONE | runtime status endpoint + SSEIndicator status panel + rollout readiness helper. live KIS 호출 0회 |
| NXT7a | ✅ DONE | session-scoped Settings/operator controls: cap 1/3/5/10, confirmation required, persisted settings unchanged |
| NXT7b | ✅ DONE | UI button live smoke: cap 1 실제 runtime PriceStore/SSE apply 확인, cap 3 connected/subscribed 상태 확인 후 cleanup |
| NXT7c | ✅ DONE | session time/tick limits + UI safety copy/state polish. live KIS 호출 0회 |
| NXT7d | ✅ DONE | UI button live smoke: H0UNCNT0 default fix 후 cap 1 applied limit cleanup, cap 3 time limit cleanup 확인 |
| NXT7e | ✅ DONE | apply path hard limit: maxApplied/maxParsed/time limit을 `priceStore.setPrice` 직전/직후 강제, UI/status/runbook 보강. live KIS 호출 0회 |
| NXT7f | ✅ DONE | UI cap 1 재검증: NXT7e hard limit이 실제 live 버튼 경로에서도 `sessionAppliedTickCount=5`로 정확히 멈춤 |
| NXT7g | ✅ DONE | UI cap 3 재검증: NXT7e hard limit이 실제 live 버튼 경로에서도 `sessionAppliedTickCount=15`로 정확히 멈춤 |
| NXT7h | ✅ DONE | UI cap 5 재검증: NXT7e hard limit이 실제 live 버튼 경로에서도 `sessionAppliedTickCount=25`로 정확히 멈춤 |
| NXT7i | ✅ DONE | operator UI/status polish: cap 1/3/5 검증 상태, cap 10 next 안내, 종료 사유/오류 문구 정리. live KIS 호출 0회 |
| NXT8a | ✅ DONE | cap 10 hard-limit live smoke: route-level fallback으로 `sessionAppliedTickCount=50` 정확히 멈춤, favorite overlay 복구. UI 버튼 재검증은 별도 후속 |
| NXT8b | 🟡 PARTIAL | cap 10 SettingsModal 버튼 경로와 status panel 확인. UI automation hooks/wiring 수정. live tick 0건으로 cap10 UI hard-limit는 재시도 필요 |
| NXT8c | 🟡 PARTIAL | active-volume overlay로 cap 10 UI 버튼 재시도. connected/subscribed/status 확인, live tick 0건으로 hard-limit는 여전히 미검증 |
| NXT8d | ✅ DONE | operator UX/readiness 정리: cap10은 조건부, cap20/40은 미승인/미지원으로 UI/API/runbook 일치. live KIS 호출 0회 |
| NXT8e | ✅ DONE | 장중 cap 10 SettingsModal UI 버튼 live hard-limit 재검증. `sessionAppliedTickCount=50`, `endReason=applied_tick_limit_reached`, overlay 복구 완료. 당시 cap20/40은 미승인 |
| NXT9a | ✅ DONE | cap20 readiness 설계/preview. 이후 final push에서 superseded |
| NXT final | ✅ DONE | cap20/cap40 SettingsModal UI controlled smoke. cap20 `sessionAppliedTickCount=100`, cap40 `sessionAppliedTickCount=200`, 둘 다 `applied_tick_limit_reached`, overlay 복구 |
| NXT always-on | ✅ DONE | 이 사용자 로컬 persisted gates true, fresh install defaults false, warmup connect+subscribe, integrated 08:00~20:00 scheduler, REST fallback 유지, 실제 누적 거래량 UI 표시 복구 |
| Araon acceptance | ✅ GO | always-on cap40 30.3분 관찰, reconnect/error 0, UI cap40 render loop 수정 후 Settings/SSE 패널 확인 |

## 3. 절대 룰 (위반 = 사고)

### 3.1 보안
- `appKey` / `appSecret` / `accessToken` / `approvalKey` 원문은 **logs / state / docs / fixture / git diff / stdout 어디에도 plain text로 남지 않아야 한다.**
- 3중 redact 가드:
  1. `src/shared/logger.ts:25-36` pino redact paths (`appKey`, `appSecret`, `body.appKey`, `body.appSecret`, `req.body.appKey`, `req.body.appSecret`, `credentials.appKey`, `credentials.appSecret`, `accessToken`, `approvalKey`)
  2. `src/server/kis/kis-approval.ts` issuer state machine — `ready`는 `issuedAt`만, `failed`는 generic `code`+`message`만 (upstream 텍스트 미포함)
  3. `src/server/kis/kis-ws-client.ts:193-196` 정규식 redact (`approval_key=...` / `appkey=...` / `appsecret=...` / `secretkey=...`)
- 라이브 KIS 호출은 **사용자 입회 + 명시적 GO 신호 후 1회만**. 자동 retry는 408/429/5xx 한정 (kis-rest-client 기본). probe성 호출은 `maxAttempts: 1` 로 retry off.

### 3.2 합성 금융 데이터 절대 금지
- 모르는 값은 **"연동 예정"** italic으로 표시하거나 disabled.
- sparkline은 실제 SSE history (`usePriceHistoryStore`)만, ≥2 point 있어야 그림.
- persisted chart는 `price_candles`의 local `1m` candle과 manual KIS `1d` candle만 표시한다. 데이터가 없으면 "차트 데이터 수집 중"으로 표시하고 synthetic candle/backfill을 만들지 않는다.
- daily background backfill은 credentials 등록 후 managed default지만 tracked/favorites 범위, 장중 차단, budget/cooldown guard를 유지한다. full master backfill과 historical minute backfill은 별도 승인 전까지 HOLD다.
- surge/alert는 **crossing 순간만** 발동 (continuous "조건 만족 중" 폭주 금지).
- `closed`/`snapshot`/`pre-open` 시 alert / sparkline 차단.

### 3.3 Bootstrap 절대 차단 금지
- master refresh는 **항상 background**. 부팅이 master refresh로 막히면 사고.

### 3.4 `/stocks` ≠ `/master`
- 추적 카탈로그(화면·polling 대상)와 마스터(검색용 4337)는 **별도 테이블**.
- 추적 추가는 `POST /stocks/from-master` (마스터에서 골라서 폴링 대상에 합류).

### 3.5 화면 섹터 grouping 정책
- 화면 섹터 grouping은 **manual sector > KIS 공식 지수업종 > 미분류** 순서다.
- KRX 섹터 플래그는 공식 지수업종 fallback으로 섞지 않는다.
- 업종 없음 / ETF / ETN / 특수상품은 `미분류`로 둔다.
- ETF/ETN 별도 그룹은 후속 작업이다.

## 4. 자주 쓰는 명령

```bash
# 검증 (커밋 전 필수)
npm run typecheck                            # server + client tsc --noEmit
npm test                                     # vitest fileParallelism=false

# scripts/ 검증 (선택, ad-hoc tsconfig)
# project_status.md 참조: NXT2b 시 사용한 ad-hoc tsconfig 패턴

# 개발 서버
npm run dev:server                           # tsx watch src/server/index.ts
npm run dev:client                           # vite

# 빌드
npm run build                                # tsc + vite build

# probe (NXT2b 패턴, 1회 standalone)
npx tsx scripts/probe-kis-approval.mts       # 라이브 1회 호출, redacted metadata만 출력
```

### 포트 충돌 시 dev server 재시작

```bash
pkill -f "korean-stock-follower"
sleep 2
npm run dev:server &
npm run dev:client &
```

## 5. 핵심 코드 entry points

| 파일 | 역할 |
|---|---|
| `src/server/index.ts` | Fastify 부팅 |
| `src/server/bootstrap-kis.ts` | KIS runtime 상태머신 (`unconfigured/starting/started/failed`) + `defaultActuallyStart` 와이어링 |
| `src/server/credential-store.ts` | AES-256-GCM 암호화 (`data/credentials.enc`), scrypt N=2^15. `KIS_CRED_KEY` env 우선, 없으면 머신 fallback |
| `src/server/kis/kis-rest-client.ts` | REST 래퍼. retry 3회 + exp backoff. `unauthenticated:true`로 인증 헤더 suppress |
| `src/server/kis/kis-auth.ts` | `KisAuth` — token 캐시 + 1분 throttle 회피 |
| `src/server/kis/kis-approval.ts` | `createApprovalIssuer` — leak-safe issuer (NXT2a) |
| `src/server/kis/kis-tick-parser.ts` | discriminated-union parser (NXT1) — 46-field 인덱스 기반 |
| `src/server/kis/kis-ws-client.ts` | WS 클라이언트 (NXT0 reconnect supervision) — 로컬 persisted `websocketEnabled=true`일 때 market scheduler warmup 때 활성 |
| `src/server/kis/kis-price-mapper.ts` | `inquire-price` 응답 → `Price` 매핑 (`stck_prpr`/`prdy_ctrt`/`acml_vol`) |
| `src/server/realtime/realtime-bridge.ts` | WS frames → guarded priceStore apply. runtime에서는 persisted gates 또는 session-scoped gate가 허용한 ticker만 priceStore/SSE 반영. NXT7e 이후 session hard limit을 apply path에서 즉시 검사 |
| `src/server/realtime/runtime-operator.ts` | NXT5c/NXT6e/NXT7a operator helpers: apply gate, session gate, credential-safe status shape, manual disable/rollback helper, auto-stop decision helper, rollout readiness helper |
| `src/server/realtime/tier-manager.ts` | favorites-only realtime tiering + NXT9a `previewRealtimeCandidates()` cap20 후보/shortage preview. non-favorites는 preview에서도 WS 후보가 아님 |
| `src/server/routes/runtime.ts` | runtime operator routes: `GET /runtime/realtime/status`, `POST /runtime/realtime/session-enable`, `POST /runtime/realtime/session-disable`, raw key/token/account 미노출 |
| `src/server/polling/polling-scheduler.ts` | REST polling. cycle ~14초 |
| `src/server/price/candle-aggregator.ts` | PriceStore `price-update` → local 1m candle in-memory aggregation + 5초 batch flush. snapshot restore는 candle 생성 금지 |
| `src/server/price/candle-aggregation.ts` | KST bucket boundary + 1m → 3m/5m/10m/15m/30m/1h/2h/4h/6h/12h, 1d → 1D/1W/1M aggregation helper |
| `src/server/chart/backfill-policy.ts` | historical backfill 허용 시간 정책. 평일 07:55~20:05 KST 차단, 20:05 이후/주말 허용 |
| `src/server/chart/daily-backfill-service.ts` | KIS daily candle backfill service. `1d` rows만 저장, `1m/3m/6m/1y` range를 100일 이하 창으로 분할 |
| `src/server/chart/background-backfill-scheduler.ts` | Managed-default background daily backfill scheduler. 장후/주말만 실행, favorites/tracked 우선, sequential low-rate, daily budget + cooldown |
| `src/server/kis/kis-daily-chart.ts` | KIS 국내주식기간별시세 daily mapper/client. 테스트는 mock transport만 사용 |
| `src/server/db/migrations/004-price-candles.sql` | `price_candles` schema: local `1m` + manual KIS `1d`. raw tick table 아님 |
| `src/server/routes/stocks.ts` | `GET /stocks/:ticker/candles` + `POST /stocks/:ticker/candles/backfill`. backfill은 장중 차단 |
| `src/client/components/StockCandleChart.tsx` | StockDetailModal `차트` 탭용 Lightweight Charts renderer. 1W/1M interval + 6m/1y range + manual daily backfill control 포함 |
| `src/server/sse/sse-manager.ts` | SSE — price-update / market-status / heartbeat 이벤트 |
| `src/shared/kis-constraints.ts` | KIS rate limit / hosts / TR_ID / WS / token 상수 단일 진실 출처 |
| `src/shared/logger.ts` | pino + redact paths |
| `src/server/settings-store.ts` | runtime 설정. clean install no credentials는 KIS 호출 0회. credentials 등록 후 managed defaults는 `websocketEnabled=true`, `applyTicksToPriceStore=true`, `backgroundDailyBackfillEnabled=true`. Explicit persisted false는 emergency disable 의도로 존중 |
| `scripts/probe-kis-approval.mts` | NXT2b 1회 probe 패턴 — 다음 라이브 검증 시 패턴 재사용 |
| `scripts/probe-kis-ws-one-ticker.mts` | NXT3 1종목 WS smoke probe — raw secret 미출력, frame 1~3개 후 disconnect |
| `scripts/probe-kis-ws-apply-one-ticker.mts` | NXT4b isolated apply smoke — probe-local PriceStore/SSE spy만 사용, production runtime 반영 금지 |
| `docs/research/nxt5a-mock-tier-bridge.md` | NXT5a mock tier 정책/검증 결과 — live KIS 호출 없음 |
| `scripts/probe-kis-ws-favorites-smoke.mts` | NXT5b favorites limited live smoke — 최대 3종목, probe-local PriceStore/SSE spy만 사용 |
| `docs/research/nxt5b-limited-live-smoke.md` | NXT5b live 결과 report — raw frame/secret 저장 없음 |
| `docs/runbooks/nxt-ws-rollout.md` | NXT5c rollout runbook — preflight, 정상/중단 기준, 되돌림 방법, leak 검사 명령 |
| `scripts/probe-kis-ws-runtime-one-ticker.mts` | NXT6a one-ticker runtime smoke — 실제 PriceStore/SseManager 경로, in-memory gate만 임시 true |
| `docs/research/nxt6a-runtime-one-ticker-smoke.md` | NXT6a 첫 시도 결과 — `no_live_tick_observed`, raw frame/secret 저장 없음 |
| `scripts/probe-kis-ws-runtime-favorites.mts` | NXT6b favorites runtime smoke — tier-manager 상위 최대 3 favorites만 실제 PriceStore/SseManager 경로로 검증 |
| `docs/research/nxt6b-runtime-favorites-smoke.md` | NXT6b live 결과 report — raw frame/secret 저장 없음 |
| `scripts/probe-kis-ws-runtime-cap5.mts` | NXT6c cap5 runtime smoke — tier-manager 상위 최대 5 favorites만 실제 PriceStore/SseManager 경로로 검증 |
| `docs/research/nxt6c-runtime-cap5-smoke.md` | NXT6c live 결과 report — raw frame/secret 저장 없음 |
| `scripts/probe-kis-ws-runtime-cap10.mts` | NXT6d cap10 runtime smoke — tracked stocks 기반 smoke-only favorite overlay를 만들고 종료 후 favorite snapshot 복구 |
| `docs/research/nxt6d-runtime-cap10-smoke.md` | NXT6d live 결과 report — raw frame/secret 저장 없음 |
| `src/client/components/SSEIndicator.tsx` | NXT6e runtime status panel wiring — 패널 open 시만 status fetch, 닫히면 timer 정리, EventSource 추가 생성 없음 |
| `src/client/lib/realtime-status-panel.ts` | NXT6e frontend polling helper — status panel open/close polling lifecycle 테스트 대상 |
| `src/client/components/SettingsModal.tsx` | NXT7a connection tab operator controls — “통합 실시간 시세” session enable/disable, cap 1/3/5/10, confirmation required |
| `src/client/lib/realtime-session-control.ts` | NXT7a/NXT7i/NXT final frontend operator control helper — allowed cap validation, cap별 session max timebox, confirmation guard, cap verification labels, end-reason labels, safe message sanitizer |
| `vite.config.ts` | dev client proxy — `/runtime/*` routes must forward to Fastify for Settings/SSEIndicator status UI |
| `docs/research/nxt7b-ui-session-live-smoke.md` | NXT7b UI button live smoke report — browser automation, cap 1 apply success, cap 3 no-new-tick observation, cleanup evidence |
| `docs/research/nxt7c-session-safeguards.md` | NXT7c non-live safeguards report — session limits, status shape, UI safety behavior, no live KIS call |
| `docs/research/nxt7d-ui-session-limit-live-smoke.md` | NXT7d UI button limit live smoke report — H0UNCNT0 default fix, cap 1 applied-limit cleanup, cap 3 time-limit cleanup |
| `docs/research/nxt7f-cap1-hard-limit-live-smoke.md` | NXT7f UI cap 1 hard-limit live smoke report — NXT7e apply-path hard limit이 실제 live burst에서도 applied 5회로 멈춘 증거 |
| `docs/research/nxt7g-cap3-hard-limit-live-smoke.md` | NXT7g UI cap 3 hard-limit live smoke report — cap 3 live burst에서도 applied 15회로 멈춘 증거 |
| `docs/research/nxt7h-cap5-hard-limit-live-smoke.md` | NXT7h UI cap 5 hard-limit live smoke report — cap 5 live burst에서도 applied 25회로 멈춘 증거 |
| `docs/research/nxt7i-ui-polish.md` | NXT7i non-live UI polish report — cap 검증 상태, 종료 사유 라벨, safe status message 정리 |
| `docs/research/nxt8a-cap10-hard-limit-live-smoke.md` | NXT8a cap 10 live smoke report — route-level fallback, applied 50회 hard limit, favorite overlay 복구 증거 |
| `docs/research/nxt8b-cap10-ui-button-live-smoke.md` | NXT8b cap 10 UI button smoke report — SettingsModal 버튼 경로, UI automation root cause/fix, status panel 확인, no-tick/time-limit로 hard-limit 재시도 필요 |
| `docs/research/nxt8c-cap10-ui-hard-limit-retry.md` | NXT8c cap 10 UI hard-limit retry report — active-volume overlay, UI button path, no-tick/time-limit partial, favorite overlay 복구 증거 |
| `docs/research/nxt8d-rollout-readiness-summary.md` | NXT8d non-live readiness summary — cap10 조건부 표시, readiness helper fields/warnings, 다음 트랙 정의 |
| `docs/research/nxt8e-cap10-ui-hard-limit-live-smoke.md` | NXT8e cap 10 UI hard-limit live smoke report — SettingsModal 버튼 경로, applied 50회 exact hard limit, favorite overlay 복구 증거 |
| `docs/research/nxt9a-cap20-readiness.md` | NXT9a non-live cap20 readiness preview — cap20 blockers/warnings, limit 설계값, favorites-only preview, route/UI enable 금지 |
| `docs/research/nxt9-cap20-cap40-live-smoke.md` | NXT final cap20/cap40 controlled live smoke report — SettingsModal 버튼 경로, cap20 applied 100회 / cap40 applied 200회 exact hard limit, favorite overlay 복구 증거 |
| `docs/research/volume-surge-baseline-v1.md` | P1 거래량 폭증 기준선 foundation — 20거래일 같은 세션/같은 시간대 누적 거래량 평균 정책, 기준선 부족 시 ratio 숨김 |
| `docs/research/araon-runtime-acceptance.md` | Araon final acceptance — always-on cap40 30.3분 관찰, SSE sample, UI render-loop fix, volume surge baseline decision |
| `src/client/components/__tests__/settings-entrypoints.test.ts` | NXT8b regression — header/statusbar settings buttons expose distinct stable automation hooks |

## 6. KIS API 운영 reference (라이브 검증된 사실)

전체는 외부 메모리 (Claude memory)에 있지만, 코덱스가 못 본다 — 핵심만 여기에 dump.

### 인증 헤더 contract (라이브-only 발견)
모든 인증 REST 요청에 다음 4개 헤더가 **함께** 가야 한다. Bearer 토큰만으로는 부족:
```
authorization: Bearer <access_token>
appkey: <APP_KEY>
appsecret: <APP_SECRET>
custtype: P              # P=개인
tr_id: <TR_ID>           # 엔드포인트별
content-type: application/json; charset=UTF-8
```
누락 시 KIS는 HTTP 500 + `"고객식별키... 유효하지 않습니다"`. **단위 테스트로 못 잡고 라이브에서만 드러남**.

회귀 방어: `src/server/kis/__tests__/kis-rest-client.headers.test.ts` (3 tests).

### 알려진 TR_ID
| 엔드포인트 | TR_ID | 비고 |
|---|---|---|
| `GET /uapi/domestic-stock/v1/quotations/inquire-price` | **`FHKST01010100`** | 실전·모의 공통. 호스트만 다름. plan 작성 시 추정한 `FHKST03010100`은 **틀림** |
| `POST /oauth2/tokenP` | (없음, body) | grant_type=client_credentials |
| `POST /oauth2/Approval` | (없음) | body 필드명 **`secretkey`** (NOT `appsecret`). `unauthenticated:true` 경로 |
| `GET /uapi/domestic-stock/v1/quotations/intstock-grouplist` | `HHKCM113004C7` | 관심종목 그룹조회 (paper 미지원 가정) |

### Approval key 라이브 응답 (NXT2b 검증)
- 단일 필드 `approval_key` (length 36)
- `code`/`message`/`expires_in`/`expiresAt`/TTL 단서 모두 **없음**
- TTL은 응답 body에 명시 0 → unknown TTL / session-scoped 운영 전제
- 결과 문서: `docs/research/nxt2b-approval-probe.md` (sha256 prefix + length만)

### Rate limit 실측 (2026-04-24 라이브)
- 공식 live: 20 req/s per app key, paper: 5 req/s
- 실효 한도는 공식보다 보수적. burst 1로 만들면 워커 line-up 때문에 오히려 throttle 악화 → 적정 burst (`= ceil(rate)`) + start pacer 조합이 베스트
- KIS retry (3회 + exp backoff)가 throttle 잘 흡수, ticker별 영구 실패율 ~0%

### WebSocket TR_ID 매트릭스 (NXT3 이후)
| 시장 | 체결가 | 호가 | 예상체결 | 장운영 |
|---|---|---|---|---|
| KRX | `H0STCNT0` | `H0STASP0` | `H0STANC0` | `H0STMKO0` |
| 통합 | `H0UNCNT0` | `H0UNASP0` | `H0UNANC0` | `H0UNMKO0` |
| NXT | `H0NXCNT0` | `H0NXASP0` | `H0NXANC0` | `H0NXMKO0` |

체결가 frame 모두 동일 46-field caret-delimited. 22번 필드 이름만 다름 (`CCLD_DVSN` for KRX vs `CNTG_CLS_CODE` for 통합/NXT) — 인덱스 기반 parser로 단일 코드 처리.

**우리 앱 권장 default: `H0UNCNT0` (통합)** — KRX+NXT 동시, 슬롯 1개로 절약. NXT 단독은 정규장 KRX 거래 누락, KRX 단독은 NXT 프리/애프터 누락.

### 운영 시간 (NXT 거래소)
- 08:00~08:50 NXT 프리마켓 (지정가만)
- 08:50~09:00 NXT 일시중단
- 09:00~15:20 정규장 (KRX+NXT 동시, SOR 통합호가)
- 15:20~15:30 KRX 종가단일가 (NXT 일시중단)
- 15:30~20:00 NXT 애프터마켓 (지정가만)

phase 변경은 `H0UNMKO0`/`H0NXMKO0`의 `MKOP_CLS_CODE`로 통지.

### NXT3 라이브 smoke 결과 (2026-04-27)
- 대상: `H0UNCNT0` / `005930` (삼성전자)
- approval key call count: 1
- WebSocket connection count: 1 (live host)
- subscribe: 1건, ack `OPSP0000`
- collected live tick frames: 2
- redacted fixture: `src/server/kis/__fixtures__/ws-tick-h0uncnt0-005930-live.redacted.json`
- report: `docs/research/nxt3-live-ws-smoke.md`
- parser validation: `src/server/kis/__tests__/kis-tick-parser.live-fixture.test.ts`
- leak guard: `src/server/kis/__tests__/probe-result-leak-guard.test.ts`
- integration guard: `priceStore.setPrice` 0회, SSE `price-update` 0회, UI 변경 0회, `websocketEnabled=false` 유지

### NXT4a mock bridge integration 결과 (2026-04-27)
- live KIS 호출: 0회
- guard 이름: `applyTicksToPriceStore`
- default: false
- priceStore apply 조건: `applyTicksToPriceStore === true` 이고 incoming tick `updatedAt`이 기존 price보다 최신일 때만
- stale 정책: 같거나 오래된 `updatedAt`은 ignore
- source metadata: WS 통합 tick은 `Price.source = 'ws-integrated'`
- SSE 연결: `PriceStore.setPrice` 성공 시 기존 `price-update` event 경로로만 발행됨. guard false / stale / parse error / apply error에서는 0회
- error isolation: WS apply error는 `RealtimeBridge`의 `apply-error` event로만 남고 polling scheduler stop으로 전파되지 않음
- 테스트: `src/server/realtime/__tests__/realtime-bridge.nxt4a.test.ts`

### NXT4b isolated live apply smoke 결과 (2026-04-27)
- 대상: `H0UNCNT0` / `005930` (삼성전자)
- approval key call count: 1
- WebSocket connection count: 1 (live host)
- subscribe: 1건, ack `OPSP0000`
- observed live tick frames: 4 (fast burst; apply/SSE는 3건으로 cap)
- probe-local `priceStore.setPrice`: 3회
- probe-local SSE `price-update`: 3회
- source metadata: `Price.source = 'ws-integrated'`
- stale/equal `updatedAt` policy: probe harness에서 통과. 4번째 observed tick은 stale/equal 정책으로 앱 상태 덮어쓰기 없음
- report: `docs/research/nxt4b-live-apply-smoke.md`
- script: `scripts/probe-kis-ws-apply-one-ticker.mts`
- integration guard: running dev/prod priceStore 0회, real SSE client 0회, UI 변경 0회, persisted settings 변경 0회, `websocketEnabled=false` 유지

### NXT5a mock favorites tier bridge 결과 (2026-04-27)
- live KIS 호출: 0회
- realtime rollout cap: oldest 3 favorites
- KIS hard cap guard: requested cap이 `WS_MAX_SUBSCRIPTIONS`를 초과해도 40으로 clamp
- realtime 후보: favorites only
- overflow favorites: `tier='polling'`으로 수락, subscribe diff 0
- non-favorites: capacity가 남아도 REST polling lane 유지
- favorite 삭제로 realtime 자리가 비면 다음 polling favorite을 승격하고 minimal diff 발행
- `/favorites` GET은 runtime tier-manager 기준으로 stale repository tier를 정규화
- `websocketEnabled=false` default 유지
- `applyTicksToPriceStore=false` default 유지
- report: `docs/research/nxt5a-mock-tier-bridge.md`
- tests: `src/server/realtime/__tests__/tier-manager.test.ts`, `src/server/routes/__tests__/favorites.test.ts`

### NXT5b limited favorites live smoke 결과 (2026-04-27)
- prerequisite audit: NXT4b commit/report/evidence true, NXT5a commit/report/evidence true
- live KIS 호출: approval key 1회
- WebSocket connection count: 1 (live host)
- target: realtime favorites 상위 3종목 (`005930`, `000660`, `042700`)
- subscribe: 3건, ACK status success (`OPSP0000`)
- live frame count: 4 (`005930` 3건, `042700` 1건, `000660` 0건)
- probe-local `priceStore.setPrice`: 3회
- probe-local SSE `price-update`: 3회
- source metadata: `Price.source = 'ws-integrated'`
- stale/equal `updatedAt` policy: probe harness에서 통과
- collection reason: `target_apply_count_reached`
- report: `docs/research/nxt5b-limited-live-smoke.md`
- script: `scripts/probe-kis-ws-favorites-smoke.mts`
- integration guard: running dev/prod priceStore 0회, real SSE client 0회, UI 변경 0회, persisted settings 변경 0회, `websocketEnabled=false` 유지, 4개 이상 종목 구독 0회

### NXT5c operator guard / rollout runbook 결과 (2026-04-27)
- live KIS 호출: 0회
- runtime apply gate: `websocketEnabled === true && applyTicksToPriceStore === true`
- defaults: `websocketEnabled=false`, `applyTicksToPriceStore=false`
- dynamic bridge gate: `canApplyTicksToPriceStore` predicate로 settings snapshot을 매 tick apply 전에 확인
- status helper: `buildRealtimeOperatorStatus()` — state/source/gates/subscriptions/reconnect/tick/error counters/approvalKey status only
- operator action: `operatorDisableRealtimeRuntime()` — bridge disconnect, active subscriptions clear는 WS client/bridge 경로에 위임. REST polling stop 호출 0회. persisted rollback 옵션이면 두 gate를 false로 저장
- auto-stop helper: auth failure/max reconnect/apply error threshold는 `disabled`, parse error rate/no tick timeout은 `degraded`, operator action은 `manual-disabled`. REST polling은 항상 계속
- runbook: `docs/runbooks/nxt-ws-rollout.md`
- tests: `src/server/realtime/__tests__/runtime-operator.nxt5c.test.ts`, `src/server/realtime/__tests__/realtime-bridge.nxt4a.test.ts`, `src/server/kis/__tests__/probe-result-leak-guard.test.ts`

### NXT6a runtime one-ticker smoke 결과 (2026-04-28)
- 1차 시도 (2026-04-27 20:30 KST 이후): 연결/구독 ACK 성공, tick 0건 (`no_live_tick_observed`)
- 재시도 실행 시각: 2026-04-28 10:36 KST
- live KIS 호출: approval key 1회
- WebSocket connection count: 1 (live host)
- target: `H0UNCNT0` / `005930`
- subscribe: 1건, ACK status success (`OPSP0000`)
- live frame count: 7
- parsed tick count: 7
- bridge applied tick count: 3
- ignored stale tick count: 4
- real `PriceStore.setPrice`: 3회
- real SSE `price-update`: 3회
- outcome: `ok`
- source metadata: `Price.source = 'ws-integrated'`
- cleanup: WS disconnected, active subscriptions 0, in-memory gates false, persisted settings unchanged
- report: `docs/research/nxt6a-runtime-one-ticker-smoke.md`
- script: `scripts/probe-kis-ws-runtime-one-ticker.mts`
- 판단: 실제 runtime 경로에서 1종목 apply 검증 완료. 다음 단계는 NXT6b favorites 상위 3종목 runtime enable

### NXT6b runtime favorites smoke 결과 (2026-04-28)
- 실행 시각: 2026-04-28 11:12 KST
- favorites count: 5
- realtime candidates: `005930`, `000660`, `042700`
- live KIS 호출: approval key 1회
- WebSocket connection count: 1 (live host)
- subscribe: 3건, ACK status success (`OPSP0000`)
- live frame count: 9 (`005930`: 5, `000660`: 4, `042700`: 0)
- parsed tick count: 9
- bridge applied tick count: 3
- ignored stale tick count: 4
- real `PriceStore.setPrice`: 3회 (`005930`: 2, `000660`: 1, `042700`: 0)
- real SSE `price-update`: 3회 (`005930`: 2, `000660`: 1, `042700`: 0)
- outcome: `ok`
- source metadata: `Price.source = 'ws-integrated'`
- cleanup: WS disconnected, active subscriptions 0, in-memory gates false, persisted settings unchanged
- report: `docs/research/nxt6b-runtime-favorites-smoke.md`
- script: `scripts/probe-kis-ws-runtime-favorites.mts`
- 판단: favorites 상위 3종목 runtime 구독/ACK 및 실제 apply 경로 검증 완료. `042700`은 구독 ACK는 성공했지만 목표 달성 전 live tick은 관찰되지 않음. 다음 단계는 NXT6c cap 5 runtime smoke

### NXT6c runtime cap5 smoke 결과 (2026-04-28)
- 실행 시각: 2026-04-28 11:21 KST
- favorites count: 5
- realtime candidates: `005930`, `000660`, `042700`, `277810`, `017510`
- live KIS 호출: approval key 1회
- WebSocket connection count: 1 (live host)
- subscribe: 5건, ACK status success (`OPSP0000`)
- live frame count: 13 (`005930`: 4, `000660`: 8, `042700`: 1, `277810`: 0, `017510`: 0)
- no_tick_by_ticker: `277810`, `017510`
- parsed tick count: 13
- bridge applied tick count: 5
- ignored stale tick count: 3
- real `PriceStore.setPrice`: 5회 (`005930`: 2, `000660`: 2, `042700`: 1, `277810`: 0, `017510`: 0)
- real SSE `price-update`: 5회 (`005930`: 2, `000660`: 2, `042700`: 1, `277810`: 0, `017510`: 0)
- outcome: `ok`
- source metadata: `Price.source = 'ws-integrated'`
- cleanup: WS disconnected, active subscriptions 0, in-memory gates false, persisted settings unchanged
- report: `docs/research/nxt6c-runtime-cap5-smoke.md`
- script: `scripts/probe-kis-ws-runtime-cap5.mts`
- 판단: favorites 상위 5종목 runtime 구독/ACK 및 실제 apply 경로 검증 완료. tick이 없던 2종목은 `no_tick_by_ticker`로 기록. 다음 단계는 NXT6d cap 10 runtime smoke

### NXT6d runtime cap10 smoke 결과 (2026-04-28)
- 실행 시각: 2026-04-28 11:33 KST
- preflight favorites count: 5 (`005930`, `000660`, `042700`, `277810`, `017510`)
- temporary favorite overlay: 사용함. tracked stocks에서 `000080`, `000100`, `000120`, `000210`, `000270`를 smoke 동안만 favorite 후보로 추가
- overlay favorites count: 10
- live KIS 호출: approval key 1회
- WebSocket connection count: 1 (live host)
- subscribe: 10건, ACK status success (`OPSP0000`)
- live frame count: 7 (`005930`: 4, `000660`: 2, `042700`: 1, 나머지 7종목: 0)
- no_tick_by_ticker: `277810`, `017510`, `000080`, `000100`, `000120`, `000210`, `000270`
- parsed tick count: 7
- bridge applied tick count: 6
- ignored stale tick count: 1
- real `PriceStore.setPrice`: 6회 (`005930`: 3, `000660`: 2, `042700`: 1)
- real SSE `price-update`: 6회 (`005930`: 3, `000660`: 2, `042700`: 1)
- outcome: `ok`
- source metadata: `Price.source = 'ws-integrated'`
- cleanup: WS disconnected, active subscriptions 0, in-memory gates false, persisted settings unchanged
- favorite restore: restored count 5, restored ticker set matches preflight snapshot, 임시 favorite 영구 잔존 0회
- report: `docs/research/nxt6d-runtime-cap10-smoke.md`
- script: `scripts/probe-kis-ws-runtime-cap10.mts`
- 판단: cap10 구독/ACK 및 실제 apply 경로 검증 완료. 모든 종목 tick 수신이 성공 기준은 아니며 tick이 없던 종목은 `no_tick_by_ticker`로 기록. 다음 단계는 NXT6e runtime rollout checklist + status panel wiring

### NXT6e runtime status/readiness wiring 결과 (2026-04-28)
- live KIS 호출: 0회
- WebSocket connect / subscribe / live frame 수집: 0회
- status endpoint: `GET /runtime/realtime/status`
- status shape: `configured`, `runtimeStatus`, `state`, `source`, `websocketEnabled`, `applyTicksToPriceStore`, `canApplyTicksToPriceStore`, subscription counts/tickers, reconnect/tick/apply/error counters, `approvalKey.status`, `approvalKey.issuedAt`
- 보안: raw approval key / appKey / appSecret / access token / account 정보 미노출. failed runtime error message는 sanitized text만 노출
- frontend wiring: header `SSEIndicator` 패널 open 시 status fetch, 15초 polling, close 시 timer 정리, 추가 EventSource 생성 없음
- readiness helper: `evaluateNxtRolloutReadiness()`는 cap10-only evidence에서 `readyForCap20=false`, `readyForCap40=false`
- runbook: `docs/runbooks/nxt-ws-rollout.md`에 1/3/5/10 smoke 검증 범위, status endpoint/panel 확인법, cap20/40 조건, rollback/leak 검사 갱신
- tests: 47 files / 412 tests pass
- typecheck/build: clean
- 판단: 운영자가 상태를 보고 확대 여부를 판단할 수 있는 read-only 계기판 준비 완료. 다음 단계는 NXT7 operator-controlled settings UI 설계 또는 별도 GO 후 NXT6f cap20 smoke

### NXT7a session-scoped operator controls 결과 (2026-04-28)
- live KIS 호출: 0회
- WebSocket connect / subscribe / live frame 수집: 0회
- backend routes:
  - `POST /runtime/realtime/session-enable`
  - `POST /runtime/realtime/session-disable`
- session-enable 정책: `confirm: true` 필수, cap은 `1`, `3`, `5`, `10`만 허용. cap20/cap40은 거부
- session gate shape: `sessionRealtimeEnabled`, `sessionApplyTicksToPriceStore`, `sessionCap`, `sessionSource`, `sessionEnabledAt`, `sessionTickers`
- apply 조건: persisted gates가 켜져 있거나, session gate가 켜져 있고 incoming ticker가 selected realtime favorites 후보에 포함될 때만 priceStore/SSE 반영 가능
- candidates: tier-manager favorites만 사용. no favorites면 `no_candidates` 반환, non-favorite 임의 편입 없음
- frontend wiring: `SettingsModal` 연결 탭에 “통합 실시간 시세 / 실험 기능 / 이 세션에서만 켜기” control 추가. confirmation checkbox 없이는 enable 호출하지 않음
- status panel: `SSEIndicator`에 session gate/cap 표시 추가
- persisted settings: `settingsStore.save` 호출 0회 테스트로 고정. `websocketEnabled=false`, `applyTicksToPriceStore=false` default 유지
- 보안: raw approval key / appKey / appSecret / access token / account 정보 미노출. operator error는 sanitized text만 표시
- runbook: `docs/runbooks/nxt-ws-rollout.md`에 session routes, cap 정책, session disable/rollback 절차 갱신
- tests: 48 files / 425 tests pass
- typecheck/build: clean
- 판단: 운영자가 UI에서 세션 한정으로 켜고 끄는 제어면은 구현 완료. 실제 버튼 클릭 live smoke는 NXT7b에서 별도 GO 후 진행

### NXT7b UI session live smoke 결과 (2026-04-28)
- live KIS 호출: approval key 총 2회 (cap 1 session enable 1회, cap 3 session enable 1회)
- WebSocket connection count: 총 2회 (cap 1, cap 3 각각 1회)
- UI automation: in-app browser로 SettingsModal 연결 탭 사용. route-level fallback 사용 0회
- dev proxy fix: Vite dev client가 `/runtime/*`을 Fastify로 proxy하지 않아 status JSON 대신 HTML을 받던 문제를 `vite.config.ts`에서 수정
- cap 1 target: `005930`
- cap 1 subscribe: 1건, subscribedTickerCount 1
- cap 1 live counters: parsed 89 / applied 49 / ignored stale 40, parse/apply error 0
- cap 1 판단: Settings 버튼 → session-enable route → runtime WS → PriceStore/SSE → SSEIndicator status panel 경로 확인 완료. 단, 시장 tick이 빠르게 몰려 1~3건 목표보다 많은 update가 들어왔으므로 NXT7c에서 UI smoke timebox/자동 해제 polish 필요
- cap 3 optional target: `005930`, `000660`, `042700`
- cap 3 subscribe: 3건, connected/subscribed 상태 확인. 짧은 20초 관찰 창에서는 신규 tick 0건 (`no_tick_by_ticker`: 세 종목)
- cleanup: session-disable 버튼 사용, active subscriptions 0, `sessionRealtimeEnabled=false`, `websocketEnabled=false`, `applyTicksToPriceStore=false`, persisted settings 변경 0회
- status panel: WS runtime `manual-disabled`, source `integrated`, gate off, parsed/applied/ignored 89/49/40 표시 확인
- report: `docs/research/nxt7b-ui-session-live-smoke.md`
- 판단: 실제 UI 버튼 경로의 cap 1 runtime apply는 검증 완료. cap 3은 optional subscribe/status evidence이며 apply-volume 검증은 아님. cap20/cap40은 여전히 미검증

### NXT7c session safeguards 결과 (2026-04-28)
- live KIS 호출: 0회
- WebSocket connect / subscribe / live frame 수집: 0회
- session default limit: `maxSessionMs=60000`
- maxSessionMs safe range: `10000` to `300000`
- cap별 tick limit:
  - cap 1: applied 5 / parsed 100
  - cap 3: applied 15 / parsed 300
  - cap 5: applied 25 / parsed 500
  - cap 10: applied 50 / parsed 1000
- limit cleanup: time/applied/parsed limit 도달 시 session gate false, realtime bridge disconnect, active subscriptions 정리 경로 사용
- 보존: REST polling stop 0회, SSE 연결 유지, 기존 priceStore 값 삭제 없음, persisted settings 변경 0회
- status shape: 기존 flattened session fields 유지 + nested `session` object 추가 (`maxSessionMs`, `expiresAt`, `maxAppliedTicks`, `maxParsedTicks`, `parsedTickDelta`, `appliedTickDelta`, `endReason`)
- UI: SettingsModal에 60초/tick 제한, 검증 범위, 20/40 미검증, H0UNCNT0 기반 문구 추가. 활성 세션 중 enable 버튼/cap 선택 잠금, disable 표시, 종료 사유/최근 tick/limit 표시
- status panel: active session 중 5초 polling, inactive 15초 polling, EventSource 추가 생성 0회
- report: `docs/research/nxt7c-session-safeguards.md`
- 판단: NXT7b에서 관찰된 tick burst에 대한 UI/runtime 안전장치 구현 완료. 다음 live 검증은 NXT7d에서 cap 1/3 세션 제한 작동 확인

### NXT7d UI session limit live smoke 결과 (2026-04-28)
- live KIS 호출: approval key 총 3회
  - 첫 cap 1 discovery 1회: session cleanup은 성공했지만 runtime bridge default가 `H0STCNT0`여서 integrated evidence로 제외
  - 수정 후 cap 1 valid rerun 1회
  - cap 3 optional session 1회
- WebSocket connection count: 총 3회
- UI automation: in-app browser로 SettingsModal 연결 탭 사용. route-level fallback 사용 0회
- 발견/수정: `RealtimeBridge` 기본 tick TR_ID가 `H0STCNT0`로 남아 있어 runtime UI session이 KRX feed를 사용하던 문제를 발견. `KIS_WS_TICK_TR_ID_INTEGRATED = 'H0UNCNT0'` 상수와 default regression test 추가
- cap 1 valid target: `H0UNCNT0` / `005930`
- cap 1 valid counters: parsed 53 / applied 20 / ignored stale 33, parse/apply error 0
- cap 1 endReason: `applied_tick_limit_reached`
- cap 3 optional target: `005930`, `000660`, `042700`
- cap 3 subscribedTickerCount: 3
- cap 3 live frame delta: 0 (`no_tick_by_ticker`: 세 종목)
- cap 3 endReason: `time_limit_reached`
- cleanup: active subscriptions 0, `sessionRealtimeEnabled=false`, `websocketEnabled=false`, `applyTicksToPriceStore=false`, persisted settings 변경 0회
- REST polling: smoke 전/중/후 계속 동작
- report: `docs/research/nxt7d-ui-session-limit-live-smoke.md`
- 판단: UI session limit은 실제 live 경로에서 작동했지만, cap 1 `maxAppliedTicks=5` 대비 실제 applied 20으로 status polling 기반 cleanup 지연이 확인됨. 다음은 확대가 아니라 NXT7e apply-path hard limit 보강

### NXT7e apply-path session hard limit 결과 (2026-04-28)
- live KIS 호출: 0회
- WebSocket connect / subscribe / live frame 수집: 0회
- root cause: NXT7c limit cleanup은 status polling/timer 경로에서 `disconnectAll()`을 호출했기 때문에, 같은 WS frame 또는 빠른 burst 안의 tick들이 cleanup 전에 `priceStore.setPrice`를 여러 번 통과할 수 있었음
- hard limit 위치:
  - `RealtimeBridge.applyPrice()` 직전 `getApplyDisabledReason(ticker, stats)` 검사
  - successful apply 직후 `onPriceApplied(price, stats)`로 exact limit 도달 시 session gate false
  - runtime bootstrap에서 session limit 도달 시 즉시 `sessionGate.disable(reason)` 후 비동기 bridge `stopSession()` cleanup 요청
- exact behavior:
  - cap 1 `maxAppliedTicks=5`이면 같은 multi-tick frame에서도 `priceStore.setPrice` 최대 5회
  - limit 이후 tick은 `sessionLimitIgnoredCount`로 분리 집계
  - `maxParsedTicks`/`maxSessionMs` 도달 후 추가 apply 차단
  - 첫 `sessionEndReason`은 후속 `operator_disabled` 등으로 덮어쓰지 않음
  - session cleanup은 bridge message listener를 제거하지 않아서 다음 session-enable에서 같은 runtime bridge 재사용 가능
- status shape 보강:
  - top-level `sessionLimitIgnoredCount`
  - nested `session.parsedTickCountAtSessionStart`
  - nested `session.appliedTickCountAtSessionStart`
  - nested `session.sessionParsedTickCount`
  - nested `session.sessionAppliedTickCount`
  - nested `session.sessionLimitIgnoredCount`
- UI:
  - SettingsModal 문구를 “통합 실시간 시세는 실험 기능입니다”, “REST 폴링은 계속 유지됩니다”, “세션은 시간 또는 tick 제한에 도달하면 자동으로 정리됩니다”로 명확화
  - SettingsModal/SSEIndicator가 `적용 current/max`, `수신 current/max`, 한국어 종료 사유를 표시
- docs:
  - `docs/research/nxt7d-ui-session-limit-live-smoke.md`에 NXT7e 후속 hardening section 추가
  - `docs/runbooks/nxt-ws-rollout.md`에 apply-path hard limit/status fields/runbook 조건 반영
- tests: `npm test` 48 files / 443 tests pass
- typecheck/build: clean
- 판단: 다음 live 단계는 cap 확대가 아니라 NXT7f cap 1 UI 재검증. 목표는 NXT7e hard limit이 live UI 버튼 경로에서 정확히 5회 이하로 멈추는지 확인

### NXT7f cap 1 hard-limit UI live smoke 결과 (2026-04-28)
- live KIS 호출: approval key 1회
- WebSocket connection count: 1회
- UI automation: in-app browser로 SettingsModal 연결 탭 사용. route-level fallback 사용 0회
- target: `H0UNCNT0` / `005930`
- cap: 1 only. cap 3/5/10/20/40 시도 0회
- observed live tick frames: 7
- parsed ticks: 17 (`005930` 17)
- runtime applied count / `PriceStore.setPrice`: 5
- stale/equal ignored: 10
- session-limit ignored: 2
- endReason: `applied_tick_limit_reached`
- hard-limit verdict: PASS. cap 1 `maxAppliedTicks=5`에서 `sessionAppliedTickCount=5`, overshoot 0
- cleanup: active subscriptions 0, `sessionRealtimeEnabled=false`, `websocketEnabled=false`, `applyTicksToPriceStore=false`, persisted settings 변경 0회
- REST polling: smoke 전/중/후 계속 동작. 이후 cycle 105/105 success, errorCount 0
- report: `docs/research/nxt7f-cap1-hard-limit-live-smoke.md`
- 판단: NXT7d의 applied limit overshoot는 NXT7e hard limit 이후 재현되지 않음. 다음 live 검증은 cap 확대가 아니라 NXT7g cap 3 hard-limit UI 재검증이 적절함

### NXT7g cap 3 hard-limit UI live smoke 결과 (2026-04-28)
- live KIS 호출: approval key 1회
- WebSocket connection count: 1회
- UI automation: in-app browser로 SettingsModal 연결 탭 사용. route-level fallback 사용 0회
- target: `H0UNCNT0` / `005930`, `000660`, `042700`
- cap: 3 only. cap 5/10/20/40 시도 0회
- observed live tick frames: 15 total (`005930` 7, `000660` 5, `042700` 3)
- parsed ticks: 44 total (`005930` 28, `000660` 11, `042700` 5)
- runtime applied count / `PriceStore.setPrice`: 15
- stale/equal ignored: 27
- session-limit ignored: 2
- endReason: `applied_tick_limit_reached`
- hard-limit verdict: PASS. cap 3 `maxAppliedTicks=15`에서 `sessionAppliedTickCount=15`, overshoot 0
- cleanup: active subscriptions 0, `sessionRealtimeEnabled=false`, `websocketEnabled=false`, `applyTicksToPriceStore=false`, persisted settings 변경 0회
- REST polling: smoke 전/중/후 계속 동작. 이후 cycle 105/105 success, errorCount 0
- report: `docs/research/nxt7g-cap3-hard-limit-live-smoke.md`
- 판단: cap 3 UI live hard-limit도 green. 다음은 PM 결정에 따라 NXT7h UI polish 또는 cap 5 hard-limit UI 재검증

### NXT7h cap 5 hard-limit UI live smoke 결과 (2026-04-28)
- live KIS 호출: approval key 1회
- WebSocket connection count: 1회
- UI automation: in-app browser로 SettingsModal 연결 탭 사용. route-level fallback 사용 0회
- target: `H0UNCNT0` / `005930`, `000660`, `042700`, `277810`, `017510`
- cap: 5 only. cap 10/20/40 시도 0회
- observed live tick frames: 25 total (`005930` 11, `000660` 8, `042700` 5, `277810` 1, `017510` 0)
- parsed ticks: 58 total
- runtime applied count / `PriceStore.setPrice`: 25
- stale/equal ignored: 33
- session-limit ignored: 0
- endReason: `applied_tick_limit_reached`
- hard-limit verdict: PASS. cap 5 `maxAppliedTicks=25`에서 `sessionAppliedTickCount=25`, overshoot 0
- cleanup: active subscriptions 0, `sessionRealtimeEnabled=false`, `websocketEnabled=false`, `applyTicksToPriceStore=false`, persisted settings 변경 0회
- REST polling: smoke 전/중/후 계속 동작
- report: `docs/research/nxt7h-cap5-hard-limit-live-smoke.md`
- 판단: cap 1/3/5 UI live hard-limit가 모두 green. 다음은 cap 10 확대 전 NXT7i operator UI/status polish

### NXT7i operator UI polish 결과 (2026-04-28)
- live KIS 호출: 0회
- WebSocket connect / subscribe / live frame 수집: 0회
- SettingsModal copy: 실험 기능, 세션 한정, REST polling 유지, 시간/tick 제한 자동 정리, H0UNCNT0 기반 안내를 명확화
- cap labels: 1/3/5종목은 “검증됨”, 10종목은 “다음 검증 예정”, 20/40종목은 route/UI 모두 미지원/미검증
- status display: 현재 상태, source `integrated`, cap, subscribed count, recent tick, applied/parsed progress, 한국어 종료 사유 표시
- status refresh: panel open 시만 fetch, active 5초/inactive 15초 cadence, close 시 timer 정리, EventSource 추가 생성 없음
- report: `docs/research/nxt7i-ui-polish.md`
- 판단: operator가 UI에서 현재 실시간 세션 상태와 종료 사유를 이해할 수 있는 표시 정리 완료. 다음 live 검증은 NXT8a cap 10 hard-limit

### NXT8a cap 10 hard-limit live smoke 결과 (2026-04-28)
- live KIS 호출: approval key 1회
- WebSocket connection count: 1회
- UI automation: in-app browser에서 SettingsModal open 실패로 route-level fallback 사용
- preflight favorites count: 5
- temporary favorite overlay: 사용함. tracked stocks에서 5개를 smoke 동안만 favorite 후보로 추가
- target count: 10
- session counters: parsed 124 / applied 50 / stale 73 / session-limit ignored 1
- endReason: `applied_tick_limit_reached`
- hard-limit verdict: PASS. cap 10 `maxAppliedTicks=50`에서 `sessionAppliedTickCount=50`, overshoot 0
- cleanup: active subscriptions 0, `sessionRealtimeEnabled=false`, `websocketEnabled=false`, `applyTicksToPriceStore=false`, persisted settings 변경 0회
- favorite restore: restored count 5, restored ticker set matches preflight snapshot, 임시 favorite 영구 잔존 0회
- report: `docs/research/nxt8a-cap10-hard-limit-live-smoke.md`
- 판단: cap10 backend/session hard-limit는 green. 단, SettingsModal UI 버튼 직접 경로는 NXT8b에서 별도 확인 필요

### NXT8b cap 10 UI button smoke 결과 (2026-04-28)
- live KIS 호출: approval key 1회
- WebSocket connection count: 1회
- UI automation: in-app browser로 SettingsModal 연결 탭 사용. route-level fallback 사용 0회
- NXT8a UI failure root cause:
  - header/footer에 `aria-label="설정 열기"`가 중복되어 automation selector가 불안정했음
  - footer `StatusBar` settings button은 `onOpenSettings`가 연결되지 않아 visible no-op button이었음
- 수정:
  - `App`이 `StatusBar`에 `onOpenSettings`를 전달
  - Header/StatusBar/SettingsModal/SSEIndicator에 stable `data-testid` hooks 추가
  - header/footer settings entrypoint regression test 추가
- non-live UI regression: SettingsModal open, connection tab, cap10 selection, confirmation 전 enable disabled, confirmation 후 enable enabled, cap20/40 option absent 확인
- preflight favorites count: 5 (`005930`, `000660`, `042700`, `277810`, `017510`)
- temporary favorite overlay: 사용함. tracked stocks에서 `000080`, `000100`, `000120`, `000210`, `000270`를 smoke 동안만 favorite 후보로 추가
- target: `005930`, `000660`, `042700`, `277810`, `017510`, `000080`, `000100`, `000120`, `000210`, `000270`
- session status: UI button click 후 `connected`, `sessionRealtimeEnabled=true`, `subscribedTickerCount=10`, `approvalKey.status=ready`
- live tick result: 60초 동안 parsed 0 / applied 0 / stale 0 / session-limit ignored 0
- endReason: `time_limit_reached`
- hard-limit verdict: PARTIAL. UI button path와 cap10 status panel은 확인됐지만 live tick이 없어 `maxAppliedTicks=50` hard-limit 자체는 미검증
- status panel: SettingsModal과 SSEIndicator에서 cap10, source 통합, session progress 0/50, endReason “시간 제한 도달”, REST polling 유지 문구 확인
- cleanup: active subscriptions 0, `sessionRealtimeEnabled=false`, `websocketEnabled=false`, `applyTicksToPriceStore=false`, persisted settings 변경 0회
- favorite restore: restored count 5, restored ticker set matches preflight snapshot, 임시 favorite 영구 잔존 0회
- report: `docs/research/nxt8b-cap10-ui-button-live-smoke.md`
- 판단: NXT8b는 UI 버튼 경로/상태 패널 검증은 green, cap10 UI hard-limit live tick 검증은 retry-needed. cap20/40은 여전히 미승인

### NXT8c cap 10 UI hard-limit retry 결과 (2026-04-28)
- 실행 시각: 2026-04-28 15:43~15:44 KST
- 장 상태/context: KRX 정규장은 종료. NXT 애프터마켓 구간 가능성은 있으나 종목별 체결 빈도 낮을 수 있음
- live KIS 호출: approval key 1회
- WebSocket connection count: 1회
- UI automation: in-app browser로 SettingsModal 연결 탭 사용. route-level fallback 사용 0회
- preflight favorites count: 5 (`005930`, `000660`, `042700`, `277810`, `017510`)
- active 후보 선정 기준: latest `price_snapshots.volume` desc among tracked non-favorites
- temporary favorite overlay: 사용함. tracked stocks에서 `018880`, `009830`, `006360`, `028050`, `010140`를 smoke 동안만 favorite 후보로 추가
- target: `005930`, `000660`, `042700`, `277810`, `017510`, `018880`, `009830`, `006360`, `028050`, `010140`
- session status: UI button click 후 `connected`, `sessionRealtimeEnabled=true`, `subscribedTickerCount=10`, `approvalKey.status=ready`
- live tick result: 60초 동안 parsed 0 / applied 0 / stale 0 / session-limit ignored 0
- endReason: `time_limit_reached`
- hard-limit verdict: PARTIAL. UI button path와 cap10 status panel은 재확인됐지만 live tick이 없어 `maxAppliedTicks=50` hard-limit 자체는 여전히 미검증
- status panel: SettingsModal과 SSEIndicator에서 cap10, source 통합, session progress 0/50, endReason “시간 제한 도달”, REST polling 유지 문구 확인
- cleanup: active subscriptions 0, `sessionRealtimeEnabled=false`, `websocketEnabled=false`, `applyTicksToPriceStore=false`, persisted settings 변경 0회
- favorite restore: restored count 5, restored ticker set matches preflight snapshot, 임시 favorite 영구 잔존 0회
- report: `docs/research/nxt8c-cap10-ui-hard-limit-retry.md`
- 판단: NXT8c도 no-tick partial. cap10 backend hard-limit는 NXT8a green, cap10 UI path/status는 NXT8b/NXT8c green, cap10 UI hard-limit live tick burst는 시장 유동성 조건부 미검증. cap20/40은 여전히 미승인

### NXT8d operator UX/readiness 정리 결과 (2026-04-28)
- live KIS 호출: 0회
- WebSocket connect / subscribe / live frame 수집: 0회
- UI: SettingsModal cap label이 `최대 10종목 · 조건부`로 변경. 문구는 “버튼 경로와 세션 제한 구조는 검증됐지만, 최근 두 번의 UI live 재검증에서 체결 tick이 없어 live burst 제한은 유동성 조건부”라고 명시
- UI: SSEIndicator에 `10종목 상태: 버튼 확인 · 유동성 조건부` 표시 추가
- readiness helper: `cap1Ready=true`, `cap3Ready=true`, `cap5Ready=true`, `cap10RouteReady=true`, `cap10UiPathReady=true`, `cap10UiHardLimitReady=false`, `cap10UiHardLimitConditional=true`
- readiness warning: `cap10_ui_hard_limit_live_burst_not_observed`
- blockers: `cap20_not_verified`, `cap40_not_verified`
- report: `docs/research/nxt8d-rollout-readiness-summary.md`
- 판단: 사용자에게 보여도 오해가 적은 상태로 정리 완료. 다음 live 후보는 NXT8e cap10 UI hard-limit 재시도(유동성 높은 시간대, UI 버튼 경로만). cap20/40은 별도 설계/승인 전 금지

### NXT8e cap 10 UI hard-limit live smoke 결과 (2026-04-29)
- 실행 시각: 2026-04-29 09:14 KST, KRX 장중
- UI 경로: SettingsModal 버튼 경로 사용. route-level fallback 0회
- in-app Browser backend unavailable로 Playwright CLI가 실제 브라우저 UI를 조작
- preflight favorites count: 5
- smoke-only overlay: tracked stocks `018880`, `009830`, `006360`, `028050`, `010140` 추가
- target tickers: `005930`, `000660`, `042700`, `277810`, `017510`, `018880`, `009830`, `006360`, `028050`, `010140`
- live KIS 호출: approval key 1회
- WebSocket connection count: 1
- TR_ID: `H0UNCNT0`
- subscribe: 최대 10종목 세션 후보
- session parsed tick count: 179
- session applied tick count: 50 / 50
- ignored stale/equal tick count: 129
- sessionLimitIgnoredCount: 0
- endReason: `applied_tick_limit_reached`
- hard-limit verdict: PASS. cap10 UI live burst에서도 51번째 apply는 발생하지 않음
- status panel: `현재 상태=제한 도달`, `세션 진행=적용 50/50`, `종료 사유=적용 tick 제한 도달` 표시 확인
- cleanup: active subscriptions 0, gates false, persisted settings 변경 0회
- favorite restore: original 5개 ticker set과 정확히 일치
- REST polling 영향: cleanup 이후 105 succeeded / 0 failures cycle 확인
- report: `docs/research/nxt8e-cap10-ui-hard-limit-live-smoke.md`
- 판단: cap10 UI button path + live hard-limit까지 green. 당시 cap20/40은 미검증/미승인 상태였으나, 이후 NXT final push에서 검증 완료

### NXT9a cap20 readiness preview 결과 (2026-04-29)
- live KIS 호출: 0회
- WebSocket connect / subscribe / live frame 수집: 0회
- cap20 route/UI enable: 당시 금지. 이후 NXT final push에서 cap20/40이 session-scoped operator caps로 허용됨
- readiness helper 당시 상태: `verifiedCaps=[1,3,5,10]`, `nextCandidateCap=20`, `cap20Readiness.status=not_ready`, `cap40Readiness.status=not_ready`
- cap20 blockers: `cap20_live_smoke_not_performed`, `operator_approval_required`
- cap20 warnings: `requires_liquid_market_window`, `do_not_enable_outside_explicit_live_smoke`
- cap20 session limit 설계값: maxAppliedTicks 100, maxParsedTicks 2000, maxSessionMs 90000. 이후 실제 session-enable에서 허용됨
- cap20 preview: `previewRealtimeCandidates()`가 favorites만 사용해 requested/effective cap, candidateCount, shortage, tickers를 반환. non-favorite은 capacity가 남아도 WS 후보가 아님
- status endpoint: `GET /runtime/realtime/status`가 `readiness.cap20Readiness`, `readiness.cap20Preview`, `readiness.cap40Readiness`를 credential-safe shape로 반환
- UI: 당시 SettingsModal과 SSEIndicator가 cap20을 `준비 중`으로 표시. 이후 NXT final push에서 cap20/40 선택지가 노출되고 검증됨
- report: `docs/research/nxt9a-cap20-readiness.md`
- 판단: pre-live readiness checkpoint. 최종 상태는 아래 NXT final push 결과를 따른다

### NXT final push cap20/cap40 controlled smoke 결과 (2026-04-29)
- SettingsModal UI 버튼 경로 사용: 예. route-level fallback 0회
- cap20 target: 20개 favorite 후보(smoke-only overlay 15개 포함)
- cap20 result: parsed 252 / applied 100 / stale 151 / session-limit ignored 1 / `endReason=applied_tick_limit_reached`
- cap20 hard-limit verdict: PASS. 101번째 apply 없음
- cap40 target: 40개 favorite 후보(smoke-only overlay 35개 포함)
- cap40 result: parsed 528 / applied 200 / stale 328 / session-limit ignored 0 / `endReason=applied_tick_limit_reached`
- cap40 hard-limit verdict: PASS. 201번째 apply 없음, 41개 이상 구독 0회
- UI: SettingsModal cap labels가 1/3/5/10/20/40 모두 `검증됨`
- status endpoint: `verifiedCaps=[1,3,5,10,20,40]`, `cap20Readiness.status=verified`, `cap40Readiness.status=verified`, blockers 없음
- cleanup: active subscriptions 0, gates false, `session.enabled=false`
- favorite restore: original 5개 ticker set과 정확히 일치
- persisted settings 변경: 0회
- REST polling 영향: cleanup 이후 polling cycle 계속 동작
- report: `docs/research/nxt9-cap20-cap40-live-smoke.md`
- 판단: cap40까지 controlled, session-scoped UI smoke는 검증 완료. 이후 NXT always-on promotion에서 이 사용자 로컬 persisted 운영 설정은 `websocketEnabled=true`, `applyTicksToPriceStore=true`로 전환됐으며 REST polling fallback은 유지. Fresh install 코드 기본값은 false/false

### KIS daily backfill live probe 결과 (2026-05-05)
- 실행 시각: 2026-05-05 21:35 KST, 장후 20:05 이후
- harness: 전체 서버 listen/auto-start 없이 `stockRoutes`만 route-level `app.inject`로 등록
- target: `005930`, `interval=1d`, `range=1m`
- live KIS daily chart REST 호출: 최종 성공 run 1회. 최초 run도 KIS 200을 받았으나 로컬 SQLite alias 버그로 저장 전 실패해 총 daily chart 호출은 2회
- token issuance: 0회, 기존 persisted token 재사용
- WebSocket connection / cap smoke / background queue: 0회
- 저장 결과: `source=kis-daily`, 20개 inserted, `2026-04-05T15:00:00.000Z`~`2026-05-03T15:00:00.000Z`
- chart API 확인: `GET /stocks/005930/candles?interval=1D&range=3m&limit=20000` → items 20, `coverage.backfilled=true`, `localOnly=false`, `sourceMix=["kis-daily"]`, `status.state=ready`
- local bug fix: `PriceCandleRepository.countExistingCandles()`의 `SELECT 1 AS exists`가 SQLite에서 syntax error를 내서 alias를 `existing`으로 변경하고 regression test 추가
- report: `docs/research/kis-daily-backfill-live-probe.md`
- 판단: manual daily historical backfill MVP는 단일 종목 live-probe verified. full watchlist/background/minute historical backfill은 미검증 후속

### Candle chart UI acceptance 결과 (2026-05-06)
- 대상: `005930` StockDetailModal `차트` 탭, local dashboard `http://127.0.0.1:5173/`
- preflight DB: `source=kis-daily` 20개 daily candle, `2026-04-05T15:00:00.000Z`~`2026-05-03T15:00:00.000Z`
- API 확인: `1D&range=1m` → 20 items, `coverage.backfilled=true`, `sourceMix=["kis-daily"]`, `status.state=ready`; `1W&range=3m` → 5 items; `1M&range=1y` → 2 items
- UI 확인: 새로고침 후 005930 모달에서 `차트` → `1D` 선택 시 `1D · 1m`, 20 candles 표시. `1W · 3m` 5 candles, `1M · 1y` 2 candles 표시
- UI 보정: daily 계열 봉을 선택했을 때 range가 너무 짧으면 `1D→1m`, `1W→3m`, `1M→1y`로 자동 확장
- cleanup 확인: 모달 close 후 chart host/canvas 0개, interval 전환 후 console error/warning 0
- 추가 KIS historical call / WebSocket session / cap smoke / background queue: 0회
- report: `docs/research/candle-chart-ui-acceptance.md`
- 판단: chart/backfill MVP는 단일 종목 live-probe + 제품 화면 표시까지 verified. 이후 daily background backfill은 tracked/favorites 대상 managed default로 승격됐고, full master/minute historical backfill은 계속 HOLD

## 7. 더 깊은 핸드오프 dump

이 프로젝트의 전체 작업 히스토리, 보안 패턴 상세, NXT3 시작 가이드는 다음 wiki 페이지에 dump:

```
/Users/stello/llm_memory/Claude Valut/wiki/entities/korean-stock-follower-nxt2b-codex-handoff-2026-04-27.md
```

본 AGENTS.md는 그 페이지의 짧은 entry point다.

## 8. 사용자 선호

- 한국어 응답 (필수)
- **비개발자**. 일상 비유 먼저, 기술 용어는 괄호 병기.
- 진행 사항을 짧고 명확하게 보고.
- 라이브 호출이나 destructive action은 명시적 GO 신호 후만.

## 9. 작업 시작 전 체크리스트

- [ ] `git status` — 미커밋 더미 점검 (`.omc/sessions/`, `data/`는 무시 대상)
- [ ] `git log --oneline -5` — HEAD 확인
- [ ] `npm test` — 현재 baseline 확인
- [ ] 본 AGENTS.md + `wiki/entities/korean-stock-follower-nxt2b-codex-handoff-2026-04-27.md` 읽기
- [ ] 다음 작업은 managed defaults와 no-credentials external-call 0회 보장을 함께 유지하는 것이다. Explicit persisted false는 emergency disable 의도로 존중한다.
