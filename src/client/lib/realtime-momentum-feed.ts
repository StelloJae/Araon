import type { MarketStatus, Price } from '@shared/types';
import {
  buildMomentumReadings,
  evaluateExitWarnings,
  evaluateMomentumSignal,
  MOMENTUM_BUCKET_MS,
  type ActiveMomentumSignal,
  type MomentumBucket,
  type MomentumSignal,
  type MomentumSignalDecision,
  type MomentumSession,
  type MomentumWindow,
} from './realtime-momentum';
import { isMarketLive } from './market-status';

export interface MomentumFeedState {
  previousMomentumByTicker: Record<
    string,
    Partial<Record<MomentumWindow, number>>
  >;
  lastSignalAtByTicker: Record<string, number>;
  activeSignalByTicker: Record<string, ActiveMomentumSignal>;
}

export interface RealtimeMomentumEvaluation {
  decision: MomentumSignalDecision;
  activeUpdate: {
    ticker: string;
    price: number;
    exitWarning?: MomentumSignalEntryPatch['exitWarning'];
    currentAt: number;
  } | null;
}

export interface MomentumSignalEntryPatch {
  exitWarning?: ReturnType<typeof evaluateExitWarnings>[number] | null;
}

export function createMomentumFeedState(): MomentumFeedState {
  return {
    previousMomentumByTicker: {},
    lastSignalAtByTicker: {},
    activeSignalByTicker: {},
  };
}

export function shouldProcessRealtimeMomentumPrice(
  price: Price,
  marketStatus: MarketStatus,
): boolean {
  return (
    price.source === 'ws-integrated' &&
    price.isSnapshot === false &&
    isMarketLive(marketStatus) &&
    typeof price.ticker === 'string' &&
    price.ticker.length > 0 &&
    Number.isFinite(price.price) &&
    price.price > 0
  );
}

export function momentumSessionFromMarketStatus(
  marketStatus: MarketStatus,
): MomentumSession {
  return marketStatus === 'open' ? 'regular' : 'unknown';
}

export function momentumBucketFromPrice(
  price: Price,
  marketStatus: MarketStatus,
  now: number,
): MomentumBucket {
  return {
    ticker: price.ticker,
    session: momentumSessionFromMarketStatus(marketStatus),
    bucketStart: Math.floor(now / MOMENTUM_BUCKET_MS) * MOMENTUM_BUCKET_MS,
    ts: now,
    price: price.price,
    volume: price.volume,
  };
}

export function evaluateRealtimeMomentumPrice(input: {
  price: Price;
  marketStatus: MarketStatus;
  name: string;
  buckets: ReadonlyArray<MomentumBucket>;
  now: number;
  state: MomentumFeedState;
}): RealtimeMomentumEvaluation {
  const current = momentumBucketFromPrice(
    input.price,
    input.marketStatus,
    input.now,
  );
  const readings = buildMomentumReadings(input.buckets, current);
  const previous =
    input.state.previousMomentumByTicker[input.price.ticker] ?? {};

  const decision = evaluateMomentumSignal({
    ticker: input.price.ticker,
    name: input.name,
    currentPrice: input.price.price,
    currentAt: input.now,
    dailyChangePct: input.price.changeRate,
    volume: input.price.volume,
    volumeSurgeRatio: input.price.volumeSurgeRatio ?? null,
    readings,
    previousMomentumByWindow: previous,
    lastSignalAt: input.state.lastSignalAtByTicker[input.price.ticker] ?? null,
    activeSignal:
      input.state.activeSignalByTicker[input.price.ticker] ?? null,
  });

  input.state.previousMomentumByTicker[input.price.ticker] = {
    ...previous,
    ...Object.fromEntries(
      readings.map((reading) => [reading.window, reading.momentumPct]),
    ),
  };

  if (decision.signal !== null) {
    rememberSignal(input.state, decision.signal);
    return { decision, activeUpdate: null };
  }

  const active = input.state.activeSignalByTicker[input.price.ticker];
  if (active === undefined) {
    return { decision, activeUpdate: null };
  }

  active.highSinceSignal = Math.max(active.highSinceSignal, input.price.price);
  const warnings = evaluateExitWarnings({
    signalPrice: active.signalPrice,
    highSinceSignal: active.highSinceSignal,
    currentPrice: input.price.price,
    signalAt: active.signalAt,
    now: input.now,
  });

  return {
    decision,
    activeUpdate: {
      ticker: input.price.ticker,
      price: input.price.price,
      currentAt: input.now,
      exitWarning: warnings[0] ?? null,
    },
  };
}

function rememberSignal(
  state: MomentumFeedState,
  signal: MomentumSignal,
): void {
  state.lastSignalAtByTicker[signal.ticker] = signal.currentAt;
  state.activeSignalByTicker[signal.ticker] = {
    ticker: signal.ticker,
    signalType: signal.signalType,
    momentumWindow: signal.momentumWindow,
    signalPrice: signal.price,
    highSinceSignal: signal.price,
    signalAt: signal.currentAt,
  };
}
