import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from '../import.js';
import type { KisRuntimeRef } from '../../bootstrap-kis.js';

describe('/import/kis-watchlist — runtime gate', () => {
  it('returns 503 when runtime not started', async () => {
    const app = Fastify({ logger: false });
    const runtimeRef: KisRuntimeRef = {
      get: vi.fn(() => ({ status: 'unconfigured' }) as never),
      start: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    };
    registerRoutes(app, { stockRepo: {} as never, runtimeRef });
    const res = await app.inject({ method: 'POST', url: '/import/kis-watchlist' });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      success: false,
      error: { code: 'KIS_RUNTIME_NOT_READY', runtime: 'unconfigured' },
    });
  });
});
