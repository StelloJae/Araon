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
  <a href="https://github.com/StelloJae/Araon/releases/tag/v1.1.0">v1.1.0 릴리스</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-339933">
  <img alt="npm" src="https://img.shields.io/badge/npm-v1.1.0-111827">
</p>

아라온은 한국 주식 단타/스윙 투자자가 옆 모니터에 켜두는 개인용 관찰
대시보드입니다. 내 컴퓨터에서 실행하고, 내 KIS OpenAPI 키로 연결하며, 장중에
계속 보고 싶은 종목들을 한 곳에 모아 보여줍니다.

증권사 앱이나 HTS를 대체하려는 도구는 아닙니다. 주문, 매매, 계좌 조작,
자동매매 기능은 없습니다. 실제 거래는 기존에 쓰는 증권사 환경에서 하고,
아라온은 옆에서 가격 흐름과 관련 정보를 정리해주는 역할에 집중합니다.

## 이런 사람에게 맞습니다

- 폰이나 증권사 앱으로 거래하고, 별도 화면에는 관찰용 대시보드를 켜두고 싶은 사람
- 관심종목의 실시간 움직임, 차트, 뉴스, 공시, 알림을 한 곳에서 보고 싶은 사람
- KIS OpenAPI를 쓰되, 클라우드 계정 없이 로컬에 데이터를 쌓고 싶은 사람
- 주문 기능 없는 읽기 전용 도구를 선호하는 사람

## 주요 기능

아라온은 관심종목을 중심으로 “지금 봐야 할 정보”를 모읍니다.

- 최대 40종목 KIS 통합 실시간 시세
- 실시간이 조용하거나 끊길 때를 위한 REST 폴링 fallback
- 당일 가격 흐름과 로컬 candle 저장
- KIS 일봉 기반 1D, 1W, 1M 차트
- 선택 종목의 당일 분봉 보강
- 뉴스와 공시 링크, 선택적 Naver Search / OpenDART 연동
- 로컬 알림, 데스크톱 알림, 소리 알림, 선택적 Telegram 알림
- 데이터가 제대로 쌓이고 있는지 확인하는 data health 화면

데이터는 내 컴퓨터에 저장됩니다. 처음 설치한 상태에서는 KIS credentials를
입력하기 전까지 외부 KIS 호출을 하지 않습니다.

## 처음 5분

```txt
1. npx @stellojae/araon 실행
2. localhost 화면 열기
3. KIS 앱키와 앱시크릿 등록
4. 검색창에서 첫 관심종목 추가
5. 종목을 눌러 실시간/차트/뉴스/공시 확인
```

KIS 키가 아직 없다면 [KIS OpenAPI 키 발급 가이드](docs/guides/kis-openapi-setup.ko.md)를
먼저 보세요.

## 설치

필요한 것은 Node.js 20 이상입니다.

가장 간단한 실행 방법:

```bash
npx @stellojae/araon
```

아라온이 로컬 서버를 실행하고 `http://127.0.0.1:<port>` 주소를 보여줍니다.
가능하면 브라우저도 자동으로 엽니다.

자주 사용할 예정이라면 전역 설치도 괜찮습니다.

```bash
npm install -g @stellojae/araon
araon
```

처음 실행하면 KIS OpenAPI app key와 app secret을 입력하는 화면이 나옵니다.
credentials가 저장되기 전에는 실시간 시세, REST 폴링, 마스터 갱신, 백필이
시작되지 않습니다.

## 기본 사용 흐름

1. `npx @stellojae/araon`을 실행합니다.
2. 브라우저가 자동으로 열리지 않으면 터미널에 나온 localhost 주소를 엽니다.
3. KIS OpenAPI credentials를 입력합니다.
4. 검색으로 종목을 추가합니다.
5. 자주 보는 종목은 즐겨찾기합니다.
6. 장중에는 아라온을 켜둔 채로 모니터링합니다.

credentials 등록 후에는 기본 모니터링 흐름을 아라온이 관리합니다.

- 통합 실시간 시세가 켜집니다.
- REST 폴링 fallback은 계속 유지됩니다.
- 과거 일봉 보강은 장외 시간에 실행됩니다.

문제가 있거나 잠시 멈추고 싶다면 Settings에서 실시간 시세나 일봉 보강을
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

`.env`, `data/`, `credentials.enc`, SQLite DB, KIS app key, app secret, access
token, approval key는 커밋하거나 공유하지 마세요.

## 데스크톱 앱

GitHub Release에는 macOS용 desktop 파일도 올라가 있습니다.

- `Araon-1.1.0-arm64.dmg`
- `Araon-1.1.0-arm64-mac.zip`

다만 현재 desktop 빌드는 공개 배포용 Apple 서명과 notarization이 되어 있지
않습니다. macOS에서 Gatekeeper 경고가 나올 수 있습니다. 지금은 npm/CLI로
실행하는 방식이 가장 안정적입니다.

## 자주 쓰는 명령

```bash
araon --no-open          # 브라우저를 자동으로 열지 않기
araon --port 3910        # 원하는 포트 사용
araon --data-dir ~/Araon # 데이터 저장 위치 지정
```

종료하려면 아라온을 실행한 터미널에서 `Ctrl+C`를 누르면 됩니다.

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
- 전체 watchlist 과거 분봉 자동 백필은 의도적으로 하지 않습니다.
- 과거 일봉 보강은 장중에는 실행되지 않습니다.
- 거래량 급증 배수는 로컬 기준선이 충분히 쌓인 뒤에만 표시됩니다.
- KIS, Naver, OpenDART, Telegram은 각자의 quota와 정책 제한이 있을 수
  있습니다.

## 라이선스

Apache License 2.0. 자세한 내용은 [LICENSE](LICENSE)와 [NOTICE](NOTICE)를
확인하세요.
