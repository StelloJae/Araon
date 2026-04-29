/**
 * KIS WebSocket approval-key issuer.
 *
 * KIS WebSocket connections require a one-time approval key obtained from
 * `POST /oauth2/Approval`. This is **separate** from the OAuth access token
 * used for REST calls — different endpoint, different body shape, different
 * lifetime. (Spike doc: TTL 공식 명시 없음, 세션 수명과 동일한 것으로 관찰.)
 *
 * NXT2a contract:
 *   - `issue()` makes one POST per call, validates the response with Zod,
 *     and returns the approval key.
 *   - Concurrent `issue()` calls share a single in-flight request (dedup).
 *   - `getState()` exposes a diagnostic-safe state machine that NEVER
 *     contains the key value or upstream error text — only mapped codes
 *     and generic messages.
 *   - Errors are classified into a small enum so callers (and the WS state
 *     machine) can route auth failures away from the reconnect chain.
 *
 * This module is live-untested as of NXT2a — `getState()`/leak guards are
 * unit-tested with mock transports. NXT2b (separately approved) will run a
 * single live probe to capture response shape (e.g., whether KIS returns
 * an explicit `expiresAt`).
 */

import { z } from 'zod';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('kis-approval');

const APPROVAL_PATH = '/oauth2/Approval';

// === Public types ============================================================

export type ApprovalErrorCode =
  /** KIS rejected the credentials (HTTP 401/403, or rt_cd != '0'). */
  | 'auth_rejected'
  /** Response missed `approval_key` or schema validation failed. */
  | 'malformed_response'
  /** Transport/connection failure (fetch threw, abort, ECONNREFUSED, ...). */
  | 'network_error'
  /** Anything not classifiable from the error shape. */
  | 'unknown';

export type ApprovalKeyState =
  | { readonly status: 'none' }
  | { readonly status: 'issuing' }
  | { readonly status: 'ready'; readonly issuedAt: string }
  | {
      readonly status: 'failed';
      readonly code: ApprovalErrorCode;
      readonly message: string;
    };

export interface ApprovalIssuer {
  /** Issue (or re-issue) an approval key. Concurrent calls share one request. */
  issue(): Promise<string>;
  /** Diagnostic-safe snapshot — never contains the key value or upstream text. */
  getState(): ApprovalKeyState;
}

export interface ApprovalRequest {
  readonly method: 'POST';
  readonly path: string;
  readonly body: Record<string, unknown>;
  readonly unauthenticated: true;
}

export interface ApprovalTransport {
  request<T>(req: ApprovalRequest): Promise<T>;
}

export interface ApprovalIssuerOptions {
  appKey: string;
  appSecret: string;
  transport: ApprovalTransport;
  /** Optional clock override for tests. */
  now?: () => Date;
}

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode;
  constructor(code: ApprovalErrorCode, message: string) {
    super(message);
    this.name = 'ApprovalError';
    this.code = code;
  }
}

// === Schema ==================================================================

const approvalResponseSchema = z
  .object({
    approval_key: z.string().min(1),
  })
  .passthrough();

// === Implementation ==========================================================

export function createApprovalIssuer(opts: ApprovalIssuerOptions): ApprovalIssuer {
  const now = opts.now ?? ((): Date => new Date());
  let state: ApprovalKeyState = { status: 'none' };
  let inFlight: Promise<string> | null = null;

  async function performIssue(): Promise<string> {
    state = { status: 'issuing' };

    let resp: unknown;
    try {
      resp = await opts.transport.request<unknown>({
        method: 'POST',
        path: APPROVAL_PATH,
        body: {
          grant_type: 'client_credentials',
          appkey: opts.appKey,
          // KIS /oauth2/Approval uses `secretkey` (NOT `appsecret`, which is
          // what /oauth2/tokenP uses). Same envelope, different field name —
          // an inline call previously had `appsecret` which would 500 on the
          // first live probe. Tracked in NXT2a; live verification is NXT2b.
          secretkey: opts.appSecret,
        },
        unauthenticated: true,
      });
    } catch (err: unknown) {
      const code = classifyTransportError(err);
      const message = describeError(code);
      state = { status: 'failed', code, message };
      // pino redact (logger.ts) drops appKey/appSecret/accessToken/approvalKey
      // fields by name. Original `err` is allowed through because the redact
      // matrix already covers what we ever attach to it.
      log.warn({ err, code }, 'approval key issuance failed');
      throw new ApprovalError(code, message);
    }

    const parsed = approvalResponseSchema.safeParse(resp);
    if (!parsed.success) {
      const message = describeError('malformed_response');
      state = { status: 'failed', code: 'malformed_response', message };
      log.warn(
        { issues: parsed.error.issues },
        'approval response failed schema validation',
      );
      throw new ApprovalError('malformed_response', message);
    }

    state = { status: 'ready', issuedAt: now().toISOString() };
    log.info('approval key issued (key value not logged)');
    return parsed.data.approval_key;
  }

  function issue(): Promise<string> {
    if (inFlight !== null) return inFlight;
    inFlight = performIssue().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function getState(): ApprovalKeyState {
    return state;
  }

  return { issue, getState };
}

// === Error classification ===================================================

function classifyTransportError(err: unknown): ApprovalErrorCode {
  if (err === null || err === undefined) return 'unknown';

  // Duck-type on KisRestError shape (avoid a cross-module import cycle).
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const rtCd = obj['rtCd'];
    if (typeof rtCd === 'string' && rtCd !== '0') return 'auth_rejected';
    const status = obj['status'];
    if (typeof status === 'number' && (status === 401 || status === 403)) {
      return 'auth_rejected';
    }
    const name = obj['name'];
    if (name === 'AbortError' || name === 'FetchError') return 'network_error';
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('403')) {
      return 'auth_rejected';
    }
    if (
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('fetch failed')
    ) {
      return 'network_error';
    }
  }
  return 'unknown';
}

/**
 * Generic, deterministic error descriptors. These are intentionally NOT a
 * pass-through of upstream KIS / fetch error text — keeping the description
 * generic ensures `state.failed.message` and `ApprovalError.message` cannot
 * leak appKey/appSecret/approval_key fragments that a transport layer might
 * have surfaced.
 */
function describeError(code: ApprovalErrorCode): string {
  switch (code) {
    case 'auth_rejected':
      return 'KIS rejected approval request (check appKey/appSecret)';
    case 'malformed_response':
      return 'KIS approval response missing approval_key field';
    case 'network_error':
      return 'network error during approval request';
    case 'unknown':
      return 'approval issuance failed with unknown error';
  }
}
