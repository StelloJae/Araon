# Araon 장중 공유용 캡처 예약

Araon은 장중에 가장 설득력 있는 화면이 나옵니다. 이 예약 작업은 평일
KST 기준으로 Chrome을 잠깐 열어 실제 로컬 Araon 화면을 캡처하고,
공유 후보 이미지를 `~/Pictures/Araon Live Captures`에 저장합니다.

## 캡처 시간

| KST | 목적 |
| --- | --- |
| 08:02 | 장전 대시보드와 준비 상태 |
| 09:03 | 장중 시작 직후 LIVE 화면 |
| 09:10 | 최근 급상승 감시 후 캡처 |
| 15:35 | 장후 데이터 정리 상태 |

`09:10` 작업은 최근 급상승이 바로 없으면 최대 30분 동안 기다립니다. 조건이
끝까지 나오지 않으면 대시보드 fallback을 저장합니다. 급상승을 가짜로 만들지
않습니다.

## 설치

```bash
npm run capture:install-schedule
```

설치 후 launchd label:

```text
io.github.stellojae.araon.live-capture
```

출력 위치:

```text
~/Pictures/Araon Live Captures/YYYY-MM-DD/<phase>/
```

로그:

```text
~/Library/Logs/Araon/live-capture.out.log
~/Library/Logs/Araon/live-capture.err.log
```

## 수동 실행

```bash
npm run capture:live-assets -- --phase manual --out "$HOME/Pictures/Araon Live Captures"
```

영상 없이 빠르게 확인하려면:

```bash
npm run capture:live-assets -- --phase manual --no-video
```

## 제거

```bash
node scripts/install-araon-live-capture-launchd.mjs --uninstall
```

## 전제

- Araon 서버와 프론트엔드가 `http://127.0.0.1:5173/`에서 열려 있어야 합니다.
- Chrome이 설치되어 있어야 합니다.
- `ffmpeg`가 있으면 MP4/GIF도 같이 생성됩니다.
- credentials, token, account number가 화면에 보이는 상태에서는 공유하지 마세요.

## README에 반영할 때

예약 결과물은 바로 repo에 커밋하지 않습니다. 좋은 장면만 골라서
`docs/assets/screenshots/` 또는 `docs/assets/demo/`로 복사한 뒤 README에
반영하세요.
