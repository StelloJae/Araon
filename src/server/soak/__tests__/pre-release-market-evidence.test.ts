import { describe, expect, it } from 'vitest';

import {
  buildPreReleaseMarketEvidenceReport,
  type PreReleaseEvidenceEndpoint,
  type PreReleaseMarketEvidenceSample,
} from '../pre-release-market-evidence.js';

describe('buildPreReleaseMarketEvidenceReport', () => {
  it('keeps closed or unchanged samples out of completion-ready evidence', () => {
    const samples = [
      sample('top-movers', topMoversBody()),
      sample('realtime-ranking', realtimeRankingBody()),
      sample('quote-batch', quoteBatchBody()),
      sample('candles', candlesBody()),
      sample('runtime-health', runtimeHealthBody()),
      sample('top-movers', topMoversBody()),
      sample('realtime-ranking', realtimeRankingBody()),
      sample('quote-batch', quoteBatchBody({ timestampOnly: true })),
      sample('candles', candlesBody()),
      sample('runtime-health', runtimeHealthBody()),
    ];

    const report = buildPreReleaseMarketEvidenceReport(baseInput(samples));

    expect(report.ok).toBe(true);
    expect(report.marketEvidenceReady).toBe(false);
    expect(report.completionReady).toBe(false);
    expect(report.finalGoalCompletionReady).toBe(false);
    expect(report.marketHoursUseful).toBe(false);
    expect(report.completionCriteria.find((item) => item.criterion === 12)?.status).toBe(
      'blocked',
    );
    expect(report.blockers).toContain('No live-like market-hours movement was observed.');
  });

  it('detects ranking, quote, and candle movement for market-hours evidence', () => {
    const samples = [
      sample('top-movers', topMoversBody()),
      sample('realtime-ranking', realtimeRankingBody()),
      sample('quote-batch', quoteBatchBody()),
      sample('candles', candlesBody()),
      sample('runtime-health', runtimeHealthBody()),
      sample('top-movers', topMoversBody({ flipped: true })),
      sample('realtime-ranking', realtimeRankingBody({ changed: true })),
      sample('quote-batch', quoteBatchBody({ changed: true })),
      sample('candles', candlesBody({ changed: true })),
      sample('runtime-health', runtimeHealthBody({ acceptedCount: 2 })),
    ];

    const report = buildPreReleaseMarketEvidenceReport(baseInput(samples));

    expect(report.ok).toBe(true);
    expect(report.marketEvidenceReady).toBe(true);
    expect(report.completionReady).toBe(true);
    expect(report.finalGoalCompletionReady).toBe(false);
    expect(report.finalGoalRemainingNeed).toContain('browser/Computer Use visual QA');
    expect(report.blockers).toEqual([]);
    expect(report.top100Cadence.observed).toBe(true);
    expect(report.top100Cadence.rankOrderObserved).toBe(true);
    expect(report.realtimeRankingCadence.observed).toBe(true);
    expect(report.quoteSampleCadence.observed).toBe(true);
    expect(report.chartProgression.observed).toBe(true);
    expect(report.fastQuoteLane.ok).toBe(true);
    expect(report.completionCriteria).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ criterion: 12, status: 'pass' }),
        expect.objectContaining({ criterion: 13, status: 'supporting' }),
        expect.objectContaining({ criterion: 14, status: 'supporting' }),
        expect.objectContaining({ criterion: 16, status: 'supporting' }),
        expect.objectContaining({ criterion: 17, status: 'supporting' }),
        expect.objectContaining({ criterion: 41, status: 'supporting' }),
      ]),
    );
  });

  it('accepts the current 100ms Toss fast quote product caps as bounded evidence', () => {
    const samples = [
      sample('top-movers', topMoversBody()),
      sample('realtime-ranking', realtimeRankingBody()),
      sample('quote-batch', quoteBatchBody()),
      sample('candles', candlesBody()),
      sample(
        'runtime-health',
        runtimeHealthBody({
          intervalMs: 100,
          targetCap: 200,
          hardCap: 400,
          candidateCount: 64,
          requestedCount: 64,
          acceptedCount: 13,
        }),
      ),
      sample('top-movers', topMoversBody({ flipped: true })),
      sample('realtime-ranking', realtimeRankingBody({ changed: true })),
      sample('quote-batch', quoteBatchBody({ changed: true })),
      sample('candles', candlesBody({ changed: true })),
      sample(
        'runtime-health',
        runtimeHealthBody({
          intervalMs: 100,
          targetCap: 200,
          hardCap: 400,
          candidateCount: 64,
          requestedCount: 64,
          acceptedCount: 13,
        }),
      ),
    ];

    const report = buildPreReleaseMarketEvidenceReport(baseInput(samples));

    expect(report.fastQuoteLane.ok).toBe(true);
    expect(report.fastQuoteLane.intervalOk).toBe(true);
    expect(report.fastQuoteLane.capOk).toBe(true);
    expect(report.fastQuoteLane.maxTargetCap).toBe(200);
    expect(report.fastQuoteLane.maxHardCap).toBe(400);
    expect(report.fastQuoteLane.maxAcceptedCount).toBe(13);
    expect(report.blockers).not.toContain('Toss fast quote lane runtime was not healthy.');
    expect(report.completionCriteria.find((item) => item.criterion === 13)?.status).toBe(
      'supporting',
    );
  });

  it('rejects unbounded Toss fast quote caps even when the lane is running', () => {
    const samples = [
      sample('top-movers', topMoversBody()),
      sample('realtime-ranking', realtimeRankingBody()),
      sample('quote-batch', quoteBatchBody()),
      sample('candles', candlesBody()),
      sample(
        'runtime-health',
        runtimeHealthBody({
          intervalMs: 100,
          targetCap: 250,
          hardCap: 500,
          candidateCount: 401,
          requestedCount: 401,
          acceptedCount: 20,
        }),
      ),
      sample('top-movers', topMoversBody({ flipped: true })),
      sample('realtime-ranking', realtimeRankingBody({ changed: true })),
      sample('quote-batch', quoteBatchBody({ changed: true })),
      sample('candles', candlesBody({ changed: true })),
      sample(
        'runtime-health',
        runtimeHealthBody({
          intervalMs: 100,
          targetCap: 250,
          hardCap: 500,
          candidateCount: 401,
          requestedCount: 401,
          acceptedCount: 20,
        }),
      ),
    ];

    const report = buildPreReleaseMarketEvidenceReport(baseInput(samples));

    expect(report.fastQuoteLane.ok).toBe(false);
    expect(report.fastQuoteLane.intervalOk).toBe(true);
    expect(report.fastQuoteLane.capOk).toBe(false);
    expect(report.blockers).toContain('Toss fast quote lane runtime was not healthy.');
    expect(report.completionCriteria.find((item) => item.criterion === 13)?.status).toBe(
      'blocked',
    );
  });

  it('requires rank reorder evidence instead of accepting value-only TOP100 changes', () => {
    const samples = [
      sample('top-movers', topMoversBody()),
      sample('realtime-ranking', realtimeRankingBody()),
      sample('quote-batch', quoteBatchBody()),
      sample('candles', candlesBody()),
      sample('runtime-health', runtimeHealthBody()),
      sample('top-movers', topMoversBody({ valueChanged: true })),
      sample('realtime-ranking', realtimeRankingBody({ changed: true })),
      sample('quote-batch', quoteBatchBody({ changed: true })),
      sample('candles', candlesBody({ changed: true })),
      sample('runtime-health', runtimeHealthBody({ acceptedCount: 2 })),
    ];

    const report = buildPreReleaseMarketEvidenceReport(baseInput(samples));

    expect(report.marketEvidenceReady).toBe(false);
    expect(report.completionReady).toBe(false);
    expect(report.top100Cadence.observed).toBe(true);
    expect(report.top100Cadence.rankOrderObserved).toBe(false);
    expect(report.realtimeRankingCadence.rankOrderObserved).toBe(false);
    expect(report.blockers).toContain('TOP100/realtime rank reorder was not observed.');
    expect(report.completionCriteria.find((item) => item.criterion === 12)?.status).toBe(
      'blocked',
    );
  });

  it('keeps latency regressions visible even when data moves', () => {
    const samples = [
      sample('top-movers', topMoversBody(), { durationMs: 3_000 }),
      sample('realtime-ranking', realtimeRankingBody({ changed: true }), { durationMs: 3_000 }),
      sample('quote-batch', quoteBatchBody({ changed: true }), { durationMs: 3_000 }),
      sample('candles', candlesBody({ changed: true }), { durationMs: 3_000 }),
      sample('runtime-health', runtimeHealthBody({ acceptedCount: 2 }), { durationMs: 3_000 }),
    ];

    const report = buildPreReleaseMarketEvidenceReport(baseInput(samples));

    expect(report.ok).toBe(false);
    expect(report.completionReady).toBe(false);
    expect(report.latency.ok).toBe(false);
    expect(report.blockers).toContain(
      'Endpoint latency exceeded the pre-release evidence threshold.',
    );
  });

  it('keeps off-hours runs out of completion-ready evidence even if samples move', () => {
    const samples = [
      sample('top-movers', topMoversBody()),
      sample('realtime-ranking', realtimeRankingBody()),
      sample('quote-batch', quoteBatchBody()),
      sample('candles', candlesBody()),
      sample('runtime-health', runtimeHealthBody()),
      sample('top-movers', topMoversBody({ flipped: true })),
      sample('realtime-ranking', realtimeRankingBody({ flipped: true })),
      sample('quote-batch', quoteBatchBody({ changed: true })),
      sample('candles', candlesBody({ changed: true })),
      sample('runtime-health', runtimeHealthBody({ acceptedCount: 2 })),
    ];

    const report = buildPreReleaseMarketEvidenceReport({
      ...baseInput(samples),
      startedAt: '2026-05-17T15:14:00.000Z',
      finishedAt: '2026-05-17T15:15:30.000Z',
    });

    expect(report.completionReady).toBe(false);
    expect(report.marketWindow.regularMarketLikely).toBe(false);
    expect(report.marketWindow.integratedLiveWindowLikely).toBe(false);
    expect(report.marketWindow.kstStartedAt).toBe('2026-05-18 00:14 KST');
    expect(report.blockers).toContain(
      'Evidence window was outside Araon integrated Korean-market live hours.',
    );
    expect(report.completionCriteria.find((item) => item.criterion === 12)?.status).toBe(
      'blocked',
    );
    expect(report.completionCriteria.find((item) => item.criterion === 14)?.status).toBe(
      'blocked',
    );
    expect(report.completionCriteria.find((item) => item.criterion === 16)?.status).toBe(
      'blocked',
    );
    expect(report.completionCriteria.find((item) => item.criterion === 17)?.status).toBe(
      'blocked',
    );
    expect(report.completionCriteria.find((item) => item.criterion === 41)?.status).toBe(
      'blocked',
    );
  });

  it('accepts the integrated live window even before regular KRX open', () => {
    const samples = [
      sample('top-movers', topMoversBody()),
      sample('realtime-ranking', realtimeRankingBody()),
      sample('quote-batch', quoteBatchBody()),
      sample('candles', candlesBody()),
      sample('runtime-health', runtimeHealthBody()),
      sample('top-movers', topMoversBody({ flipped: true })),
      sample('realtime-ranking', realtimeRankingBody({ flipped: true })),
      sample('quote-batch', quoteBatchBody({ changed: true })),
      sample('candles', candlesBody({ changed: true })),
      sample('runtime-health', runtimeHealthBody({ acceptedCount: 2 })),
    ];

    const report = buildPreReleaseMarketEvidenceReport({
      ...baseInput(samples),
      startedAt: '2026-05-17T23:30:00.000Z',
      finishedAt: '2026-05-17T23:31:00.000Z',
    });

    expect(report.completionReady).toBe(true);
    expect(report.marketWindow.regularMarketLikely).toBe(false);
    expect(report.marketWindow.integratedLiveWindowLikely).toBe(true);
    expect(report.marketWindow.kstStartedAt).toBe('2026-05-18 08:30 KST');
  });

  it('keeps slow sample cadence out of completion-ready market evidence', () => {
    const samples = [
      sample('top-movers', topMoversBody(), { sampledAt: '2026-05-18T00:00:00.000Z' }),
      sample('realtime-ranking', realtimeRankingBody(), {
        sampledAt: '2026-05-18T00:00:00.000Z',
      }),
      sample('quote-batch', quoteBatchBody(), { sampledAt: '2026-05-18T00:00:00.000Z' }),
      sample('candles', candlesBody(), { sampledAt: '2026-05-18T00:00:00.000Z' }),
      sample('runtime-health', runtimeHealthBody(), {
        sampledAt: '2026-05-18T00:00:00.000Z',
      }),
      sample('top-movers', topMoversBody({ flipped: true }), {
        sampledAt: '2026-05-18T00:00:05.000Z',
      }),
      sample('realtime-ranking', realtimeRankingBody({ changed: true }), {
        sampledAt: '2026-05-18T00:00:05.000Z',
      }),
      sample('quote-batch', quoteBatchBody({ changed: true }), {
        sampledAt: '2026-05-18T00:00:05.000Z',
      }),
      sample('candles', candlesBody({ changed: true }), {
        sampledAt: '2026-05-18T00:00:05.000Z',
      }),
      sample('runtime-health', runtimeHealthBody({ acceptedCount: 2 }), {
        sampledAt: '2026-05-18T00:00:05.000Z',
      }),
    ];

    const report = buildPreReleaseMarketEvidenceReport(baseInput(samples));

    expect(report.ok).toBe(true);
    expect(report.completionReady).toBe(false);
    expect(report.sampleCadence.ok).toBe(false);
    expect(report.blockers).toContain(
      'Sample cadence exceeded the pre-release evidence threshold.',
    );
    expect(report.completionCriteria.find((item) => item.criterion === 12)?.status).toBe(
      'blocked',
    );
    expect(report.completionCriteria.find((item) => item.criterion === 41)?.status).toBe(
      'blocked',
    );
  });

  it('blocks completion when Toss fast quote lane is not a healthy bounded runtime lane', () => {
    const samples = [
      sample('top-movers', topMoversBody()),
      sample('realtime-ranking', realtimeRankingBody()),
      sample('quote-batch', quoteBatchBody()),
      sample('candles', candlesBody()),
      sample('runtime-health', runtimeHealthBody({ running: false })),
      sample('top-movers', topMoversBody({ flipped: true })),
      sample('realtime-ranking', realtimeRankingBody({ changed: true })),
      sample('quote-batch', quoteBatchBody({ changed: true })),
      sample('candles', candlesBody({ changed: true })),
      sample('runtime-health', runtimeHealthBody({ running: false, acceptedCount: 2 })),
    ];

    const report = buildPreReleaseMarketEvidenceReport(baseInput(samples));

    expect(report.completionReady).toBe(false);
    expect(report.fastQuoteLane.ok).toBe(false);
    expect(report.blockers).toContain('Toss fast quote lane runtime was not healthy.');
    expect(report.completionCriteria.find((item) => item.criterion === 13)?.status).toBe(
      'blocked',
    );
    expect(report.completionCriteria.find((item) => item.criterion === 14)?.status).toBe(
      'blocked',
    );
  });
});

