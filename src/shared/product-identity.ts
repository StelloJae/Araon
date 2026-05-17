export type AraonProductMarket = 'KOSPI' | 'KOSDAQ' | 'US' | 'TOSS_ONLY' | 'UNKNOWN';
export type AraonCurrency = 'KRW' | 'USD' | 'UNKNOWN';

export interface AraonProductIdentity {
  productCode: string;
  krTicker: string | null;
  symbol: string;
  name: string;
  market: AraonProductMarket;
  currency: AraonCurrency;
  tossEligible: boolean;
  kisEligible: boolean;
  chartEligible: boolean;
  quoteEligible: boolean;
  source: 'toss' | 'local' | 'kis-legacy' | 'unknown';
}

export function normalizeTossProductCode(input: string): string | null {
  const normalized = input.trim().toUpperCase();
  if (normalized.length === 0) return null;
  if (/^\d{6}$/.test(normalized)) return `A${normalized}`;
  if (/^A\d{6}$/.test(normalized)) return normalized;
  if (/^[A-Z0-9]{5,}$/.test(normalized)) return normalized;
  return null;
}

export function krTickerFromTossProductCode(input: string): string | null {
  const productCode = normalizeTossProductCode(input);
  if (productCode === null) return null;
  const match = /^A(\d{6})$/.exec(productCode);
  return match?.[1] ?? null;
}

export function isKisEligibleProductCode(input: string): boolean {
  return krTickerFromTossProductCode(input) !== null;
}

export function createAraonProductIdentity(input: {
  productCode: string;
  symbol?: string | null;
  name: string;
  market?: AraonProductMarket | null;
  currency?: AraonCurrency | null;
  source?: AraonProductIdentity['source'];
}): AraonProductIdentity | null {
  const productCode = normalizeTossProductCode(input.productCode);
  if (productCode === null) return null;
  const krTicker = krTickerFromTossProductCode(productCode);
  const market = input.market ?? inferMarket(productCode, input.currency ?? null);
  const currency = input.currency ?? inferCurrency(market);
  const kisEligible = krTicker !== null && market !== 'US' && market !== 'TOSS_ONLY';
  const symbol = input.symbol?.trim() || krTicker || productCode;

  return {
    productCode,
    krTicker,
    symbol,
    name: input.name,
    market,
    currency,
    tossEligible: true,
    kisEligible,
    chartEligible: kisEligible,
    quoteEligible: true,
    source: input.source ?? 'toss',
  };
}

function inferMarket(productCode: string, currency: AraonCurrency | null): AraonProductMarket {
  if (/^A\d{6}$/.test(productCode)) return 'UNKNOWN';
  if (currency === 'USD' || productCode.startsWith('US')) return 'US';
  return 'TOSS_ONLY';
}

function inferCurrency(market: AraonProductMarket): AraonCurrency {
  if (market === 'KOSPI' || market === 'KOSDAQ') return 'KRW';
  if (market === 'US') return 'USD';
  return 'UNKNOWN';
}
