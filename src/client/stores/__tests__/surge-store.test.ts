import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('useSurgeStore momentum entries', () => {
  it('does not create duplicate rows for the same active ticker', async () => {
    const { useSurgeStore } = await import('../surge-store');
    const s = useSurgeStore.getState();
    s.spawn({
      code: '005930',
      name: '삼성전자',
      price: 100_000,
      surgePct: 1.9,
      source: 'realtime-momentum',
      signalType: 'scalp',
      momentumPct: 1.9,
      momentumWindow: '30s',
    });
    s.spawn({
      code: '005930',
      name: '삼성전자',
      price: 100_100,
      surgePct: 2.0,
      source: 'realtime-momentum',
      signalType: 'scalp',
      momentumPct: 2.0,
      momentumWindow: '30s',
    });

    expect(useSurgeStore.getState().feed).toHaveLength(1);
  });

  it('updates the existing row when signal level escalates', async () => {
    const { useSurgeStore } = await import('../surge-store');
    const s = useSurgeStore.getState();
    s.spawn({
      code: '005930',
      name: '삼성전자',
      price: 100_000,
      surgePct: 1.9,
      source: 'realtime-momentum',
      signalType: 'scalp',
      momentumPct: 1.9,
      momentumWindow: '30s',
    });
    s.spawn({
      code: '005930',
      name: '삼성전자',
      price: 103_100,
      surgePct: 3.1,
      source: 'realtime-momentum',
      signalType: 'strong_scalp',
      momentumPct: 3.1,
      momentumWindow: '30s',
    });

    expect(useSurgeStore.getState().feed).toHaveLength(1);
    expect(useSurgeStore.getState().feed[0]).toMatchObject({
      signalType: 'strong_scalp',
      momentumPct: 3.1,
      price: 103_100,
    });
  });

  it('can attach exit warning state to an active row', async () => {
    const { useSurgeStore } = await import('../surge-store');
    const s = useSurgeStore.getState();
    s.spawn({
      code: '005930',
      name: '삼성전자',
      price: 100_000,
      surgePct: 1.9,
      source: 'realtime-momentum',
      signalType: 'scalp',
      momentumPct: 1.9,
      momentumWindow: '30s',
    });
    s.update('005930', {
      exitWarning: {
        type: 'drawdown_from_high',
        message: '이탈 경고',
        valuePct: -0.8,
      },
    });

    expect(useSurgeStore.getState().feed[0]?.exitWarning?.message).toBe(
      '이탈 경고',
    );
  });
});
