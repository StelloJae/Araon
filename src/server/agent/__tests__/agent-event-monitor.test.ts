import { describe, expect, it, vi } from 'vitest';
import type { Favorite, Stock, StockDisclosureItem, StockNewsItem } from '@shared/types.js';

import { createAgentEventQueue } from '../agent-event-queue.js';
import { createAgentEventMonitor } from '../agent-event-monitor.js';

function stock(ticker: string, name = ticker): Stock {
  return { ticker, name, market: 'KOSPI' };
}

function favorite(ticker: string, addedAt: string): Favorite {
  return { ticker, tier: 'polling', addedAt };
}

describe('agent event monitor', () => {
  it('stays disabled by default and does not call external providers', async () => {
    const refreshNews = vi.fn();
    const refreshDisclosure = vi.fn();
    const monitor = createAgentEventMonitor({
      enabled: false,
      stockService: { list: () => [stock('005930', '삼성전자')] },
      favoriteRepo: { findAll: () => [favorite('005930', '2026-05-11T00:00:00.000Z')] },
      newsFeedService: {
        refresh: refreshNews,
      },
      dartDisclosureService: {
        isConfigured: () => true,
        refreshTicker: refreshDisclosure,
      },
      agentEventQueue: createAgentEventQueue(),
    });

    await expect(monitor.runOnce('manual')).resolves.toMatchObject({
      state: 'disabled',
      tickers: [],
    });
    expect(refreshNews).not.toHaveBeenCalled();
    expect(refreshDisclosure).not.toHaveBeenCalled();
    expect(monitor.status()).toMatchObject({
      enabled: false,
      running: false,
      cycleCount: 0,
      dispatchPolicy: {
        mode: 'best_effort_after_first_seen',
        targetFirstSeenToDispatchMs: {
          min: 10_000,
          max: 30_000,
        },
        providerPublicationGuarantee: false,
        autoPollingRequiresOptIn: true,
        fullMarketPolling: false,
      },
      providers: {
        news: true,
        tossNews: false,
        tossSignal: false,
        disclosure: false,
      },
      providerPolicies: {
        news: {
          enabled: true,
          cooldownMs: 10_000,
          freshness: 'published_at_when_available',
          firstSeen: 'araon_observed_at',
        },
        tossNews: {
          enabled: false,
          cooldownMs: 10_000,
          freshness: 'published_at_when_available',
          firstSeen: 'araon_observed_at',
        },
        tossSignal: {
          enabled: false,
          cooldownMs: 10_000,
          freshness: 'published_at_when_available',
          firstSeen: 'araon_observed_at',
        },
        disclosure: {
          enabled: false,
          cooldownMs: 10_000,
          freshness: 'published_at_when_available',
          firstSeen: 'araon_observed_at',
        },
      },
      providerStates: {
        news: {
          enabled: true,
          reason: 'refresh-ready',
        },
        tossNews: {
          enabled: false,
          reason: 'session-required',
        },
        tossSignal: {
          enabled: false,
          reason: 'request-body-template-missing',
        },
        disclosure: {
          enabled: false,
          reason: 'disclosure-store-missing',
        },
      },
      tossSignalContract: {
        endpoint: {
          method: 'POST',
          host: 'wts-info-api.tossinvest.com',
          path: '/api/v2/dashboard/wts/overview/signals',
        },
        bodyContract: 'capture_required',
        captureRequired: true,
        externalCallsEnabled: false,
        requestBodyTemplateSource: 'ARAON_TOSS_SIGNAL_REQUEST_BODY_TEMPLATE',
        rawTemplateExposed: false,
        shapeProbeCandidates: [
          {
            method: 'GET',
            host: 'wts-info-api.tossinvest.com',
            path: '/api/v1/trading/analysis/productCode/{productCode}',
            purpose: 'shape_probe_only',
            rawPayloadExposed: false,
            rawSessionExposed: false,
          },
          {
            method: 'GET',
            host: 'wts-cert-api.tossinvest.com',
            path: '/api/v1/trading/analysis/productCode/{productCode}',
            purpose: 'shape_probe_only',
            rawPayloadExposed: false,
            rawSessionExposed: false,
          },
        ],
        semanticPolicy: {
          emptyResponse: 'supported_empty_not_actionable',
          eventEmission: 'non_empty_items_only',
          agentEventType: 'toss_signal_detected',
          rawPayloadExposed: false,
        },
        captureGuidance: {
          required: true,
          requiresUserLoginForCapture: true,
          requiresDevToolsForCapture: true,
          rawTemplateExposed: false,
          nextAction: 'user-assisted-capture-required',
        },
        reference: 'tossinvest-cli rpc-catalog',
      },
      watchedCandidates: [{
        ticker: '005930',
        name: '삼성전자',
        source: 'favorite',
        reason: '사용자 관심종목',
      }],
    });
  });

  it('builds a bounded favorite-first watch scope', async () => {
    const refreshNews = vi.fn(async () => []);
    const monitor = createAgentEventMonitor({
      enabled: true,
      maxTickersPerCycle: 3,
      now: () => new Date('2026-05-11T06:00:30.000Z'),
      stockService: {
        list: () => [
          stock('005930', '삼성전자'),
          stock('000660', 'SK하이닉스'),
          stock('035420', 'NAVER'),
          stock('035720', '카카오'),
        ],
      },
      favoriteRepo: {
        findAll: () => [
          favorite('035420', '2026-05-11T00:00:01.000Z'),
          favorite('000660', '2026-05-11T00:00:00.000Z'),
        ],
      },
      newsFeedService: { refresh: refreshNews },
      agentEventQueue: createAgentEventQueue(),
    });

    const result = await monitor.runOnce('manual');

    expect(result).toMatchObject({
      state: 'completed',
      tickers: ['000660', '035420', '005930'],
      refreshedNews: 3,
    });
    expect(monitor.status().watchedCandidates).toEqual([
      {
        ticker: '000660',
        name: 'SK하이닉스',
        source: 'favorite',
        reason: '사용자 관심종목',
      },
      {
        ticker: '035420',
        name: 'NAVER',
        source: 'favorite',
        reason: '사용자 관심종목',
      },
      {
        ticker: '005930',
        name: '삼성전자',
        source: 'tracked',
        reason: '추적 종목 보조 후보',
      },
    ]);
    expect(refreshNews.mock.calls.map(([input]) => input.ticker)).toEqual([
      '000660',
      '035420',
      '005930',
    ]);
  });

  it('promotes recent agent event tickers into the bounded watch scope', async () => {
    const queue = createAgentEventQueue({
      now: () => '2026-05-11T06:00:20.000Z',
    });
    queue.enqueue({
      type: 'market_movement_detected',
      ticker: '000660',
      source: 'kis-ws',
      firstSeenAt: '2026-05-11T06:00:20.000Z',
      confidence: 0.81,
      reason: 'KIS realtime momentum',
      dedupeKey: 'market:000660:2026-05-11T06:00:20.000Z',
      payloadRef: 'stock-signal:sig-1',
    });
    const refreshNews = vi.fn(async () => []);
    const monitor = createAgentEventMonitor({
      enabled: true,
      maxTickersPerCycle: 3,
      now: () => new Date('2026-05-11T06:00:30.000Z'),
      stockService: {
        list: () => [
          stock('005930', '삼성전자'),
          stock('035420', 'NAVER'),
          stock('000660', 'SK하이닉스'),
        ],
      },
      favoriteRepo: {
        findAll: () => [favorite('005930', '2026-05-11T00:00:00.000Z')],
      },
      newsFeedService: { refresh: refreshNews },
      agentEventQueue: queue,
    });

    const result = await monitor.runOnce('manual');

    expect(result.tickers).toEqual(['005930', '000660', '035420']);
    expect(monitor.status().watchedCandidates).toEqual([
      {
        ticker: '005930',
        name: '삼성전자',
        source: 'favorite',
        reason: '사용자 관심종목',
      },
      {
        ticker: '000660',
        name: 'SK하이닉스',
        source: 'agent_event',
        reason: '최근 agent event: 시장 움직임',
      },
      {
        ticker: '035420',
        name: 'NAVER',
        source: 'tracked',
        reason: '추적 종목 보조 후보',
      },
    ]);
    expect(refreshNews.mock.calls.map(([input]) => input.ticker)).toEqual([
      '005930',
      '000660',
      '035420',
    ]);
  });

  it('keeps watch scope configurable without falling back to every tracked stock', async () => {
    const refreshNews = vi.fn(async () => []);
    const monitor = createAgentEventMonitor({
      enabled: true,
      maxTickersPerCycle: 3,
      watchSources: ['favorite'],
      now: () => new Date('2026-05-11T06:00:30.000Z'),
      stockService: {
        list: () => [
          stock('005930', '삼성전자'),
          stock('000660', 'SK하이닉스'),
          stock('035420', 'NAVER'),
        ],
      },
      favoriteRepo: {
        findAll: () => [favorite('005930', '2026-05-11T00:00:00.000Z')],
      },
      newsFeedService: { refresh: refreshNews },
      agentEventQueue: createAgentEventQueue(),
    });

    const result = await monitor.runOnce('manual');

    expect(result.tickers).toEqual(['005930']);
    expect(monitor.status()).toMatchObject({
      watchPolicy: {
        sources: ['favorite'],
        fullMarket: false,
      },
      watchedCandidates: [
        {
          ticker: '005930',
          source: 'favorite',
        },
      ],
    });
    expect(refreshNews.mock.calls.map(([input]) => input.ticker)).toEqual(['005930']);
  });

  it('enqueues new news and filing events without raw provider URLs', async () => {
    const queue = createAgentEventQueue({
      idFactory: () => `evt-${queue.snapshot().length + 1}`,
      now: () => '2026-05-11T06:00:30.000Z',
    });
    const newsItem: StockNewsItem = {
      id: 'news-1',
      ticker: '005930',
      source: 'naver-search',
      title: '삼성전자 신규 뉴스',
      url: 'https://example.test/raw-news-url',
      description: null,
      publishedAt: '2026-05-11T06:00:00.000Z',
      fetchedAt: '2026-05-11T06:00:20.000Z',
      isNew: true,
    };
    const disclosureItem: StockDisclosureItem = {
      id: 'filing-1',
      ticker: '005930',
      source: 'dart',
      kind: 'filing',
      title: '주요사항보고서',
      url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260511000001',
      publishedAt: '2026-05-11T00:00:00.000Z',
      fetchedAt: '2026-05-11T06:00:20.000Z',
    };
    const monitor = createAgentEventMonitor({
      enabled: true,
      now: () => new Date('2026-05-11T06:00:30.000Z'),
      stockService: { list: () => [stock('005930', '삼성전자')] },
      favoriteRepo: { findAll: () => [] },
      newsFeedService: { refresh: vi.fn(async () => [newsItem]) },
      disclosureRepo: { listByTicker: () => [] },
      dartDisclosureService: {
        isConfigured: () => true,
        refreshTicker: vi.fn(async () => [disclosureItem]),
      },
      agentEventQueue: queue,
    });

    await expect(monitor.runOnce('manual')).resolves.toMatchObject({
      state: 'completed',
      insertedEvents: 2,
    });
    expect(queue.snapshot().map((event) => event.type)).toEqual([
      'disclosure_detected',
      'news_detected',
    ]);
    expect(JSON.stringify(queue.snapshot())).not.toContain('raw-news-url');
    expect(JSON.stringify(queue.snapshot())).not.toContain('rcpNo=');
  });

  it('does not enqueue DART filing URL variants that share the same receipt number', async () => {
    const queue = createAgentEventQueue({
      idFactory: () => `evt-${queue.snapshot().length + 1}`,
      now: () => '2026-05-11T06:00:30.000Z',
    });
    const existingDisclosure: StockDisclosureItem = {
      id: 'filing-cached',
      ticker: '005930',
      source: 'dart',
      kind: 'filing',
      title: '주요사항보고서',
      url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260511000001&dcmNo=9876543',
      publishedAt: '2026-05-11T00:00:00.000Z',
      fetchedAt: '2026-05-11T06:00:10.000Z',
    };
    const refreshedDisclosure: StockDisclosureItem = {
      ...existingDisclosure,
      id: 'filing-refreshed',
      url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260511000001',
      fetchedAt: '2026-05-11T06:00:20.000Z',
    };
    const monitor = createAgentEventMonitor({
      enabled: true,
      now: () => new Date('2026-05-11T06:00:30.000Z'),
      stockService: { list: () => [stock('005930', '삼성전자')] },
      favoriteRepo: { findAll: () => [] },
      newsFeedService: { refresh: vi.fn(async () => []) },
      disclosureRepo: { listByTicker: () => [existingDisclosure] },
      dartDisclosureService: {
        isConfigured: () => true,
        refreshTicker: vi.fn(async () => [refreshedDisclosure]),
      },
      agentEventQueue: queue,
    });

    await expect(monitor.runOnce('manual')).resolves.toMatchObject({
      state: 'completed',
      insertedEvents: 0,
    });
    expect(queue.snapshot()).toEqual([]);
  });

  it('enqueues Toss signal items as sanitized agent events when a signal provider is wired', async () => {
    const queue = createAgentEventQueue({
      idFactory: () => `evt-${queue.snapshot().length + 1}`,
      now: () => '2026-05-11T06:00:30.000Z',
    });
    const refreshTossSignals = vi.fn(async () => [
      {
        id: 'raw-toss-signal-card-1',
        ticker: '005930',
        source: 'toss-overview-signals',
        title: '토스증권 AI가 찾은 시그널',
        publishedAt: null,
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        relevance: 0.8,
        confidence: 0.78,
        isNew: true,
      },
      {
        id: 'raw-toss-signal-card-old',
        ticker: '005930',
        source: 'toss-overview-signals',
        title: '이미 처리한 시그널',
        publishedAt: null,
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        relevance: 0.4,
        confidence: 0.5,
        isNew: false,
      },
    ]);
    const monitor = createAgentEventMonitor({
      enabled: true,
      now: () => new Date('2026-05-11T06:00:30.000Z'),
      stockService: { list: () => [stock('005930', '삼성전자')] },
      favoriteRepo: { findAll: () => [] },
      newsFeedService: { refresh: vi.fn(async () => []) },
      tossSignalService: { refresh: refreshTossSignals },
      agentEventQueue: queue,
    });

    await expect(monitor.runOnce('manual')).resolves.toMatchObject({
      state: 'completed',
      insertedEvents: 1,
      refreshedTossSignals: 1,
    });
    expect(refreshTossSignals).toHaveBeenCalledWith({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:00:30.000Z'),
    });
    expect(queue.snapshot()).toEqual([
      expect.objectContaining({
        type: 'toss_signal_detected',
        ticker: '005930',
        source: 'toss-overview-signals',
        publishedAt: null,
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        relevance: 0.8,
        confidence: 0.78,
        payloadRef: null,
      }),
    ]);
    expect(queue.snapshot()[0]?.reason).toContain('토스증권 AI가 찾은 시그널');
    expect(queue.snapshot()[0]?.dedupeKey).toMatch(
      /^toss-signal:toss-overview-signals:[a-f0-9]{16}$/,
    );
    expect(JSON.stringify(queue.snapshot())).not.toContain('raw-toss-signal-card');
    expect(JSON.stringify(queue.snapshot())).not.toContain('payloadRef":"raw');
  });

  it('treats empty Toss signal responses as non-actionable supported empty state', async () => {
    const queue = createAgentEventQueue();
    const refreshTossSignals = vi.fn(async () => []);
    const monitor = createAgentEventMonitor({
      enabled: true,
      now: () => new Date('2026-05-11T06:00:30.000Z'),
      stockService: { list: () => [stock('005930', '삼성전자')] },
      favoriteRepo: { findAll: () => [] },
      newsFeedService: { refresh: vi.fn(async () => []) },
      tossSignalService: { refresh: refreshTossSignals },
      tossSignalEndpointPath: '/api/v1/dashboard/intelligences/all',
      agentEventQueue: queue,
    });

    await expect(monitor.runOnce('manual')).resolves.toMatchObject({
      state: 'completed',
      refreshedTossSignals: 1,
      insertedEvents: 0,
    });

    expect(queue.snapshot()).toEqual([]);
    expect(monitor.status().tossSignalContract.semanticPolicy).toEqual({
      emptyResponse: 'supported_empty_not_actionable',
      eventEmission: 'non_empty_items_only',
      agentEventType: 'toss_signal_detected',
      rawPayloadExposed: false,
    });
  });

  it('enqueues Toss asset news items as sanitized news events when a Toss news provider is wired', async () => {
    const queue = createAgentEventQueue({
      idFactory: () => `evt-${queue.snapshot().length + 1}`,
      now: () => '2026-05-11T06:00:30.000Z',
    });
    const refreshTossNews = vi.fn(async () => [
      {
        id: 'toss-news:local-hashed-id',
        ticker: '005930',
        source: 'toss-asset-news',
        sectionType: 'NEWS',
        title: '삼성전자 신규 HBM 투자',
        agencyName: '테스트신문',
        newsType: 'company_ctr',
        publishedAt: '2026-05-11T06:00:00.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        relevance: 0.82,
        confidence: 0.78,
        isNew: true,
      },
      {
        id: 'toss-news:old-local-hashed-id',
        ticker: '005930',
        source: 'toss-asset-news',
        sectionType: 'NEWS',
        title: '이미 처리한 Toss 뉴스',
        agencyName: null,
        newsType: null,
        publishedAt: null,
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        relevance: 0.5,
        confidence: 0.6,
        isNew: false,
      },
    ]);
    const monitor = createAgentEventMonitor({
      enabled: true,
      now: () => new Date('2026-05-11T06:00:30.000Z'),
      stockService: { list: () => [stock('005930', '삼성전자')] },
      favoriteRepo: { findAll: () => [] },
      newsFeedService: { refresh: vi.fn(async () => []) },
      tossNewsService: { refresh: refreshTossNews },
      agentEventQueue: queue,
    });

    await expect(monitor.runOnce('manual')).resolves.toMatchObject({
      state: 'completed',
      insertedEvents: 1,
      refreshedNews: 1,
      refreshedTossNews: 1,
    });
    expect(refreshTossNews).toHaveBeenCalledWith({
      ticker: '005930',
      name: '삼성전자',
      now: new Date('2026-05-11T06:00:30.000Z'),
    });
    expect(queue.snapshot()).toEqual([
      expect.objectContaining({
        type: 'news_detected',
        ticker: '005930',
        source: 'toss-asset-news',
        publishedAt: '2026-05-11T06:00:00.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        relevance: 0.82,
        confidence: 0.78,
        payloadRef: null,
      }),
    ]);
    expect(queue.snapshot()[0]?.reason).toContain('삼성전자 신규 HBM 투자');
    expect(queue.snapshot()[0]?.dedupeKey).toMatch(
      /^news:toss-asset-news:[a-f0-9]{16}$/,
    );
    expect(JSON.stringify(queue.snapshot())).not.toContain('local-hashed-id');
    expect(JSON.stringify(queue.snapshot())).not.toContain('agencyName');
  });

  it('rate-limits repeated provider refreshes per ticker', async () => {
    let currentNow = new Date('2026-05-11T06:00:30.000Z');
    const refreshNews = vi.fn(async () => []);
    const monitor = createAgentEventMonitor({
      enabled: true,
      providerCooldownMs: 30_000,
      now: () => currentNow,
      stockService: { list: () => [stock('005930', '삼성전자')] },
      favoriteRepo: { findAll: () => [] },
      newsFeedService: { refresh: refreshNews },
      agentEventQueue: createAgentEventQueue(),
    });

    await expect(monitor.runOnce('manual')).resolves.toMatchObject({
      refreshedNews: 1,
      skippedRefreshes: 0,
    });
    currentNow = new Date('2026-05-11T06:00:45.000Z');
    await expect(monitor.runOnce('manual')).resolves.toMatchObject({
      refreshedNews: 0,
      skippedRefreshes: 1,
    });
    currentNow = new Date('2026-05-11T06:01:01.000Z');
    await expect(monitor.runOnce('manual')).resolves.toMatchObject({
      refreshedNews: 1,
      skippedRefreshes: 0,
    });

    expect(refreshNews).toHaveBeenCalledTimes(2);
    expect(monitor.status()).toMatchObject({
      providerCooldownMs: 30_000,
      lastSkippedRefreshes: 0,
    });
  });

  it('records provider-specific latency observations without raw payloads', async () => {
    let currentMs = 1_000;
    const monitor = createAgentEventMonitor({
      enabled: true,
      now: () => new Date('2026-05-11T06:00:30.000Z'),
      nowMs: () => currentMs,
      stockService: { list: () => [stock('005930', '삼성전자')] },
      favoriteRepo: { findAll: () => [] },
      newsFeedService: {
        refresh: vi.fn(async () => {
          currentMs += 7;
          return [];
        }),
      },
      tossNewsService: {
        refresh: vi.fn(async () => {
          currentMs += 11;
          return [];
        }),
      },
      tossSignalService: {
        refresh: vi.fn(async () => {
          currentMs += 13;
          return [];
        }),
      },
      disclosureRepo: { listByTicker: () => [] },
      dartDisclosureService: {
        isConfigured: () => true,
        refreshTicker: vi.fn(async () => {
          currentMs += 17;
          return [];
        }),
      },
      agentEventQueue: createAgentEventQueue(),
    });

    await expect(monitor.runOnce('manual')).resolves.toMatchObject({
      state: 'completed',
      insertedEvents: 0,
    });

    expect(monitor.status().providerObservations).toMatchObject({
      news: {
        lastOutcome: 'refreshed',
        lastAttemptedAt: '2026-05-11T06:00:30.000Z',
        lastDurationMs: 7,
        lastInsertedEvents: 0,
        lastErrorCode: null,
      },
      tossNews: {
        lastOutcome: 'refreshed',
        lastDurationMs: 11,
      },
      tossSignal: {
        lastOutcome: 'refreshed',
        lastDurationMs: 13,
      },
      disclosure: {
        lastOutcome: 'refreshed',
        lastDurationMs: 17,
      },
    });
    expect(JSON.stringify(monitor.status().providerObservations)).not.toContain('SESSION');
    expect(JSON.stringify(monitor.status().providerObservations)).not.toContain('raw');
  });

  it('reports the optional Toss signal provider in monitor status', () => {
    const monitor = createAgentEventMonitor({
      enabled: true,
      stockService: { list: () => [stock('005930', '삼성전자')] },
      favoriteRepo: { findAll: () => [] },
      newsFeedService: { refresh: vi.fn(async () => []) },
      tossSignalService: { refresh: vi.fn(async () => []) },
      tossSignalEndpointPath: '/api/v1/dashboard/intelligences/all',
      agentEventQueue: createAgentEventQueue(),
    });

    expect(monitor.status()).toMatchObject({
      providers: {
        news: true,
        tossNews: false,
        tossSignal: true,
        disclosure: false,
      },
      providerStates: {
        tossSignal: {
          enabled: true,
          reason: 'request-body-template-configured',
        },
      },
      tossSignalContract: {
        endpoint: {
          path: '/api/v1/dashboard/intelligences/all',
        },
        bodyContract: 'configured',
        captureRequired: false,
        externalCallsEnabled: true,
        rawTemplateExposed: false,
        semanticPolicy: {
          emptyResponse: 'supported_empty_not_actionable',
          eventEmission: 'non_empty_items_only',
          agentEventType: 'toss_signal_detected',
          rawPayloadExposed: false,
        },
        captureGuidance: {
          required: false,
          requiresUserLoginForCapture: false,
          requiresDevToolsForCapture: false,
          rawTemplateExposed: false,
          nextAction: 'configured',
        },
      },
    });
  });

  it('reports the optional Toss news provider separately from Naver news', () => {
    const monitor = createAgentEventMonitor({
      enabled: true,
      stockService: { list: () => [stock('005930', '삼성전자')] },
      favoriteRepo: { findAll: () => [] },
      newsFeedService: { refresh: vi.fn(async () => []) },
      tossNewsService: { refresh: vi.fn(async () => []) },
      agentEventQueue: createAgentEventQueue(),
    });

    expect(monitor.status()).toMatchObject({
      providers: {
        news: true,
        tossNews: true,
        tossSignal: false,
        disclosure: false,
      },
      providerStates: {
        news: {
          enabled: true,
          reason: 'refresh-ready',
        },
        tossNews: {
          enabled: true,
          reason: 'session-gated',
        },
      },
      providerPolicies: {
        news: {
          enabled: true,
        },
        tossNews: {
          enabled: true,
          cooldownMs: 10_000,
        },
      },
    });
  });

  it('keeps provider failure details out of monitor status', async () => {
    const monitor = createAgentEventMonitor({
      enabled: true,
      stockService: { list: () => [stock('005930', '삼성전자')] },
      favoriteRepo: { findAll: () => [] },
      newsFeedService: {
        refresh: vi.fn(async () => {
          throw new Error('raw Toss response SESSION=[test-session] accountNo=[test-account]');
        }),
      },
      agentEventQueue: createAgentEventQueue(),
    });

    await expect(monitor.runOnce('manual')).rejects.toThrow('raw Toss response');

    const status = monitor.status();
    expect(status.lastErrorCode).toBe('AGENT_EVENT_MONITOR_FAILED');
    expect(JSON.stringify(status)).not.toContain(['SESSION', ''].join('='));
    expect(JSON.stringify(status)).not.toContain('[test-session]');
    expect(JSON.stringify(status)).not.toContain('accountNo');
  });
});
