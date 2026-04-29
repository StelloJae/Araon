/**
 * KIS WebSocket 실시간 체결가 frame parser.
 *
 * Supported TR_IDs (모두 동일한 46-field caret-delimited layout — 22번 필드 이름만
 * `CCLD_DVSN` (KRX) vs `CNTG_CLS_CODE` (통합/NXT)로 다른데, 우리는 인덱스로만
 * 접근하므로 단일 코드 경로로 처리):
 *   - `H0STCNT0` — KRX 실시간 체결가      → source: 'krx'
 *   - `H0UNCNT0` — 통합/SOR 실시간 체결가  → source: 'integrated'
 *   - `H0NXCNT0` — NXT 실시간 체결가      → source: 'nxt'
 *
 * Frame format (raw 단일 프레임):
 *   비암호화 tick:  `0|<TR_ID>|<dataCount>|<46n caret-fields>`
 *   암호화 tick:   `1|<TR_ID>|<dataCount>|<base64-encrypted-body>`  (NXT1 미지원)
 *   제어 frame:    `{"header":{"tr_id":"PINGPONG", ...}}` 또는 subscribe-ack JSON
 *
 * NXT1 단계 정책: priceStore/SSE 반영 없음. 이 모듈은 frame → 구조화된 결과
 * 분류만 담당하며, 실 반영은 후속 NXT4 단계에서 bridge wrapper가 결정한다.
 *
 * TODO(NXT3): H0NXCNT0 라이브 fixture 추가 + 합성 fixture 라이브 redacted 파일로 교체.
 * TODO(NXT3+): 암호화 frame(flag=1) AES-256 복호화 지원 (현재는 ignore).
 */

import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('kis-tick-parser');

// === Public types ============================================================

export type SupportedTickTrId = 'H0STCNT0' | 'H0UNCNT0' | 'H0NXCNT0';
export type TickSource = 'krx' | 'integrated' | 'nxt';
export type TickIgnoreReason =
  | 'encrypted_frame'
  | 'unsupported_tr_id'
  | 'empty_data'
  | 'control_frame';
export type TickErrorCode =
  | 'malformed_frame'
  | 'invalid_data_count'
  | 'invalid_field_count';

export interface KisRealtimeTick {
  readonly trId: SupportedTickTrId;
  readonly source: TickSource;
  readonly ticker: string;
  readonly price: number;
  readonly changeAbs: number;
  readonly changeRate: number;
  readonly volume: number;
  /** 체결시간 HHMMSS (KIS 원본 그대로). */
  readonly tradeTime: string;
  /** parser 생성 시각 ISO-8601. KIS는 tradeTime이 일자 정보를 포함하지 않음. */
  readonly updatedAt: string;
  readonly isSnapshot: false;
}

export type KisTickParseResult =
  | { readonly kind: 'ticks'; readonly ticks: KisRealtimeTick[] }
  | { readonly kind: 'pingpong'; readonly raw: string }
  | { readonly kind: 'ignore'; readonly reason: TickIgnoreReason }
  | { readonly kind: 'error'; readonly code: TickErrorCode; readonly message: string };

// === Constants ===============================================================

const SOURCE_BY_TR_ID: Record<SupportedTickTrId, TickSource> = {
  H0STCNT0: 'krx',
  H0UNCNT0: 'integrated',
  H0NXCNT0: 'nxt',
};

const FIELD_COUNT_PER_BLOCK = 46;

// 0-based field indices we extract from each 46-field block.
//   0  MKSC_SHRN_ISCD       종목코드
//   1  STCK_CNTG_HOUR       체결시간 HHMMSS
//   2  STCK_PRPR            현재가
//   3  PRDY_VRSS_SIGN       전일대비 부호 (1 상한 / 2 상승 / 3 보합 / 4 하한 / 5 하락)
//   4  PRDY_VRSS            전일대비 (절댓값 magnitude)
//   5  PRDY_CTRT            전일대비율 (KIS는 보통 signed string으로 줌)
//  13  ACML_VOL             누적 거래량
const IDX_TICKER = 0;
const IDX_TRADE_TIME = 1;
const IDX_PRICE = 2;
const IDX_VRSS_SIGN = 3;
const IDX_VRSS = 4;
const IDX_CTRT = 5;
const IDX_VOLUME = 13;

// === Public API ==============================================================

export function parseKisTickFrame(raw: string): KisTickParseResult {
  if (raw === '') {
    return { kind: 'error', code: 'malformed_frame', message: 'empty input' };
  }

  // KIS 제어 프레임은 항상 JSON 객체. tick frame은 `0|` 또는 `1|`로 시작하므로
  // leading `{` / `[` 만 JSON 경로로 분기 — 이래야 `'0'`/`'1'` 같은 primitive
  // JSON과 충돌하지 않음.
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseJsonControlFrame(raw, trimmed);
  }

  return parsePipeDelimitedFrame(raw);
}

