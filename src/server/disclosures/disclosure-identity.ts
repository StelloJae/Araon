import type { StockDisclosureItem } from '@shared/types.js';

export function disclosureIdentityKeys(
  item: Pick<StockDisclosureItem, 'ticker' | 'source' | 'kind' | 'url'>,
): string[] {
  const normalizedUrl = normalizeDisclosureUrl(item.url);
  const keys = [`url:${normalizedUrl}`];
  const receiptNo = extractDartReceiptNo(item);
  if (receiptNo !== null) {
    keys.push(`dart-receipt:${item.ticker}:${receiptNo}`);
  }
  return keys;
}

function normalizeDisclosureUrl(value: string): string {
  const raw = value.trim();
  if (raw.length === 0) return raw;
  try {
    const url = new URL(raw);
    const receiptNo = dartReceiptNoFromUrl(url);
    if (receiptNo !== null) {
      return canonicalDartReceiptUrl(receiptNo);
    }
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|wbraid$|gbraid$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function extractDartReceiptNo(
  item: Pick<StockDisclosureItem, 'source' | 'kind' | 'url'>,
): string | null {
  if (item.source !== 'dart' || item.kind !== 'filing') return null;
  try {
    return dartReceiptNoFromUrl(new URL(item.url));
  } catch {
    return null;
  }
}

function dartReceiptNoFromUrl(url: URL): string | null {
  if (url.hostname !== 'dart.fss.or.kr') return null;
  const receiptNo = url.searchParams.get('rcpNo')?.trim();
  return receiptNo && /^\d+$/.test(receiptNo) ? receiptNo : null;
}

function canonicalDartReceiptUrl(receiptNo: string): string {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(receiptNo)}`;
}
