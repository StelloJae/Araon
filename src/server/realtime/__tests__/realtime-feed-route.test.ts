import { describe, expect, it } from 'vitest';

import {
  KIS_WS_TICK_TR_ID_INTEGRATED,
  KIS_WS_TICK_TR_ID_NXT,
} from '@shared/kis-constraints.js';
import { resolveRealtimeTickTrId } from '../realtime-feed-route.js';

function atKst(hhmm: string): Date {
  const [hour, minute] = hhmm.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(2026, 4, 8, hour - 9, minute, 0, 0));
}

describe('resolveRealtimeTickTrId', () => {
  it('uses NXT ticks during premarket and after-hours windows', () => {
    expect(resolveRealtimeTickTrId(atKst('08:10'))).toBe(KIS_WS_TICK_TR_ID_NXT);
    expect(resolveRealtimeTickTrId(atKst('08:55'))).toBe(KIS_WS_TICK_TR_ID_NXT);
    expect(resolveRealtimeTickTrId(atKst('15:40'))).toBe(KIS_WS_TICK_TR_ID_NXT);
    expect(resolveRealtimeTickTrId(atKst('19:59'))).toBe(KIS_WS_TICK_TR_ID_NXT);
  });

  it('uses the integrated feed during regular KRX session', () => {
    expect(resolveRealtimeTickTrId(atKst('09:00'))).toBe(KIS_WS_TICK_TR_ID_INTEGRATED);
    expect(resolveRealtimeTickTrId(atKst('15:20'))).toBe(KIS_WS_TICK_TR_ID_INTEGRATED);
    expect(resolveRealtimeTickTrId(atKst('15:29'))).toBe(KIS_WS_TICK_TR_ID_INTEGRATED);
  });
});
