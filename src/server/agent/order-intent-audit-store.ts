import type Database from 'better-sqlite3';

import {
  buildOrderIntentLifecycle,
  buildOrderIntentPaperLedgerPreview,
  buildOrderIntentPreviewImpact,
  buildOrderIntentRiskPolicyEvaluation,
  buildOrderIntentStrategyEvaluation,
  hashOrderIntentApprovalSummary,
} from './order-intent-service.js';
import type {
  OrderIntentAuditDecision,
  OrderIntentAuditEntry,
  OrderIntentAuditEvent,
  OrderIntentApprovalChallenge,
  OrderIntentApprovalOrderSummary,
  OrderIntentApprovalChallengeStatus,
  OrderIntentMarket,
  OrderIntentOrderType,
  OrderIntentPaperLedgerEntry,
  OrderIntentPreview,
  OrderIntentRequestedMode,
  OrderIntentRiskCheck,
  OrderIntentSide,
  OrderIntentStore,
} from './order-intent-service.js';

interface OrderIntentRow {
  id: string;
  ticker: string;
  side: string;
  market: string;
  requested_mode: string;
  execution_mode: string;
  status: string;
  live_execution_locked: number;
  quantity: number | null;
  cash_amount: number | null;
  order_type: string;
  limit_price: number | null;
  trigger_event_id: string | null;
  agent_id: string | null;
  reason: string;
  risk_checks_json: string;
  created_at: string;
  expires_at: string;
  audit_ref: string;
}

interface OrderIntentAuditRow {
  id: string;
  intent_id: string | null;
  event: string;
  decision: string;
  ticker: string;
  side: string;
  requested_mode: string;
  agent_id: string | null;
  trigger_event_id: string | null;
  reason: string;
  created_at: string;
}

interface OrderIntentApprovalChallengeRow {
  id: string;
  intent_id: string;
  ticker: string;
  side: string;
  requested_mode: string;
  status: string;
  confirmation_text: string;
  intent_hash: string;
  order_summary_json: string;
  kill_switch: string;
  live_execution_locked: number;
  operator_id: string | null;
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
  audit_ref: string;
}

interface OrderIntentPaperLedgerRow {
  id: string;
  intent_id: string;
  ticker: string;
  side: string;
  market: string;
  status: string;
  booked: number;
  position_delta: number | null;
  cash_delta_krw: number | null;
  note: string;
  created_at: string;
}

