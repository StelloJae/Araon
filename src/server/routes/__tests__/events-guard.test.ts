import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { eventsRoutes } from '../events.js';
import type { KisRuntimeRef } from '../../bootstrap-kis.js';

describe('GET /events — runtime gate', () => {
  it('returns 503 when runtimeRef is not started', async () => {
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
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      success: false,
      error: { code: 'KIS_RUNTIME_NOT_READY', runtime: 'unconfigured' },
    });
  });
});
