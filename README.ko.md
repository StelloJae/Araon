# 아라온 Araon

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.png">
    <img src="public/logo.png" alt="Araon logo" width="96" height="96">
  </picture>
</p>

<p align="center">
  거래는 폰에서, 관찰은 옆 모니터에서.
</p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="INSTALL.md">설치 가이드</a>
  ·
  <a href="https://github.com/StelloJae/Araon/releases/tag/v1.2.0">v1.2.0 릴리스</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-339933">
  <img alt="npm" src="https://img.shields.io/badge/npm-v1.2.0-111827">
</p>

아라온은 한국 주식 투자자가 옆 모니터에 켜두는 개인용 관찰
대시보드입니다. 내 컴퓨터에서 실행하고, Toss 우선 시장 데이터와 선택적 Toss
QR 로그인을 사용해 관심종목, 보유종목, 차트, 움직임, 뉴스, 공시, 에이전트
후보를 한 화면에 정리합니다.

증권사 앱이나 HTS를 대체하려는 도구는 아닙니다. 주문, 매매, 계좌 조작,
자동매매 기능은 제공하지 않습니다. 실제 거래는 기존에 쓰는 증권사 환경에서
하고, 아라온은 옆에서 시장 흐름과 판단 재료를 정리해주는 역할에 집중합니다.

## 화면 미리보기

![Araon dashboard](docs/assets/screenshots/araon-dashboard.png)

![Araon stock chart](docs/assets/screenshots/araon-stock-chart.png)

[짧은 데모 영상 보기](docs/assets/demo/araon-flow.mp4)

## 이런 사람에게 맞습니다

- 폰이나 증권사 앱으로 거래하고, 별도 화면에는 관찰용 대시보드를 켜두고 싶은 사람
- 관심종목의 빠른 움직임, 차트, 뉴스, 공시, 알림을 한 곳에서 보고 싶은 사람
- Toss 계정의 보유/관심 흐름을 읽기 전용으로 함께 보고 싶은 사람
- 주문 기능 없는 로컬 도구를 선호하는 사람

## 주요 기능

아라온은 관심종목을 중심으로 “지금 봐야 할 정보”를 모읍니다.

- Toss public quote, search, TOP100/movers, chart candle을 기본 시장 데이터 경로로 사용
- 선택적 Toss QR 로그인으로 계좌 요약, 포트폴리오, watchlist, 주문/거래 내역,
  현금 개요, 인증 기반 알림 trigger를 읽기 전용으로 표시
- Toss watchlist와 보유종목을 중심으로 즐겨찾기 화면 구성
- 선택적 KIS WebSocket 실시간 추적 rail. KIS credentials가 있을 때만 최대
  40개 우선순위 한국 종목에 사용
- 장중 가격 움직임, 로컬 candle/history, compact sparkline
- Toss-first 일봉/선택 분봉 candle backfill과 live quote overlay 기반 차트
- 제품 아이콘, 계좌 rail hover, row click chart 전환
- 뉴스와 공시 링크, 선택적 Naver Search / OpenDART 보강
- 에이전트 후보 감지, 모의 미리보기, 리스크/감사 context, 명시적 실거래 잠금
- 로컬 알림, 데스크톱 알림, 소리 알림, 선택적 Telegram 알림

데이터는 내 컴퓨터에 저장됩니다. 처음 설치한 상태에서는 KIS credentials 없이도
Toss-first 대시보드를 사용할 수 있습니다. Toss 계좌 화면은 사용자가 직접 QR
로그인을 완료하기 전까지 잠겨 있습니다.

## 처음 5분

```txt
1. npx @stellojae/araon@latest 실행
2. localhost 화면 열기
3. 검색창에서 첫 종목 추가
4. 필요하면 Settings에서 Toss QR 로그인 완료
5. 더 낮은 지연의 40-slot 실시간 추적이 필요하면 KIS credentials 추가
```

KIS 실시간 추적 rail이 필요하다면
[KIS OpenAPI 키 발급 가이드](docs/guides/kis-openapi-setup.ko.md)를 보세요.
KIS 키가 없어도 Toss-first 대시보드는 사용할 수 있습니다.

## 설치

필요한 것은 Node.js 20 이상입니다.

가장 간단한 실행 방법:

```bash
npx @stellojae/araon@latest
```

아라온이 로컬 서버를 실행하고 `http://127.0.0.1:<port>` 주소를 보여줍니다.
가능하면 브라우저도 자동으로 엽니다.

자주 사용할 예정이라면 전역 설치도 괜찮습니다.

```bash
npm install -g @stellojae/araon@latest
araon
```

처음 실행한 상태에서도 brokerage credentials 없이 동작할 수 있습니다. Toss
public market data가 watchlist, search, chart, mover 화면의 기본 경로입니다.
Settings에서 Toss QR 로그인을 완료하면 계좌/포트폴리오/watchlist/주문/거래
내역을 읽기 전용으로 볼 수 있습니다. KIS credentials는 선택 사항이며, 낮은
지연의 한국 종목 실시간 추적 rail이 필요할 때만 추가합니다.

## 기본 사용 흐름

1. `npx @stellojae/araon@latest`를 실행합니다.
2. 브라우저가 자동으로 열리지 않으면 터미널에 나온 localhost 주소를 엽니다.
3. 검색으로 종목을 추가합니다.
4. 자주 보는 종목은 별표로 표시합니다.
5. Toss 계정 화면이 필요하면 QR 로그인을 완료합니다.
6. KIS 실시간 추적이 필요할 때만 KIS credentials를 추가합니다.
7. 장중에는 아라온을 켜둔 채로 모니터링합니다.

