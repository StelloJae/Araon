# KIS OpenAPI 키 발급 가이드

이 가이드는 선택 사항입니다. Araon은 이제 Toss-first 시장 데이터로 시작할 수
있고, KIS credential 없이도 기본 대시보드를 사용할 수 있습니다. KIS OpenAPI는
한국 주식 저지연 WebSocket realtime rail을 켜고 싶을 때만 설정하세요.

선택적 KIS rail은 한국투자증권 KIS OpenAPI의 **실전투자 앱키와 앱시크릿**을
사용합니다. Araon 자체에는 주문, 매매, 자동매매 실행 기능이 없지만, KIS OpenAPI
credential은 개인 키이므로 공개 저장소, 이슈, 채팅방에 올리지 않는 것이
안전합니다.

공식 사이트:

- [KIS Developers](https://apiportal.koreainvestment.com/)
- [KIS API 서비스 목록](https://apiportal.koreainvestment.com/apiservice-apiservice)

포털 화면은 바뀔 수 있습니다. 아래 단계와 메뉴명이 다르면 포털 검색창에서
`API신청`, `서비스 신청`, `Open API`를 검색하세요.

## 준비물

- 한국투자증권 계정
- KIS Developers 로그인
- 실전투자 OpenAPI 신청

Araon은 KIS 설정 화면에서 모의투자 선택을 노출하지 않습니다. 모의투자
credential은 호출 제한과 endpoint 동작이 달라 실제 모니터링 경험과 어긋날 수
있기 때문입니다.

## 발급 순서

1. [KIS Developers](https://apiportal.koreainvestment.com/)에 로그인합니다.
2. 상단 또는 검색창에서 `API신청` 또는 `서비스 신청`을 찾습니다.
3. 실전투자 OpenAPI 서비스를 신청합니다.
4. 신청 완료 후 발급된 `App Key`와 `App Secret`을 확인합니다.
5. Araon Settings의 connection 화면에서 선택적 KIS realtime rail을 켤 때 두 값을
   입력합니다.

Araon에 입력한 값은 선택한 로컬 data directory의 `credentials.enc`에 암호화되어
저장됩니다. 소스코드, `.env`, README, GitHub issue에는 넣지 마세요.

## Araon에서 필요한 범위

Araon은 관찰용 대시보드입니다. Toss가 시장 데이터와 계좌 기반 read-only surface의
기본 경로이고, KIS는 선택적 realtime acceleration rail입니다.

- 통합 WebSocket 실시간 시세
- 일부 fallback 메타데이터/차트 경로
- KIS 기반 보조 관심종목 가져오기

Araon은 주문 API를 호출하지 않습니다.

## 첫 연결 후 확인할 것

1. 대시보드가 열리는지 확인합니다.
2. 검색창에서 종목명이나 종목코드를 입력해 관심종목을 추가합니다.
3. 장중이면 상단 상태가 `LIVE` 또는 실시간 대기 상태로 표시되는지 봅니다.
4. 종목을 클릭해 차트와 뉴스/공시 패널을 확인합니다.
5. Settings에서 data health와 비상정지 버튼 위치를 확인합니다.

## 문제가 생기면

- `앱키 또는 앱시크릿이 올바르지 않습니다`  
  KIS 포털에서 실전투자 앱키/앱시크릿을 다시 확인하세요.

- `KIS 토큰 발급이 일시 제한되었습니다`  
  잠시 기다린 뒤 다시 시도하세요. 토큰 발급과 API 호출에는 KIS 측 제한이 있습니다.

- 장중인데 실시간 tick이 적음  
  종목 유동성, 프리마켓/애프터마켓, KIS WebSocket 상태에 따라 조용할 수 있습니다.
  기본 fallback은 Toss REST refresh입니다. KIS REST polling fallback은
  `ARAON_KIS_POLLING_FALLBACK_ENABLED=1`을 명시한 경우에만 열립니다.

- 차트가 비어 있음  
  새로 추가한 종목은 저장된 candle이 아직 없을 수 있습니다. 장중에는 선택 종목의
  오늘 분봉부터 보강되고, 일봉은 장외 시간에 보강됩니다.
