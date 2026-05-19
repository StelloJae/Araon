import { describe, expect, it } from 'vitest';

import {
  getMarketTopMoversFetchWindow,
  isFetchableMarketTopMoversSourcePhase,
  millisecondsUntilMarketTopMoversFetchWindow,
  resolveMarketTopMoversSourcePhase,
} from '../market-top-movers-phase.js';

describe('market top movers phase', () => {
  it('resolves the same KST source phases used by TOP100 ranking fetches', () => {
    expect(resolveMarketTopMoversSourcePhase(new Date('2026-05-12T22:30:00.000Z'))).toBe('stale_snapshot');
    expect(resolveMarketTopMoversSourcePhase(new Date('2026-05-12T23:30:00.000Z'))).toBe('premarket');
    expect(resolveMarketTopMoversSourcePhase(new Date('2026-05-12T23:55:00.000Z'))).toBe('opening_freeze');
    expect(resolveMarketTopMoversSourcePhase(new Date('2026-05-13T01:00:00.000Z'))).toBe('regular');
    expect(resolveMarketTopMoversSourcePhase(new Date('2026-05-13T07:00:00.000Z'))).toBe('after_hours');
    expect(resolveMarketTopMoversSourcePhase(new Date('2026-05-13T11:30:00.000Z'))).toBe('stale_snapshot');
  });

  it('marks only provider-fetchable phases as supported for live TOP100 acceptance', () => {
    expect(isFetchableMarketTopMoversSourcePhase('premarket')).toBe(true);
    expect(isFetchableMarketTopMoversSourcePhase('regular')).toBe(true);
    expect(isFetchableMarketTopMoversSourcePhase('after_hours')).toBe(true);
    expect(isFetchableMarketTopMoversSourcePhase('opening_freeze')).toBe(false);
    expect(isFetchableMarketTopMoversSourcePhase('stale_snapshot')).toBe(false);
    expect(isFetchableMarketTopMoversSourcePhase('unsupported')).toBe(false);
  });

  it('returns the current fetchable window while inside one', () => {
    const window = getMarketTopMoversFetchWindow(new Date('2026-05-13T01:00:00.000Z'));

    expect(window).toEqual({
      phase: 'regular',
      currentWindow: true,
      startsAt: '2026-05-13T00:00:00.000Z',
      endsAt: '2026-05-13T06:30:00.000Z',
    });
  });

  it('returns the next fetchable KST window when the current phase is unsupported', () => {
    const beforePremarket = getMarketTopMoversFetchWindow(new Date('2026-05-12T22:30:00.000Z'));
    const openingFreeze = getMarketTopMoversFetchWindow(new Date('2026-05-12T23:55:00.000Z'));
    const afterClose = getMarketTopMoversFetchWindow(new Date('2026-05-13T11:30:00.000Z'));

    expect(beforePremarket).toEqual({
      phase: 'premarket',
      currentWindow: false,
      startsAt: '2026-05-12T23:00:00.000Z',
      endsAt: '2026-05-12T23:50:00.000Z',
    });
    expect(openingFreeze).toEqual({
      phase: 'regular',
      currentWindow: false,
      startsAt: '2026-05-13T00:00:00.000Z',
      endsAt: '2026-05-13T06:30:00.000Z',
    });
    expect(afterClose).toEqual({
      phase: 'premarket',
      currentWindow: false,
      startsAt: '2026-05-13T23:00:00.000Z',
      endsAt: '2026-05-13T23:50:00.000Z',
    });
  });

  it('returns zero wait while fetchable and positive wait before the next window', () => {
    expect(millisecondsUntilMarketTopMoversFetchWindow(new Date('2026-05-13T01:00:00.000Z'))).toBe(0);
    expect(millisecondsUntilMarketTopMoversFetchWindow(new Date('2026-05-12T22:59:30.000Z'))).toBe(30_000);
    expect(millisecondsUntilMarketTopMoversFetchWindow(new Date('2026-05-12T23:55:00.000Z'))).toBe(5 * 60_000);
  });
});
