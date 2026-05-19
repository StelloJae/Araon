import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from 'fastify';

import type {
  OrderIntentInput,
  OrderIntentService,
} from '../agent/order-intent-service.js';

type MutableOrderIntentInput = {
  -readonly [Key in keyof OrderIntentInput]: OrderIntentInput[Key];
};

export interface AgentOrderIntentRoutesOptions extends FastifyPluginOptions {
  readonly service: OrderIntentService;
}

export async function agentOrderIntentRoutes(
  app: FastifyInstance,
  opts: AgentOrderIntentRoutesOptions,
): Promise<void> {
  app.post('/agent/order-intents/preview', async (request, reply) => {
    try {
      const result = opts.service.createPreview(parsePreviewBody(request.body));
      if (result.rejection !== null) {
        return reply.code(423).send({
          success: false,
          error: {
            code: result.rejection.code,
            message: result.rejection.message,
          },
          data: {
            auditRef: result.rejection.auditRef,
          },
        });
      }
      return reply.send({
        success: true,
        data: {
          preview: result.preview,
        },
      });
    } catch (err: unknown) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'invalid_order_intent',
          message: safeRouteErrorMessage(err, 'Invalid order intent request'),
        },
      });
    }
  });

  app.get('/agent/order-intents', async (request, reply) => {
    try {
      const limit = parseLimit((request.query as { limit?: unknown }).limit);
      const items = opts.service.snapshotPreviews(limit);
      return reply.send({
        success: true,
        data: {
          items,
          returnedCount: items.length,
        },
      });
    } catch {
      return sendSnapshotFailure(reply, 'Order intent snapshot failed');
    }
  });

  app.get('/agent/order-intents/live-policy', async (_request, reply) => {
    try {
      return reply.send({
        success: true,
        data: {
          policy: opts.service.snapshotLivePolicy(),
        },
      });
    } catch {
      return sendSnapshotFailure(reply, 'Order intent live policy snapshot failed');
    }
  });

  app.post('/agent/order-intents/:intentId/approval-challenge', async (request, reply) => {
    try {
      const params = request.params as { intentId?: unknown };
      const result = opts.service.createApprovalChallenge({
        intentId: requiredString(params.intentId, 'intentId'),
        ...parseApprovalChallengeBody(request.body),
      });
      if (result.rejection !== null) {
        return reply.code(404).send({
          success: false,
          error: {
            code: result.rejection.code,
            message: result.rejection.message,
          },
          data: {
            auditRef: result.rejection.auditRef,
          },
        });
      }
      return reply.send({
        success: true,
        data: {
          challenge: result.challenge,
        },
      });
    } catch (err: unknown) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'invalid_approval_challenge',
          message: safeRouteErrorMessage(err, 'Invalid approval challenge request'),
        },
      });
    }
  });

  app.post('/agent/order-intents/approval-challenges/:challengeId/confirm', async (request, reply) => {
    try {
      const params = request.params as { challengeId?: unknown };
      const result = opts.service.confirmApprovalChallenge({
        challengeId: requiredString(params.challengeId, 'challengeId'),
        confirmationText: parseConfirmBody(request.body).confirmationText,
      });
      if (result.rejection !== null) {
        const code = result.rejection.code === 'challenge_not_found' ? 404 : 423;
        return reply.code(code).send({
          success: false,
          error: {
            code: result.rejection.code,
            message: result.rejection.message,
          },
          data: {
            challenge: result.challenge,
            auditRef: result.rejection.auditRef,
            liveExecutionLocked: result.liveExecutionLocked,
            execution: result.execution,
            lockedExecutionProof: result.lockedExecutionProof,
          },
        });
      }
      return reply.send({
        success: true,
        data: {
          challenge: result.challenge,
          liveExecutionLocked: result.liveExecutionLocked,
          execution: result.execution,
          lockedExecutionProof: result.lockedExecutionProof,
        },
      });
    } catch (err: unknown) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'invalid_approval_confirmation',
          message: safeRouteErrorMessage(err, 'Invalid approval confirmation request'),
        },
      });
    }
  });

  app.get('/agent/order-intents/approval-challenges', async (request, reply) => {
    try {
      const limit = parseLimit((request.query as { limit?: unknown }).limit);
      const items = opts.service.snapshotApprovalChallenges(limit);
      return reply.send({
        success: true,
        data: {
          items,
          returnedCount: items.length,
        },
      });
    } catch {
      return sendSnapshotFailure(reply, 'Order intent approval challenge snapshot failed');
    }
  });

  app.get('/agent/order-intents/audit', async (request, reply) => {
    try {
      const limit = parseLimit((request.query as { limit?: unknown }).limit);
      const items = opts.service.snapshotAudit(limit);
      return reply.send({
        success: true,
        data: {
          items,
          returnedCount: items.length,
        },
      });
    } catch {
      return sendSnapshotFailure(reply, 'Order intent audit snapshot failed');
    }
  });

  app.get('/agent/order-intents/paper-ledger', async (request, reply) => {
    try {
      const limit = parseLimit((request.query as { limit?: unknown }).limit);
      return reply.send({
        success: true,
        data: opts.service.snapshotPaperLedger(limit),
      });
    } catch {
      return sendSnapshotFailure(reply, 'Order intent paper ledger snapshot failed');
    }
  });

  app.get('/agent/order-intents/performance-review', async (request, reply) => {
    try {
      const limit = parseLimit((request.query as { limit?: unknown }).limit);
      return reply.send({
        success: true,
        data: opts.service.snapshotPerformanceReview(limit),
      });
    } catch {
      return sendSnapshotFailure(reply, 'Order intent performance review snapshot failed');
    }
  });

  app.get('/agent/order-intents/reconciliation', async (request, reply) => {
    try {
      const limit = parseLimit((request.query as { limit?: unknown }).limit);
      return reply.send({
        success: true,
        data: opts.service.snapshotReconciliation(limit),
      });
    } catch {
      return sendSnapshotFailure(reply, 'Order intent reconciliation snapshot failed');
    }
  });
}

