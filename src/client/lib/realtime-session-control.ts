export const SESSION_REALTIME_CAP_OPTIONS = [1, 3, 5, 10, 20, 40] as const;
export type SessionRealtimeCap = (typeof SESSION_REALTIME_CAP_OPTIONS)[number];

export const REALTIME_CONTROL_BADGE_LABEL = '검증 완료';
export const REALTIME_ADVANCED_RECHECK_LABEL = '운영자 재검증';
export const REALTIME_STATUS_FETCH_ERROR_MESSAGE =
  '실시간 상태를 불러오지 못했습니다. REST 폴링은 계속 유지됩니다.';

export interface SessionEnableRequest {
  readonly cap: SessionRealtimeCap;
  readonly confirm: true;
  readonly maxSessionMs?: number;
}

export type RealtimeSessionEndReason =
  | 'time_limit_reached'
  | 'applied_tick_limit_reached'
  | 'parsed_tick_limit_reached'
  | 'no_live_tick_observed'
  | 'safe_error'
  | 'operator_disabled'
  | null;

export type SessionEnableControlResult<T> =
  | { readonly kind: 'blocked'; readonly reason: 'confirm_required' }
  | { readonly kind: 'blocked'; readonly reason: 'invalid_cap' }
  | { readonly kind: 'sent'; readonly data: T };

export async function requestRealtimeSessionEnable<T>(
  input: {
    readonly cap: number;
    readonly confirmed: boolean;
    readonly maxSessionMs?: number;
    readonly enable: (request: SessionEnableRequest) => Promise<T>;
  },
): Promise<SessionEnableControlResult<T>> {
  if (!isSessionRealtimeCap(input.cap)) {
    return { kind: 'blocked', reason: 'invalid_cap' };
  }
  if (!input.confirmed) {
    return { kind: 'blocked', reason: 'confirm_required' };
  }
  return {
    kind: 'sent',
    data: await input.enable({
      cap: input.cap,
      confirm: true,
      ...(input.maxSessionMs !== undefined
        ? { maxSessionMs: input.maxSessionMs }
        : {}),
    }),
  };
}

export interface RealtimeSessionUiStateInput {
  readonly runtimeStarted: boolean;
  readonly confirmed: boolean;
  readonly busy: boolean;
  readonly sessionRealtimeEnabled: boolean;
}

export interface RealtimeSessionUiState {
  readonly enableDisabled: boolean;
  readonly disableDisabled: boolean;
  readonly capSelectDisabled: boolean;
}

export function getRealtimeSessionUiState(
  input: RealtimeSessionUiStateInput,
): RealtimeSessionUiState {
  return {
    enableDisabled:
      input.busy ||
      !input.runtimeStarted ||
      !input.confirmed ||
      input.sessionRealtimeEnabled,
    disableDisabled:
      input.busy || !input.runtimeStarted || !input.sessionRealtimeEnabled,
    capSelectDisabled: input.busy || input.sessionRealtimeEnabled,
  };
}

export function getRealtimeSessionEndReasonLabel(
  reason: RealtimeSessionEndReason,
): string {
  switch (reason) {
    case 'time_limit_reached':
      return '시간 제한 도달';
    case 'applied_tick_limit_reached':
      return '적용 tick 제한 도달';
    case 'parsed_tick_limit_reached':
      return '수신 tick 제한 도달';
    case 'no_live_tick_observed':
      return 'live tick 미관찰';
    case 'safe_error':
      return '안전 오류';
    case 'operator_disabled':
      return '사용자가 세션 해제';
    case null:
      return '—';
  }
}

export function getRealtimeCapVerificationLabel(
  cap: SessionRealtimeCap,
): '검증됨' | '진행 중' | '부분 검증' | '미검증' {
  return '검증됨';
}

export function getRealtimeCapOptionLabel(cap: SessionRealtimeCap): string {
  return `최대 ${cap}종목 · ${getRealtimeCapVerificationLabel(cap)}`;
}

export function getRealtimeSessionMaxMsForCap(
  cap: SessionRealtimeCap,
): number {
  if (cap === 20) return 90_000;
  if (cap === 40) return 120_000;
  return 60_000;
}

export function getRealtimeCapVerificationDescription(
  cap: SessionRealtimeCap,
): string {
  if (cap === 10) {
    return '10종목은 UI 버튼 경로에서 live burst hard-limit 검증이 완료됐습니다.';
  }
  if (cap === 20) {
    return '20종목은 UI 버튼 경로 controlled live smoke 검증이 완료됐습니다.';
  }
  if (cap === 40) {
    return '40종목은 UI 버튼 경로 controlled live smoke 검증이 완료됐습니다.';
  }
  return `${cap}종목은 UI live hard-limit 검증이 완료됐습니다.`;
}

export function getRealtimeCap20ReadinessLabel(input: {
  readonly status: 'not_ready' | 'verified';
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
} | null | undefined): '검증됨' | '준비 중' {
  if (input?.status === 'verified') return '검증됨';
  return '준비 중';
}

export function getRealtimeCap20PreviewLabel(input: {
  readonly requestedCap: number;
  readonly effectiveCap: number;
  readonly candidateCount: number;
  readonly shortage: number;
} | null | undefined): string {
  if (input === null || input === undefined) return '현재 후보 0개 / 필요 20개';
  const shortage = Math.max(0, input.shortage);
  return `현재 후보 ${input.candidateCount}개 / 필요 ${input.effectiveCap}개 · 부족 ${shortage}개`;
}

export function getRealtimeSessionStateLabel(input: {
  readonly state:
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'degraded'
    | 'disabled'
    | 'manual-disabled'
    | null;
  readonly sessionEnabled: boolean;
  readonly endReason: RealtimeSessionEndReason;
  readonly hasError?: boolean;
}): '꺼짐' | '연결 중' | '수신 중' | '제한 도달' | '오류' {
  if (input.hasError === true || input.state === 'degraded') return '오류';
  if (input.state === 'connecting') return '연결 중';
  if (input.state === 'connected') return '수신 중';
  if (input.sessionEnabled && input.state !== 'disabled' && input.state !== 'manual-disabled') {
    return '연결 중';
  }
  if (
    input.endReason === 'applied_tick_limit_reached' ||
    input.endReason === 'parsed_tick_limit_reached' ||
    input.endReason === 'time_limit_reached'
  ) {
    return '제한 도달';
  }
  if (input.endReason === 'safe_error') return '오류';
  return '꺼짐';
}

export function isSessionRealtimeCap(cap: number): cap is SessionRealtimeCap {
  return SESSION_REALTIME_CAP_OPTIONS.includes(cap as SessionRealtimeCap);
}

export function sanitizeRealtimeOperatorMessage(message: string): string {
  return message
    .replace(/approval[_-]?key[=:]\s*[^\s&"',}]+/gi, 'approval_key=[REDACTED]')
    .replace(/appkey[=:]\s*[^\s&"',}]+/gi, 'appkey=[REDACTED]')
    .replace(/appsecret[=:]\s*[^\s&"',}]+/gi, 'appsecret=[REDACTED]')
    .replace(/secretkey[=:]\s*[^\s&"',}]+/gi, 'secretkey=[REDACTED]')
    .replace(/access[_-]?token[=:]\s*[^\s&"',}]+/gi, 'access_token=[REDACTED]')
    .replace(/bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
}
