export type KisRestFailureKind =
  | 'KIS_RATE_LIMIT_SECOND_WINDOW'
  | 'auth_failure'
  | 'upstream_5xx'
  | 'network_timeout'
  | 'malformed_response'
  | 'unknown';

export interface KisRestFailureClassification {
  kind: KisRestFailureKind;
  throttle: boolean;
  retryable: boolean;
  code: string | null;
  safeMessage: string;
}

interface KisRestErrorLike {
  status?: number;
  msgCd?: string | null;
  rtCd?: string | null;
  payload?: unknown;
  message?: string;
  name?: string;
}

const SECOND_WINDOW_THROTTLE_MESSAGE = /초당\s*거래건수를\s*초과|EGW00201|rate.?limit|throttle/i;

export function classifyKisRestFailure(error: unknown): KisRestFailureClassification {
  const err = toErrorLike(error);
  const status = typeof err.status === 'number' && Number.isFinite(err.status)
    ? err.status
    : null;
  const code = firstString(err.msgCd, payloadString(err.payload, 'msg_cd'));
  const message = [
    err.message,
    payloadString(err.payload, 'msg1'),
    payloadString(err.payload, 'message'),
  ].filter(Boolean).join(' ');

  if (code === 'EGW00201' || SECOND_WINDOW_THROTTLE_MESSAGE.test(message)) {
    return {
      kind: 'KIS_RATE_LIMIT_SECOND_WINDOW',
      throttle: true,
      retryable: true,
      code: code ?? 'EGW00201',
      safeMessage: 'KIS 초당 거래건수 제한에 걸렸습니다.',
    };
  }

  if (status === 401 || status === 403) {
    return {
      kind: 'auth_failure',
      throttle: false,
      retryable: false,
      code,
      safeMessage: 'KIS 인증이 거부되었습니다.',
    };
  }

  if (status === 408 || /timeout|timed.?out|AbortError/i.test(`${err.name ?? ''} ${message}`)) {
    return {
      kind: 'network_timeout',
      throttle: false,
      retryable: true,
      code,
      safeMessage: 'KIS 요청이 시간 초과되었습니다.',
    };
  }

  if (error instanceof SyntaxError || /malformed|invalid json|unexpected token/i.test(message)) {
    return {
      kind: 'malformed_response',
      throttle: false,
      retryable: false,
      code,
      safeMessage: 'KIS 응답 형식을 해석하지 못했습니다.',
    };
  }

  if (status !== null && status >= 500) {
    return {
      kind: 'upstream_5xx',
      throttle: false,
      retryable: true,
      code,
      safeMessage: 'KIS upstream 오류가 발생했습니다.',
    };
  }

  return {
    kind: 'unknown',
    throttle: false,
    retryable: error instanceof Error,
    code,
    safeMessage: 'KIS 요청 처리 중 오류가 발생했습니다.',
  };
}

export function isKisSecondWindowThrottle(
  classification: KisRestFailureClassification,
): boolean {
  return classification.kind === 'KIS_RATE_LIMIT_SECOND_WINDOW';
}

function toErrorLike(error: unknown): KisRestErrorLike {
  if (typeof error === 'object' && error !== null) {
    return error as KisRestErrorLike;
  }
  return { message: String(error) };
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function payloadString(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
