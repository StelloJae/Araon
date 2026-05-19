/**
 * KIS '관심종목 그룹조회' API wrapper.
 *
 * Calls GET `KIS_INTSTOCK_GROUPLIST_PATH` with `tr_id = KIS_INTSTOCK_GROUPLIST_TR_ID`,
 * parses the KIS response shape defensively via zod, and returns typed groups.
 *
 * This legacy helper logs only bounded diagnostics. It must not write raw KIS
 * payloads, tokens, app keys, approval keys, or account identifiers.
 */

import { z } from 'zod';

import {
  KIS_INTSTOCK_GROUPLIST_PATH,
  KIS_INTSTOCK_GROUPLIST_TR_ID,
} from '@shared/kis-constraints.js';
import { createChildLogger } from '@shared/logger.js';
import type { Stock } from '@shared/types.js';

import { KisRestError, type KisRestClient } from './kis-rest-client.js';
import type { KisAuth } from './kis-auth.js';

const log = createChildLogger('kis-watchlist-api');

// === Error ===================================================================

/**
 * Thrown when the KIS watchlist endpoint is unreachable, returns 404, or
 * returns a response that cannot be parsed. The route uses `instanceof` to
 * surface a 502 with a CSV fallback hint.
 */
export class KisWatchlistUnavailableError extends Error {
  readonly cause: unknown;
  readonly diagnostic: KisWatchlistErrorDiagnostic | null;
  constructor(
    message: string,
    cause?: unknown,
    diagnostic: KisWatchlistErrorDiagnostic | null = null,
  ) {
    super(message);
    this.name = 'KisWatchlistUnavailableError';
    this.cause = cause;
    this.diagnostic = diagnostic;
  }
}

export interface KisWatchlistErrorDiagnostic {
  readonly name: string;
  readonly message: string;
  readonly status?: number;
  readonly rtCd?: string | null;
  readonly msgCd?: string | null;
  readonly issueCount?: number;
}

const SENSITIVE_DIAGNOSTIC_PATTERNS: readonly RegExp[] = [
  /\b(?:appKey|appSecret|accessToken|approvalKey|accountNo|accountNumber|authorization|bearer)\b\s*[:=]\s*[^\s"',}]+/gi,
  /\b(?:approval[_-]?key|access[_-]?token|account[_-]?(?:no|number))\b\s*[:=]\s*[^\s"',}]+/gi,
  /\b\d{8,14}-\d{2}\b/g,
];

function sanitizeDiagnosticText(value: string): string {
  let sanitized = value;
  for (const pattern of SENSITIVE_DIAGNOSTIC_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[redacted]');
  }
  return sanitized;
}

export function describeKisWatchlistErrorCause(cause: unknown): KisWatchlistErrorDiagnostic {
  if (cause instanceof KisRestError) {
    return {
      name: cause.name,
      message: sanitizeDiagnosticText(cause.message),
      status: cause.status,
      rtCd: cause.rtCd,
      msgCd: cause.msgCd,
    };
  }
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: sanitizeDiagnosticText(cause.message),
    };
  }
  return {
    name: typeof cause,
    message: 'KIS watchlist request failed with a non-error cause',
  };
}

// === KIS response schema =====================================================

/**
 * A single stock entry within a group. KIS field names are Korean — we accept
 * any unknown extras via `.passthrough()` and extract only what we need.
 */
const kisStockItemSchema = z
  .object({
    종목코드: z.string().min(1),
    종목명: z.string().default(''),
    시장: z.string().default(''),
  })
  .passthrough();

/**
 * A watchlist group returned in the `output` array. The field names reflect
 * the actual KIS payload; group-level extras are tolerated.
 */
const kisGroupSchema = z
  .object({
    그룹명: z.string().default(''),
    종목리스트: z.array(kisStockItemSchema).default([]),
  })
  .passthrough();

/**
 * Top-level KIS response envelope. `output` holds the list of groups.
 * `rt_cd` / `msg_cd` / `msg1` are already handled by `KisRestError` in the
 * rest client — by the time this schema runs, `rt_cd` must be "0".
 */
const kisWatchlistResponseSchema = z
  .object({
    output: z.array(kisGroupSchema).default([]),
  })
  .passthrough();

// === Types ===================================================================

export interface WatchlistGroup {
  groupName: string;
  stocks: Stock[];
}

export interface FetchWatchlistDeps {
  restClient: KisRestClient;
  auth: KisAuth;
}

// === Implementation ==========================================================

function marketToStockMarket(raw: string): Stock['market'] {
  const upper = raw.toUpperCase();
  if (upper.includes('KOSDAQ') || upper === 'Q') return 'KOSDAQ';
  return 'KOSPI';
}

/**
 * Fetches the user's KIS watchlist groups and converts each stock entry to a
 * `Stock`. Throws `KisWatchlistUnavailableError` on any network, HTTP, or
 * parse failure so the caller can return a clear 502 rather than a 500.
 */
export async function fetchWatchlistGroups(
  deps: FetchWatchlistDeps,
): Promise<WatchlistGroup[]> {
  log.info(
    { path: KIS_INTSTOCK_GROUPLIST_PATH, trId: KIS_INTSTOCK_GROUPLIST_TR_ID },
    'fetching KIS watchlist groups',
  );

  let raw: unknown;
  try {
    raw = await deps.restClient.request({
      method: 'GET',
      path: KIS_INTSTOCK_GROUPLIST_PATH,
      trId: KIS_INTSTOCK_GROUPLIST_TR_ID,
      endpointClass: 'foreground',
    });
  } catch (err: unknown) {
    const diagnostic = describeKisWatchlistErrorCause(err);
    log.error(
      { diagnostic, path: KIS_INTSTOCK_GROUPLIST_PATH, trId: KIS_INTSTOCK_GROUPLIST_TR_ID },
      'KIS watchlist request failed',
    );
    throw new KisWatchlistUnavailableError(
      'KIS watchlist endpoint unreachable or returned an error',
      err,
      diagnostic,
    );
  }

  const parsed = kisWatchlistResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const diagnostic: KisWatchlistErrorDiagnostic = {
      name: parsed.error.name,
      message: 'KIS watchlist response schema validation failed',
      issueCount: parsed.error.issues.length,
    };
    log.error(
      { issues: parsed.error.issues, issueCount: parsed.error.issues.length },
      'KIS watchlist response failed schema validation',
    );
    throw new KisWatchlistUnavailableError(
      'KIS watchlist response did not match expected shape',
      parsed.error,
      diagnostic,
    );
  }

  const groups: WatchlistGroup[] = parsed.data.output.map((group) => {
    const stocks: Stock[] = group.종목리스트.map((item) => ({
      ticker: item.종목코드,
      name: item.종목명,
      market: marketToStockMarket(item.시장),
    }));
    return { groupName: group.그룹명, stocks };
  });

  log.info(
    { groupCount: groups.length, totalStocks: groups.reduce((n, g) => n + g.stocks.length, 0) },
    'KIS watchlist groups fetched',
  );

  return groups;
}