function baseInput(samples: PreReleaseMarketEvidenceSample[]) {
  return {
    targetUrl: 'http://127.0.0.1:3000',
    startedAt: '2026-05-18T00:00:00.000Z',
    finishedAt: '2026-05-18T00:00:02.000Z',
    durationMs: 2_000,
    intervalMs: 500,
    selectedTicker: '005930',
    quoteTickers: ['005930'],
    samples,
  };
}

function sample(
  endpoint: PreReleaseEvidenceEndpoint,
  data: unknown,
  opts: { status?: number; durationMs?: number; sampledAt?: string } = {},
): PreReleaseMarketEvidenceSample {
  return {
    endpoint,
    sampledAt: opts.sampledAt ?? '2026-05-18T00:00:00.000Z',
    status: opts.status ?? 200,
    durationMs: opts.durationMs ?? 20,
    bodyText: JSON.stringify({ success: true, data }),
  };
}

function topMoversBody(opts: { flipped?: boolean; valueChanged?: boolean } = {}) {
  const gainers = opts.flipped
    ? [
        mover(1, '000660', 'SK하이닉스', 200_000, 5.5),
        mover(2, '005930', '삼성전자', 80_000, 4.1),
      ]
    : opts.valueChanged
      ? [
          mover(1, '005930', '삼성전자', 80_500, 4.4),
          mover(2, '000660', 'SK하이닉스', 199_000, 3.7),
        ]
    : [
        mover(1, '005930', '삼성전자', 79_000, 3.8),
        mover(2, '000660', 'SK하이닉스', 198_000, 3.2),
      ];
  return {
    generatedAt: '2026-05-18T00:00:00.000Z',
    fetchedAt: '2026-05-18T00:00:00.000Z',
    cacheTtlMs: 500,
    refreshIntervalMs: 500,
    staleAfterMs: 2_000,
    source: 'toss-overview-ranking',
    sourcePhase: 'regular',
    sourceLabel: 'Toss',
    sourceReason: null,
    frozen: false,
    lastGoodAgeMs: 0,
    partialReason: null,
    stopReason: 'complete',
    rankingDiagnostics: { gainers: null, losers: null },
    rankingRateLimited: false,
    status: 'ready',
    message: '',
    cooldownUntil: null,
    coverage: {
      requestedLimit: 100,
      gainersCount: 2,
      losersCount: 1,
      gainersComplete: true,
      losersComplete: true,
      marketUniverse: 'toss-web-ranking',
      guaranteedTop100: true,
      includesLocalFallback: false,
    },
    gainers,
    losers: [mover(1, '035420', 'NAVER', 180_000, -2.1)],
  };
}

