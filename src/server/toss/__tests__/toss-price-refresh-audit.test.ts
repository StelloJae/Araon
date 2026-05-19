import { describe, expect, it } from 'vitest';

import {
  createTossPriceRefreshAuditHint,
  mapTossQuoteRefreshAuditResult,
} from '../toss-price-refresh-audit.js';

describe('Toss price-refresh audit helpers', () => {
  it('builds sanitized quote refresh hints from Toss price-refresh events', () => {
    expect(createTossPriceRefreshAuditHint({
      stockCode: 'A005930',
      receivedAt: '2026-05-11T06:00:01.000Z',
    })).toEqual({
      resource: 'quote',
      ticker: '005930',
      receivedAt: '2026-05-11T06:00:01.000Z',
      sourceType: 'price-refresh',
      reason: 'Toss SSE price-refresh thin notification',
    });

    expect(createTossPriceRefreshAuditHint({
      stockCode: 'raw-session-looking-value',
      receivedAt: '2026-05-11T06:00:01.000Z',
    }).ticker).toBeNull();
  });

  it('maps quote refresh outcomes into the shared sanitized audit result set', () => {
    expect(mapTossQuoteRefreshAuditResult('refreshed')).toBe('refreshed');
    expect(mapTossQuoteRefreshAuditResult('throttled')).toBe('throttled');
    expect(mapTossQuoteRefreshAuditResult('in_flight')).toBe('in_flight');
    expect(mapTossQuoteRefreshAuditResult('ignored')).toBe('ignored');
    expect(mapTossQuoteRefreshAuditResult('untracked')).toBe('ignored');
    expect(mapTossQuoteRefreshAuditResult('missing')).toBe('ignored');
  });
});
