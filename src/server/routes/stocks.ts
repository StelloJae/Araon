/**
 * Fastify plugin for stock CRUD endpoints.
 *
 * Routes:
 *   POST   /stocks         – add one stock
 *   GET    /stocks         – list all stocks
 *   DELETE /stocks/:ticker – remove a stock
 *   POST   /stocks/bulk    – bulk-add via CSV text
 *
 * The plugin accepts a `service` option at registration time so the caller
 * (Phase 8+ bootstrap) can inject the real or test implementation.
 * No port binding occurs here.
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { StockService } from '../services/stock-service.js';
import type {
  CandleCoverageRepository,
  PriceCandleRepository,
  StockNoteRepository,
  StockObservationPlanRepository,
  StockSignalEventRepository,
} from '../db/repositories.js';
import { parseStockCsv } from '../parsers/csv-parser.js';
import { createChildLogger } from '@shared/logger.js';
import { aggregateCandles } from '../price/candle-aggregation.js';
import { isBackfillAllowed } from '../chart/backfill-policy.js';
import { shouldBackfillDailyTicker } from '../chart/daily-backfill-coverage.js';
import { planSelectedTickerMinuteBackfill } from '../chart/minute-backfill-strategy.js';
import type {
  CandleApiCoverage,
  CandleApiItem,
  CandleApiStatus,
  CandleCoverageLedgerSummary,
  CandleInterval,
  PriceCandle,
  PriceCandleSource,
  StockNote,
  StockObservationPlan,
  StockSignalEvent,
  StockSignalOutcome,
  StockTimelineItem,
} from '@shared/types.js';
import type {
  DailyBackfillRange,
  DailyBackfillService,
} from '../chart/daily-backfill-service.js';
import type { TodayMinuteBackfillService } from '../chart/today-minute-backfill-service.js';
import type { HistoricalMinuteBackfillService } from '../chart/historical-minute-backfill-service.js';
import type { StockNewsFeedService } from '../news/news-feed-service.js';

const log = createChildLogger('routes/stocks');
const MAX_DISPLAY_MINUTE_TRADE_VALUE_KRW = 5_000_000_000_000;

// === Plugin options ===========================================================

export interface StockRoutesOptions extends FastifyPluginOptions {
  service: StockService;
  candleRepo?: PriceCandleRepository;
  candleCoverageRepo?: CandleCoverageRepository;
  noteRepo?: StockNoteRepository;
  observationPlanRepo?: StockObservationPlanRepository;
  signalEventRepo?: StockSignalEventRepository;
  dailyBackfillService?: DailyBackfillService;
  todayMinuteBackfillService?: TodayMinuteBackfillService;
  historicalMinuteBackfillService?: HistoricalMinuteBackfillService;
  newsFeedService?: StockNewsFeedService;
  now?: () => Date;
}

// === Request/response schemas =================================================

const addOneBodySchema = z.object({
  ticker: z.string().regex(/^\d{6}$/, 'ticker must be exactly 6 digits'),
  name: z.string().min(1),
  market: z.enum(['KOSPI', 'KOSDAQ']).default('KOSPI'),
  sectorName: z.string().optional(),
});

const bulkBodySchema = z.object({
  csv: z.string().min(1),
});

const candleIntervalSchema = z.enum([
  '1m',
  '3m',
  '5m',
  '10m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '12h',
  '1D',
  '1W',
  '1M',
]);

const candleRangeSchema = z.enum(['1d', '1w', '1m', '3m', '6m', '1y']);

const candlesQuerySchema = z.object({
  interval: candleIntervalSchema.default('1m'),
  range: candleRangeSchema.default('1d'),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(20_000).optional(),
});

const candleBackfillBodySchema = z.object({
  interval: z.literal('1d'),
  range: z.enum(['1m', '3m', '6m', '1y']).default('3m'),
});

const minuteBackfillBodySchema = z.object({
  interval: z.literal('1m').default('1m'),
  maxPages: z.coerce.number().int().positive().max(4).default(4),
});

const ensureCoverageBodySchema = z.object({
  interval: candleIntervalSchema,
  range: candleRangeSchema,
  from: z.string().optional(),
  to: z.string().optional(),
});

const stockNoteBodySchema = z.object({
  body: z.string().trim().min(1).max(2_000),
});

const observationPlanBodySchema = z.object({
  thesis: z.string().trim().min(1).max(2_000),
  trigger: z.string().trim().min(1).max(1_000),
  invalidation: z.string().trim().min(1).max(1_000),
  status: z.enum(['watching', 'paused', 'archived']).default('watching'),
});

const stockNoteQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const signalEventBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  signalType: z.enum(['scalp', 'strong_scalp', 'overheat', 'trend']),
  source: z.literal('realtime-momentum'),
  signalPrice: z.number().positive(),
  signalAt: z.string().datetime(),
  baselinePrice: z.number().positive().nullable(),
  baselineAt: z.string().datetime().nullable(),
  momentumPct: z.number(),
  momentumWindow: z.enum(['10s', '20s', '30s', '1m', '3m', '5m']),
  dailyChangePct: z.number().nullable(),
  volume: z.number().int().nonnegative().nullable(),
  volumeSurgeRatio: z.number().positive().nullable(),
  volumeBaselineStatus: z.enum(['collecting', 'ready', 'unavailable']).nullable(),
});

const timelineQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(30),
});

type AddOneBody = z.infer<typeof addOneBodySchema>;
type BulkBody = z.infer<typeof bulkBodySchema>;
type CandleBackfillBody = z.infer<typeof candleBackfillBodySchema>;
type MinuteBackfillBody = z.infer<typeof minuteBackfillBodySchema>;
type EnsureCoverageBody = z.infer<typeof ensureCoverageBodySchema>;
type StockNoteBody = z.infer<typeof stockNoteBodySchema>;
type ObservationPlanBody = z.infer<typeof observationPlanBodySchema>;
type StockNoteQuery = z.input<typeof stockNoteQuerySchema>;
type SignalEventBody = z.infer<typeof signalEventBodySchema>;

// === Plugin ===================================================================

export async function stockRoutes(
  app: FastifyInstance,
  opts: StockRoutesOptions,
): Promise<void> {
  const { service } = opts;

  app.get<{ Params: { ticker: string } }>(
    '/stocks/:ticker/observation-plan',
    async (request, reply) => {
      const ticker = request.params.ticker;
      if (!/^\d{6}$/.test(ticker)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_TICKER' },
        });
      }
      if (opts.observationPlanRepo === undefined) {
        return reply.status(503).send({
          success: false,
          error: { code: 'STOCK_OBSERVATION_PLAN_REPOSITORY_NOT_WIRED' },
        });
      }
      return reply.send({
        success: true,
        data: opts.observationPlanRepo.findByTicker(ticker),
      });
    },
  );

  app.put<{
    Params: { ticker: string };
    Body: ObservationPlanBody;
  }>('/stocks/:ticker/observation-plan', async (request, reply) => {
    const ticker = request.params.ticker;
    if (!/^\d{6}$/.test(ticker)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TICKER' },
      });
    }
    if (opts.observationPlanRepo === undefined) {
      return reply.status(503).send({
        success: false,
        error: { code: 'STOCK_OBSERVATION_PLAN_REPOSITORY_NOT_WIRED' },
      });
    }
    const parsed = observationPlanBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues,
      });
    }

    const plan: StockObservationPlan = opts.observationPlanRepo.upsert({
      ticker,
      thesis: parsed.data.thesis,
      trigger: parsed.data.trigger,
      invalidation: parsed.data.invalidation,
      status: parsed.data.status,
      now: (opts.now ?? (() => new Date()))(),
    });
    return reply.send({ success: true, data: plan });
  });

  app.get<{ Params: { ticker: string }; Querystring: StockNoteQuery }>(
    '/stocks/:ticker/notes',
    async (request, reply) => {
    const ticker = request.params.ticker;
    if (!/^\d{6}$/.test(ticker)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TICKER' },
      });
    }
    if (opts.noteRepo === undefined) {
      return reply.status(503).send({
        success: false,
        error: { code: 'STOCK_NOTE_REPOSITORY_NOT_WIRED' },
      });
    }
    const parsed = stockNoteQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues,
      });
    }

    return reply.send({
      success: true,
      data: opts.noteRepo.listByTicker(ticker, parsed.data),
    });
  },
  );

  app.post<{
    Params: { ticker: string };
    Body: StockNoteBody;
  }>('/stocks/:ticker/notes', async (request, reply) => {
    const ticker = request.params.ticker;
    if (!/^\d{6}$/.test(ticker)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TICKER' },
      });
    }
    if (opts.noteRepo === undefined) {
      return reply.status(503).send({
        success: false,
        error: { code: 'STOCK_NOTE_REPOSITORY_NOT_WIRED' },
      });
    }
    const parsed = stockNoteBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues,
      });
    }

    const note: StockNote = opts.noteRepo.create({
      ticker,
      body: parsed.data.body,
      now: (opts.now ?? (() => new Date()))(),
    });
    return reply.status(201).send({ success: true, data: note });
  });

  app.delete<{ Params: { ticker: string; noteId: string } }>(
    '/stocks/:ticker/notes/:noteId',
    async (request, reply) => {
      const { ticker, noteId } = request.params;
      if (!/^\d{6}$/.test(ticker)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_TICKER' },
        });
      }
      if (!/^[0-9a-fA-F-]{36}$/.test(noteId)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_NOTE_ID' },
        });
      }
      if (opts.noteRepo === undefined) {
        return reply.status(503).send({
          success: false,
          error: { code: 'STOCK_NOTE_REPOSITORY_NOT_WIRED' },
        });
      }

      opts.noteRepo.delete(ticker, noteId);
      return reply.status(204).send();
    },
  );

  app.post<{
    Params: { ticker: string };
    Body: SignalEventBody;
  }>('/stocks/:ticker/signals', async (request, reply) => {
    const ticker = request.params.ticker;
    if (!/^\d{6}$/.test(ticker)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TICKER' },
      });
    }
    if (opts.signalEventRepo === undefined) {
      return reply.status(503).send({
        success: false,
        error: { code: 'STOCK_SIGNAL_REPOSITORY_NOT_WIRED' },
      });
    }
    const parsed = signalEventBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues,
      });
    }

    const event: StockSignalEvent = opts.signalEventRepo.create({
      ticker,
      name: parsed.data.name,
      signalType: parsed.data.signalType,
      source: parsed.data.source,
      signalPrice: parsed.data.signalPrice,
      signalAt: parsed.data.signalAt,
      baselinePrice: parsed.data.baselinePrice,
      baselineAt: parsed.data.baselineAt,
      momentumPct: parsed.data.momentumPct,
      momentumWindow: parsed.data.momentumWindow,
      dailyChangePct: parsed.data.dailyChangePct,
      volume: parsed.data.volume,
      volumeSurgeRatio: parsed.data.volumeSurgeRatio,
      volumeBaselineStatus: parsed.data.volumeBaselineStatus,
      now: (opts.now ?? (() => new Date()))(),
    });
    return reply.status(201).send({ success: true, data: event });
  });

  app.get<{
    Params: { ticker: string };
    Querystring: z.input<typeof timelineQuerySchema>;
  }>('/stocks/:ticker/timeline', async (request, reply) => {
    const ticker = request.params.ticker;
    if (!/^\d{6}$/.test(ticker)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TICKER' },
      });
    }
    if (opts.noteRepo === undefined || opts.signalEventRepo === undefined) {
      return reply.status(503).send({
        success: false,
        error: { code: 'STOCK_TIMELINE_NOT_WIRED' },
      });
    }
    const parsed = timelineQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues,
      });
    }

    const notes: StockTimelineItem[] = opts.noteRepo
      .listByTicker(ticker, { limit: parsed.data.limit })
      .map((note) => ({
        kind: 'note',
        id: note.id,
        ticker,
        occurredAt: note.createdAt,
        note,
      }));
    const signals: StockTimelineItem[] = opts.signalEventRepo
      .listByTicker(ticker, parsed.data.limit)
      .map((signal) => ({
        kind: 'signal',
        id: signal.id,
        ticker,
        occurredAt: signal.signalAt,
        signal,
        outcomes: buildSignalOutcomes(signal, opts.candleRepo),
      }));

    const items = [...notes, ...signals]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, parsed.data.limit);
    return reply.send({ success: true, data: items });
  });

  app.get<{ Params: { ticker: string } }>('/stocks/:ticker/news', async (request, reply) => {
    const ticker = request.params.ticker;
    if (!/^\d{6}$/.test(ticker)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TICKER' },
      });
    }
    if (opts.newsFeedService === undefined) {
      return reply.status(503).send({
        success: false,
        error: { code: 'STOCK_NEWS_FEED_NOT_WIRED' },
      });
    }
    return reply.send({ success: true, data: opts.newsFeedService.list(ticker) });
  });

  app.post<{ Params: { ticker: string } }>(
    '/stocks/:ticker/news/refresh',
    async (request, reply) => {
      const ticker = request.params.ticker;
      if (!/^\d{6}$/.test(ticker)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_TICKER' },
        });
      }
      if (opts.newsFeedService === undefined) {
        return reply.status(503).send({
          success: false,
          error: { code: 'STOCK_NEWS_FEED_NOT_WIRED' },
        });
      }
      try {
        const data = await opts.newsFeedService.refresh({
          ticker,
          now: (opts.now ?? (() => new Date()))(),
        });
        return reply.send({ success: true, data });
      } catch (err: unknown) {
        log.warn(
          { ticker, err: err instanceof Error ? err.message : String(err) },
          'stock news feed refresh failed',
        );
        return reply.status(503).send({
          success: false,
          error: { code: 'STOCK_NEWS_REFRESH_FAILED' },
        });
      }
    },
  );

  app.post<{
    Params: { ticker: string };
    Body: CandleBackfillBody;
  }>('/stocks/:ticker/candles/backfill', async (request, reply) => {
    const ticker = request.params.ticker;
    if (!/^\d{6}$/.test(ticker)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TICKER' },
      });
    }
    if (opts.dailyBackfillService === undefined) {
      return reply.status(503).send({
        success: false,
        error: { code: 'DAILY_BACKFILL_NOT_WIRED' },
      });
    }

    const parsed = candleBackfillBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues,
      });
    }

    const now = (opts.now ?? (() => new Date()))();
    if (!isBackfillAllowed(now, 'closed')) {
      return reply.status(409).send({
        success: false,
        error: { code: 'BACKFILL_NOT_ALLOWED_DURING_MARKET' },
      });
    }

    try {
      const result = await opts.dailyBackfillService.backfillDailyCandles({
        ticker,
        range: parsed.data.range as DailyBackfillRange,
        now,
      });
      return reply.send({ success: true, data: result });
    } catch (err: unknown) {
      log.warn(
        { ticker, err: err instanceof Error ? err.message : String(err) },
        'daily candle backfill failed',
      );
      return reply.status(503).send({
        success: false,
        error: { code: 'DAILY_BACKFILL_FAILED' },
      });
    }
  });

  app.post<{
    Params: { ticker: string };
    Body: EnsureCoverageBody;
  }>('/stocks/:ticker/candles/ensure-coverage', async (request, reply) => {
    const ticker = request.params.ticker;
    if (!/^\d{6}$/.test(ticker)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TICKER' },
      });
    }
    if (opts.candleRepo === undefined) {
      return reply.status(503).send({
        success: false,
        error: { code: 'CANDLE_REPOSITORY_NOT_WIRED' },
      });
    }

    const parsed = ensureCoverageBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues,
      });
    }

    const now = (opts.now ?? (() => new Date()))();
    const window = resolveCandleWindow(parsed.data.range, parsed.data.from, parsed.data.to);
    if (window === null) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_CANDLE_WINDOW' },
      });
    }

    if (!isBackfillAllowed(now, 'closed')) {
      return reply.send({
        success: true,
        data: {
          state: 'skipped',
          reason: 'MARKET_HOURS',
          source: null,
          requested: 0,
          inserted: 0,
          updated: 0,
          message: '장중에는 차트 과거 데이터 자동 보강을 대기합니다.',
        },
      });
    }

    if (dailyBaseInterval(parsed.data.interval)) {
      if (opts.dailyBackfillService === undefined) {
        return reply.status(503).send({
          success: false,
          error: { code: 'DAILY_BACKFILL_NOT_WIRED' },
        });
      }
      const range = dailyBackfillRangeForCandleRange(parsed.data.range);
      if (
        opts.candleCoverageRepo?.hasCompleteCoverage({
          ticker,
          interval: '1d',
          source: 'kis-daily',
          from: window.from,
          to: window.to,
        }) === true ||
        !shouldBackfillDailyTicker({
          ticker,
          range,
          now,
          repo: opts.candleRepo,
        })
      ) {
        return reply.send({
          success: true,
          data: {
            state: 'current',
            source: 'kis-daily',
            requested: 0,
            inserted: 0,
            updated: 0,
            message: '일봉 차트 coverage가 이미 준비되어 있습니다.',
          },
        });
      }
      try {
        const result = await opts.dailyBackfillService.backfillDailyCandles({
          ticker,
          range,
          now,
        });
        if (opts.candleCoverageRepo !== undefined && result.requested > 0) {
          opts.candleCoverageRepo.upsertSegment({
            ticker,
            interval: '1d',
            source: result.source,
            rangeFrom: window.from,
            rangeTo: window.to,
            status: 'complete',
            requested: result.requested,
            inserted: result.inserted,
            updated: result.updated,
            now,
          });
        }
        return reply.send({
          success: true,
          data: {
            state: result.requested > 0 ? 'backfilled' : 'empty',
            source: result.source,
            requested: result.requested,
            inserted: result.inserted,
            updated: result.updated,
            from: result.from,
            to: result.to,
            message: '일봉 차트 coverage를 자동 보강했습니다.',
          },
        });
      } catch (err: unknown) {
        log.warn(
          { ticker, err: err instanceof Error ? err.message : String(err) },
          'daily chart coverage ensure failed',
        );
        return reply.status(503).send({
          success: false,
          error: { code: 'DAILY_COVERAGE_ENSURE_FAILED' },
        });
      }
    }

    if (opts.historicalMinuteBackfillService === undefined) {
      return reply.status(503).send({
        success: false,
        error: { code: 'HISTORICAL_MINUTE_BACKFILL_NOT_WIRED' },
      });
    }

    if (hasBackfilledIntradayInWindow(opts.candleRepo, opts.candleCoverageRepo, ticker, window)) {
      return reply.send({
        success: true,
        data: {
          state: 'current',
          source: 'kis-time-daily',
          requested: 0,
          inserted: 0,
          updated: 0,
          message: '분봉 차트 coverage가 이미 준비되어 있습니다.',
        },
      });
    }

    try {
      const result = await opts.historicalMinuteBackfillService.backfillHistoricalMinuteCandles({
        ticker,
        from: window.from,
        to: window.to,
        now,
      });
      if (opts.candleCoverageRepo !== undefined && result.requested > 0) {
        opts.candleCoverageRepo.upsertSegment({
          ticker,
          interval: '1m',
          source: result.source,
          rangeFrom: window.from,
          rangeTo: window.to,
          status: 'complete',
          requested: result.requested,
          inserted: result.inserted,
          updated: result.updated,
          now,
        });
      }
      return reply.send({
        success: true,
        data: {
          state: result.requested > 0 ? 'backfilled' : 'empty',
          source: result.source,
          requested: result.requested,
          inserted: result.inserted,
          updated: result.updated,
          from: result.from,
          to: result.to,
          pages: result.pages,
          tradingDays: result.tradingDays,
          message: '분봉 차트 coverage를 자동 보강했습니다.',
        },
      });
    } catch (err: unknown) {
      log.warn(
        { ticker, err: err instanceof Error ? err.message : String(err) },
        'historical minute chart coverage ensure failed',
      );
      return reply.status(503).send({
        success: false,
        error: { code: 'HISTORICAL_MINUTE_COVERAGE_ENSURE_FAILED' },
      });
    }
  });

  app.post<{
    Params: { ticker: string };
    Body: MinuteBackfillBody;
  }>('/stocks/:ticker/candles/backfill-minute', async (request, reply) => {
    const ticker = request.params.ticker;
    if (!/^\d{6}$/.test(ticker)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TICKER' },
      });
    }
    if (opts.todayMinuteBackfillService === undefined) {
      return reply.status(503).send({
        success: false,
        error: { code: 'TODAY_MINUTE_BACKFILL_NOT_WIRED' },
      });
    }

    const parsed = minuteBackfillBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues,
      });
    }

    const now = (opts.now ?? (() => new Date()))();
    const strategy = planSelectedTickerMinuteBackfill({ tickers: [ticker], now });
    if (strategy.state !== 'ready') {
      return reply.status(strategy.state === 'hold' ? 409 : 423).send({
        success: false,
        error: { code: strategy.reason ?? 'MINUTE_BACKFILL_NOT_ALLOWED' },
      });
    }

    try {
      const result = await opts.todayMinuteBackfillService.backfillTodayMinuteCandles({
        ticker,
        now,
        maxPages: parsed.data.maxPages,
      });
      return reply.send({ success: true, data: result });
    } catch (err: unknown) {
      log.warn(
        { ticker, err: err instanceof Error ? err.message : String(err) },
        'today minute candle backfill failed',
      );
      return reply.status(503).send({
        success: false,
        error: { code: 'TODAY_MINUTE_BACKFILL_FAILED' },
      });
    }
  });

  app.get<{
    Params: { ticker: string };
    Querystring: z.input<typeof candlesQuerySchema>;
  }>('/stocks/:ticker/candles', async (request, reply) => {
    if (opts.candleRepo === undefined) {
      return reply.status(503).send({
        success: false,
        error: { code: 'CANDLE_REPOSITORY_NOT_WIRED' },
      });
    }
    const ticker = request.params.ticker;
    if (!/^\d{6}$/.test(ticker)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TICKER' },
      });
    }

    const parsed = candlesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues,
      });
    }

    const window = resolveCandleWindow(parsed.data.range, parsed.data.from, parsed.data.to);
    if (window === null) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_CANDLE_WINDOW' },
      });
    }

    const baseInterval = dailyBaseInterval(parsed.data.interval) ? '1d' : '1m';
    const rawBase = opts.candleRepo.listCandles({
      ticker,
      interval: baseInterval,
      from: window.from,
      to: window.to,
      limit: parsed.data.limit,
    });
    const base =
      baseInterval === '1m'
        ? rawBase.filter(isDisplayableIntradayCandle)
        : rawBase;
    const candles = aggregateCandles(base, parsed.data.interval);
    const items = candles.map(toCandleApiItem);
    const first = items[0];
    const last = items[items.length - 1];
    const ledger = opts.candleCoverageRepo?.summarizeSegments({
      ticker,
      interval: baseInterval,
      from: window.from,
      to: window.to,
    });

    return reply.send({
      success: true,
      data: {
        ticker,
        interval: parsed.data.interval,
        items,
        coverage: buildCoverage(candles, first, last, ledger),
        status: buildStatus(items, candles),
      },
    });
  });

  // POST /stocks
  app.post<{ Body: AddOneBody }>('/stocks', async (request, reply) => {
    const parsed = addOneBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues });
    }

    const { ticker, name, market, sectorName } = parsed.data;
    const addInput =
      sectorName !== undefined
        ? { ticker, name, market, sectorName }
        : { ticker, name, market };
    const result = await service.addOne(addInput);
    log.debug({ ticker: result.stock.ticker }, 'POST /stocks');
    return reply.status(201).send({ success: true, data: result });
  });

  // GET /stocks
  app.get('/stocks', async (_request, reply) => {
    const stocks = service.list();
    return reply.send({ success: true, data: stocks });
  });

  // DELETE /stocks/:ticker
  app.delete<{ Params: { ticker: string } }>('/stocks/:ticker', async (request, reply) => {
    const { ticker } = request.params;
    service.remove(ticker);
    log.debug({ ticker }, 'DELETE /stocks/:ticker');
    return reply.status(204).send();
  });

  // POST /stocks/bulk
  app.post<{ Body: BulkBody }>('/stocks/bulk', async (request, reply) => {
    const parsed = bulkBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues });
    }

    const { valid, errors: parseErrors } = parseStockCsv(parsed.data.csv);
    const result = await service.addBulk(valid, parseErrors);

    log.debug(
      { succeeded: result.succeeded, failed: result.failed },
      'POST /stocks/bulk',
    );

    return reply.status(207).send({
      success: result.failed === 0,
      data: {
        succeeded: result.succeeded,
        failed: result.failed,
        errors: result.errors,
      },
    });
  });
}

function resolveCandleWindow(
  range: '1d' | '1w' | '1m' | '3m' | '6m' | '1y',
  from: string | undefined,
  to: string | undefined,
): { from: string; to: string } | null {
  const toDate = to !== undefined ? new Date(to) : new Date();
  if (Number.isNaN(toDate.getTime())) return null;

  if (from !== undefined) {
    const fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) return null;
    return { from: fromDate.toISOString(), to: toDate.toISOString() };
  }

  const durationMs = rangeDurationMs(range);
  return {
    from: new Date(toDate.getTime() - durationMs).toISOString(),
    to: toDate.toISOString(),
  };
}

function rangeDurationMs(range: '1d' | '1w' | '1m' | '3m' | '6m' | '1y'): number {
  switch (range) {
    case '1d':
      return 24 * 60 * 60 * 1000;
    case '1w':
      return 7 * 24 * 60 * 60 * 1000;
    case '1m':
      return 31 * 24 * 60 * 60 * 1000;
    case '3m':
      return 93 * 24 * 60 * 60 * 1000;
    case '6m':
      return 186 * 24 * 60 * 60 * 1000;
    case '1y':
      return 366 * 24 * 60 * 60 * 1000;
  }
}

function dailyBaseInterval(interval: CandleInterval): boolean {
  return interval === '1D' || interval === '1W' || interval === '1M';
}

function dailyBackfillRangeForCandleRange(
  range: '1d' | '1w' | '1m' | '3m' | '6m' | '1y',
): DailyBackfillRange {
  switch (range) {
    case '3m':
    case '6m':
    case '1y':
      return range;
    case '1d':
    case '1w':
    case '1m':
      return '1m';
  }
}

function hasBackfilledIntradayInWindow(
  repo: PriceCandleRepository,
  coverageRepo: CandleCoverageRepository | undefined,
  ticker: string,
  window: { from: string; to: string },
): boolean {
  if (
    coverageRepo?.hasCompleteCoverage({
      ticker,
      interval: '1m',
      source: 'kis-time-daily',
      from: window.from,
      to: window.to,
    }) === true
  ) {
    return true;
  }
  return repo
    .listCandles({
      ticker,
      interval: '1m',
      from: window.from,
      to: window.to,
      limit: 200,
    })
    .some((candle) => candle.source === 'kis-time-daily');
}

function isDisplayableIntradayCandle(candle: PriceCandle): boolean {
  if (candle.source === null || candle.source === 'rest') return false;
  if (isSuspiciousRealtimeMinuteCandle(candle)) return false;
  if (
    (candle.source === 'kis-time-today' || candle.source === 'kis-time-daily') &&
    candle.sampleCount <= 1 &&
    candle.open === candle.high &&
    candle.high === candle.low &&
    candle.low === candle.close
  ) {
    return false;
  }
  return true;
}

function isSuspiciousRealtimeMinuteCandle(candle: PriceCandle): boolean {
  if (
    candle.source !== 'ws-krx' &&
    candle.source !== 'ws-integrated' &&
    candle.source !== 'ws-nxt'
  ) {
    return false;
  }
  if (candle.interval !== '1m') return false;
  if (candle.volume <= 0 || candle.close <= 0) return false;
  return candle.volume * candle.close > MAX_DISPLAY_MINUTE_TRADE_VALUE_KRW;
}

function buildCoverage(
  candles: readonly PriceCandle[],
  first: CandleApiItem | undefined,
  last: CandleApiItem | undefined,
  ledger: CandleCoverageLedgerSummary | undefined,
): CandleApiCoverage {
  const sourceMix = Array.from(
    new Set(
      candles
        .map((c) => c.source)
        .filter((source): source is PriceCandleSource => source !== null),
    ),
  ).sort();
  const backfilled =
    sourceMix.includes('kis-daily') ||
    sourceMix.includes('kis-time-today') ||
    sourceMix.includes('kis-time-daily');
  const coverage: CandleApiCoverage = {
    from: first?.bucketAt ?? null,
    to: last?.bucketAt ?? null,
    localOnly: !backfilled,
    backfilled,
    sourceMix,
    partialCount: candles.filter((c) => c.isPartial).length,
    gapCount: countVisibleGaps(candles),
    oldestBucketAt: first?.bucketAt ?? null,
    newestBucketAt: last?.bucketAt ?? null,
  };
  if (ledger !== undefined) {
    coverage.ledger = ledger;
  }
  return coverage;
}

function countVisibleGaps(candles: readonly PriceCandle[]): number {
  if (candles.length < 2) return 0;
  const expectedMs = intervalMs(candles[0]?.interval);
  if (expectedMs === null) return 0;
  let gaps = 0;
  for (let index = 1; index < candles.length; index += 1) {
    const prev = new Date(candles[index - 1]?.bucketAt ?? '').getTime();
    const current = new Date(candles[index]?.bucketAt ?? '').getTime();
    if (!Number.isFinite(prev) || !Number.isFinite(current)) continue;
    const missing = Math.floor((current - prev) / expectedMs) - 1;
    if (missing > 0) gaps += missing;
  }
  return gaps;
}

function intervalMs(interval: PriceCandle['interval'] | undefined): number | null {
  switch (interval) {
    case '1m':
      return 60_000;
    case '3m':
      return 3 * 60_000;
    case '5m':
      return 5 * 60_000;
    case '10m':
      return 10 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '30m':
      return 30 * 60_000;
    case '1h':
      return 60 * 60_000;
    case '2h':
      return 2 * 60 * 60_000;
    case '4h':
      return 4 * 60 * 60_000;
    case '6h':
      return 6 * 60 * 60_000;
    case '12h':
      return 12 * 60 * 60_000;
    case '1d':
    case '1D':
      return 24 * 60 * 60_000;
    case '1W':
      return 7 * 24 * 60 * 60_000;
    case '1M':
    default:
      return null;
  }
}

function buildStatus(
  items: readonly CandleApiItem[],
  candles: readonly PriceCandle[],
): CandleApiStatus {
  if (items.length === 0) {
    return {
      state: 'collecting',
      message: 'Araon이 실행 중인 동안의 candle부터 저장됩니다.',
    };
  }
  const partialCount = candles.filter((c) => c.isPartial).length;
  if (partialCount > 0) {
    return {
      state: 'partial',
      message: '일부 candle은 아직 수집 중입니다.',
    };
  }
  return {
    state: 'ready',
    message: '저장된 candle을 표시하고 있습니다.',
  };
}

function toCandleApiItem(candle: {
  bucketAt: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sampleCount: number;
  isPartial: boolean;
  interval: CandleInterval | string;
  source?: PriceCandleSource | null;
}): CandleApiItem {
  return {
    time: Math.floor(new Date(candle.bucketAt).getTime() / 1000),
    bucketAt: candle.bucketAt,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    sampleCount: candle.sampleCount,
    source: candle.source ?? null,
    isPartial: candle.isPartial,
  };
}

function buildSignalOutcomes(
  signal: StockSignalEvent,
  candleRepo: PriceCandleRepository | undefined,
): StockSignalOutcome[] {
  return [
    buildSignalOutcome(signal, candleRepo, '5m', 5),
    buildSignalOutcome(signal, candleRepo, '15m', 15),
    buildSignalOutcome(signal, candleRepo, '30m', 30),
  ];
}

function buildSignalOutcome(
  signal: StockSignalEvent,
  candleRepo: PriceCandleRepository | undefined,
  horizon: StockSignalOutcome['horizon'],
  minutes: number,
): StockSignalOutcome {
  if (candleRepo === undefined || signal.signalPrice <= 0) {
    return {
      horizon,
      state: 'pending',
      price: null,
      changePct: null,
      observedAt: null,
    };
  }
  const target = new Date(new Date(signal.signalAt).getTime() + minutes * 60_000);
  const candle = candleRepo.findFirstCandleAtOrAfter({
    ticker: signal.ticker,
    interval: '1m',
    at: target.toISOString(),
  });
  if (candle === null) {
    return {
      horizon,
      state: 'pending',
      price: null,
      changePct: null,
      observedAt: null,
    };
  }
  return {
    horizon,
    state: 'ready',
    price: candle.close,
    changePct: (candle.close / signal.signalPrice - 1) * 100,
    observedAt: candle.bucketAt,
  };
}
