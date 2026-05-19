import type { FastifyReply } from 'fastify';

export function sendTossReadRouteError(err: unknown, reply: FastifyReply): unknown {
  if (err instanceof Error && err.message === 'Toss session is required') {
    return reply.status(503).send({
      success: false,
      error: { code: 'TOSS_SESSION_REQUIRED' },
    });
  }
  return reply.status(502).send({
    success: false,
    error: {
      code: 'TOSS_READ_REQUEST_FAILED',
      message: 'Toss read request failed',
    },
  });
}
