# NXT/통합 실시간 시세 — KIS OpenAPI 1차 spike 리포트

**조사일**: 2026-04-27
**상태**: 문서화만 완료, 구현은 후속 트랙
**관련 트랙**: 본 spike는 코드 변경 없음. KIS WebSocket API 활용 가능성을 다음 단계 결정용으로 정리.

## 0. 한 줄 요약
한국 주식 "프리마켓"은 KRX가 아니라 **NXT(Korea Next Trade, 2025년 3월 출범)** 거래소이며, KIS OpenAPI에는 **KRX/통합/NXT 실시간체결가/호가/장운영정보 endpoint가 모두 존재**한다. 우리 앱은 현재 REST `inquire-price` (KRX 기준) polling만 하므로 NXT 프리(08:00~08:50)·애프터(15:30~20:00) 가격이 보이지 않는다. 권장 default는 **`H0UNCNT0` (통합)**.

## 1. WebSocket approval key

**발급**
- 실전 `POST https://openapi.koreainvestment.com:9443/oauth2/Approval`
- 모의 `POST https://openapivts.koreainvestment.com:29443/oauth2/Approval`
- body: `{ grant_type: 'client_credentials', appkey, secretkey }`
- 응답: `{ approval_key, code, message }`

**TTL**: 공식 명시 없음. 커뮤니티 경험상 WebSocket 세션 수명과 동일. 세션 단절 후 재발급 필요. REST access token(24h)과는 별개. → 라이브 검증 필요.

## 2. TR_ID 매트릭스

| 시장 | 체결가 | 호가 | 예상체결 | 장운영 |
|---|---|---|---|---|
| KRX | `H0STCNT0` | `H0STASP0` | `H0STANC0` | `H0STMKO0` |
| 통합 | `H0UNCNT0` | `H0UNASP0` | `H0UNANC0` | `H0UNMKO0` |
| NXT | `H0NXCNT0` | `H0NXASP0` | `H0NXANC0` | `H0NXMKO0` |

체결통보(KRX 전용): 실전 `H0STCNI0` / 모의 `H0STCNI9`.

## 3. 구독 payload

KRX/통합/NXT **모두 동일**. TR_ID만 바꿔주면 됨.

```json
{
  "header": {
    "approval_key": "<approval_key>",
    "custtype": "P",
    "tr_type": "1",
    "content-type": "utf-8"
  },
  "body": {
    "input": {
      "tr_id": "H0UNCNT0",
      "tr_key": "005930"
    }
  }
}
```

`tr_type`: `"1"` = 등록, `"0"` = 해제.

## 4. Frame payload field layout

수신 frame 최상위: `0|<TR_ID>|<반복건수>|<caret-delimited-data>`

체결가 frame: KRX/통합/NXT 모두 **46개 필드 동일 순서**. 다른 점은 **22번 필드 이름 하나뿐** (`CCLD_DVSN` for KRX vs `CNTG_CLS_CODE` for 통합/NXT). → 인덱스 기반 parser면 단일 코드로 처리 가능.

호가 frame `H0NXASP0`: 65개 필드. KRX 호가 대비 **NXT/KRX 중간가 필드 6개 추가**: `KMID_PRC`/`KMID_TOTAL_RSQN`/`KMID_CLS_CODE`/`NMID_PRC`/`NMID_TOTAL_RSQN`/`NMID_CLS_CODE`.

장운영 frame: 통합/NXT 모두 `EXCH_CLS_CODE` 필드를 가지므로 통합 stream에서 어느 거래소 이벤트인지 구분 가능.

## 5. 운영 시간

| 구간 | 시간 | 비고 |
|---|---|---|
| NXT 프리마켓 | 08:00~08:50 | 지정가만, 예상체결가 미표출 |
| NXT 일시중단 | 08:50~09:00 | KRX 시가 형성 보호 |
| 정규장 (KRX+NXT 동시, SOR) | 09:00~15:20 | 통합호가 작동 |
| KRX 종가단일가 | 15:20~15:30 | NXT 일시중단 |
| NXT 애프터마켓 | 15:30~20:00 | 지정가만 |

