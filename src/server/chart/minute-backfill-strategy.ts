export type MinuteBackfillStrategyState = 'ready' | 'blocked' | 'hold';

export type MinuteBackfillBlockedReason =
  | 'INVALID_TICKER'
  | 'MARKET_HOURS'
  | 'SELECTED_TICKER_ONLY'
  | 'TODAY_MINUTE_ONLY';

export interface MinuteBackfillStrategyInput {
  tickers: readonly string[];
  now: Date;
}

export interface MinuteBackfillStrategy {
  state: MinuteBackfillStrategyState;
  tickers: string[];
  interval: '1m';
  source: 'kis-time-today';
  rowLimitPerRequest: number;
  maxPages: number;
  maxRows: number;
  backgroundAllowed: false;
  fullWatchlistAllowed: false;
  message: string;
  reason?: MinuteBackfillBlockedReason;
}

const ROW_LIMIT_PER_REQUEST = 30;
const MAX_PAGES = 4;

export function planSelectedTickerMinuteBackfill(
  input: MinuteBackfillStrategyInput,
): MinuteBackfillStrategy {
  const base = {
    tickers: [...input.tickers],
    interval: '1m' as const,
    source: 'kis-time-today' as const,
    rowLimitPerRequest: ROW_LIMIT_PER_REQUEST,
    maxPages: MAX_PAGES,
    maxRows: ROW_LIMIT_PER_REQUEST * MAX_PAGES,
    backgroundAllowed: false as const,
    fullWatchlistAllowed: false as const,
  };

  if (input.tickers.length !== 1) {
    return {
      ...base,
      state: 'blocked',
      reason: 'SELECTED_TICKER_ONLY',
      message: '과거 분봉 보강은 선택한 단일 종목에만 허용됩니다.',
    };
  }
  if (!/^\d{6}$/.test(input.tickers[0] ?? '')) {
    return {
      ...base,
      state: 'blocked',
      reason: 'INVALID_TICKER',
      message: '유효한 6자리 종목코드가 필요합니다.',
    };
  }

  const kst = toKstParts(input.now);
  if (kst.day === 0 || kst.day === 6) {
    return {
      ...base,
      state: 'hold',
      reason: 'TODAY_MINUTE_ONLY',
      message: 'KIS 당일분봉은 오늘 데이터 중심이라 주말 자동 보강은 보류합니다.',
    };
  }
  if (kst.minutes >= 7 * 60 + 55 && kst.minutes < 20 * 60 + 5) {
    return {
      ...base,
      state: 'blocked',
      reason: 'MARKET_HOURS',
      message: '장중에는 과거 분봉 보강을 실행하지 않습니다.',
    };
  }

  return {
    ...base,
    state: 'ready',
    message: '선택 종목의 당일 분봉 일부만 수동 보강할 수 있습니다.',
  };
}

function toKstParts(now: Date): { day: number; minutes: number } {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    day: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}
