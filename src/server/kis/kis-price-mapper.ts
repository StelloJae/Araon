/**
 * KIS 주식현재가 시세 응답 → `Price` 매퍼.
 *
 * Endpoint: `GET /uapi/domestic-stock/v1/quotations/inquire-price`
 * TR ID: `FHKST03010100` (live) 또는 `VHKST03010100` (paper).
 *
 * KIS 응답은 `{ rt_cd, msg_cd, msg1, output: { stck_prpr, prdy_ctrt, acml_vol, ... } }`
 * 형태. 호출부가 이미 `resp.output`을 추출해서 넘겨주는 것을 기본으로 하되,
 * 호환성을 위해 top-level 필드도 허용한다 (일부 KIS 응답은 output을 평탄화하기도 함).
 *
 * 숫자 필드는 KIS에서 문자열로 오는 것이 일반적 (`"75000"`). Zod로 string|number
 * 양쪽 허용 후 `Number()`로 강제 변환. 누락은 로그 + 0 기본값.
 */

import { z } from 'zod';
import type { Price } from '@shared/types.js';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('kis-price-mapper');

/**
 * KIS 주식현재가 시세 응답의 `output` 스키마.
 * 숫자 필드는 KIS가 문자열로 보내는 경우가 많아 `union(string, number)`로 받는다.
 */
const numericString = z.union([z.string(), z.number()]).optional();

export const kisInquirePriceOutputSchema = z.object({
  /** 주식현재가 */
  stck_prpr: numericString,
  /** 전일 대비 (원, signed string from KIS — e.g. "-5000") */
  prdy_vrss: numericString,
  /** 전일 대비율 (%) */
  prdy_ctrt: numericString,
  /** 누적 거래량 */
  acml_vol: numericString,
  /** 누적 거래 대금 */
  acml_tr_pbmn: numericString,
  /** 주식 시가 / 고가 / 저가 */
  stck_oprc: numericString,
  stck_hgpr: numericString,
  stck_lwpr: numericString,
  /** HTS 시가총액 — KIS reports this in 억원. */
  hts_avls: numericString,
  /** Fundamental quote fields included in KIS 현재가 시세 responses. */
  per: numericString,
  pbr: numericString,
  /** HTS 외국인 소진율 (%) */
  hts_frgn_ehrt: numericString,
  /** 52주 최고 / 최저 */
  w52_hgpr: numericString,
  w52_lwpr: numericString,
  /** Optional dividend-yield aliases. Often absent on 현재가 시세. */
  dvd_yld: numericString,
}).passthrough();  // 다른 KIS 필드는 무시

export type KisInquirePriceOutput = z.infer<typeof kisInquirePriceOutputSchema>;

/**
 * KIS 응답 payload에서 `Price`를 생성.
 *
 * - `raw`가 객체가 아니면 throw.
 * - `raw.output`이 있으면 그 안을, 없으면 raw 자체를 `output`으로 간주.
 * - 필수 필드(`stck_prpr`) 누락은 로그 warn 후 0 반환 — 상위 계층에서 이상치로 취급 가능.
 * - `updatedAt`은 현재 시각 ISO (KIS는 이 endpoint에서 tick timestamp를 주지 않음).
 */
export function mapKisInquirePriceToPrice(ticker: string, raw: unknown): Price {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`mapKisInquirePriceToPrice: expected object, got ${typeof raw}`);
  }

  const r = raw as Record<string, unknown>;
  const outputCandidate = typeof r['output'] === 'object' && r['output'] !== null
    ? r['output']
    : r;

  const parsed = kisInquirePriceOutputSchema.safeParse(outputCandidate);
  if (!parsed.success) {
    log.warn(
      { ticker, issues: parsed.error.issues },
      'mapKisInquirePriceToPrice: schema validation failed, using best-effort fallback',
    );
  }
  const out = parsed.success ? parsed.data : (outputCandidate as Record<string, unknown>);

  const priceRaw = out['stck_prpr' as keyof typeof out];
  if (priceRaw === undefined || priceRaw === null) {
    log.warn({ ticker }, 'mapKisInquirePriceToPrice: stck_prpr missing');
  }

  return {
    ticker,
    price: toFiniteNumber(priceRaw, 0),
    changeRate: toFiniteNumber(out['prdy_ctrt' as keyof typeof out], 0),
    changeAbs: toOptionalSignedNumber(out['prdy_vrss' as keyof typeof out]),
    volume: toFiniteNumber(out['acml_vol' as keyof typeof out], 0),
    accumulatedTradeValue: toOptionalNumber(out['acml_tr_pbmn' as keyof typeof out]),
    openPrice: toOptionalNumber(out['stck_oprc' as keyof typeof out]),
    highPrice: toOptionalNumber(out['stck_hgpr' as keyof typeof out]),
    lowPrice: toOptionalNumber(out['stck_lwpr' as keyof typeof out]),
    marketCapKrw: toMarketCapKrw(out['hts_avls' as keyof typeof out]),
    per: toOptionalNumber(out['per' as keyof typeof out]),
    pbr: toOptionalNumber(out['pbr' as keyof typeof out]),
    foreignOwnershipRate: toOptionalNumber(out['hts_frgn_ehrt' as keyof typeof out]),
    week52High: toOptionalNumber(out['w52_hgpr' as keyof typeof out]),
    week52Low: toOptionalNumber(out['w52_lwpr' as keyof typeof out]),
    dividendYield: toOptionalNumber(out['dvd_yld' as keyof typeof out]),
    updatedAt: new Date().toISOString(),
    isSnapshot: false,
  };
}

function toFiniteNumber(v: unknown, fallback: number): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse KIS `prdy_vrss` style fields where the value is either signed
 * ("-5000") or already numeric. Missing / empty / non-finite returns null
 * so the caller can render '-' rather than a misleading 0.
 */
function toOptionalSignedNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toOptionalNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toMarketCapKrw(v: unknown): number | null {
  const eok = toOptionalNumber(v);
  return eok === null ? null : eok * 100_000_000;
}
