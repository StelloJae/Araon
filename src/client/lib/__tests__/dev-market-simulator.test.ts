import { describe, expect, it } from 'vitest';
import {
  buildDevMarketFrame,
  isDevMarketSimulatorVisible,
  SIMULATED_MARKET_LABEL,
  type DevMarketScenarioId,
} from '../dev-market-simulator';
import type { CatalogEntry } from '../../stores/stocks-store';

const NOW = 1_700_000_000_000;

function catalog(): Record<string, CatalogEntry> {
  return {
    '005930': {
      name: '삼성전자',
      market: 'KOSPI',
      sectorId: null,
      manualSectorName: null,
      autoSector: '전기전자',
    },
    '000660': {
      name: 'SK하이닉스',
      market: 'KOSPI',
      sectorId: null,
      manualSectorName: null,
      autoSector: '전기전자',
    },
  };
}

describe('dev market simulator', () => {
  it('is only visible when the caller reports a dev build', () => {
    expect(isDevMarketSimulatorVisible(true)).toBe(true);
    expect(isDevMarketSimulatorVisible(false)).toBe(false);
    expect(SIMULATED_MARKET_LABEL).toBe('SIMULATED MARKET');
  });

  it('builds live ws-integrated frames without touching server contracts', () => {
    const frame = buildDevMarketFrame({
      scenarioId: 'momentum-burst',
      step: 3,
      now: NOW,
      catalog: catalog(),
    });

    expect(frame.label).toBe(SIMULATED_MARKET_LABEL);
    expect(frame.marketStatus).toBe('open');
    expect(frame.prices).toHaveLength(2);
    expect(frame.prices.every((p) => p.source === 'ws-integrated')).toBe(true);
    expect(frame.prices.every((p) => p.isSnapshot === false)).toBe(true);
    expect(frame.surgeEntries[0]).toMatchObject({
      code: '005930',
      source: 'realtime-momentum',
      signalType: 'scalp',
      momentumWindow: '10s',
    });
  });

  it('keeps collecting volume baselines honest without fake multipliers', () => {
    const frame = buildDevMarketFrame({
      scenarioId: 'momentum-burst',
      step: 1,
      now: NOW,
      catalog: catalog(),
    });

    expect(frame.prices[0]?.volumeSurgeRatio).toBeNull();
    expect(frame.prices[0]?.volumeBaselineStatus).toBe('collecting');
    expect(frame.surgeEntries[0]?.volumeSurgeRatio).toBeNull();
    expect(frame.surgeEntries[0]?.volumeBaselineStatus).toBe('collecting');
  });

  it('can explicitly generate a ready volume baseline scenario', () => {
    const frame = buildDevMarketFrame({
      scenarioId: 'volume-ready',
      step: 4,
      now: NOW,
      catalog: catalog(),
    });

    expect(frame.prices[0]?.volumeSurgeRatio).toBeGreaterThanOrEqual(2);
    expect(frame.prices[0]?.volumeBaselineStatus).toBe('ready');
    expect(frame.surgeEntries[0]?.volumeSurgeRatio).toBeGreaterThanOrEqual(2);
    expect(frame.surgeEntries[0]?.volumeBaselineStatus).toBe('ready');
  });

  it('generates snapshot caveat frames without live surge entries', () => {
    const frame = buildDevMarketFrame({
      scenarioId: 'snapshot-caveat',
      step: 2,
      now: NOW,
      catalog: catalog(),
    });

    expect(frame.marketStatus).toBe('snapshot');
    expect(frame.prices.every((p) => p.isSnapshot === true)).toBe(true);
    expect(frame.prices.every((p) => p.source === 'rest')).toBe(true);
    expect(frame.surgeEntries).toEqual([]);
  });

  it('falls back to public sample stocks when the dashboard catalog is empty', () => {
    const frame = buildDevMarketFrame({
      scenarioId: 'sector-rotation',
      step: 2,
      now: NOW,
      catalog: {},
    });

    expect(frame.catalogStocks.map((s) => s.ticker)).toContain('005930');
    expect(frame.catalogStocks.length).toBeGreaterThanOrEqual(5);
    expect(frame.prices.length).toBe(frame.catalogStocks.length);
  });
});

describe.each<DevMarketScenarioId>([
  'momentum-burst',
  'sector-rotation',
  'volume-ready',
  'snapshot-caveat',
])('scenario %s', (scenarioId) => {
  it('stays deterministic for the same step and catalog', () => {
    const a = buildDevMarketFrame({
      scenarioId,
      step: 5,
      now: NOW,
      catalog: catalog(),
    });
    const b = buildDevMarketFrame({
      scenarioId,
      step: 5,
      now: NOW,
      catalog: catalog(),
    });

    expect(b).toEqual(a);
  });
});