// === JSON 제어 프레임 ========================================================

function parseJsonControlFrame(raw: string, trimmed: string): KisTickParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: unknown) {
    return {
      kind: 'error',
      code: 'malformed_frame',
      message: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (typeof parsed === 'object' && parsed !== null && 'header' in parsed) {
    const header = (parsed as Record<string, unknown>)['header'];
    if (typeof header === 'object' && header !== null) {
      const trId = (header as Record<string, unknown>)['tr_id'];
      if (trId === 'PINGPONG') {
        return { kind: 'pingpong', raw };
      }
    }
  }
  // subscribe ack, error response 등 — 진단 로그만 남기고 무시.
  return { kind: 'ignore', reason: 'control_frame' };
}

// === Pipe-delimited tick 프레임 =============================================

function parsePipeDelimitedFrame(raw: string): KisTickParseResult {
  const parts = raw.split('|');
  if (parts.length < 4) {
    return {
      kind: 'error',
      code: 'malformed_frame',
      message: `pipe-delimited frame must have at least 4 segments, got ${parts.length}`,
    };
  }

  const encryptFlag = parts[0]!;
  const trId = parts[1]!;
  const dataCountStr = parts[2]!;
  const body = parts[3]!;

  if (encryptFlag === '1') {
    return { kind: 'ignore', reason: 'encrypted_frame' };
  }
  if (encryptFlag !== '0') {
    return {
      kind: 'error',
      code: 'malformed_frame',
      message: `unknown encrypt flag '${encryptFlag}' (expected '0' or '1')`,
    };
  }

  if (!isSupportedTrId(trId)) {
    return { kind: 'ignore', reason: 'unsupported_tr_id' };
  }

  const dataCount = Number(dataCountStr);
  if (!Number.isInteger(dataCount) || dataCount < 0) {
    return {
      kind: 'error',
      code: 'invalid_data_count',
      message: `dataCount must be a non-negative integer, got '${dataCountStr}'`,
    };
  }
  if (dataCount === 0) {
    return { kind: 'ignore', reason: 'empty_data' };
  }

  const fields = body.length === 0 ? [] : body.split('^');
  const expectedFieldCount = dataCount * FIELD_COUNT_PER_BLOCK;
  if (fields.length !== expectedFieldCount) {
    return {
      kind: 'error',
      code: 'invalid_field_count',
      message: `expected ${expectedFieldCount} fields for dataCount=${dataCount}, got ${fields.length}`,
    };
  }

  const updatedAt = new Date().toISOString();
  const ticks: KisRealtimeTick[] = [];
  for (let i = 0; i < dataCount; i += 1) {
    const offset = i * FIELD_COUNT_PER_BLOCK;
    const block = fields.slice(offset, offset + FIELD_COUNT_PER_BLOCK);
    ticks.push(extractTick(trId, block, updatedAt));
  }
  return { kind: 'ticks', ticks };
}

function isSupportedTrId(value: string): value is SupportedTickTrId {
  return value === 'H0STCNT0' || value === 'H0UNCNT0' || value === 'H0NXCNT0';
}

function extractTick(
  trId: SupportedTickTrId,
  block: readonly string[],
  updatedAt: string,
): KisRealtimeTick {
  const ticker = block[IDX_TICKER] ?? '';
  const tradeTime = block[IDX_TRADE_TIME] ?? '';
  const price = toFiniteNumber(block[IDX_PRICE], 0);
  const sign = block[IDX_VRSS_SIGN] ?? '';
  const vrssMagnitude = Math.abs(toFiniteNumber(block[IDX_VRSS], 0));
  const changeAbs = applySign(vrssMagnitude, sign);
  const changeRate = toFiniteNumber(block[IDX_CTRT], 0);
  const volume = toFiniteNumber(block[IDX_VOLUME], 0);

  if (ticker === '') {
    log.warn({ trId }, 'tick parsed without ticker code — fixture/data drift suspected');
  }

  return {
    trId,
    source: SOURCE_BY_TR_ID[trId],
    ticker,
    price,
    changeAbs,
    changeRate,
    volume,
    tradeTime,
    updatedAt,
    isSnapshot: false,
  };
}

/**
 * KIS PRDY_VRSS_SIGN convention:
 *   '1' 상한, '2' 상승  → positive
 *   '3' 보합            → zero
 *   '4' 하한, '5' 하락  → negative
 *
 * PRDY_VRSS 자체가 양수 magnitude라는 가정을 사용. 이미 부호가 들어있는
 * 응답이 와도 `Math.abs`로 magnitude를 구한 뒤 sign 필드 기준으로 다시 부호화
 * 하므로 멱등.
 */
function applySign(magnitude: number, sign: string): number {
  if (sign === '1' || sign === '2') return magnitude;
  if (sign === '4' || sign === '5') return -magnitude;
  return 0;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
