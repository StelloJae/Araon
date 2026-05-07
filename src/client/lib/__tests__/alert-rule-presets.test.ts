import { describe, expect, it } from 'vitest';

import {
  buildQuickAlertRulePresets,
  findMatchingAlertRule,
} from '../alert-rule-presets';
import type { AlertRule } from '../../stores/alert-rules-store';

describe('alert rule quick presets', () => {
  it('builds stock-scoped presets from current quote fields', () => {
    const presets = buildQuickAlertRulePresets({
      code: '005930',
      price: 70_000,
    });

    expect(presets.map((p) => p.id)).toEqual([
      'change-up-5',
      'change-down-5',
      'volume-surge-2_5',
      'price-up-3',
    ]);
    expect(presets[0]?.input).toMatchObject({
      ticker: '005930',
      kind: 'changePctAbove',
      threshold: 5,
    });
    expect(presets[1]?.input).toMatchObject({
      ticker: '005930',
      kind: 'changePctBelow',
      threshold: -5,
    });
    expect(presets[2]?.input).toMatchObject({
      ticker: '005930',
      kind: 'volumeSurgeRatioAbove',
      threshold: 2.5,
    });
    expect(presets[3]?.input).toMatchObject({
      ticker: '005930',
      kind: 'priceAbove',
      threshold: 72_100,
    });
  });

  it('does not offer a current-price preset when price is unavailable', () => {
    const presets = buildQuickAlertRulePresets({
      code: '005930',
      price: 0,
    });

    expect(presets.map((p) => p.id)).not.toContain('price-up-3');
  });

  it('matches existing rules by ticker kind threshold and market cap scope', () => {
    const existing: AlertRule = {
      id: 'rule-1',
      ticker: '005930',
      kind: 'changePctAbove',
      threshold: 5,
      marketCapFilter: 'all',
      enabled: true,
      cooldownMs: 300_000,
      createdAt: 1,
      updatedAt: 1,
    };

    expect(
      findMatchingAlertRule([existing], {
        ticker: '005930',
        kind: 'changePctAbove',
        threshold: 5,
      }),
    ).toBe(existing);
    expect(
      findMatchingAlertRule([existing], {
        ticker: '005930',
        kind: 'changePctAbove',
        threshold: 6,
      }),
    ).toBeNull();
  });
});
