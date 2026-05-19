import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from 'fastify';
import { z } from 'zod';

import type {
  TossTransactionsClient,
  TossTransactionsOptions,
} from '../toss/toss-transactions-client.js';
import { sendTossReadRouteError } from './toss-read-route-error.js';

export interface TossTransactionsRoutesOptions extends FastifyPluginOptions {
  readonly transactionsClient: TossTransactionsClient;
}

export async function tossTransactionsRoutes(
  app: FastifyInstance,
  opts: TossTransactionsRoutesOptions,
): Promise<void> {
  function handleError(err: unknown, reply: FastifyReply): unknown {
    return sendTossReadRouteError(err, reply);
  }

  app.get('/toss/transactions', async (request, reply) => {
    const parsed = transactionsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TOSS_TRANSACTIONS_QUERY' },
      });
    }
    try {
      return reply.send({
        success: true,
        data: await opts.transactionsClient.listTransactions(toTransactionsOptions(parsed.data)),
      });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  app.get('/toss/transactions/overview', async (request, reply) => {
    const parsed = transactionsOverviewQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TOSS_TRANSACTIONS_OVERVIEW_QUERY' },
      });
    }
    try {
      return reply.send({
        success: true,
        data: await opts.transactionsClient.getOverview(parsed.data.market),
      });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });
}

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const transactionsQuerySchema = z.object({
  market: z.enum(['kr', 'us']).optional(),
  from: ymdSchema.optional(),
  to: ymdSchema.optional(),
  filter: z.enum(['all', 'trade', 'cash', 'inout', 'cash-alt']).optional(),
  size: numericQuerySchema(1, 100).optional(),
  number: numericQuerySchema(0, 100).optional(),
});
const transactionsOverviewQuerySchema = z.object({
  market: z.enum(['kr', 'us']).optional(),
});

function numericQuerySchema(min: number, max: number) {
  return z.string().transform((value, ctx) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `expected integer between ${min} and ${max}`,
      });
      return z.NEVER;
    }
    return parsed;
  });
}

function toTransactionsOptions(
  value: z.infer<typeof transactionsQuerySchema>,
): TossTransactionsOptions {
  return {
    ...(value.market === undefined ? {} : { market: value.market }),
    ...(value.from === undefined ? {} : { from: value.from }),
    ...(value.to === undefined ? {} : { to: value.to }),
    ...(value.filter === undefined ? {} : { filter: value.filter }),
    ...(value.size === undefined ? {} : { size: value.size }),
    ...(value.number === undefined ? {} : { number: value.number }),
  };
}
