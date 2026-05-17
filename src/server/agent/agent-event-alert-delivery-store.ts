import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

import type { AgentEvent, AgentEventType } from './agent-event-queue.js';
import { normalizeAgentEventTicker } from './agent-event-queue.js';

export type AgentEventAlertDeliveryChannel = 'browser-sse';
export type AgentEventAlertDeliveryStatus = 'dispatched' | 'skipped_no_client';
export type AgentEventAlertDeliveryTarget = 'local-ui';

export interface AgentEventAlertDelivery {
  readonly id: string;
  readonly eventId: string;
  readonly eventType: AgentEventType;
  readonly ticker: string;
  readonly channel: AgentEventAlertDeliveryChannel;
  readonly target: AgentEventAlertDeliveryTarget;
  readonly status: AgentEventAlertDeliveryStatus;
  readonly clientCount: number;
  readonly dispatchLatencyMs: number;
  readonly reason: string;
  readonly createdAt: string;
}

export interface AgentEventAlertDeliverySummary {
  readonly targetFirstSeenToDispatchMs: number;
  readonly totalCount: number;
  readonly dispatchedCount: number;
  readonly skippedNoClientCount: number;
  readonly dispatchedWithinTargetCount: number;
  readonly dispatchedLateCount: number;
  readonly lastDispatchLatencyMs: number | null;
  readonly maxDispatchLatencyMs: number | null;
}

export interface AgentEventAlertDeliveryInput {
  readonly event: AgentEvent;
  readonly channel: AgentEventAlertDeliveryChannel;
  readonly target: AgentEventAlertDeliveryTarget;
  readonly status: AgentEventAlertDeliveryStatus;
  readonly clientCount: number;
  readonly reason: string;
}

export interface AgentEventAlertDeliveryStore {
  append(input: AgentEventAlertDeliveryInput): AgentEventAlertDelivery;
  snapshot(limit?: number): AgentEventAlertDelivery[];
  summarize(): AgentEventAlertDeliverySummary;
}

export interface AgentEventAlertDeliveryStoreOptions {
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

interface AgentEventAlertDeliveryRow {
  id: string;
  event_id: string;
  event_type: string;
  ticker: string;
  channel: string;
  target: string;
  status: string;
  client_count: number;
  dispatch_latency_ms: number;
  reason: string;
  created_at: string;
}

interface AgentEventAlertDeliverySummaryRow {
  total_count: number;
  dispatched_count: number | null;
  skipped_no_client_count: number | null;
  dispatched_within_target_count: number | null;
  dispatched_late_count: number | null;
  max_dispatch_latency_ms: number | null;
}

interface AgentEventAlertDeliveryLastLatencyRow {
  dispatch_latency_ms: number;
}

const TARGET_FIRST_SEEN_TO_DISPATCH_MS = 30_000;

export function createSqliteAgentEventAlertDeliveryStore(
  db: Database.Database,
  options: AgentEventAlertDeliveryStoreOptions = {},
): AgentEventAlertDeliveryStore {
  const idFactory = options.idFactory ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    append(input) {
      const createdAt = normalizeTimestamp(now(), 'createdAt');
      const entry: AgentEventAlertDelivery = {
        id: normalizeRequiredText(idFactory(), 'id', 128),
        eventId: normalizeRequiredText(input.event.id, 'eventId', 128),
        eventType: input.event.type,
        ticker: normalizeAgentEventTicker(input.event.ticker),
        channel: input.channel,
        target: input.target,
        status: input.status,
        clientCount: normalizeClientCount(input.clientCount),
        dispatchLatencyMs: latencyMs(input.event.firstSeenAt, createdAt),
        reason: normalizeRequiredText(input.reason, 'reason', 240),
        createdAt,
      };

      db.prepare(
        `INSERT OR REPLACE INTO agent_event_alert_deliveries (
           id, event_id, event_type, ticker, channel, target, status,
           client_count, dispatch_latency_ms, reason, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        entry.id,
        entry.eventId,
        entry.eventType,
        entry.ticker,
        entry.channel,
        entry.target,
        entry.status,
        entry.clientCount,
        entry.dispatchLatencyMs,
        entry.reason,
        entry.createdAt,
      );

      return entry;
    },
    snapshot(limit = 50) {
      const rows = db
        .prepare<[number], AgentEventAlertDeliveryRow>(
          `SELECT id, event_id, event_type, ticker, channel, target, status,
                  client_count, dispatch_latency_ms, reason, created_at
           FROM agent_event_alert_deliveries
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .all(normalizeLimit(limit));
      return rows.map(rowToDelivery);
    },
    summarize() {
      const row = db
        .prepare<[number, number], AgentEventAlertDeliverySummaryRow>(
          `SELECT
             COUNT(*) AS total_count,
             SUM(CASE WHEN status = 'dispatched' THEN 1 ELSE 0 END) AS dispatched_count,
             SUM(CASE WHEN status = 'skipped_no_client' THEN 1 ELSE 0 END) AS skipped_no_client_count,
             SUM(CASE WHEN status = 'dispatched' AND dispatch_latency_ms <= ? THEN 1 ELSE 0 END)
               AS dispatched_within_target_count,
             SUM(CASE WHEN status = 'dispatched' AND dispatch_latency_ms > ? THEN 1 ELSE 0 END)
               AS dispatched_late_count,
             MAX(dispatch_latency_ms) AS max_dispatch_latency_ms
           FROM agent_event_alert_deliveries`,
        )
        .get(TARGET_FIRST_SEEN_TO_DISPATCH_MS, TARGET_FIRST_SEEN_TO_DISPATCH_MS);
      const last = db
        .prepare<[], AgentEventAlertDeliveryLastLatencyRow>(
          `SELECT dispatch_latency_ms
           FROM agent_event_alert_deliveries
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
        )
        .get();
      return {
        targetFirstSeenToDispatchMs: TARGET_FIRST_SEEN_TO_DISPATCH_MS,
        totalCount: row?.total_count ?? 0,
        dispatchedCount: row?.dispatched_count ?? 0,
        skippedNoClientCount: row?.skipped_no_client_count ?? 0,
        dispatchedWithinTargetCount: row?.dispatched_within_target_count ?? 0,
        dispatchedLateCount: row?.dispatched_late_count ?? 0,
        lastDispatchLatencyMs: last?.dispatch_latency_ms ?? null,
        maxDispatchLatencyMs: row?.max_dispatch_latency_ms ?? null,
      };
    },
  };
}

function rowToDelivery(row: AgentEventAlertDeliveryRow): AgentEventAlertDelivery {
  return {
    id: row.id,
    eventId: row.event_id,
    eventType: row.event_type as AgentEventType,
    ticker: row.ticker,
    channel: row.channel as AgentEventAlertDeliveryChannel,
    target: row.target as AgentEventAlertDeliveryTarget,
    status: row.status as AgentEventAlertDeliveryStatus,
    clientCount: row.client_count,
    dispatchLatencyMs: row.dispatch_latency_ms,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function normalizeClientCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(200, Math.trunc(limit)));
}

function normalizeRequiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) throw new Error(`Invalid agent alert delivery ${field}`);
  return normalized.slice(0, maxLength);
}

function normalizeTimestamp(value: string, field: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`Invalid agent alert delivery ${field}`);
  return new Date(ms).toISOString();
}

function latencyMs(firstSeenAt: string, createdAt: string): number {
  const firstSeenMs = Date.parse(firstSeenAt);
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(firstSeenMs) || !Number.isFinite(createdMs)) return 0;
  return Math.max(0, Math.trunc(createdMs - firstSeenMs));
}
