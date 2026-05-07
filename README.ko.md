# 아라온 Araon

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.png">
    <img src="public/logo.png" alt="Araon logo" width="104" height="104">
  </picture>
</p>

<p align="center">
  <strong>KIS OpenAPI로 한국 주식을 로컬에서 모니터링하는 대시보드</strong>
</p>

<p align="center">
  <a href="README.md">English README</a>
  ·
  <a href="INSTALL.md">설치 상세 가이드</a>
  ·
  <a href="https://github.com/StelloJae/Araon/releases/tag/v1.1.0">최신 릴리스</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-339933">
  <img alt="Version" src="https://img.shields.io/badge/npm-v1.1.0-111827">
</p>

아라온은 **내 컴퓨터에서만 실행되는 한국 주식 관심종목 대시보드**입니다.
실제 매매는 증권사 앱이나 HTS에서 하고, 아라온은 옆 화면에서 실시간 가격,
차트, 뉴스, 공시, 알림을 보기 좋게 정리해주는 도구입니다.

아라온은 읽기 전용입니다. 주문, 매매, 계좌 조작, 자동매매 기능은 없습니다.
투자 판단과 KIS API 사용 조건 준수는 사용자 책임입니다.

---

## 아라온으로 할 수 있는 것

- 관심종목과 즐겨찾기 종목을 한 화면에서 보기
- KIS 통합 실시간 시세로 최대 40종목 자동 모니터링
- 실시간이 조용하거나 끊겨도 REST 폴링으로 fallback 유지
- 종목 상세 모달에서 실시간 가격 추이, candle 차트, 뉴스, 공시 확인
- 당일 tick/sparkline 흐름을 재실행 후에도 이어서 보기
- 로컬 1분봉 기반 intraday 차트 보기
- KIS 일봉 기반 1D / 1W / 1M 차트 보기
- 장외 시간에 관심종목/추적종목의 과거 일봉 자동 보강
- 선택한 종목의 당일 분봉 보강
- 로컬 알림, 데스크톱 알림, 소리 알림, 선택적 Telegram 폰 알림
- 선택적 Naver Search / OpenDART 연동으로 뉴스와 공시 강화
- 모든 credentials와 데이터는 내 컴퓨터에만 저장

---

## 가장 쉬운 시작 방법

필요한 것:

- Node.js 20 이상
- npm
- KIS OpenAPI 실전 app key / app secret

터미널에서 실행:

```bash
npx @stellojae/araon
```

그러면 아라온이 로컬 서버를 실행하고, `http://127.0.0.1:<port>` 주소를
출력한 뒤 브라우저를 엽니다.

자주 쓸 거라면 전역 설치도 가능합니다:

```bash
npm install -g @stellojae/araon
araon
```

처음 실행하면 KIS 앱키 등록 화면이 나옵니다. credentials를 등록하기 전에는
아라온이 외부 KIS 호출을 하지 않습니다.

---

## 첫 실행 체크리스트

1. Node.js 20 이상을 설치합니다.
2. 터미널에서 `npx @stellojae/araon`을 실행합니다.
3. 브라우저가 자동으로 열리지 않으면 터미널에 나온 localhost 주소를 엽니다.
4. KIS OpenAPI 실전 app key와 app secret을 입력합니다.
5. 검색 또는 마스터 카탈로그에서 종목을 추가합니다.
6. 자주 보는 종목은 즐겨찾기합니다.
7. 장중에는 아라온을 켜둔 채로 모니터링합니다.

credentials 등록 후에는 아라온이 자동으로 관리합니다:

```txt
통합 실시간 시세: 켜짐
REST 폴링 fallback: 유지
과거 일봉 자동 보강: 장외 시간에 실행
```

문제가 있거나 잠시 멈추고 싶다면 Settings에서 실시간 시세 또는 일봉 보강을
일시정지할 수 있습니다.

---

## 선택 연동

아래 값들은 없어도 아라온을 사용할 수 있습니다. 추가 기능이 필요할 때만
`.env`에 설정하면 됩니다.

```bash
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
DART_API_KEY=
ARAON_TELEGRAM_BOT_TOKEN=
ARAON_TELEGRAM_CHAT_ID=
```

각 값의 역할:

- **Naver Search API**: 종목 뉴스 검색 결과를 더 풍부하게 가져옵니다.
- **OpenDART API**: 전자공시 정보를 더 잘 매핑합니다.
- **Telegram Bot**: 조건 알림을 휴대폰 Telegram으로 받습니다.

아라온은 뉴스/공시의 제목, 시간, provider snippet, 링크를 저장합니다. 기사
본문 전체를 저장하거나 뉴스 요약을 생성하지 않습니다.

---

## 내 데이터는 어디에 저장되나요?

아라온의 데이터는 내 컴퓨터에 저장됩니다.

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

소스코드 개발 모드에서는 보통 `data/` 아래에 저장됩니다.

절대 공유하거나 커밋하면 안 되는 것:

- `.env`
- `data/`
- `credentials.enc`
- SQLite DB 파일
- KIS app key / app secret
- access token / approval key

---

## 데스크톱 앱

GitHub Release에는 macOS용 desktop artifact도 포함되어 있습니다.

- `Araon-1.1.0-arm64.dmg`
- `Araon-1.1.0-arm64-mac.zip`

다만 현재 desktop 앱은 Apple Developer ID 서명과 notarization이 되어 있지
않습니다. macOS Gatekeeper 경고가 나올 수 있습니다. 대부분의 사용자는 먼저
npm/CLI 경로로 시작하는 것을 추천합니다.

---

## 자주 쓰는 명령

브라우저 자동 열기 없이 실행:

```bash
araon --no-open
```

특정 포트 사용:

```bash
araon --port 3910
```

데이터 저장 위치 지정:

```bash
araon --data-dir ~/AraonData
```

종료:

```txt
아라온을 실행한 터미널에서 Ctrl+C
```

---

## 개발자용

소스코드로 실행:

```bash
git clone https://github.com/StelloJae/Araon.git
cd Araon
npm install
cp .env.example .env
```

서버 실행:

```bash
npm run dev:server
```

다른 터미널에서 클라이언트 실행:

```bash
npm run dev:client
```

브라우저에서 열기:

```txt
http://127.0.0.1:5173
```

검증:

```bash
npm test
npm run typecheck
npm run build
```

---

## 알아두면 좋은 제한사항

- 아라온은 한 사람이 한 컴퓨터에서 쓰는 localhost 도구입니다.
- SaaS나 서버형 서비스가 아닙니다.
- 주문/매매 기능은 없습니다.
- 전체 watchlist 과거 분봉 자동 백필은 의도적으로 하지 않습니다.
- 과거 일봉 자동 보강은 장중에는 실행되지 않습니다.
- 거래량 급증 배수는 로컬 기준선이 충분히 쌓인 뒤에만 표시됩니다.
- KIS, Naver, OpenDART, Telegram은 각자의 quota, 장애, 정책 제한이 있을 수
  있습니다.

---

## 라이선스

Apache License 2.0. 자세한 내용은 [LICENSE](LICENSE)와 [NOTICE](NOTICE)를
확인하세요.