function realtimeRankingBody(opts: { changed?: boolean; flipped?: boolean } = {}) {
  const items = opts.flipped
    ? [
        {
          rank: 1,
          ticker: '000660',
          productCode: 'A000660',
          name: 'SK하이닉스',
          market: 'KOSPI',
          currency: 'KRW',
          price: 200_000,
          changeAbs: 2_000,
          changePct: 5.5,
          volume: 200_000,
        },
        {
          rank: 2,
          ticker: '005930',
          productCode: 'A005930',
          name: '삼성전자',
          market: 'KOSPI',
          currency: 'KRW',
          price: 80_000,
          changeAbs: 1_000,
          changePct: 4.1,
          volume: 100_000,
        },
      ]
    : [
        {
          rank: 1,
          ticker: '005930',
          productCode: 'A005930',
          name: '삼성전자',
          market: 'KOSPI',
          currency: 'KRW',
          price: opts.changed ? 80_000 : 79_000,
          changeAbs: opts.changed ? 1_000 : 500,
          changePct: opts.changed ? 4.1 : 3.8,
          volume: 100_000,
        },
      ];
  return {
    generatedAt: '2026-05-18T00:00:00.000Z',
    fetchedAt: '2026-05-18T00:00:00.000Z',
    rankingDateTime: '2026-05-18T00:00:00.000Z',
    rankingTimestampStatus: 'fresh',
    source: 'toss-public-realtime-ranking',
    sourceLabel: '토스 실시간 인기',
    status: 'ready',
    message: '',
    refreshIntervalMs: 500,
    coverage: {
      requestedLimit: 100,
      returnedCount: 1,
      pricedCount: 1,
      market: 'kr',
    },
    items,
  };
}