→ NXT 단일 stream(`H0NXCNT0`)으로 프리/정규/애프터 모두 수신, 구분은 `HOUR_CLS_CODE` 필드. 일시중단 등 phase 변경은 `H0NXMKO0`의 `MKOP_CLS_CODE`로 통지받음.

## 6. "통합" vs "NXT" — 토스/카카오페이가 보는 게 어느 쪽

KIS MTS 주문 화면이 KRX/NXT/**통합(SOR)** 세 버튼을 두고 통합이 기본값. 토스증권·카카오페이증권 모두 NXT 참여 증권사이고, 두 앱 모두 **SOR 기반 통합호가**를 기본으로 표시 → 사실상 `H0UNCNT0` 데이터.

**우리 앱 권장 default: `H0UNCNT0`**
- KRX만 → NXT 프리·애프터 누락
- NXT만 → KRX 정규장 체결량 누락
- 통합 → 양쪽 다 받고 슬롯도 1개

## 7. 우리 앱 적용 시 미해결 위험

- approval_key 캐싱 정책 미확정 → 라이브 검증 필요
- KRX/NXT 구독 시 슬롯 한도 (이전 조사 ~41개). 통합 1개로 처리하면 슬롯 절반 절약
- frame 22번 필드 이름이 KRX vs 통합/NXT에서 다름 → 인덱스 기반 parser로 통일 가능
- REST `inquire-price`는 KRX 가격 → WS 통합 stream과 가격이 다를 수 있음. Tier 정책 재검토 필요
- 라이선스: KIS OpenAPI 약관에 NXT 데이터 별도 제한 조항 미확인. 개인/localhost 한정 사용은 OK 추정 → KIS 고객센터 확인 권장

## 8. 다음 단계 권고 — Build 단계적

**Phase 1 (1~2일)**: `kisTickParser`를 `H0UNCNT0` 기준으로 슬림 작성. 사용 필드만 추출 (종목코드 / 현재가 / 전일대비율 / 누적거래량 / 체결시간 / 거래정지 여부). 22번 필드는 인덱스로 통일. KRX fixture 단위 테스트 + 통합 fixture 동일 구조 확인.

**Phase 2 (3~5일)**: WebSocket 활성화. `H0UNCNT0` 구독. approval key 발급을 기존 REST token 발급 직후 붙임. 슬롯 한도 내 watchlist 상위 종목 구독.

**Phase 3 (선택, 1~2일)**: `H0NXMKO0` 장운영정보 구독 → 08:50~09:00 일시중단 / 15:20~15:30 종가단일가 구간을 UI 뱃지로 표시.

**Wait 판단**: REST polling만으로 핵심 기능이 충분하면 WS는 후속. 단, NXT 프리마켓(08:00~08:50)이 필요하다면 WS가 필수.

## 참고 소스

- [KIS open-trading-api GitHub (`koreainvestment/open-trading-api`)](https://github.com/koreainvestment/open-trading-api) — `examples_llm/domestic_stock/ccnl_*` / `asking_price_*` / `market_status_*`
- [KIS Developers 포털](https://apiportal.koreainvestment.com/apiservice-apiservice)
- [KRX 실시간체결가 (H0STCNT0) 문서](https://apiportal.koreainvestment.com/apiservice-apiservice?%2Ftryitout%2FH0STCNT0=)
- [금융위 NXT 승인 보도자료](https://www.fsc.go.kr/eng/pr010101/83967)
- [KIS 블로그 NXT 안내](https://blog.koreainvestment.com/nxt-%EB%8C%80%EC%B2%B4%EA%B1%B0%EB%9E%98%EC%86%8C-%EC%A2%85%EB%AA%A9-800%EA%B0%9C-%EA%B1%B0%EB%9E%98%EC%8B%9C%EA%B0%84-%ED%98%B8%EA%B0%80%EB%B0%A9%EC%8B%9D-%EC%88%98%EC%88%98%EB%A3%8C/)
