import { randomUUID } from 'node:crypto';

import type {
  AgentEventNotificationType,
  AgentEventProductMarket,
  AgentEventRelatedIdsPayload,
} from '@shared/types.js';

export type AgentEventType =
  AgentEventNotificationType;

export interface AgentEvent {
  readonly id: string;
  readonly type: AgentEventType;
  readonly ticker: string;
  readonly productCode: string | null;
  readonly krTicker: string | null;
  readonly market: AgentEventProductMarket | null;
  readonly displayName: string | null;
  readonly source: string;
  readonly publishedAt: string | null;
  readonly firstSeenAt: string;
  readonly freshnessMs: number | null;
  readonly relevance: number | null;
  readonly confidence: number;
  readonly reason: string;
  readonly dedupeKey: string;
  readonly payloadRef: string | null;
  readonly rawPayloadRedacted: true;
  readonly relatedIds: AgentEventRelatedIdsPayload;
  readonly skipReason: string | null;
  readonly createdAt: string;
}

export interface AgentEventInput {
  readonly type: AgentEventType;
  readonly ticker: string;
  readonly productCode?: string | null;
  readonly krTicker?: string | null;
  readonly market?: AgentEventProductMarket | null;
  readonly displayName?: string | null;
  readonly source: string;
  readonly publishedAt?: string | null;
  readonly firstSeenAt?: string;
  readonly relevance?: number | null;
  readonly confidence: number;
  readonly reason: string;
  readonly dedupeKey: string;
  readonly payloadRef?: string | null;
  readonly relatedIds?: Partial<AgentEventRelatedIdsPayload>;
  readonly skipReason?: string | null;
}

export interface AgentEventQueueResult {
  readonly inserted: boolean;
  readonly event: AgentEvent;
}

export interface AgentEventQueue {
  enqueue(input: AgentEventInput): AgentEventQueueResult;
  snapshot(limit?: number): AgentEvent[];
}

export interface AgentEventQueueOptions {
  readonly maxSize?: number;
  readonly initialEvents?: readonly AgentEvent[];
  readonly idFactory?: () => string;
  readonly now?: () => string;
  readonly onInsert?: (event: AgentEvent) => void;
}

const DEFAULT_MAX_SIZE = 500;

export function createAgentEventQueue(
  options: AgentEventQueueOptions = {},
): AgentEventQueue {
  const maxSize = Math.max(1, Math.trunc(options.maxSize ?? DEFAULT_MAX_SIZE));
  const idFactory = options.idFactory ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  const onInsert = options.onInsert;
  const events: AgentEvent[] = [];
  const byDedupeKey = new Map<string, AgentEvent>();
  seedInitialEvents(options.initialEvents ?? [], events, byDedupeKey, maxSize);

  function enqueue(input: AgentEventInput): AgentEventQueueResult {
    const dedupeKey = normalizeRequiredText(input.dedupeKey, 'dedupeKey', 256);
    const existing = byDedupeKey.get(dedupeKey);
    if (existing !== undefined) {
      return { inserted: false, event: existing };
    }

    const ticker = normalizeTicker(input.ticker);
    const product = normalizeProductIdentity({
      ticker,
      productCode: input.productCode,
      krTicker: input.krTicker,
      market: input.market,
      displayName: input.displayName,
    });
    const firstSeenAt = normalizeTimestamp(input.firstSeenAt ?? now(), 'firstSeenAt');
    const publishedAt = input.publishedAt === undefined || input.publishedAt === null
      ? null
      : normalizeTimestamp(input.publishedAt, 'publishedAt');
    const event: AgentEvent = {
      id: normalizeRequiredText(idFactory(), 'id', 128),
      type: input.type,
      ticker,
      productCode: product.productCode,
      krTicker: product.krTicker,
      market: product.market,
      displayName: product.displayName,
      source: normalizeRequiredText(input.source, 'source', 80),
      publishedAt,
      firstSeenAt,
      freshnessMs: freshnessMs(publishedAt, firstSeenAt),
      relevance: input.relevance === undefined || input.relevance === null
        ? null
        : clampScore(input.relevance),
      confidence: clampScore(input.confidence),
      reason: normalizeRequiredText(redactSensitiveText(input.reason), 'reason', 500),
      dedupeKey,
      payloadRef: input.payloadRef === undefined || input.payloadRef === null
        ? null
        : normalizeRequiredText(redactSensitiveText(input.payloadRef), 'payloadRef', 256),
      rawPayloadRedacted: true,
      relatedIds: normalizeRelatedIds(input.relatedIds),
      skipReason: input.skipReason === undefined || input.skipReason === null
        ? null
        : normalizeRequiredText(redactSensitiveText(input.skipReason), 'skipReason', 256),
      createdAt: firstSeenAt,
    };

    events.unshift(event);
    byDedupeKey.set(dedupeKey, event);
    while (events.length > maxSize) {
      const removed = events.pop();
      if (removed !== undefined) byDedupeKey.delete(removed.dedupeKey);
    }
    onInsert?.(event);
    return { inserted: true, event };
  }

  function snapshot(limit = maxSize): AgentEvent[] {
    return events.slice(0, Math.max(0, Math.trunc(limit)));
  }

  return { enqueue, snapshot };
}

