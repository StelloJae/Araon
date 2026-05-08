import { describe, expect, it } from 'vitest';
import { planRealtimeSessionPool } from '../realtime-session-pool.js';

describe('planRealtimeSessionPool', () => {
  it('splits candidates across enabled profiles with a per-profile cap', () => {
    const plan = planRealtimeSessionPool({
      perSessionCap: 2,
      profiles: [
        { id: 'primary', label: 'Primary', enabled: true },
        { id: 'secondary', label: 'Secondary', enabled: true },
      ],
      candidates: ['000001', '000002', '000003', '000004', '000005'],
    });

    expect(plan.totalCapacity).toBe(4);
    expect(plan.assignedTickerCount).toBe(4);
    expect(plan.fallbackTickerCount).toBe(1);
    expect(plan.sessions.map((session) => session.tickers)).toEqual([
      ['000001', '000002'],
      ['000003', '000004'],
    ]);
  });

  it('ignores disabled profiles and keeps overflow on polling fallback', () => {
    const plan = planRealtimeSessionPool({
      perSessionCap: 2,
      profiles: [
        { id: 'primary', label: 'Primary', enabled: true },
        { id: 'disabled', label: 'Disabled', enabled: false },
      ],
      candidates: ['000001', '000002', '000003'],
    });

    expect(plan.enabledProfileCount).toBe(1);
    expect(plan.totalCapacity).toBe(2);
    expect(plan.fallbackTickerCount).toBe(1);
    expect(plan.sessions).toHaveLength(1);
  });
});
