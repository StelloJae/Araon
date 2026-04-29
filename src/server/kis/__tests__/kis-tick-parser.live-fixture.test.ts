import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseKisTickFrame } from '../kis-tick-parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '__fixtures__',
  'ws-tick-h0uncnt0-005930-live.redacted.json',
);

interface LiveFixture {
  raw: string;
  expected: {
    kind: 'ticks';
    tick: {
      trId: 'H0UNCNT0';
      source: 'integrated';
      ticker: '005930';
    };
  };
}

describe('parseKisTickFrame — NXT3 live H0UNCNT0 fixture', () => {
  it('parses the redacted 005930 live smoke frame without secrets', () => {
    expect(
      existsSync(fixturePath),
      'run scripts/probe-kis-ws-one-ticker.mts to capture the NXT3 live fixture',
    ).toBe(true);

    const text = readFileSync(fixturePath, 'utf8');
    expect(text).not.toMatch(/[A-Za-z0-9_-]{40,}/);
    expect(text).not.toMatch(/approval_key\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/appsecret\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/secretkey\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/access[_-]?token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i);
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i);

    const fixture = JSON.parse(text) as LiveFixture;
    const result = parseKisTickFrame(fixture.raw);

    expect(result.kind).toBe('ticks');
    if (result.kind !== 'ticks') return;

    expect(result.ticks).toHaveLength(1);
    const tick = result.ticks[0]!;
    expect(tick.trId).toBe(fixture.expected.tick.trId);
    expect(tick.trId).toBe('H0UNCNT0');
    expect(tick.source).toBe(fixture.expected.tick.source);
    expect(tick.source).toBe('integrated');
    expect(tick.ticker).toBe(fixture.expected.tick.ticker);
    expect(tick.ticker).toBe('005930');
    expect(Number.isFinite(tick.price)).toBe(true);
    expect(Number.isFinite(tick.changeAbs)).toBe(true);
    expect(Number.isFinite(tick.changeRate)).toBe(true);
    expect(Number.isFinite(tick.volume)).toBe(true);
    expect(tick.tradeTime).toMatch(/^\d{6}$/);
    expect(tick.isSnapshot).toBe(false);
  });
});
