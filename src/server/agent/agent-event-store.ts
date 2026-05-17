import type Database from 'better-sqlite3';

import type { AgentEvent, AgentEventType } from './agent-event-queue.js';

interface AgentEventRow {
  id: string;
  type: string;
  ticker: string;
  source: string;
  published_at: string | null;
  first_seen_at: string;
  freshness_ms: number | null;
  relevance: number | null;
  confidence: number;
  reason: string;
  dedupe_key: string;
  payload_ref: string | null;
  created_at: string;
}

export interface AgentEventStore {
  append(event: AgentEvent): void;
  snapshot(limit?: number): AgentEvent[];
}

export function createSqliteAgentEventStore(db: Database.Database): AgentEventStore {
  return {
    append(event) {
      db.prepare(
        `INSERT OR IGNORE INTO agent_events (
           id, type, ticker, source, published_at, first_seen_at, freshness_ms,
           relevance, confidence, reason, dedupe_key, payload_ref, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        event.id,
        event.type,
        event.ticker,
        event.source,
        event.publishedAt,
        event.firstSeenAt,
        event.freshnessMs,
        event.relevance,
        event.confidence,
        event.reason,
        event.dedupeKey,
        event.payloadRef,
        event.createdAt,
      );
    },
    snapshot(limit = 50) {
      const safeLimit = normalizeLimit(limit);
      const rows = db
        .prepare<[number], AgentEventRow>(
          `SELECT id, type, ticker, source, published_at, first_seen_at,
                  freshness_ms, relevance, confidence, reason, dedupe_key,
                  payload_ref, created_at
           FROM agent_events
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .all(safeLimit);
      return rows.map(rowToAgentEvent);
    },
  };
}

function rowToAgentEvent(row: AgentEventRow): AgentEvent {
  return {
    id: row.id,
    type: row.type as AgentEventType,
    ticker: row.ticker,
    productCode: row.ticker.length === 6 ? `A${row.ticker}` : null,
    krTicker: row.ticker.length === 6 ? row.ticker : null,
    market: null,
    displayName: null,
    source: row.source,
    publishedAt: row.published_at,
    firstSeenAt: row.first_seen_at,
    freshnessMs: row.freshness_ms,
    relevance: row.relevance,
    confidence: row.confidence,
    reason: row.reason,
    dedupeKey: row.dedupe_key,
    payloadRef: row.payload_ref,
    rawPayloadRedacted: true,
    relatedIds: {
      watchlistId: null,
      holdingId: null,
      orderIntentId: null,
      approvalId: null,
    },
    skipReason: null,
    createdAt: row.created_at,
  };
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(200, Math.trunc(limit)));
}
