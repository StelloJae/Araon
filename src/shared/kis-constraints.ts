/**
 * KIS OpenAPI constraints — single source of truth.
 *
 * Every number in this file is sourced from `.omc/research/kis-api-findings.md`.
 * Do NOT hardcode these values anywhere else in the codebase; reference the
 * named constants instead. When KIS publishes a change, update it here only.
 *
 * TODO markers indicate values the findings flagged as unverified against
 * official KIS documentation — confirm on first authenticated call.
 */

// === WebSocket ============================================================

/**
 * Maximum concurrent WebSocket subscriptions per session.
 *
 * Source: https://hky035.github.io/web/refact-kis-websocket/
 * Rationale: community measurement reports a per-session cap of 41
 * (체결 + 호가 + 주식체결통보 share the cap). We reserve 1 slot for
 * 주식체결통보 (H0STCNI0) or future headroom, keeping the effective cap at 40.
 * TODO: confirm the exact cap from KIS error responses on first breach.
 */
export const WS_MAX_SUBSCRIPTIONS = 40;

/**
 * Delay between successive WebSocket subscribe frames on reconnect burst.
 *
 * Source: https://wikidocs.net/170517 (KIS Python sample inspection)
 * Rationale: KIS does not document a required interval; practitioners report
 * 100ms is safe and completes a 40-ticker re-subscription in ~4s.
 */
export const WS_SUBSCRIBE_INTERVAL_MS = 100;

/**
 * Default realtime 체결가 TR_ID for the app runtime.
 *
 * NXT rollout uses the integrated KRX+NXT/SOR feed so one subscription slot can
 * cover both regular-session KRX ticks and NXT pre/after-market ticks.
 */
export const KIS_WS_TICK_TR_ID_INTEGRATED = 'H0UNCNT0';

/**
 * KIS WebSocket ping interval (server-side keepalive).
 *
 * Source: https://wikidocs.net/170517 (`ping_interval=60` in Python samples)
 * Rationale: KIS default; deviation is unnecessary.
 */
export const WS_PING_INTERVAL_MS = 60_000;

/**
 * Base delay for WebSocket reconnect exponential backoff.
 *
 * Source: https://hky035.github.io/web/refact-kis-websocket/ (practitioner pattern)
 * Rationale: start low, double on each failure, clamp to `WS_RECONNECT_MAX_MS`.
 */
export const WS_RECONNECT_BASE_MS = 1_000;

/**
 * Upper bound for WebSocket reconnect exponential backoff.
 *
 * Source: https://hky035.github.io/web/refact-kis-websocket/
 * Rationale: 30s ceiling balances recovery latency against API pressure.
 */
export const WS_RECONNECT_MAX_MS = 30_000;

// === REST =================================================================

/**
 * REST rate limit for 실전투자 (live trading) — requests per second per app key.
 *
 * Source: https://tgparkk.github.io/robotrader/2025/10/09/robotrader-1-70stocks-problem.html
 * Rationale: consistently cited across the Korean KIS developer community.
 * Enforcement is sustained per-second, not burst.
 * TODO: confirm against official KIS portal docs once authenticated — breach
 * returns error code `EGW00201` (초당 거래건수 초과).
 */
export const REST_RATE_LIMIT_PER_SEC_LIVE = 20;

/**
 * REST rate limit for 모의투자 (paper trading) — requests per second per app key.
 *
 * Source: https://tgparkk.github.io/robotrader/2025/10/09/robotrader-1-70stocks-problem.html
 * Rationale: paper is materially throttled vs live; dev iteration must assume
 * this lower ceiling unless explicitly targeting live credentials.
 * TODO: confirm against official KIS portal docs once authenticated.
 */
export const REST_RATE_LIMIT_PER_SEC_PAPER = 5;

/**
 * Multiplier applied to the raw rate limit to derive a safe effective rate.
 *
 * Source: https://hky035.github.io/web/kis-api-throttling/ (practitioner guidance)
 * Rationale: leaves headroom for clock skew and server-side measurement jitter.
 * Effective rates: live = 15 req/s, paper = 3.75 req/s.
 *
 * Live 2026-04-24 KIS throttle testing: 1/10 failure rate at
 * (ratePerSec=15, burst=15, maxInFlight=5, maxAttempts=3). Internal retries
 * in kis-rest-client smooth over these as steady-state failures mostly
 * succeed on retry with backoff.
 */