function parsePreviewBody(body: unknown): OrderIntentInput {
  if (body === null || typeof body !== 'object') {
    throw new Error('Invalid order intent body');
  }
  const record = body as Record<string, unknown>;
  const input: MutableOrderIntentInput = {
    ticker: requiredString(record.ticker, 'ticker'),
    side: requiredString(record.side, 'side') as OrderIntentInput['side'],
    reason: requiredString(record.reason, 'reason'),
  };
  const market = optionalString(record.market);
  if (market !== undefined) input.market = market as NonNullable<OrderIntentInput['market']>;
  const quantity = optionalNumber(record.quantity);
  if (quantity !== undefined) input.quantity = quantity;
  const cashAmount = optionalNumber(record.cashAmount);
  if (cashAmount !== undefined) input.cashAmount = cashAmount;
  const orderType = optionalString(record.orderType);
  if (orderType !== undefined) input.orderType = orderType as NonNullable<OrderIntentInput['orderType']>;
  const limitPrice = optionalNumber(record.limitPrice);
  if (limitPrice !== undefined) input.limitPrice = limitPrice;
  const triggerEventId = optionalString(record.triggerEventId);
  if (triggerEventId !== undefined) input.triggerEventId = triggerEventId;
  const agentId = optionalString(record.agentId);
  if (agentId !== undefined) input.agentId = agentId;
  const requestedMode = optionalString(record.requestedMode);
  if (requestedMode !== undefined) input.requestedMode = requestedMode as NonNullable<OrderIntentInput['requestedMode']>;
  return input;
}

function parseApprovalChallengeBody(body: unknown): {
  operatorId?: string | null;
  expiresInMs?: number;
} {
  if (body === null || typeof body !== 'object') return {};
  const record = body as Record<string, unknown>;
  const output: {
    operatorId?: string | null;
    expiresInMs?: number;
  } = {};
  const operatorId = optionalString(record.operatorId);
  if (operatorId !== undefined) output.operatorId = operatorId;
  const expiresInMs = optionalNumber(record.expiresInMs);
  if (expiresInMs !== undefined) output.expiresInMs = expiresInMs;
  return output;
}

function parseConfirmBody(body: unknown): { confirmationText: string } {
  if (body === null || typeof body !== 'object') {
    throw new Error('Invalid approval confirmation body');
  }
  const record = body as Record<string, unknown>;
  return {
    confirmationText: requiredString(record.confirmationText, 'confirmationText'),
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Missing order intent ${field}`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function parseLimit(value: unknown): number {
  if (typeof value !== 'string') return 50;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 50;
  if (parsed < 1) return 1;
  if (parsed > 200) return 200;
  return parsed;
}

function sendSnapshotFailure(reply: FastifyReply, message: string): unknown {
  return reply.code(500).send({
    success: false,
    error: {
      code: 'order_intent_snapshot_failed',
      message,
    },
  });
}

const SAFE_ROUTE_ERROR_PREFIXES = [
  'Missing order intent ',
  'Invalid order intent ',
  'Invalid approval confirmation body',
];
const SENSITIVE_ROUTE_ERROR_PATTERN =
  /\b(?:SESSION|UTK|LTK|FTK|browserSessionId|deviceId|accountNo|orderNo|referenceId|approval[_-]?key|appKey|appSecret|secretKey|access[_-]?token|bearer)\b/i;

function safeRouteErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const message = err.message.trim();
  if (message.length === 0) return fallback;
  if (SENSITIVE_ROUTE_ERROR_PATTERN.test(message)) return fallback;
  if (!SAFE_ROUTE_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix))) {
    return fallback;
  }
  return message;
}
