/**
 * Fastify plugin for the SSE events endpoint.
 *
 * Registers `GET /events` which keeps the HTTP connection open and streams
 * SSE frames produced by the injected `sseManager`. The plugin does not
 * bootstrap Fastify itself — it is registered by the Phase 8 entrypoint.
 *
 * The KIS runtime must be in `started` state before SSE clients can connect.
 * Requests arriving before that return 503 so the client can retry.
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createChildLogger } from '@shared/logger.js';
import type { KisRuntimeRef } from '../bootstrap-kis.js';

const log = createChildLogger('routes/events');

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface EventsRoutesOptions extends FastifyPluginOptions {
  runtimeRef: KisRuntimeRef;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function eventsRoutes(
  app: FastifyInstance,
  opts: EventsRoutesOptions,
): Promise<void> {
  const { runtimeRef } = opts;

  app.get('/events', (request, reply) => {
    const rs = runtimeRef.get();
    if (rs.status !== 'started') {
      return reply.code(503).send({
        success: false,
        error: { code: 'KIS_RUNTIME_NOT_READY', runtime: rs.status },
      });
    }

    const { sseManager } = rs.runtime;

    // SSE-required headers
    void reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    function write(frame: string): void {
      reply.raw.write(frame);
    }

    function close(): void {
      reply.raw.end();
    }

    const detach = sseManager.attachClient(write, close);

    request.raw.on('close', () => {
      log.debug('SSE client disconnected');
      detach();
    });

    // Prevent Fastify from auto-responding — the connection stays open.
    return reply;
  });
}