function seedInitialEvents(
  initialEvents: readonly AgentEvent[],
  events: AgentEvent[],
  byDedupeKey: Map<string, AgentEvent>,
  maxSize: number,
): void {
  for (const event of initialEvents) {
    const dedupeKey = normalizeRequiredText(event.dedupeKey, 'dedupeKey', 256);
    if (byDedupeKey.has(dedupeKey)) continue;
    const normalized: AgentEvent = {
      id: normalizeRequiredText(event.id, 'id', 128),
      type: event.type,
      ticker: normalizeTicker(event.ticker),
      productCode: normalizeProductCode(event.productCode) ?? productCodeFromTicker(event.ticker),
      krTicker: normalizeKrTicker(event.krTicker) ?? krTickerFromProductCode(event.productCode) ?? krTickerFromTicker(event.ticker),
      market: normalizeMarket(event.market),
      displayName: normalizeOptionalText(event.displayName, 'displayName', 120),
      source: normalizeRequiredText(event.source, 'source', 80),
      publishedAt: event.publishedAt === null
        ? null
        : normalizeTimestamp(event.publishedAt, 'publishedAt'),
      firstSeenAt: normalizeTimestamp(event.firstSeenAt, 'firstSeenAt'),
      freshnessMs: event.freshnessMs,
      relevance: event.relevance === null ? null : clampScore(event.relevance),
      confidence: clampScore(event.confidence),
      reason: normalizeRequiredText(redactSensitiveText(event.reason), 'reason', 500),
      dedupeKey,
      payloadRef: event.payloadRef === null
        ? null
        : normalizeRequiredText(redactSensitiveText(event.payloadRef), 'payloadRef', 256),
      rawPayloadRedacted: true,
      relatedIds: normalizeRelatedIds(event.relatedIds),
      skipReason: event.skipReason === null
        ? null
        : normalizeRequiredText(redactSensitiveText(event.skipReason), 'skipReason', 256),
      createdAt: normalizeTimestamp(event.createdAt, 'createdAt'),
    };
    events.push(normalized);
    byDedupeKey.set(dedupeKey, normalized);
    if (events.length >= maxSize) return;
  }
}

export function normalizeAgentEventTicker(value: string): string {
  return normalizeTicker(value);
}

function normalizeTicker(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const krTicker = trimmed.startsWith('A') ? trimmed.slice(1) : trimmed;
  if (/^\d{6}$/.test(krTicker)) return krTicker;
  if (/^[A-Z][A-Z0-9.-]{0,15}$/.test(trimmed)) return trimmed;
  throw new Error('Invalid agent event ticker');
}

function normalizeProductIdentity(input: {
  readonly ticker: string;
  readonly productCode?: string | null | undefined;
  readonly krTicker?: string | null | undefined;
  readonly market?: AgentEventProductMarket | null | undefined;
  readonly displayName?: string | null | undefined;
}): {
  productCode: string | null;
  krTicker: string | null;
  market: AgentEventProductMarket | null;
  displayName: string | null;
} {
  const explicitProductCode = normalizeProductCode(input.productCode);
  const explicitKrTicker = normalizeKrTicker(input.krTicker);
  const productCode =
    explicitProductCode ??
    (explicitKrTicker !== null ? `A${explicitKrTicker}` : productCodeFromTicker(input.ticker));
  const krTicker =
    explicitKrTicker ??
    krTickerFromProductCode(productCode) ??
    krTickerFromTicker(input.ticker);
  return {
    productCode,
    krTicker,
    market: normalizeMarket(input.market),
    displayName: normalizeOptionalText(input.displayName, 'displayName', 120),
  };
}

