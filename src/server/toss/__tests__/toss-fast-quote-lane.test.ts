import { describe, expect, it, vi } from 'vitest';
import type { Favorite, MarketTopMoversResponse, Price } from '@shared/types.js';

import {
  buildTossFastQuoteCandidates,
  createTossFastQuoteLane,
} from '../toss-fast-quote-lane.js';

function favorite(ticker: string, addedAt = '2026-05-15T00:00:00.000Z'): Favorite {
  return { ticker, tier: 'realtime', addedAt };
}

function topMovers(): MarketTopMoversResponse {
  const base = {
    generatedAt: '2026-05-15T00:00:00.000Z',
    fetchedAt: '2026-05-15T00:00:00.000Z',
    cacheTtlMs: 500,
    refreshIntervalMs: 500,
    staleAfterMs: 5_000,
    source: 'toss-overview-ranking' as const,
    sourcePhase: 'regular' as const,
    sourceLabel: 'Toss ranking',
    sourceReason: null,
    frozen: false,
    lastGoodAgeMs: null,
    partialReason: null,
    stopReason: null,
    rankingDiagnostics: { gainers: null, losers: null },
    rankingRateLimited: false,
    status: 'ready' as const,
    message: 'ready',
    cooldownUntil: null,
    coverage: {
      requestedLimit: 100,
      gainersCount: 2,
      losersCount: 1,
      gainersComplete: true,
      losersComplete: true,
      marketUniverse: 'toss-web-ranking' as const,
      guaranteedTop100: true,
      includesLocalFallback: false,
    },
  };
  return {
    ...base,
    gainers: [
      { rank: 1, ticker: '005930', name: '삼성전자', price: 100_000, changeAbs: 1_000, changePct: 3.1, volume: 100 },
      { rank: 2, ticker: '000660', name: 'SK하이닉스', price: 200_000, changeAbs: 2_000, changePct: 2.5, volume: 200 },
    ],
    losers: [
      { rank: 1, ticker: 'A035720', name: '카카오', price: 50_000, changeAbs: -500, changePct: -1, volume: 50 },
    ],
  };
}

function price(ticker: string, overrides: Partial<Price> = {}): Price {
  return {
    ticker,
    price: 100_000,
    changeRate: 3.1,
    changeAbs: 3_000,
    volume: 1000,
    updatedAt: '2026-05-15T00:00:00.000Z',
    isSnapshot: false,
    source: 'rest',
    ...overrides,
  };
}

describe('buildTossFastQuoteCandidates', () => {
  it('prioritizes holdings, favorites, agent candidates, current ticker, TOP100, and KIS companions with a hard cap', () => {
    const candidates = buildTossFastQuoteCandidates({
      now: '2026-05-15T00:00:00.000Z',
      currentTickers: ['A005930'],
      favorites: [favorite('000660')],
      watchlistSnapshot: {
        provider: 'toss',
        fetchedAt: '2026-05-15T00:00:00.000Z',
        groups: [],
        items: [{
          ref: 'watchlist-item-1',
          groupRef: 'watchlist-group-1',
          groupName: '기본',
          productCode: 'A129920',
          symbol: '129920',
          name: '대성하이텍',
          currency: 'KRW',
          base: 1,
          last: 1,
        }],
      },
      portfolioSnapshot: {
        provider: 'toss',
        fetchedAt: '2026-05-15T00:00:00.000Z',
        positions: [{
          productCode: 'A042660',
          symbol: '042660',
          name: '한화오션',
          marketType: 'KR',
          marketCode: 'KRX',
          quantity: 1,
          averagePrice: 1,
          currentPrice: 1,
          marketValue: 1,
          unrealizedPnl: 0,
          profitRate: 0,
          dailyProfitLoss: 0,
          dailyProfitRate: 0,
          averagePriceUsd: 0,
          currentPriceUsd: 0,
          marketValueUsd: 0,
          unrealizedPnlUsd: 0,
          profitRateUsd: 0,
          dailyProfitLossUsd: 0,
          dailyProfitRateUsd: 0,
        }],
      },
      agentEvents: [{
        id: 'event-1',
        type: 'market_movement_detected',
        ticker: '035720',
        productCode: 'A035720',
        krTicker: '035720',
        market: 'KR',
        displayName: '카카오',
        source: 'test',
        publishedAt: null,
        firstSeenAt: '2026-05-15T00:00:00.000Z',
        freshnessMs: null,
        relevance: 0.9,
        confidence: 0.8,
        reason: 'test',
        dedupeKey: 'event-1',
        payloadRef: null,
        rawPayloadRedacted: true,
        relatedIds: { newsIds: [], disclosureIds: [], signalIds: [], orderIntentIds: [] },
        skipReason: null,
        createdAt: '2026-05-15T00:00:00.000Z',
      }],
      orderIntentPreviews: [],
      topMovers: topMovers(),
      kisTrackedTickers: ['068270'],
      targetCap: 4,
      hardCap: 4,
    });

    expect(candidates.map((item) => item.ticker)).toEqual(['042660', '129920', '000660', '035720']);
    expect(candidates.every((item) => item.ticker !== '0011T0')).toBe(true);
  });

  it('keeps Toss-only product codes as Toss quote keys without making them KIS tickers', () => {
    const candidates = buildTossFastQuoteCandidates({
      now: '2026-05-15T00:00:00.000Z',
      currentTickers: ['US19970515001'],
      watchlistSnapshot: {
        provider: 'toss',
        fetchedAt: '2026-05-15T00:00:00.000Z',
        groups: [],
        items: [{
          ref: 'watchlist-item-1',
          groupRef: 'watchlist-group-1',
          groupName: '기본',
          productCode: 'A0011T0',
          symbol: '0011T0',
          name: '채비',
          currency: 'KRW',
          base: 0,
          last: 0,
        }],
      },
      favorites: [],
      topMovers: null,
      hardCap: 10,
    });

    expect(candidates.map((item) => item.ticker)).toEqual(['A0011T0', 'US19970515001']);
  });
});

