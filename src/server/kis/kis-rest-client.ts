/**
 * Thin REST wrapper for the KIS OpenAPI.
 *
 * Scope is intentionally narrow:
 *   - Resolve the correct host (live vs paper) from credentials.
 *   - Attach the bearer access token (via the injected `KisAuth`) on
 *     non-token calls.
 *   - Retry idempotent failures with exponential backoff (3 attempts).
 *   - Map KIS-specific error envelopes into typed errors.
 *
 * Rate limiting lives in Phase 4a's dedicated layer and is NOT implemented
 * here. The token call intentionally bypasses the bearer header since the
 * point of the call is to mint that token.
 */

import { URL } from 'node:url';

import {
  KIS_REST_HOST_LIVE,
  KIS_REST_HOST_PAPER,
  TOKEN_ENDPOINT_PATH,
} from '@shared/kis-constraints.js';
import { createChildLogger } from '@shared/logger.js';

import type { KisAuth, KisTokenTransport } from './kis-auth.js';

const log = createChildLogger('kis-rest');

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 250;
const DEFAULT_BACKOFF_MAX_MS = 4_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export type KisHttpMethod = 'GET' | 'POST' | 'DELETE';

export interface KisRestRequest {
  method: KisHttpMethod;
  path: string;
  trId?: string;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip bearer-token attachment — used by the token-issuance path itself. */
  unauthenticated?: boolean;
}

/**
 * Structured error envelope raised by the client when KIS returns a 4xx/5xx
 * or a non-zero `rt_cd`. Preserves the raw KIS codes so upper layers can
 * branch on specific failure modes (e.g. `EGW00201` for rate-limit).
 */
export class KisRestError extends Error {
  readonly status: number;
  readonly rtCd: string | null;
  readonly msgCd: string | null;
  readonly payload: unknown;
  constructor(
    message: string,
    status: number,
    rtCd: string | null,
    msgCd: string | null,
    payload: unknown,
  ) {
    super(message);
    this.name = 'KisRestError';
    this.status = status;
    this.rtCd = rtCd;
    this.msgCd = msgCd;
    this.payload = payload;
  }
}

export interface KisRestClientOptions {
  /**
   * `true` selects the paper host, `false` selects the live host (see
   * `KIS_REST_HOST_LIVE` / `KIS_REST_HOST_PAPER` in kis-constraints).
   * Passed in so the client does not re-read the credential store — auth
   * already did that.
   */
  isPaper: boolean;
  /** Auth manager — optional only because the token-issuance path reuses the client. */
  auth?: KisAuth;
  /** Injected `fetch` for tests; defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  maxAttempts?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Per-request timeout (hard abort via AbortController). Default 10_000ms. */
  requestTimeoutMs?: number;
}

export interface KisRestClient extends KisTokenTransport {
  request<T>(req: KisRestRequest): Promise<T>;
}

function buildUrl(
  host: string,
  path: string,
  query: Record<string, string | number | boolean> | undefined,
): string {
  const url = new URL(path, host);
  if (query !== undefined) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function extractErrorCodes(payload: unknown): {
  rtCd: string | null;
  msgCd: string | null;
  msg: string | null;
} {
  if (typeof payload !== 'object' || payload === null) {
    return { rtCd: null, msgCd: null, msg: null };
  }
  const rec = payload as Record<string, unknown>;
  const rtCd = typeof rec['rt_cd'] === 'string' ? rec['rt_cd'] : null;
  const msgCd = typeof rec['msg_cd'] === 'string' ? rec['msg_cd'] : null;
  const msg = typeof rec['msg1'] === 'string' ? rec['msg1'] : null;
  return { rtCd, msgCd, msg };
}

export function createKisRestClient(
  options: KisRestClientOptions,
): KisRestClient {
  const host = options.isPaper ? KIS_REST_HOST_PAPER : KIS_REST_HOST_LIVE;
  const fetchImpl = options.fetchFn ?? fetch;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const backoffMaxMs = options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  async function performOnce<T>(req: KisRestRequest): Promise<T> {
    const url = buildUrl(host, req.path, req.query);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=UTF-8',
      ...(req.headers ?? {}),
    };
    if (req.trId !== undefined) {
      headers['tr_id'] = req.trId;
    }
    if (req.unauthenticated !== true) {
      if (options.auth === undefined) {
        throw new Error(
          'authenticated KIS request requires a KisAuth instance on the client',
        );
      }
      // KIS OpenAPI requires `appkey`, `appsecret`, `custtype` headers on
      // every authenticated REST call in addition to the Bearer token —
      // the OAuth token alone is insufficient for quote/trade endpoints.
      const [token, creds] = await Promise.all([
        options.auth.getAccessToken(),
        options.auth.getCredentials(),
      ]);
      headers['authorization'] = `Bearer ${token}`;
      headers['appkey'] = creds.appKey;
      headers['appsecret'] = creds.appSecret;
      if (headers['custtype'] === undefined) {
        headers['custtype'] = 'P';  // P = personal (individual). Override via req.headers if needed.
      }
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), requestTimeoutMs);
    const init: RequestInit = {
      method: req.method,
      headers,
      signal: controller.signal,
    };
    if (req.body !== undefined) {
      init.body = JSON.stringify(req.body);
    }

    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        throw new KisRestError(
          `KIS request timeout after ${requestTimeoutMs}ms: ${req.method} ${req.path}`,
          408,
          null,
          null,
          null,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutHandle);
    }
    const text = await response.text();
    let payload: unknown = null;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const { rtCd, msgCd, msg } = extractErrorCodes(payload);
      throw new KisRestError(
        `KIS HTTP ${response.status} ${req.method} ${req.path}${msg !== null ? `: ${msg}` : ''}`,
        response.status,
        rtCd,
        msgCd,
        payload,
      );
    }

    const { rtCd, msgCd, msg } = extractErrorCodes(payload);
    if (rtCd !== null && rtCd !== '0') {
      throw new KisRestError(
        `KIS rt_cd=${rtCd} ${req.method} ${req.path}${msg !== null ? `: ${msg}` : ''}`,
        response.status,
        rtCd,
        msgCd,
        payload,
      );
    }

    return payload as T;
  }

  function isRetryable(err: unknown): boolean {
    if (err instanceof KisRestError) {
      return RETRYABLE_STATUS.has(err.status);
    }
    // Network-level failures (fetch TypeError, AbortError, etc.)
    return err instanceof Error;
  }

  async function request<T>(req: KisRestRequest): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await performOnce<T>(req);
      } catch (err: unknown) {
        lastErr = err;
        if (attempt === maxAttempts || !isRetryable(err)) {
          break;
        }
        const delay = Math.min(
          backoffBaseMs * 2 ** (attempt - 1),
          backoffMaxMs,
        );
        log.warn(
          {
            attempt,
            delay,
            method: req.method,
            path: req.path,
            err: err instanceof Error ? err.message : String(err),
          },
          'KIS REST retrying',
        );
        await sleep(delay);
      }
    }
    throw lastErr;
  }

  return {
    request,
    async postToken(body): Promise<unknown> {
      return request<unknown>({
        method: 'POST',
        path: TOKEN_ENDPOINT_PATH,
        body,
        unauthenticated: true,
      });
    },
  };
}