function normalizeProductCode(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) return null;
  if (/^\d{6}$/.test(normalized)) return `A${normalized}`;
  if (/^A\d{6}$/.test(normalized)) return normalized;
  if (/^[A-Z0-9]{5,}$/.test(normalized)) return normalized;
  return null;
}

function normalizeKrTicker(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().toUpperCase();
  const ticker = normalized.startsWith('A') ? normalized.slice(1) : normalized;
  return /^\d{6}$/.test(ticker) ? ticker : null;
}

function productCodeFromTicker(ticker: string): string | null {
  const krTicker = krTickerFromTicker(ticker);
  return krTicker === null ? null : `A${krTicker}`;
}

function krTickerFromProductCode(productCode: string | null): string | null {
  if (productCode === null) return null;
  const match = /^A(\d{6})$/.exec(productCode);
  return match?.[1] ?? null;
}

function krTickerFromTicker(ticker: string): string | null {
  const normalized = ticker.trim().toUpperCase();
  const candidate = normalized.startsWith('A') ? normalized.slice(1) : normalized;
  return /^\d{6}$/.test(candidate) ? candidate : null;
}

function normalizeMarket(
  value: AgentEventProductMarket | null | undefined,
): AgentEventProductMarket | null {
  if (
    value === 'KOSPI' ||
    value === 'KOSDAQ' ||
    value === 'US' ||
    value === 'TOSS_ONLY' ||
    value === 'UNKNOWN'
  ) {
    return value;
  }
  return null;
}

function normalizeOptionalText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) return null;
  return normalizeRequiredText(redactSensitiveText(value), field, maxLength);
}

function normalizeRelatedIds(
  value: Partial<AgentEventRelatedIdsPayload> | null | undefined,
): AgentEventRelatedIdsPayload {
  return {
    watchlistId: normalizeOptionalText(value?.watchlistId, 'watchlistId', 128),
    holdingId: normalizeOptionalText(value?.holdingId, 'holdingId', 128),
    orderIntentId: normalizeOptionalText(value?.orderIntentId, 'orderIntentId', 128),
    approvalId: normalizeOptionalText(value?.approvalId, 'approvalId', 128),
  };
}

function normalizeRequiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) throw new Error(`Invalid agent event ${field}`);
  return normalized.slice(0, maxLength);
}

function redactSensitiveText(value: string): string {
  return value
    .replace(
      /\b(SESSION|UTK|LTK|FTK|browserSessionId|deviceId|accountNo|orderNo|referenceId)\s*[=:]\s*[^\s&"',}]+/gi,
      (_match, key: string) => `${canonicalSensitiveKey(key)}=[REDACTED]`,
    )
    .replace(
      /\b(approval[_-]?key|appKey|appSecret|secretKey|access[_-]?token)\s*[=:]\s*[^\s&"',}]+/gi,
      (_match, key: string) => `${canonicalSensitiveKey(key)}=[REDACTED]`,
    )
    .replace(/\bbearer\s+[^\s&"',}]+/gi, 'bearer [REDACTED]');
}

function canonicalSensitiveKey(key: string): string {
  const lower = key.toLowerCase();
  switch (lower) {
    case 'browsersessionid':
      return 'browserSessionId';
    case 'deviceid':
      return 'deviceId';
    case 'accountno':
      return 'accountNo';
    case 'orderno':
      return 'orderNo';
    case 'referenceid':
      return 'referenceId';
    case 'appkey':
      return 'appKey';
    case 'appsecret':
      return 'appSecret';
    case 'secretkey':
      return 'secretKey';
  }
  if (/^approval[_-]?key$/i.test(key)) return 'approval_key';
  if (/^access[_-]?token$/i.test(key)) return 'access_token';
  return key.toUpperCase();
}

function normalizeTimestamp(value: string, field: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`Invalid agent event ${field}`);
  return new Date(ms).toISOString();
}

function freshnessMs(publishedAt: string | null, firstSeenAt: string): number | null {
  if (publishedAt === null) return null;
  return Date.parse(firstSeenAt) - Date.parse(publishedAt);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
