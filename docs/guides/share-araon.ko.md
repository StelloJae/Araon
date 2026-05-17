# Araon 공유용 체크리스트

Araon을 처음 보는 사람에게는 기능 수보다 **왜 켜두는 앱인지**가 먼저 보여야
합니다.

추천 메시지:

> 거래는 폰이나 증권사 앱에서 하고, Araon은 옆 모니터에서 관심종목 흐름,
> 차트, 뉴스, 공시, 알림을 계속 정리해주는 로컬 대시보드입니다.

## 보여주면 좋은 화면

이미 준비된 캡처는 [Visual Assets](../assets/README.md)에 있습니다.

1. **대시보드 전체**
   - 관심종목
   - 최근 급상승 / 오늘 강세
   - 장전/장중/장후 상태 표시

2. **종목 상세 모달**
   - 실시간 가격 추이
   - 차트 탭
   - 데이터 품질 표시

3. **뉴스 · 공시 패널**
   - Naver 뉴스
   - DART/KIND 공시
   - 외부 링크가 아니라 feed 형태로 보이는 상태

4. **알림 설정**
   - 가격/등락률/거래량 기준 알림
   - 데스크톱/소리/Telegram 선택

5. **첫 실행 화면**
   - 읽기 전용
   - 주문/매매 없음
   - Toss 로그인 전 계좌 surface 잠금
   - KIS credentials 등록 전 외부 KIS 호출 없음

## 피하면 좋은 표현

- “자동매매”
- “수익 보장”
- “뉴스 분석”
- “실시간 완전 보장”
- “과거 분봉 무제한”

Araon은 관찰 도구입니다. 과장하지 않는 쪽이 오히려 신뢰를 줍니다.

## 짧은 소개문

```txt
Araon은 한국 주식 단타/스윙 투자자가 옆 모니터에 켜두는 로컬 관찰 대시보드입니다.
Toss 공개 데이터와 선택적 Toss QR 로그인으로 시세·차트·계좌 read-only surface,
뉴스·공시·알림을 한 화면에 정리합니다. KIS는 원하면 40개 슬롯의 저지연
한국주식 realtime 보조 rail로만 붙일 수 있습니다. 주문/매매 기능은 없고,
데이터는 내 컴퓨터에 저장됩니다.
```

## 긴 소개문

```txt
증권앱은 거래용으로 쓰고, Araon은 관찰용으로 옆에 켜두는 도구입니다.
관심종목을 추가하면 Toss-first 시세·TOP100·차트, 로컬 candle 차트,
뉴스·공시 feed, 가격/거래량 알림, 선택적 Toss 계좌 read-only surface를
한 화면에서 볼 수 있습니다.

처음 설치한 상태에서는 Toss 계좌 API나 KIS API를 임의로 호출하지 않습니다.
Toss 계좌 surface는 QR 로그인 뒤에만 열리고, KIS는 credentials를 입력한 경우
선택적 realtime rail로만 사용됩니다. 세션과 credentials는 로컬에 암호화되어
저장됩니다. Araon은 주문을 넣거나 계좌를 조작하지 않습니다.
```

## 공유 전 점검

```bash
npm test
npm run typecheck
npm run build
npm pack --dry-run --json
```

스크린샷을 찍을 때는 Toss 세션/계좌/주문 식별자, app key, app secret,
access token, approval key, account number, Telegram token, Naver/OpenDART key가
보이지 않는지 확인하세요.
