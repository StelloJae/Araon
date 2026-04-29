/**
 * KIS OpenAPI access-token manager.
 *
 * Responsibilities:
 *   - Issue a fresh access token via the KIS OAuth endpoint.
 *   - Refresh proactively (`TOKEN_REFRESH_LEADTIME_SEC` before expiry).
 *   - Deduplicate concurrent callers behind a single in-flight promise.
 *   - Persist the active token so server restarts reuse it (KIS enforces a
 *     1-token-per-minute issuance throttle).
 *   - Enforce the KIS issuance-interval guard locally, surfacing a typed
 *     error instead of leaking the 403 to callers.
 *
 * Rate limiting and REST error mapping live in `kis-rest-client`; this
 * module only owns the OAuth concern.
 */

import { z } from 'zod';

import {
  TOKEN_ENDPOINT_PATH,
  TOKEN_MIN_ISSUANCE_INTERVAL_MS,
  TOKEN_REFRESH_LEADTIME_SEC,
  TOKEN_TTL_SEC,
} from '@shared/kis-constraints.js';
import { createChildLogger } from '@shared/logger.js';

import type {
  CredentialStore,
  KisCredentials,
  PersistedToken,
} from '../credential-store.js';

const log = createChildLogger('kis-auth');

/**
 * Minimal REST surface needed by the auth manager. `kis-rest-client` will
 * provide the concrete implementation — but the token call must bypass the
 * client's bearer header (the token is what we're issuing), so this thin
 * contract keeps the dependency direction clean.
 */
export interface KisTokenTransport {
  postToken(body: {
    grant_type: 'client_credentials';
    appkey: string;
    appsecret: string;
  }): Promise<unknown>;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1).default('Bearer'),
  expires_in: z.number().int().positive().optional(),
});

export interface KisAuthOptions {
  store: CredentialStore;
  transport: KisTokenTransport;
  /** Injectable clock for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
}

export interface KisAuth {
  /**
   * Return a non-expired access token, issuing or refreshing as needed.
   * Concurrent callers share one in-flight request.
   */
  getAccessToken(): Promise<string>;
  /**
   * Return the stored KIS credentials (appKey + appSecret + isPaper).
   *
   * KIS OpenAPI requires the raw `appkey`/`appsecret` as headers on every
   * authenticated REST call — NOT just in the OAuth token exchange. The REST
   * client calls this to populate those headers.
   *
   * Throws `KisCredentialsMissingError` when no credentials are persisted.
   */
  getCredentials(): Promise<KisCredentials>;
  /**
   * Invalidate the cached token (e.g. on a 401 from a downstream call) so
   * the next `getAccessToken` triggers a refresh.
   */
  invalidate(): Promise<void>;
  /** Testing / diagnostics — the current in-memory token view. */
  peek(): PersistedToken | null;
}

/**
 * Raised when the KIS 1-token-per-minute guard would be violated. Callers
 * should surface this to operators rather than retrying in a tight loop.
 */
export class KisTokenThrottledError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(
      `KIS token issuance throttled — retry in ${retryAfterMs}ms (per TOKEN_MIN_ISSUANCE_INTERVAL_MS)`,
    );
    this.name = 'KisTokenThrottledError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Raised when credentials are not yet stored. The caller (likely the HTTP
 * bootstrap) should prompt the user to enter their KIS app key/secret.
 */
export class KisCredentialsMissingError extends Error {
  constructor() {
    super(
      'KIS credentials are not configured — persist them via credential-store first',
    );
    this.name = 'KisCredentialsMissingError';
  }
}

function isExpired(
  token: PersistedToken,
  now: number,
  leadtimeMs: number,
): boolean {
  return token.expiresAtMs - leadtimeMs <= now;
}

export function createKisAuth(options: KisAuthOptions): KisAuth {
  const { store, transport } = options;
  const now = options.now ?? Date.now;
  const leadtimeMs = TOKEN_REFRESH_LEADTIME_SEC * 1_000;

  let cachedToken: PersistedToken | null = null;
  let cachedCredentials: KisCredentials | null = null;
  let loaded = false;
  let inFlight: Promise<string> | null = null;

  async function ensureLoaded(): Promise<void> {
    if (loaded) return;
    const payload = await store.load();
    if (payload !== null) {
      cachedCredentials = payload.credentials;
      cachedToken = payload.token ?? null;
    }
    loaded = true;
  }

  async function issueAndPersist(): Promise<string> {
    if (cachedCredentials === null) {
      throw new KisCredentialsMissingError();
    }
    if (cachedToken !== null) {
      const sinceIssuance = now() - cachedToken.issuedAtMs;
      if (sinceIssuance < TOKEN_MIN_ISSUANCE_INTERVAL_MS) {
        throw new KisTokenThrottledError(
          TOKEN_MIN_ISSUANCE_INTERVAL_MS - sinceIssuance,
        );
      }
    }

    log.info(
      { endpoint: TOKEN_ENDPOINT_PATH, isPaper: cachedCredentials.isPaper },
      'issuing KIS access token',
    );
    const raw = await transport.postToken({
      grant_type: 'client_credentials',
      appkey: cachedCredentials.appKey,
      appsecret: cachedCredentials.appSecret,
    });
    const parsed = tokenResponseSchema.parse(raw);
    const issuedAtMs = now();
    const ttlSec = parsed.expires_in ?? TOKEN_TTL_SEC;
    const next: PersistedToken = {
      accessToken: parsed.access_token,
      tokenType: parsed.token_type,
      expiresAtMs: issuedAtMs + ttlSec * 1_000,
      issuedAtMs,
    };
    cachedToken = next;
    await store.saveToken(next);
    log.info(
      { expiresInSec: ttlSec },
      'KIS access token issued and persisted',
    );
    return next.accessToken;
  }

  async function runExclusive(): Promise<string> {
    await ensureLoaded();
    if (
      cachedToken !== null &&
      !isExpired(cachedToken, now(), leadtimeMs)
    ) {
      return cachedToken.accessToken;
    }
    return issueAndPersist();
  }

  return {
    async getAccessToken(): Promise<string> {
      if (inFlight !== null) {
        return inFlight;
      }
      const pending = runExclusive().finally(() => {
        inFlight = null;
      });
      inFlight = pending;
      return pending;
    },

    async invalidate(): Promise<void> {
      cachedToken = null;
      await store.clearToken();
      log.warn('KIS access token invalidated');
    },

    async getCredentials(): Promise<KisCredentials> {
      await ensureLoaded();
      if (cachedCredentials === null) {
        throw new KisCredentialsMissingError();
      }
      return cachedCredentials;
    },

    peek(): PersistedToken | null {
      return cachedToken;
    },
  };
}
