# AGENTS.md — Araon

이 파일은 이 저장소에서 작업하는 AI 에이전트가 먼저 읽는 프로젝트 규칙이다.
역사적 검증 기록은 `docs/archive/`에 보관되어 있고, 여기에는 현재 개발에 필요한
운영 원칙과 주요 진입점만 둔다.

## 프로젝트 요약

Araon은 localhost 단일 사용자용 한국 주식 watchlist 대시보드다.

- Runtime: Node 20, Fastify 5, React 19, Vite
- Data source: KIS OpenAPI
- Realtime: KIS credentials 등록 후 장중 H0UNCNT0, 장전/장후 H0NXCNT0 WebSocket cap40 managed default
- Fallback: REST polling 유지
- Chart: local 1m candle, KIS daily 1d candle, 서버 집계 3m~12h/1W/1M
- Packaging: CLI/npm and Electron desktop

Clean install + no credentials 상태에서는 외부 KIS 호출이 없어야 한다.

## 절대 규칙

### Secrets

다음 값은 logs, docs, fixtures, stdout, git diff 어디에도 원문으로 남기지 않는다.

- `appKey`
- `appSecret`
- access token
- approval key
- account number
- Telegram token/chat id
- Naver/OpenDART API secret

Credentials/data/runtime state는 커밋하지 않는다.

### Financial Data

합성 금융 데이터를 만들지 않는다.

- 모르는 값은 비워두거나 "수집 중"으로 표시한다.
- chart는 저장된 candle만 표시한다.
- 데이터가 없으면 synthetic candle이나 가짜 과거 차트를 만들지 않는다.
- raw tick 영구 저장은 별도 승인 전까지 금지한다.

### Backfill

- Daily backfill은 credentials 등록 후 managed default다.
- 대상은 tracked/favorites 범위로 제한한다.
- 장중 backfill guard와 rate/cooldown/budget guard를 유지한다.
- full master backfill은 금지한다.
- automatic historical minute backfill은 금지한다.
- selected ticker minute backfill은 선택 종목 단위로만 다룬다.

### Runtime

- REST polling fallback은 유지한다.
- Realtime emergency disable 경로를 제거하지 않는다.
- Clean no-credentials startup에서 master refresh, token, approval, WebSocket, backfill
  호출이 발생하면 회귀다.
- Public status/API/UI에 raw secret이 노출되면 회귀다.
- KIS REST 호출은 가능한 한 전역 outbound governor를 통과시키고 `endpointClass`를
  명시한다. Foreground도 governor를 우회하지 않는다.
- `EGW00201` / "초당 거래건수 초과"는 second-window throttle로 다룬다. 단순
  고정 cooldown으로 치환하지 말고 canary recovery, backoff, start spacing,
  circuit breaker 정책을 유지한다.
- Governor queue에서는 foreground가 background/ranking/master refresh보다 먼저
  나가야 하지만, token/start spacing/max in-flight 제한은 계속 지킨다.
- KIS AIMD는 polling policy override만 조정한다. 자동 판단은 polling gap에
  제한하고, recovery rps는 명시 실험값으로만 바꾼다. Active AIMD는 명시 승인된
  목표나 운영 절차에서만 켜고, 문제 시 `/runtime/kis-governor/aimd` rollback으로
  baseline 상태로 되돌린다.
- live KIS stress test나 의도적인 throttle 유도는 사용자의 명시 승인 없이 금지한다.

## 주요 명령

```bash
npm test
npm run typecheck
npm run build
npm run build:desktop
npm run dist:mac
```

개발 서버:

```bash
npm run dev:server
npm run dev:client
```

CLI smoke:

```bash
node dist/cli/araon.js --help
node dist/cli/araon.js --version
```

No-live soak:

```bash
npm run soak:no-live
```

## 주요 코드 위치

| Path | Role |
|---|---|
| `src/server/index.ts` | Fastify server bootstrap |
| `src/server/bootstrap-kis.ts` | KIS runtime state machine |
| `src/server/credential-store.ts` | encrypted credential storage |
| `src/server/kis/` | KIS REST/WS/auth/parser clients |
| `src/server/realtime/` | realtime bridge, operator state, tiering |
| `src/server/chart/` | daily/minute backfill policy and services |
| `src/server/price/` | price store and candle aggregation |
| `src/server/routes/` | Fastify routes |
| `src/client/components/` | React UI components |
| `src/server/db/migrations/` | SQLite migrations packaged with npm |
| `scripts/internal/probes/` | historical live-probe scripts, not normal user flow |
| `scripts/internal/soak/` | no-live soak harness |
| `docs/runbooks/` | operational runbooks |
| `docs/archive/` | historical beta/research/acceptance evidence |

## Public Repo Hygiene

- Keep README/INSTALL user-facing and concise.
- Put internal acceptance reports under `docs/archive/`.
- Put live probe scripts under `scripts/internal/`.
- Do not add generated release assets, screenshots, local DBs, logs, or credentials.
- `package.json` `files` must stay narrow; archive/probe materials should not ship in npm.

## Verification Before Commit

For code changes, run at least:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

For release/package changes, also run:

```bash
npm pack --dry-run --json
```

For security-sensitive changes, run a tracked-file secret grep before committing.
