import { describe, expect, it } from 'vitest';
import type { MarketStatus, Price } from '@shared/types';
import {
  evaluateAlerts,
  makeFavCooldownKey,
  makeRuleCooldownKey,
} from '../alert-evaluator';
import type { AlertRule } from '../../stores/alert-rules-store';
import type { ClientSettings } from '../../stores/settings-store';
import type { CatalogEntry } from '../../stores/stocks-store';

const NOW = 1_700_000_000_000;

function quote(
  ticker: string,
  price: number,
  changeRate: number,
  opts: Partial<Price> = {},
): Price {
  return {
    ticker,
    price,
    changeRate,
    changeAbs: 0,
    volume: 100_000,
    updatedAt: '2025-01-01T00:00:00Z',
    isSnapshot: false,
    ...opts,
  };
}

const BASE_SETTINGS: ClientSettings = {
  notifGlobalEnabled: true,
  surgeFilter: 'live',
  notifPctThreshold: 5,
  soundOn: false,
  soundVolume: 0.4,
  desktopNotif: false,
  toastDurationMs: 5_500,
  alertCooldownMs: 5 * 60_000,
  surgeThreshold: 3,
};

const CATALOG: Record<string, CatalogEntry> = {
  '005930': { name: '삼성전자', market: 'KOSPI', sectorId: 'semi' },
  '000660': { name: 'SK하이닉스', market: 'KOSPI', sectorId: 'semi' },
};

const STATUS_OPEN: MarketStatus = 'open';
const STATUS_CLOSED: MarketStatus = 'closed';
const STATUS_SNAPSHOT: MarketStatus = 'snapshot';

describe('evaluateAlerts — global gating', () => {
  it('returns nothing when notifGlobalEnabled is false', () => {
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 78_000, 6) },
      previousQuotes: { '005930': quote('005930', 78_000, 4) },
      favorites: new Set(['005930']),
      catalog: CATALOG,
      rules: [],
      settings: { ...BASE_SETTINGS, notifGlobalEnabled: false },
      cooldowns: new Map(),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs).toEqual([]);
    expect(out.cooldownKeysToTouch).toEqual([]);
  });

  it('returns nothing when market is closed', () => {
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 78_000, 6) },
      previousQuotes: { '005930': quote('005930', 78_000, 4) },
      favorites: new Set(['005930']),
      catalog: CATALOG,
      rules: [],
      settings: BASE_SETTINGS,
      cooldowns: new Map(),
      marketStatus: STATUS_CLOSED,
      now: NOW,
    });
    expect(out.specs).toEqual([]);
  });

  it('returns nothing on initial hydration (no previous quote)', () => {
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 78_000, 7) },
      previousQuotes: {},
      favorites: new Set(['005930']),
      catalog: CATALOG,
      rules: [],
      settings: BASE_SETTINGS,
      cooldowns: new Map(),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs).toEqual([]);
  });

  it('returns nothing when current quote is a snapshot', () => {
    const out = evaluateAlerts({
      quotes: {
        '005930': quote('005930', 78_000, 6, { isSnapshot: true }),
      },
      previousQuotes: { '005930': quote('005930', 78_000, 4) },
      favorites: new Set(['005930']),
      catalog: CATALOG,
      rules: [],
      settings: BASE_SETTINGS,
      cooldowns: new Map(),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs).toEqual([]);
  });
});

