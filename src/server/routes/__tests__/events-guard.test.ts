import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { eventsRoutes } from '../events.js';
import type { KisRuntimeRef } from '../../bootstrap-kis.js';

describe('GET /events — app-level SSE fallback', () => {
  it('uses an injected SSE manager when runtimeRef is not started', async () => {
    const runtimeRef: KisRuntimeRef = {
      get: vi.fn(() => ({ status: 'unconfigured' }) as never),
      start: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    };
    const app = Fastify({ logger: false });
    const sseManager = {
      attachClient: vi.fn((write: (frame: string) => void, close: () => void) => {
        write('event: snapshot\\ndata: {"type":"snapshot","prices":[],"marketStatus":"snapshot"}\\n\\n');
        close();
        return vi.fn();
      }),
      closeAll: vi.fn(async () => undefined),
      broadcastError: vi.fn(),
      getClientCount: vi.fn(() => 0),
    };
    await app.register(eventsRoutes, { runtimeRef, sseManager });
    const res = await app.inject({ method: 'GET', url: '/events' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('event: snapshot');
    expect(sseManager.attachClient).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when neither app-level nor KIS SSE is available', async () => {
    const runtimeRef: KisRuntimeRef = {
      get: vi.fn(() => ({ status: 'unconfigured' }) as never),
      start: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    };
    const app = Fastify({ logger: false });
    await app.register(eventsRoutes, { runtimeRef });
    const res = await app.inject({ method: 'GET', url: '/events' });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({
      success: false,
      error: { code: 'EVENT_STREAM_NOT_READY', runtime: 'unconfigured' },
    });
  });
});