아라온의 기본 모니터링 흐름은 Toss-first입니다.

- Toss quote refresh가 기본 가격 갱신 경로입니다.
- Toss SSE 알림은 Toss session이 있을 때 refresh trigger로 사용됩니다.
- 실시간 알림이 조용할 때도 REST refresh가 유지됩니다.
- daily candle backfill은 guarded Toss-first chart path를 사용합니다.
- KIS WebSocket slot은 선택적 KIS credentials가 있을 때만 사용됩니다.

문제가 있거나 잠시 멈추고 싶다면 Settings에서 실시간 추적이나 backfill을
일시정지할 수 있습니다.

## 선택 연동

아래 값들은 없어도 됩니다. 뉴스, 공시, 폰 알림을 더 쓰고 싶을 때만 `.env`에
넣으면 됩니다.

```bash
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
DART_API_KEY=
ARAON_TELEGRAM_BOT_TOKEN=
ARAON_TELEGRAM_CHAT_ID=
```

- Naver Search는 종목 뉴스 결과를 보강합니다.
- OpenDART는 공시 feed 매칭을 보강합니다.
- Telegram은 선택한 알림을 휴대폰으로 보내줍니다.

아라온은 뉴스와 공시의 제목, 시간, snippet, 링크를 저장합니다. 기사 본문
전체를 저장하거나 뉴스 요약을 만들지는 않습니다.

## 공유하거나 소개할 때

아라온을 다른 사람에게 보여줄 때는 기능 목록보다 “거래는 기존 앱에서, 관찰은
아라온에서”라는 사용 장면을 먼저 보여주는 편이 좋습니다. 스크린샷을 준비한다면
[공유용 체크리스트](docs/guides/share-araon.ko.md)를 참고하세요.

## 데이터 저장 위치

아라온은 로컬 도구입니다. 실행 중 생기는 파일은 내 컴퓨터에 저장됩니다.

CLI 데이터 디렉터리 우선순위:

```txt
1. --data-dir
2. ARAON_DATA_DIR
3. 운영체제 기본 user-data 디렉터리
```

기본 위치:

```txt
macOS:   ~/Library/Application Support/Araon
Windows: %APPDATA%/Araon
Linux:   ~/.local/share/araon
```

소스코드로 개발할 때는 보통 `data/` 아래에 저장됩니다.

`.env`, `data/`, `credentials.enc`, SQLite DB, Toss session material, KIS
credentials, access token, approval key, 계좌/주문 식별자는 커밋하거나 공유하지
마세요.

## 데스크톱 앱

GitHub Release에는 desktop 파일도 올라가 있습니다.

- `Araon-1.2.0-arm64.dmg`
- `Araon-1.2.0-arm64-mac.zip`
- `Araon-Setup-1.2.0-x64.exe`
- `Araon-1.2.0-x64-portable.exe`

다만 현재 desktop 빌드는 공개 배포용 Apple 서명과 notarization이 되어 있지
않습니다. macOS에서 Gatekeeper 경고가 나올 수 있습니다. 지금은 npm/CLI로
실행하는 방식이 가장 안정적입니다.

## 자주 쓰는 명령

```bash
araon                                      # 아라온 시작, built UI serve, 브라우저 열기
araon --no-open                            # 브라우저 자동 열기 끄기
araon --port 3910                          # 원하는 포트 사용
araon --data-dir ~/Araon                   # 데이터 저장 위치 지정
araon doctor --no-live                     # 설치, build, data dir, session 상태 점검
araon status                               # 마지막으로 실행한 local URL/runtime 상태 보기
araon open                                 # 마지막으로 실행한 local UI 열기
araon reset --session                      # Toss session/cache 상태만 초기화
araon reset --data --confirm DELETE_LOCAL_ARAON_DATA
```

`doctor`는 local/no-live 점검이며 Toss, KIS, Naver, OpenDART를 호출하지
않습니다. `reset --data`는 선택된 로컬 Araon 데이터 디렉터리를 삭제하므로 위의
확인 문자열이 필요합니다. 종료하려면 아라온을 실행한 터미널에서 `Ctrl+C`를
누르면 됩니다.

## 개발자용

```bash
git clone https://github.com/StelloJae/Araon.git
cd Araon
npm install
cp .env.example .env
```

첫 번째 터미널에서 서버를 실행합니다.

```bash
npm run dev:server
```

두 번째 터미널에서 클라이언트를 실행합니다.

```bash
npm run dev:client
```

변경 전후 검증:

```bash
npm test
npm run typecheck
npm run build
```

## 현재 경계

- 아라온은 한 사람이 한 컴퓨터에서 쓰는 로컬 도구입니다.
- 주문이나 자동매매 기능은 없습니다.
- 에이전트 화면은 decision-support와 모의 미리보기까지만 제공합니다.
- 실거래 실행은 명시적으로 잠겨 있습니다.
- 전체 watchlist 과거 분봉 자동 backfill은 의도적으로 하지 않습니다.
- daily backfill은 장중 window에서 guarded 상태로 동작합니다.
- 거래량 급증 배수는 로컬 기준선이 충분히 쌓인 뒤에만 표시됩니다.
- Toss, KIS, Naver, OpenDART, Telegram은 각자의 quota와 정책 제한이 있을 수
  있습니다.

## 라이선스

Apache License 2.0. 자세한 내용은 [LICENSE](LICENSE)와 [NOTICE](NOTICE)를
확인하세요.