describe('evaluateAlerts — favorite threshold crossing', () => {
  it('fires on upward crossing', () => {
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 78_000, 5.2) },
      previousQuotes: { '005930': quote('005930', 77_000, 4.8) },
      favorites: new Set(['005930']),
      catalog: CATALOG,
      rules: [],
      settings: BASE_SETTINGS,
      cooldowns: new Map(),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs).toHaveLength(1);
    expect(out.specs[0]?.kind).toBe('fav-pct');
    expect(out.specs[0]?.direction).toBe('up');
    expect(out.cooldownKeysToTouch).toEqual([
      makeFavCooldownKey(5, '005930', 'up'),
    ]);
  });

  it('fires on downward crossing', () => {
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 70_000, -5.5) },
      previousQuotes: { '005930': quote('005930', 71_000, -4.0) },
      favorites: new Set(['005930']),
      catalog: CATALOG,
      rules: [],
      settings: BASE_SETTINGS,
      cooldowns: new Map(),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs).toHaveLength(1);
    expect(out.specs[0]?.direction).toBe('down');
  });

  it('does not refire while still above threshold', () => {
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 78_000, 6.5) },
      previousQuotes: { '005930': quote('005930', 78_000, 5.8) },
      favorites: new Set(['005930']),
      catalog: CATALOG,
      rules: [],
      settings: BASE_SETTINGS,
      cooldowns: new Map(),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs).toEqual([]);
  });

  it('respects cooldown — same key within window is skipped', () => {
    const key = makeFavCooldownKey(5, '005930', 'up');
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 78_000, 5.2) },
      previousQuotes: { '005930': quote('005930', 77_000, 4.8) },
      favorites: new Set(['005930']),
      catalog: CATALOG,
      rules: [],
      settings: BASE_SETTINGS,
      cooldowns: new Map([[key, NOW - 60_000]]),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs).toEqual([]);
  });

  it('does not fire for non-favorites', () => {
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 78_000, 5.2) },
      previousQuotes: { '005930': quote('005930', 77_000, 4.8) },
      favorites: new Set(),
      catalog: CATALOG,
      rules: [],
      settings: BASE_SETTINGS,
      cooldowns: new Map(),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs).toEqual([]);
  });
});

describe('evaluateAlerts — rule crossing', () => {
  function rule(partial: Partial<AlertRule> & Pick<AlertRule, 'kind' | 'threshold'>): AlertRule {
    return {
      id: partial.id ?? 'r1',
      ticker: partial.ticker ?? '005930',
      kind: partial.kind,
      threshold: partial.threshold,
      enabled: partial.enabled ?? true,
      cooldownMs: partial.cooldownMs ?? 60_000,
      createdAt: 1,
      updatedAt: partial.updatedAt ?? 1,
    };
  }

  it('priceAbove crosses on upward break', () => {
    const r = rule({ kind: 'priceAbove', threshold: 80_000 });
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 80_500, 1) },
      previousQuotes: { '005930': quote('005930', 79_000, 0) },
      favorites: new Set(),
      catalog: CATALOG,
      rules: [r],
      settings: BASE_SETTINGS,
      cooldowns: new Map(),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs).toHaveLength(1);
    expect(out.specs[0]?.kind).toBe('rule');
  });

  it('priceBelow direction is "down"', () => {
    const r = rule({ kind: 'priceBelow', threshold: 70_000 });
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 69_500, -1) },
      previousQuotes: { '005930': quote('005930', 71_000, 0) },
      favorites: new Set(),
      catalog: CATALOG,
      rules: [r],
      settings: BASE_SETTINGS,
      cooldowns: new Map(),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs[0]?.direction).toBe('down');
  });

  it('volumeAbove fires on volume crossing', () => {
    const r = rule({ kind: 'volumeAbove', threshold: 1_000_000 });
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 78_000, 1, { volume: 1_500_000 }) },
      previousQuotes: { '005930': quote('005930', 78_000, 1, { volume: 800_000 }) },
      favorites: new Set(),
      catalog: CATALOG,
      rules: [r],
      settings: BASE_SETTINGS,
      cooldowns: new Map(),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs).toHaveLength(1);
  });

  it('disabled rules do not fire', () => {
    const r = rule({ kind: 'priceAbove', threshold: 80_000, enabled: false });
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 80_500, 1) },
      previousQuotes: { '005930': quote('005930', 79_000, 0) },
      favorites: new Set(),
      catalog: CATALOG,
      rules: [r],
      settings: BASE_SETTINGS,
      cooldowns: new Map(),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs).toEqual([]);
  });

  it('cooldown key changes when rule.updatedAt changes — old cooldown does not block', () => {
    const r1 = rule({ kind: 'priceAbove', threshold: 80_000, updatedAt: 100 });
    const oldKey = makeRuleCooldownKey(r1);
    const r2 = rule({ kind: 'priceAbove', threshold: 80_000, updatedAt: 200 });
    const out = evaluateAlerts({
      quotes: { '005930': quote('005930', 80_500, 1) },
      previousQuotes: { '005930': quote('005930', 79_000, 0) },
      favorites: new Set(),
      catalog: CATALOG,
      rules: [r2],
      settings: BASE_SETTINGS,
      cooldowns: new Map([[oldKey, NOW - 1_000]]),
      marketStatus: STATUS_OPEN,
      now: NOW,
    });
    expect(out.specs).toHaveLength(1);
    expect(out.cooldownKeysToTouch[0]).toBe(makeRuleCooldownKey(r2));
  });
});
