import { describe, expect, it, vi } from 'vitest';

import {
  REALTIME_STATUS_FETCH_ERROR_MESSAGE,
  REALTIME_ADVANCED_RECHECK_LABEL,
  REALTIME_CONTROL_BADGE_LABEL,
  SESSION_REALTIME_CAP_OPTIONS,
  getRealtimeCapVerificationDescription,
  getRealtimeCap20PreviewLabel,
  getRealtimeCap20ReadinessLabel,
  getRealtimeCapOptionLabel,
  getRealtimeCapVerificationLabel,
  getRealtimeSessionMaxMsForCap,
  getRealtimeSessionEndReasonLabel,
  getRealtimeSessionStateLabel,
  getRealtimeSessionUiState,
  requestRealtimeSessionEnable,
  sanitizeRealtimeOperatorMessage,
} from '../realtime-session-control';

describe('realtime session operator controls', () => {
  it('describes integrated realtime as verified, not experimental', () => {
    expect(REALTIME_CONTROL_BADGE_LABEL).toBe('검증 완료');
    expect(REALTIME_ADVANCED_RECHECK_LABEL).toBe('운영자 재검증');
    expect(REALTIME_CONTROL_BADGE_LABEL).not.toContain('실험');
    expect(REALTIME_ADVANCED_RECHECK_LABEL).not.toContain('실험');
  });

  it('exposes controlled cap choices up to the KIS WebSocket ceiling', () => {
    expect(SESSION_REALTIME_CAP_OPTIONS).toEqual([1, 3, 5, 10, 20, 40]);
    expect(SESSION_REALTIME_CAP_OPTIONS).not.toContain(41);
  });

  it('does not call enable without explicit confirmation', async () => {
    const enable = vi.fn(async () => ({ outcome: 'enabled' }));

    const result = await requestRealtimeSessionEnable({
      cap: 3,
      confirmed: false,
      enable,
    });

    expect(result).toEqual({ kind: 'blocked', reason: 'confirm_required' });
    expect(enable).not.toHaveBeenCalled();
  });

  it('calls enable with confirm true when the operator confirms', async () => {
    const enable = vi.fn(async () => ({ outcome: 'enabled' }));

    const result = await requestRealtimeSessionEnable({
      cap: 5,
      confirmed: true,
      enable,
    });

    expect(result).toEqual({ kind: 'sent', data: { outcome: 'enabled' } });
    expect(enable).toHaveBeenCalledWith({ cap: 5, confirm: true });
  });

  it('redacts secret-like text before rendering operator errors', () => {
    const token = ['rawtoken', '1234567890', '1234567890'].join('');
    const text = sanitizeRealtimeOperatorMessage(`Bearer ${token}`);

    expect(text).toContain('[REDACTED]');
    expect(text).not.toContain('rawtoken');
  });

  it('locks the enable controls while a session is active', () => {
    const ui = getRealtimeSessionUiState({
      runtimeStarted: true,
      confirmed: true,
      busy: false,
      sessionRealtimeEnabled: true,
    });

    expect(ui.enableDisabled).toBe(true);
    expect(ui.capSelectDisabled).toBe(true);
    expect(ui.disableDisabled).toBe(false);
  });

  it('renders Korean labels for all session end reasons', () => {
    expect(getRealtimeSessionEndReasonLabel('applied_tick_limit_reached')).toBe(
      '적용 tick 제한 도달',
    );
    expect(getRealtimeSessionEndReasonLabel('parsed_tick_limit_reached')).toBe(
      '수신 tick 제한 도달',
    );
    expect(getRealtimeSessionEndReasonLabel('time_limit_reached')).toBe(
      '시간 제한 도달',
    );
    expect(getRealtimeSessionEndReasonLabel('no_live_tick_observed')).toBe(
      'live tick 미관찰',
    );
    expect(getRealtimeSessionEndReasonLabel('safe_error')).toBe('안전 오류');
    expect(getRealtimeSessionEndReasonLabel('operator_disabled')).toBe(
      '사용자가 세션 해제',
    );
    expect(getRealtimeSessionEndReasonLabel(null)).toBe('—');
  });

  it('labels cap verification state for the operator UI', () => {
    expect(getRealtimeCapVerificationLabel(1)).toBe('검증됨');
    expect(getRealtimeCapVerificationLabel(3)).toBe('검증됨');
    expect(getRealtimeCapVerificationLabel(5)).toBe('검증됨');
    expect(getRealtimeCapVerificationLabel(10)).toBe('검증됨');
    expect(getRealtimeCapVerificationLabel(20)).toBe('검증됨');
    expect(getRealtimeCapVerificationLabel(40)).toBe('검증됨');
    expect(getRealtimeCapOptionLabel(5)).toBe('최대 5종목 · 검증됨');
    expect(getRealtimeCapOptionLabel(10)).toBe('최대 10종목 · 검증됨');
    expect(getRealtimeCapOptionLabel(20)).toBe('최대 20종목 · 검증됨');
    expect(getRealtimeCapOptionLabel(40)).toBe('최대 40종목 · 검증됨');
    expect(getRealtimeCapVerificationDescription(10)).toContain(
      'UI 버튼 경로에서 live burst hard-limit 검증이 완료',
    );
    expect(getRealtimeCapVerificationDescription(5)).toContain(
      'UI live hard-limit 검증이 완료',
    );
    expect(getRealtimeCapVerificationDescription(20)).toContain(
      'UI 버튼 경로 controlled live smoke 검증이 완료',
    );
    expect(getRealtimeCapVerificationDescription(40)).toContain(
      'UI 버튼 경로 controlled live smoke 검증이 완료',
    );
  });

  it('uses wider session timeboxes for cap20 and cap40 UI sessions', () => {
    expect(getRealtimeSessionMaxMsForCap(1)).toBe(60_000);
    expect(getRealtimeSessionMaxMsForCap(10)).toBe(60_000);
    expect(getRealtimeSessionMaxMsForCap(20)).toBe(90_000);
    expect(getRealtimeSessionMaxMsForCap(40)).toBe(120_000);
  });

  it('labels cap20 as readiness preview only, not an enabled cap', () => {
    expect(
      getRealtimeCap20ReadinessLabel({
        status: 'not_ready',
        blockers: ['cap20_live_smoke_not_performed'],
        warnings: ['requires_liquid_market_window'],
      }),
    ).toBe('준비 중');
    expect(
      getRealtimeCap20PreviewLabel({
        requestedCap: 20,
        effectiveCap: 20,
        candidateCount: 7,
        shortage: 13,
      }),
    ).toBe('현재 후보 7개 / 필요 20개 · 부족 13개');
  });

  it('summarizes session state for user-facing panels', () => {
    expect(
      getRealtimeSessionStateLabel({
        state: 'connected',
        sessionEnabled: true,
        endReason: null,
      }),
    ).toBe('수신 중');
    expect(
      getRealtimeSessionStateLabel({
        state: 'connecting',
        sessionEnabled: true,
        endReason: null,
      }),
    ).toBe('연결 중');
    expect(
      getRealtimeSessionStateLabel({
        state: 'connected',
        sessionEnabled: false,
        endReason: null,
      }),
    ).toBe('수신 중');
    expect(
      getRealtimeSessionStateLabel({
        state: 'disabled',
        sessionEnabled: true,
        endReason: null,
      }),
    ).toBe('꺼짐');
    expect(
      getRealtimeSessionStateLabel({
        state: 'manual-disabled',
        sessionEnabled: false,
        endReason: 'applied_tick_limit_reached',
      }),
    ).toBe('제한 도달');
    expect(
      getRealtimeSessionStateLabel({
        state: 'disabled',
        sessionEnabled: false,
        endReason: null,
      }),
    ).toBe('꺼짐');
    expect(
      getRealtimeSessionStateLabel({
        state: 'degraded',
        sessionEnabled: false,
        endReason: null,
        hasError: true,
      }),
    ).toBe('오류');
  });

  it('uses a safe realtime status fetch failure message', () => {
    expect(REALTIME_STATUS_FETCH_ERROR_MESSAGE).toBe(
      '실시간 상태를 불러오지 못했습니다. REST 폴링은 계속 유지됩니다.',
    );
    expect(REALTIME_STATUS_FETCH_ERROR_MESSAGE).not.toContain('approval');
    expect(REALTIME_STATUS_FETCH_ERROR_MESSAGE).not.toContain('account');
    expect(REALTIME_STATUS_FETCH_ERROR_MESSAGE).not.toContain('secret');
  });
});
