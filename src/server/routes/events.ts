/**
 * Fastify plugin for the SSE events endpoint.
 *
 * Registers `GET /events` which keeps the HTTP connection open and streams
 * SSE frames produced by the injected `sseManager`. The plugin does not
 * bootstrap Fastify itself — it is registered by the Phase 8 entrypoint.
 *
 * Toss-first mode can use an app-level SSE manager even when KIS is not
 * started. If no app-level manager is injected, the route falls back to the
 * legacy KIS runtime SSE manager.
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createChildLogger } from '@shared/logger.js';
import type { KisRuntimeRef } from '../bootstrap-kis.js';
import type { SseManagerHandle } from '../sse/sse-manager.js';

const log = createChildLogger('routes/events');

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface EventsRoutesOptions extends FastifyPluginOptions {
  runtimeRef: KisRuntimeRef;
  sseManager?: SseManagerHandle;
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
    const sseManager = opts.sseManager ?? (rs.status === 'started' ? rs.runtime.sseManager : null);
    if (sseManager === null) {
      return reply.code(503).send({
        success: false,
        error: { code: 'EVENT_STREAM_NOT_READY', runtime: rs.status },
      });
    }

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