describe('createTossFastQuoteLane', () => {
  it('defaults to the product hot quote cadence and caps', () => {
    const lane = createTossFastQuoteLane({
      provider: {
        getQuoteBatch: vi.fn(),
      },
      priceStore: { setPrice: vi.fn() },
      collectCandidates: () => [],
    });

    expect(lane.snapshot()).toMatchObject({
      intervalMs: 100,
      targetCap: 200,
      hardCap: 400,
    });
  });

  it('writes changed fast-lane prices as toss-fast-quote and dedupes unchanged values', async () => {
    const writes: Price[] = [];
    const provider = {
      getQuoteBatch: vi.fn(async ({ tickers }: { tickers: readonly string[] }) => ({
        providerId: 'toss-public' as const,
        fetchedAt: '2026-05-15T00:00:00.000Z',
        requestedCount: tickers.length,
        returnedCount: tickers.length,
        prices: tickers.map((ticker) => price(ticker)),
        missingTickers: [],
      })),
    };
    const lane = createTossFastQuoteLane({
      provider,
      priceStore: { setPrice: (item) => writes.push(item) },
      collectCandidates: () => [
        { ticker: '005930', source: 'current_view', reason: '현재 화면', score: 1, lastSeenAt: '2026-05-15T00:00:00.000Z' },
      ],
      now: () => Date.parse('2026-05-15T00:00:00.000Z'),
    });

    await lane.refreshOnce();
    await lane.refreshOnce();

    expect(provider.getQuoteBatch).toHaveBeenCalledTimes(2);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      ticker: '005930',
      source: 'toss-fast-quote',
      isSnapshot: false,
    });
    expect(lane.snapshot().droppedUnchangedCount).toBe(1);
  });

  it('writes Toss-only fast-lane prices under their productCode key', async () => {
    const writes: Price[] = [];
    const provider = {
      getQuoteBatch: vi.fn(async ({ tickers }: { tickers: readonly string[] }) => ({
        providerId: 'toss-public' as const,
        fetchedAt: '2026-05-15T00:00:00.000Z',
        requestedCount: tickers.length,
        returnedCount: tickers.length,
        prices: tickers.map((ticker) => price(ticker, { price: 188.1, changeRate: 1.2 })),
        missingTickers: [],
      })),
    };
    const lane = createTossFastQuoteLane({
      provider,
      priceStore: { setPrice: (item) => writes.push(item) },
      collectCandidates: () => [
        { ticker: 'US19970515001', source: 'watchlist', reason: 'Toss 즐겨찾기', score: 1, lastSeenAt: '2026-05-15T00:00:00.000Z' },
      ],
      now: () => Date.parse('2026-05-15T00:00:00.000Z'),
    });

    await lane.refreshOnce();

    expect(provider.getQuoteBatch).toHaveBeenCalledWith({ tickers: ['US19970515001'] });
    expect(writes).toEqual([
      expect.objectContaining({
        ticker: 'US19970515001',
        price: 188.1,
        changeRate: 1.2,
        source: 'toss-fast-quote',
      }),
    ]);
  });

  it('writes A-prefixed KR fast-lane prices under their six-digit quote key', async () => {
    const writes: Price[] = [];
    const provider = {
      getQuoteBatch: vi.fn(async ({ tickers }: { tickers: readonly string[] }) => ({
        providerId: 'toss-public' as const,
        fetchedAt: '2026-05-15T00:00:00.000Z',
        requestedCount: tickers.length,
        returnedCount: tickers.length,
        prices: tickers.map((ticker) => price(ticker, { price: 111_800, changeRate: -6.29 })),
        missingTickers: [],
      })),
    };
    const lane = createTossFastQuoteLane({
      provider,
      priceStore: { setPrice: (item) => writes.push(item) },
      collectCandidates: () => [
        { ticker: 'A298380', source: 'watchlist', reason: 'Toss 즐겨찾기', score: 1, lastSeenAt: '2026-05-15T00:00:00.000Z' },
      ],
      now: () => Date.parse('2026-05-15T00:00:00.000Z'),
    });

    await lane.refreshOnce();

    expect(provider.getQuoteBatch).toHaveBeenCalledWith({ tickers: ['298380'] });
    expect(writes).toEqual([
      expect.objectContaining({
        ticker: '298380',
        price: 111_800,
        changeRate: -6.29,
        source: 'toss-fast-quote',
      }),
    ]);
  });

  it('skips a refresh when a previous fast quote request is still in flight', async () => {
    let resolveRequest: ((value: unknown) => void) | null = null;
    const lane = createTossFastQuoteLane({
      provider: {
        getQuoteBatch: vi.fn(async () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          }) as Promise<any>),
      },
      priceStore: { setPrice: vi.fn() },
      collectCandidates: () => [
        { ticker: '005930', source: 'current_view', reason: '현재 화면', score: 1, lastSeenAt: '2026-05-15T00:00:00.000Z' },
      ],
      now: () => Date.parse('2026-05-15T00:00:00.000Z'),
    });

    const first = lane.refreshOnce();
    const second = await lane.refreshOnce();
    resolveRequest?.({
      providerId: 'toss-public',
      fetchedAt: '2026-05-15T00:00:00.000Z',
      requestedCount: 1,
      returnedCount: 1,
      prices: [price('005930')],
      missingTickers: [],
    });
    await first;

    expect(second.skippedInFlightCount).toBe(1);
    expect(lane.snapshot().skippedInFlightCount).toBe(1);
  });

  it('keeps the last completed counters visible while a new fast quote cycle is in flight', async () => {
    let resolveSecond: ((value: unknown) => void) | null = null;
    const provider = {
      getQuoteBatch: vi
        .fn()
        .mockResolvedValueOnce({
          providerId: 'toss-public' as const,
          fetchedAt: '2026-05-15T00:00:00.000Z',
          requestedCount: 1,
          returnedCount: 1,
          prices: [price('005930')],
          missingTickers: [],
        })
        .mockImplementationOnce(async () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          })),
    };
    const lane = createTossFastQuoteLane({
      provider,
      priceStore: { setPrice: vi.fn() },
      collectCandidates: () => [
        { ticker: '005930', source: 'current_view', reason: '현재 화면', score: 1, lastSeenAt: '2026-05-15T00:00:00.000Z' },
      ],
      now: () => Date.parse('2026-05-15T00:00:00.000Z'),
    });

    await lane.refreshOnce();
    const second = lane.refreshOnce();
    await Promise.resolve();
    const inFlight = lane.snapshot();
    resolveSecond?.({
      providerId: 'toss-public',
      fetchedAt: '2026-05-15T00:00:00.000Z',
      requestedCount: 1,
      returnedCount: 1,
      prices: [price('005930', { price: 100_500 })],
      missingTickers: [],
    });
    await second;

    expect(inFlight.requestedCount).toBe(1);
    expect(inFlight.returnedCount).toBe(1);
    expect(inFlight.acceptedCount).toBe(1);
    expect(lane.snapshot().acceptedCount).toBe(1);
  });

  it('backs off after a 429 without exposing raw upstream payloads', async () => {
    let now = Date.parse('2026-05-15T00:00:00.000Z');
    const lane = createTossFastQuoteLane({
      provider: {
        getQuoteBatch: vi.fn(async () => {
          throw new Error('Toss public request failed: 429');
        }),
      },
      priceStore: { setPrice: vi.fn() },
      collectCandidates: () => [
        { ticker: '005930', source: 'current_view', reason: '현재 화면', score: 1, lastSeenAt: '2026-05-15T00:00:00.000Z' },
      ],
      now: () => now,
    });

    const failed = await lane.refreshOnce();
    const skipped = await lane.refreshOnce();
    now += 5_001;

    expect(failed.lastErrorCode).toBe('TOSS_FAST_QUOTE_RATE_LIMITED');
    expect(skipped.lastMessage).toBe('backoff');
    expect(lane.snapshot().backoffUntil).toBeNull();
    expect(JSON.stringify(failed)).not.toContain('cookie');
    expect(JSON.stringify(failed)).not.toContain('SESSION');
  });
});
