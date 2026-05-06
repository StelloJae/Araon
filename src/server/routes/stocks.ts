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
  PriceCandleRepository,
  StockNoteRepository,
  StockSignalEventRepository,
} from '../db/repositories.js';
import { parseStockCsv } from '../parsers/csv-parser.js';
import { createChildLogger } from '@shared/logger.js';
import { aggregateCandles } from '../price/candle-aggregation.js';
import { isBackfillAllowed } from '../chart/backfill-policy.js';
import type {
  CandleApiCoverage,
  CandleApiItem,
  CandleApiStatus,
  CandleInterval,
  PriceCandle,
  PriceCandleSource,
  StockNote,
  StockSignalEvent,
  StockSignalOutcome,
  StockTimelineItem,
} from '@shared/types.js';
import type {
  DailyBackfillRange,
  DailyBackfillService,
} from '../chart/daily-backfill-service.js';

const log = createChildLogger('routes/stocks');

// === Plugin options ===========================================================

export interface StockRoutesOptions extends FastifyPluginOptions {
  service: StockService;
  candleRepo?: PriceCandleRepository;
  noteRepo?: StockNoteRepository;
  signalEventRepo?: StockSignalEventRepository;
  dailyBackfillService?: DailyBackfillService;
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

const stockNoteBodySchema = z.object({
  body: z.string().trim().min(1).max(2_000),
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
type StockNoteBody = z.infer<typeof stockNoteBodySchema>;
type SignalEventBody = z.infer<typeof signalEventBodySchema>;

// === Plugin ===================================================================

export async function stockRoutes(
  app: FastifyInstance,
  opts: StockRoutesOptions,
): Promise<void> {
  const { service } = opts;

  app.get<{ Params: { ticker: string } }>('/stocks/:ticker/notes', async (request, reply) => {
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

    return reply.send({ success: true, data: opts.noteRepo.listByTicker(ticker) });
  });

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
      .listByTicker(ticker)
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
    const base = opts.candleRepo.listCandles({
      ticker,
      interval: baseInterval,
      from: window.from,
      to: window.to,
      limit: parsed.data.limit,
    });
    const candles = aggregateCandles(base, parsed.data.interval);
    const items = candles.map(toCandleApiItem);
    const first = items[0];
    const last = items[items.length - 1];

    return reply.send({
      success: true,
      data: {
        ticker,
        interval: parsed.data.interval,
        items,
        coverage: buildCoverage(candles, first, last),
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

function buildCoverage(
  candles: readonly PriceCandle[],
  first: CandleApiItem | undefined,
  last: CandleApiItem | undefined,
): CandleApiCoverage {
  const sourceMix = Array.from(
    new Set(
      candles
        .map((c) => c.source)
        .filter((source): source is PriceCandleSource => source !== null),
    ),
  ).sort();
  const backfilled = sourceMix.includes('kis-daily');
  return {
    from: first?.bucketAt ?? null,
    to: last?.bucketAt ?? null,
    localOnly: !backfilled,
    backfilled,
    sourceMix,
    partialCount: candles.filter((c) => c.isPartial).length,
    gapCount: 0,
    oldestBucketAt: first?.bucketAt ?? null,
    newestBucketAt: last?.bucketAt ?? null,
  };
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
