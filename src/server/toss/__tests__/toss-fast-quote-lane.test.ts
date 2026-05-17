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
  it('prioritizes current ticker, favorites, agent candidates, TOP100, and KIS companions with a hard cap', () => {
    const candidates = buildTossFastQuoteCandidates({
      now: '2026-05-15T00:00:00.000Z',
      currentTickers: ['A005930'],
      favorites: [favorite('000660')],
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
      targetCap: 3,
      hardCap: 3,
    });

    expect(candidates.map((item) => item.ticker)).toEqual(['005930', '000660', '035720']);
    expect(candidates.every((item) => item.ticker !== '0011T0')).toBe(true);
  });

  it('drops Toss-only unsupported product codes instead of treating them as KIS eligible tickers', () => {
    const candidates = buildTossFastQuoteCandidates({
      now: '2026-05-15T00:00:00.000Z',
      currentTickers: ['0011T0'],
      favorites: [],
      topMovers: null,
      hardCap: 10,
    });

    expect(candidates).toEqual([]);
  });
});

describe('createTossFastQuoteLane', () => {
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