function quoteBatchBody(opts: { changed?: boolean; timestampOnly?: boolean } = {}) {
  return {
    providerId: 'toss-public',
    fetchedAt: '2026-05-18T00:00:00.000Z',
    requestedCount: 1,
    returnedCount: 1,
    prices: [
      {
        ticker: '005930',
        price: opts.changed ? 80_000 : 79_000,
        changeRate: opts.changed ? 4.1 : 3.8,
        volume: 100_000,
        updatedAt: opts.changed || opts.timestampOnly
          ? '2026-05-18T00:00:01.000Z'
          : '2026-05-18T00:00:00.000Z',
        isSnapshot: false,
        source: 'toss-fast-quote',
      },
    ],
    missingTickers: [],
  };
}

function candlesBody(opts: { changed?: boolean } = {}) {
  return {
    ticker: '005930',
    interval: '1m',
    items: [
      {
        time: 1_768_704_000,
        bucketAt: '2026-05-18T00:00:00.000Z',
        open: 79_000,
        high: opts.changed ? 80_000 : 79_000,
        low: 79_000,
        close: opts.changed ? 80_000 : 79_000,
        volume: 100,
        sampleCount: opts.changed ? 2 : 1,
        source: 'toss-fast-quote',
        isPartial: true,
      },
    ],
  };
}

