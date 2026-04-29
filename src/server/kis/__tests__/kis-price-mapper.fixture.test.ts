import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mapKisInquirePriceToPrice } from '../kis-price-mapper.js';

// Regression guard: freeze the shape + value mapping observed on 2026-04-24
// live KIS call (samsung 005930, 장 마감). If KIS changes its response schema
// or our mapper drifts, this test fails loudly so we can update fixture and
// mapper together rather than silently coerce bad data.

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '__fixtures__', 'inquire-price-005930.redacted.json');

describe('mapKisInquirePriceToPrice — live-observed fixture (005930)', () => {
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>;

  it('maps fixture to the values observed on live KIS 2026-04-24', () => {
    const price = mapKisInquirePriceToPrice('005930', raw);
    expect(price.ticker).toBe('005930');
    expect(price.price).toBe(219500);
    expect(price.changeRate).toBeCloseTo(-2.23, 2);
    expect(price.changeAbs).toBe(-5000);
    expect(price.volume).toBe(19_165_257);
    expect(price.isSnapshot).toBe(false);
    expect(price.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('fixture carries no secrets — regression guard for accidental leaks', () => {
    const asText = JSON.stringify(raw).toLowerCase();
    expect(asText).not.toContain('appkey');
    expect(asText).not.toContain('appsecret');
    expect(asText).not.toContain('accesstoken');
    expect(asText).not.toContain('approval_key');
    expect(asText).not.toContain('approvalkey');
    // Bearer tokens are base64ish and often include the literal 'bearer'.
    expect(asText).not.toContain('bearer ');
  });
});
