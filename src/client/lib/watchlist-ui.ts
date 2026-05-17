import {
  krTickerFromTossProductCode,
  normalizeTossProductCode,
  type AraonProductMarket,
} from '@shared/product-identity';
import type {
  AraonWatchlistItem,
  AraonWatchlistMutationInput,
} from './api-client';

type WatchlistCatalogMeta = {
  name: string;
  market: Extract<AraonProductMarket, 'KOSPI' | 'KOSDAQ'>;
};

type AraonWatchlistCurrency = NonNullable<AraonWatchlistMutationInput['currency']>;

export function productCodeForWatchlistUiCode(
  code: string,
  existingItem?: AraonWatchlistItem | null,
): string | null {
  return existingItem?.productCode ?? normalizeTossProductCode(code);
}

export function buildWatchlistAddInput(
  code: string,
  meta?: WatchlistCatalogMeta,
  existingItem?: AraonWatchlistItem | null,
): AraonWatchlistMutationInput | null {
  const productCode = productCodeForWatchlistUiCode(code, existingItem);
  if (productCode === null) return null;
  const krTicker = existingItem?.krTicker ?? krTickerFromTossProductCode(productCode);
  const market = existingItem?.market ?? meta?.market ?? inferMarket(productCode, krTicker);
  return {
    productCode,
    krTicker,
    symbol: existingItem?.symbol ?? krTicker ?? code,
    name: existingItem?.name ?? meta?.name ?? krTicker ?? code,
    market,
    currency: existingItem?.currency ?? inferCurrency(market),
  };
}

function inferMarket(
  productCode: string,
  krTicker: string | null,
): AraonProductMarket {
  if (krTicker !== null) return 'UNKNOWN';
  if (productCode.startsWith('US')) return 'US';
  return 'TOSS_ONLY';
}

function inferCurrency(
  market: AraonProductMarket,
): AraonWatchlistCurrency {
  if (market === 'KOSPI' || market === 'KOSDAQ') return 'KRW';
  if (market === 'US') return 'USD';
  return 'UNKNOWN';
}
