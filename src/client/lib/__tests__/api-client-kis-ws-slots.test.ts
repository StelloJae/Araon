import { afterEach, describe, expect, it, vi } from 'vitest';

import { getKisWsSlotStatus } from '../api-client';

describe('getKisWsSlotStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes the current screen ticker as a sanitized query parameter', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        enabled: true,
        provider: 'kis',
        perProfileCap: 40,
        activeCount: 1,
        fallbackCount: 0,
        churnCooldownMs: 30_000,
        diff: {
          subscribe: ['A000660'],
          unsubscribe: [],
        },
        candidates: [],
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    await getKisWsSlotStatus('A000660');

    expect(fetchMock).toHaveBeenCalledWith(
      '/runtime/realtime/kis-ws-slots?currentTicker=A000660',
    );
  });

  it('unwraps the sanitized subscribe/unsubscribe diff from the slot preview', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        enabled: true,
        provider: 'kis',
        perProfileCap: 40,
        activeCount: 1,
        fallbackCount: 0,
        churnCooldownMs: 30_000,
        diff: {
          subscribe: ['000660'],
          unsubscribe: ['005930'],
        },
        candidates: [],
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    const status = await getKisWsSlotStatus(null);

    expect(status.diff).toEqual({
      subscribe: ['000660'],
      unsubscribe: ['005930'],
    });
  });
});
