import { describe, expect, it } from 'vitest';
import { isBackfillAllowed } from '../backfill-policy.js';

describe('isBackfillAllowed', () => {
  it('rejects weekday warmup and market hours', () => {
    expect(isBackfillAllowed(new Date('2026-05-05T22:59:00.000Z'), 'snapshot')).toBe(false); // 07:59 KST
    expect(isBackfillAllowed(new Date('2026-05-04T23:00:00.000Z'), 'open')).toBe(false); // 08:00 KST
    expect(isBackfillAllowed(new Date('2026-05-05T06:00:00.000Z'), 'open')).toBe(false); // 15:00 KST
    expect(isBackfillAllowed(new Date('2026-05-05T10:59:00.000Z'), 'open')).toBe(false); // 19:59 KST
  });

  it('allows weekday backfill only after the post-close safety window', () => {
    expect(isBackfillAllowed(new Date('2026-05-05T11:04:59.000Z'), 'closed')).toBe(false); // 20:04:59 KST
    expect(isBackfillAllowed(new Date('2026-05-05T11:05:00.000Z'), 'closed')).toBe(true); // 20:05 KST
  });

  it('allows weekend catch-up and rejects unknown phase', () => {
    expect(isBackfillAllowed(new Date('2026-05-09T03:00:00.000Z'), 'closed')).toBe(true);
    expect(isBackfillAllowed(new Date('2026-05-05T12:00:00.000Z'), 'unknown')).toBe(false);
  });
});