export const REST_RATE_LIMIT_SAFETY_FACTOR = 0.75;

// === Token ================================================================

/**
 * Access-token lifetime in seconds, as returned by `POST /oauth2/tokenP`.
 *
 * Source: https://wikidocs.net/159336 (shows `expires_in: 86400`)
 * Rationale: confirmed by the API response itself — KIS issues 24h tokens.
 */
export const TOKEN_TTL_SEC = 86_400;

/**
 * Lead time before expiry to trigger a proactive token refresh.
 *
 * Source: https://wikidocs.net/159336 (KIS sample recommendation)
 * Rationale: 5 minutes matches KIS guidance and Phase 1's auto-refresh cadence.
 */
export const TOKEN_REFRESH_LEADTIME_SEC = 300;

/**
 * Minimum interval between token issuance requests (KIS enforces this limit).
 *
 * Source: `.omc/research/kis-api-findings.md` §3
 * Rationale: KIS caps issuance at 1 token per minute; the credential store
 * MUST persist the active token across restarts to avoid accidental lockout.
 */
export const TOKEN_MIN_ISSUANCE_INTERVAL_MS = 60_000;

/**
 * Path for the OAuth token endpoint (relative to the KIS REST host).
 *
 * Source: https://wikidocs.net/159336
 */
export const TOKEN_ENDPOINT_PATH = '/oauth2/tokenP';

// === Hostnames ============================================================

/**
 * Live trading REST host.
 *
 * Source: https://wikidocs.net/159336
 */
export const KIS_REST_HOST_LIVE = 'https://openapi.koreainvestment.com:9443';

/**
 * Paper trading REST host.
 *
 * Source: https://wikidocs.net/159336
 * Rationale: many 시세분석 endpoints are live-only on this host — see
 * `KIS_INTSTOCK_SUPPORTED_IN_PAPER`.
 */
export const KIS_REST_HOST_PAPER = 'https://openapivts.koreainvestment.com:29443';

/**
 * Live trading WebSocket host.
 *
 * Source: `.omc/research/kis-api-findings.md` §6
 */
export const KIS_WS_HOST_LIVE = 'ws://ops.koreainvestment.com:21000';

/**
 * Paper trading WebSocket host.
 *
 * Source: `.omc/research/kis-api-findings.md` §6
 * Rationale: paper WS coverage is reduced (일부 종목 제외) — plan accordingly.
 */
export const KIS_WS_HOST_PAPER = 'ws://ops.koreainvestment.com:31000';

// === Watchlist import =====================================================

/**
 * Path for the 관심종목 그룹조회 REST endpoint.
 *
 * Source: https://apiportal.koreainvestment.com/apiservice-category (portal menu
 * under 국내주식 → 시세분석)
 * Rationale: used by Phase 3b to import the user's KIS-side watchlist groups.
 */
export const KIS_INTSTOCK_GROUPLIST_PATH =
  '/uapi/domestic-stock/v1/quotations/intstock-grouplist';

/**
 * TR_ID for the 관심종목 그룹조회 call.
 *
 * Source: `.omc/research/kis-api-findings.md` §4 (cross-referenced via
 * Soju06/python-kis and community samples)
 * TODO: confirm on first call — TR_IDs require exact casing and failure
 * returns a distinct error we can capture in the logs.
 */
export const KIS_INTSTOCK_GROUPLIST_TR_ID = 'HHKCM113004C7';

/**
 * Whether 관심종목 그룹조회 is available on 모의투자.
 *
 * Source: `.omc/research/kis-api-findings.md` §4
 * Rationale: many 시세분석 endpoints are live-only; conservative assumption
 * pending verification. Phase 3b falls back to the Phase 3a CSV path if false.
 * TODO: flip to true once verified against a live paper credential.
 */
export const KIS_INTSTOCK_SUPPORTED_IN_PAPER = false;
