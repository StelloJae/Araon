import type { TossLoginJobState, TossLoginStatusPayload } from './api-client';

export function isTossLoginRunningState(
  state: TossLoginJobState | null | undefined,
): boolean {
  return state === 'starting' || state === 'waiting_for_qr' || state === 'waiting_for_persistent';
}

export function shouldStopTossLoginPolling(status: TossLoginStatusPayload | null): boolean {
  if (status === null) return true;
  return !isTossLoginRunningState(status.state);
}

export function shouldRefreshTossAccountRailAfterLogin(
  status: TossLoginStatusPayload | null,
): boolean {
  return status?.state === 'succeeded';
}

export function tossLoginRailNotice(status: TossLoginStatusPayload | null): string | null {
  if (status === null) return null;
  switch (status.state) {
    case 'idle':
      return null;
    case 'starting':
      return 'Toss QR 로그인 창을 여는 중입니다.';
    case 'waiting_for_qr':
      return 'Toss QR 로그인 창을 열었습니다. QR 인증을 완료해 주세요. QR 화면이 멈춰 보이면 열린 Chrome 창을 새로고침해도 됩니다.';
    case 'waiting_for_persistent':
      return 'Toss 로그인 유지 확인을 기다리는 중입니다.';
    case 'succeeded':
      return 'Toss 로그인 완료. 계좌 데이터를 새로고침합니다.';
    case 'failed':
      return 'Toss 로그인에 실패했습니다. 설정에서 다시 시도해 주세요.';
    case 'cancelled':
      return 'Toss 로그인이 취소되었습니다.';
  }
}