function runtimeHealthBody(
  opts: {
    running?: boolean;
    intervalMs?: number;
    targetCap?: number;
    hardCap?: number;
    candidateCount?: number;
    requestedCount?: number;
    acceptedCount?: number;
  } = {},
) {
  return {
    tossFastQuoteLane: {
      configured: true,
      running: opts.running ?? true,
      enabled: true,
      source: 'toss-fast-quote',
      intervalMs: opts.intervalMs ?? 500,
      targetCap: opts.targetCap ?? 64,
      hardCap: opts.hardCap ?? 100,
      candidateCount: opts.candidateCount ?? 20,
      requestedCount: opts.requestedCount ?? 20,
      returnedCount: 20,
      acceptedCount: opts.acceptedCount ?? 1,
      droppedUnchangedCount: 0,
      droppedStaleCount: 0,
      droppedInvalidCount: 0,
      skippedInFlightCount: 0,
      failureCount: 0,
      consecutiveFailureCount: 0,
      backoffUntil: null,
      lastSuccessAt: '2026-05-18T00:00:00.000Z',
      lastFailureAt: null,
      lastErrorCode: null,
      lastMessage: 'ready',
    },
  };
}

function mover(
  rank: number,
  ticker: string,
  name: string,
  price: number,
  changePct: number,
) {
  return {
    rank,
    ticker,
    name,
    price,
    changeAbs: Math.round((price * changePct) / 100),
    changePct,
    volume: 100_000,
  };
}
