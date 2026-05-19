import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from 'fastify';
import { z } from 'zod';

import type {
  TossCompletedOrdersOptions,
  TossOrdersClient,
} from '../toss/toss-orders-client.js';
import { sendTossReadRouteError } from './toss-read-route-error.js';

export interface TossOrdersRoutesOptions extends FastifyPluginOptions {
  readonly ordersClient: TossOrdersClient;
}

export async function tossOrdersRoutes(
  app: FastifyInstance,
  opts: TossOrdersRoutesOptions,
): Promise<void> {
  function handleError(err: unknown, reply: FastifyReply): unknown {
    if (err instanceof Error && err.message === 'Toss order ref was not found') {
      return reply.status(404).send({
        success: false,
        error: { code: 'TOSS_ORDER_NOT_FOUND' },
      });
    }
    return sendTossReadRouteError(err, reply);
  }

  app.get('/toss/orders/pending', async (_request, reply) => {
    try {
      return reply.send({
        success: true,
        data: await opts.ordersClient.listPendingOrders(),
      });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  app.get('/toss/orders/completed', async (request, reply) => {
    const parsed = completedOrdersQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TOSS_COMPLETED_ORDERS_QUERY' },
      });
    }
    try {
      return reply.send({
        success: true,
        data: await opts.ordersClient.listCompletedOrders(toCompletedOptions(parsed.data)),
      });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  app.get('/toss/orders/:ref', async (request, reply) => {
    const params = orderRefParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TOSS_ORDER_REF' },
      });
    }
    const parsed = completedOrdersQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TOSS_COMPLETED_ORDERS_QUERY' },
      });
    }
    try {
      return reply.send({
        success: true,
        data: await opts.ordersClient.getOrder(
          params.data.ref,
          toCompletedOptions(parsed.data),
        ),
      });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });
}

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const orderRefParamsSchema = z.object({
  ref: z.string().regex(/^(pending|completed)-order-[1-9]\d*$/),
});
const completedOrdersQuerySchema = z.object({
  market: z.enum(['kr', 'us', 'all']).optional(),
  from: ymdSchema.optional(),
  to: ymdSchema.optional(),
  size: numericQuerySchema(1, 100).optional(),
  number: numericQuerySchema(1, 100).optional(),
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

function toCompletedOptions(
  value: z.infer<typeof completedOrdersQuerySchema>,
): TossCompletedOrdersOptions {
  return {
    ...(value.market === undefined ? {} : { market: value.market }),
    ...(value.from === undefined ? {} : { from: value.from }),
    ...(value.to === undefined ? {} : { to: value.to }),
    ...(value.size === undefined ? {} : { size: value.size }),
    ...(value.number === undefined ? {} : { number: value.number }),
  };
}