export function createSqliteOrderIntentStore(db: Database.Database): OrderIntentStore {
  return {
    getPreview(id) {
      const row = db
        .prepare<[string], OrderIntentRow>(
          `SELECT id, ticker, side, market, requested_mode, execution_mode,
                  status, live_execution_locked, quantity, cash_amount,
                  order_type, limit_price, trigger_event_id, agent_id, reason,
                  risk_checks_json, created_at, expires_at, audit_ref
           FROM agent_order_intents
           WHERE id = ?`,
        )
        .get(id);
      return row === undefined ? null : rowToPreview(row);
    },
    appendPreview(preview) {
      db.prepare(
        `INSERT OR REPLACE INTO agent_order_intents (
           id, ticker, side, market, requested_mode, execution_mode, status,
           live_execution_locked, quantity, cash_amount, order_type, limit_price,
           trigger_event_id, agent_id, reason, risk_checks_json, created_at,
           expires_at, audit_ref
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        preview.id,
        preview.ticker,
        preview.side,
        preview.market,
        preview.requestedMode,
        preview.executionMode,
        preview.status,
        preview.liveExecutionLocked ? 1 : 0,
        preview.quantity,
        preview.cashAmount,
        preview.orderType,
        preview.limitPrice,
        preview.triggerEventId,
        preview.agentId,
        preview.reason,
        JSON.stringify(preview.riskChecks),
        preview.createdAt,
        preview.expiresAt,
        preview.auditRef,
      );
    },
    appendPaperLedgerEntry(entry) {
      db.prepare(
        `INSERT OR REPLACE INTO agent_order_intent_paper_ledger_entries (
           id, intent_id, ticker, side, market, status, booked, position_delta,
           cash_delta_krw, note, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        entry.id,
        entry.intentId,
        entry.ticker,
        entry.side,
        entry.market,
        entry.status,
        entry.booked ? 1 : 0,
        entry.positionDelta,
        entry.cashDeltaKrw,
        entry.note,
        entry.createdAt,
      );
    },
    snapshotPaperLedger(limit) {
      const safeLimit = normalizeLimit(limit);
      const rows = db
        .prepare<[number], OrderIntentPaperLedgerRow>(
          `SELECT id, intent_id, ticker, side, market, status, booked,
                  position_delta, cash_delta_krw, note, created_at
           FROM agent_order_intent_paper_ledger_entries
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .all(safeLimit);
      return rows.map(rowToPaperLedgerEntry);
    },
    appendAudit(entry) {
      db.prepare(
        `INSERT OR REPLACE INTO agent_order_intent_audit_entries (
           id, intent_id, event, decision, ticker, side, requested_mode,
           agent_id, trigger_event_id, reason, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        entry.id,
        entry.intentId,
        entry.event,
        entry.decision,
        entry.ticker,
        entry.side,
        entry.requestedMode,
        entry.agentId,
        entry.triggerEventId,
        entry.reason,
        entry.createdAt,
      );
    },
    appendApprovalChallenge(challenge) {
      db.prepare(
        `INSERT OR REPLACE INTO agent_order_intent_approval_challenges (
           id, intent_id, ticker, side, requested_mode, status,
           confirmation_text, intent_hash, order_summary_json, kill_switch,
           live_execution_locked, operator_id, created_at, expires_at,
           confirmed_at, audit_ref
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        challenge.id,
        challenge.intentId,
        challenge.ticker,
        challenge.side,
        challenge.requestedMode,
        challenge.status,
        challenge.confirmationText,
        challenge.intentHash,
        JSON.stringify(challenge.orderSummary),
        challenge.killSwitch,
        challenge.liveExecutionLocked ? 1 : 0,
        challenge.operatorId,
        challenge.createdAt,
        challenge.expiresAt,
        challenge.confirmedAt,
        challenge.auditRef,
      );
    },
    updateApprovalChallenge(challenge) {
      db.prepare(
        `UPDATE agent_order_intent_approval_challenges
            SET status = ?,
                confirmed_at = ?
          WHERE id = ?`,
      ).run(challenge.status, challenge.confirmedAt, challenge.id);
    },
    getApprovalChallenge(id) {
      const row = db
        .prepare<[string], OrderIntentApprovalChallengeRow>(
          `SELECT id, intent_id, ticker, side, requested_mode, status,
                  confirmation_text, intent_hash, order_summary_json,
                  kill_switch, live_execution_locked, operator_id, created_at,
                  expires_at, confirmed_at, audit_ref
           FROM agent_order_intent_approval_challenges
           WHERE id = ?`,
        )
        .get(id);
      return row === undefined ? null : rowToApprovalChallenge(row);
    },
    snapshotApprovalChallenges(limit) {
      const safeLimit = normalizeLimit(limit);
      const rows = db
        .prepare<[number], OrderIntentApprovalChallengeRow>(
          `SELECT id, intent_id, ticker, side, requested_mode, status,
                  confirmation_text, intent_hash, order_summary_json,
                  kill_switch, live_execution_locked, operator_id, created_at,
                  expires_at, confirmed_at, audit_ref
           FROM agent_order_intent_approval_challenges
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .all(safeLimit);
      return rows.map(rowToApprovalChallenge);
    },
    snapshotPreviews(limit) {
      const safeLimit = normalizeLimit(limit);
      const rows = db
        .prepare<[number], OrderIntentRow>(
          `SELECT id, ticker, side, market, requested_mode, execution_mode,
                  status, live_execution_locked, quantity, cash_amount,
                  order_type, limit_price, trigger_event_id, agent_id, reason,
                  risk_checks_json, created_at, expires_at, audit_ref
           FROM agent_order_intents
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .all(safeLimit);
      return rows.map(rowToPreview);
    },
    snapshotAudit(limit) {
      const safeLimit = normalizeLimit(limit);
      const rows = db
        .prepare<[number], OrderIntentAuditRow>(
          `SELECT id, intent_id, event, decision, ticker, side, requested_mode,
                  agent_id, trigger_event_id, reason, created_at
           FROM agent_order_intent_audit_entries
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .all(safeLimit);
      return rows.map(rowToAudit);
    },
  };
}

function rowToPaperLedgerEntry(row: OrderIntentPaperLedgerRow): OrderIntentPaperLedgerEntry {
  return {
    id: row.id,
    intentId: row.intent_id,
    ticker: row.ticker,
    side: row.side as OrderIntentSide,
    market: row.market as OrderIntentMarket,
    status: 'preview_only',
    booked: false,
    positionDelta: row.position_delta,
    cashDeltaKrw: row.cash_delta_krw,
    note: row.note,
    createdAt: row.created_at,
  };
}

function rowToApprovalChallenge(row: OrderIntentApprovalChallengeRow): OrderIntentApprovalChallenge {
  const orderSummary = parseApprovalOrderSummary(row.order_summary_json, row);
  return {
    id: row.id,
    intentId: row.intent_id,
    ticker: row.ticker,
    side: row.side as OrderIntentSide,
    requestedMode: 'live',
    status: row.status as OrderIntentApprovalChallengeStatus,
    confirmationText: row.confirmation_text,
    intentHash: row.intent_hash.length > 0
      ? row.intent_hash
      : hashOrderIntentApprovalSummary(orderSummary),
    orderSummary,
    killSwitch: 'engaged',
    liveExecutionLocked: true,
    operatorId: row.operator_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
    auditRef: row.audit_ref,
  };
}

function parseApprovalOrderSummary(
  value: string,
  row: Pick<OrderIntentApprovalChallengeRow, 'ticker' | 'side'>,
): OrderIntentApprovalOrderSummary {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isApprovalOrderSummary(parsed)) return parsed;
  } catch {
    // Older rows can be restored from non-secret challenge fields.
  }
  return {
    ticker: row.ticker,
    side: row.side as OrderIntentSide,
    market: 'KR',
    orderType: 'market',
    quantity: null,
    cashAmount: null,
    limitPrice: null,
    liveExecutionLocked: true,
  };
}

function isApprovalOrderSummary(value: unknown): value is OrderIntentApprovalOrderSummary {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.ticker === 'string'
    && (record.side === 'buy' || record.side === 'sell')
    && (record.market === 'KR' || record.market === 'US')
    && (record.orderType === 'market' || record.orderType === 'limit')
    && (typeof record.quantity === 'number' || record.quantity === null)
    && (typeof record.cashAmount === 'number' || record.cashAmount === null)
    && (typeof record.limitPrice === 'number' || record.limitPrice === null)
    && record.liveExecutionLocked === true;
}

function rowToPreview(row: OrderIntentRow): OrderIntentPreview {
  const riskChecks = parseRiskChecks(row.risk_checks_json);
  return {
    id: row.id,
    ticker: row.ticker,
    side: row.side as OrderIntentSide,
    market: row.market as OrderIntentMarket,
    requestedMode: row.requested_mode as Exclude<OrderIntentRequestedMode, 'live'>,
    executionMode: row.execution_mode as Exclude<OrderIntentRequestedMode, 'live'>,
    status: 'preview_ready',
    liveExecutionLocked: true,
    quantity: row.quantity,
    cashAmount: row.cash_amount,
    orderType: row.order_type as OrderIntentOrderType,
    limitPrice: row.limit_price,
    triggerEventId: row.trigger_event_id,
    agentId: row.agent_id,
    reason: row.reason,
    riskChecks,
    strategyEvaluation: buildOrderIntentStrategyEvaluation({
      side: row.side as OrderIntentSide,
      requestedMode: row.requested_mode as Exclude<OrderIntentRequestedMode, 'live'>,
      triggerEventId: row.trigger_event_id,
      orderType: row.order_type as OrderIntentOrderType,
      market: row.market as OrderIntentMarket,
    }),
    riskPolicy: buildOrderIntentRiskPolicyEvaluation(riskChecks),
    paperLedgerPreview: buildOrderIntentPaperLedgerPreview({
      intentId: row.id,
      side: row.side as OrderIntentSide,
      market: row.market as OrderIntentMarket,
      quantity: row.quantity,
      cashAmount: row.cash_amount,
    }),
    previewImpact: buildOrderIntentPreviewImpact({
      side: row.side as OrderIntentSide,
      market: row.market as OrderIntentMarket,
      quantity: row.quantity,
      cashAmount: row.cash_amount,
      limitPrice: row.limit_price,
    }),
    lifecycle: buildOrderIntentLifecycle({ triggerEventId: row.trigger_event_id }),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    auditRef: row.audit_ref,
  };
}

function rowToAudit(row: OrderIntentAuditRow): OrderIntentAuditEntry {
  return {
    id: row.id,
    intentId: row.intent_id,
    event: row.event as OrderIntentAuditEvent,
    decision: row.decision as OrderIntentAuditDecision,
    ticker: row.ticker,
    side: row.side as OrderIntentSide,
    requestedMode: row.requested_mode as OrderIntentRequestedMode,
    agentId: row.agent_id,
    triggerEventId: row.trigger_event_id,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function parseRiskChecks(value: string): OrderIntentRiskCheck[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRiskCheck);
}

function isRiskCheck(value: unknown): value is OrderIntentRiskCheck {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === 'string'
    && (record.status === 'pass' || record.status === 'warning' || record.status === 'blocked')
    && typeof record.message === 'string';
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(200, Math.trunc(limit)));
}
