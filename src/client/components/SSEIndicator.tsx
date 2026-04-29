/**
 * SSEIndicator — header SSE status pill + click-to-open data-source panel.
 *
 * Closed state: a colored dot + label ("실시간" / "연결 중" / "끊김").
 *   - connected   → green, soft glow
 *   - connecting  → gold, pulsing
 *   - disconnected→ red
 *
 * Open state: a 280px panel anchored under the pill, listing the actual data
 * sources the dashboard is using:
 *   - WebSocket (즐겨찾기) — `realtimeCount` / 40 capacity
 *   - REST 폴링 — `pollingCount` 종목
 *   - 마지막 이벤트 — relative time vs the last incoming SSE message
 *
 * The panel is intentionally light on numbers we can't actually measure: we
 * do NOT show "latency ms" because the SSE payload doesn't carry an upstream
 * server-sent timestamp. Once that field exists, swap "마지막 이벤트 N초 전"
 * for true round-trip latency.
 */

import { useEffect, useRef, useState } from 'react';
import {
  getRealtimeStatus,
  type RealtimeStatusPayload,
} from '../lib/api-client';
import { fmtRelativeTime } from '../lib/format';
import {
  realtimeStatusPollIntervalMs,
  syncRealtimeStatusPanelPolling,
  type RealtimeStatusPollingHandle,
} from '../lib/realtime-status-panel';
import {
  REALTIME_STATUS_FETCH_ERROR_MESSAGE,
  getRealtimeCap20PreviewLabel,
  getRealtimeCap20ReadinessLabel,
  getRealtimeCapVerificationLabel,
  getRealtimeSessionEndReasonLabel,
  getRealtimeSessionStateLabel,
} from '../lib/realtime-session-control';

export type SseStatus = 'connected' | 'connecting' | 'disconnected';

const CONFIG: Record<SseStatus, { dot: string; label: string }> = {
  connected: { dot: '#0ECB81', label: '실시간' },
  connecting: { dot: 'var(--gold)', label: '연결 중' },
  disconnected: { dot: 'var(--kr-up)', label: '끊김' },
};

const RUNTIME_STATE_LABEL: Record<RealtimeStatusPayload['state'], string> = {
  idle: '대기',
  connecting: '연결 중',
  connected: '연결',
  degraded: '주의',
  disabled: '꺼짐',
  'manual-disabled': '수동 중지',
};

const APPROVAL_LABEL: Record<RealtimeStatusPayload['approvalKey']['status'], string> = {
  none: 'key 없음',
  issuing: 'key 발급',
  ready: 'key 준비',
  failed: 'key 실패',
  unknown: 'key 미확인',
};

interface SSEIndicatorProps {
  status: SseStatus;
  lastUpdate: Date | null;
  realtimeCount: number;
  pollingCount: number;
}

export function SSEIndicator({
  status,
  lastUpdate,
  realtimeCount,
  pollingCount,
}: SSEIndicatorProps) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [runtimeStatus, setRuntimeStatus] =
    useState<RealtimeStatusPayload | null>(null);
  const [runtimeStatusError, setRuntimeStatusError] = useState(false);
  const runtimePollerRef = useRef<RealtimeStatusPollingHandle | null>(null);
  const cfg = CONFIG[status];

  // 1Hz tick only while the panel is open or we have something to age out;
  // keeps the indicator cheap when idle.
  useEffect(() => {
    if (!open && lastUpdate === null) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [open, lastUpdate]);

  useEffect(() => {
    runtimePollerRef.current = syncRealtimeStatusPanelPolling({
      open,
      current: runtimePollerRef.current,
      fetchStatus: getRealtimeStatus,
      onStatus: (payload) => {
        setRuntimeStatus(payload);
        setRuntimeStatusError(false);
      },
      onError: () => {
        setRuntimeStatusError(true);
      },
      intervalMs: realtimeStatusPollIntervalMs(runtimeStatus),
    });

    return () => {
      if (open) {
        runtimePollerRef.current?.stop();
        runtimePollerRef.current = null;
      }
    };
  }, [open, runtimeStatus?.sessionRealtimeEnabled]);

  const ageLabel =
    lastUpdate !== null ? fmtRelativeTime(lastUpdate, now) : '대기 중';

  const wsChip =
    status === 'connected' ? '연결' : status === 'connecting' ? '연결 중' : '끊김';

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="SSE 연결 상태"
        aria-expanded={open}
        data-testid="sse-indicator-button"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 8,
          background: open ? 'var(--bg-tint)' : 'transparent',
          border: `1px solid ${open ? 'var(--border)' : 'transparent'}`,
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: 'var(--text-secondary)',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 50,
            background: cfg.dot,
            boxShadow: status === 'connected' ? `0 0 8px ${cfg.dot}99` : 'none',
            animation:
              status === 'connecting'
                ? 'liveDotPulse 1s ease-in-out infinite'
                : 'none',
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
          {cfg.label}
        </span>
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 90 }}
          />
          <div
            role="dialog"
            aria-label="데이터 소스 상세"
            data-testid="sse-status-panel"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              zIndex: 100,
              width: 280,
              padding: 14,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
              animation: 'fadeIn 150ms ease-out',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: 'var(--text-primary)',
                marginBottom: 10,
                letterSpacing: -0.1,
              }}
            >
              데이터 소스
            </div>
            <PanelRow
              k="WebSocket (즐겨찾기)"
              v={`${realtimeCount} / 40 종목`}
              chip={wsChip}
              chipColor={cfg.dot}
            />
            <PanelRow
              k="REST 폴링"
              v={`${pollingCount} 종목`}
              chip="활성"
              chipColor="var(--text-muted)"
            />
            <PanelRow
              k="마지막 이벤트"
              v={ageLabel}
              chip={status === 'connected' ? 'live' : '—'}
              chipColor={status === 'connected' ? cfg.dot : 'var(--text-muted)'}
            />
            <PanelRow
              k="WS 런타임"
              v={runtimeStatusLabel(runtimeStatus, runtimeStatusError)}
              chip={runtimeStatus?.source === 'integrated' ? '통합' : '대기'}
              chipColor="var(--text-muted)"
            />
            <PanelRow
              k="적용 gate"
              v={runtimeGateLabel(runtimeStatus)}
              chip={runtimeStatus?.canApplyTicksToPriceStore ? 'on' : 'off'}
              chipColor={
                runtimeStatus?.canApplyTicksToPriceStore
                  ? 'var(--kr-down)'
                  : 'var(--text-muted)'
              }
            />
            <PanelRow
              k="세션 gate"
              v={runtimeSessionLabel(runtimeStatus)}
              chip={
                runtimeStatus?.sessionRealtimeEnabled
                  ? `cap ${runtimeStatus.sessionCap ?? '-'}`
                  : 'off'
              }
              chipColor={
                runtimeStatus?.sessionRealtimeEnabled
                  ? 'var(--gold-text)'
                  : 'var(--text-muted)'
              }
            />
            <PanelRow
              k="구독 수"
              v={`${runtimeStatus?.subscribedTickerCount ?? 0} 종목`}
              chip={`${realtimeCount} 후보`}
              chipColor="var(--text-muted)"
            />
            <PanelRow
              k="최근 tick"
              v={runtimeStatus?.lastTickAt !== undefined && runtimeStatus.lastTickAt !== null
                ? fmtRelativeTime(new Date(runtimeStatus.lastTickAt), now)
                : '없음'}
              chip={`${runtimeStatus?.reconnectAttempts ?? 0}회`}
              chipColor="var(--text-muted)"
            />
            <PanelRow
              k="파싱/반영/무시"
              v={runtimeCountersLabel(runtimeStatus)}
              chip={
                runtimeStatus !== null
                  ? APPROVAL_LABEL[runtimeStatus.approvalKey.status]
                  : 'key 없음'
              }
              chipColor="var(--text-muted)"
            />
            <PanelRow
              k="세션 제한"
              v={runtimeSessionLimitLabel(runtimeStatus)}
              chip={runtimeSessionEndReasonLabel(runtimeStatus)}
              chipColor="var(--text-muted)"
            />
            <PanelRow
              k="10종목 상태"
              v={runtimeCap10ReadinessLabel(runtimeStatus)}
              chip={getRealtimeCapVerificationLabel(10)}
              chipColor="var(--gold-text)"
            />
            <PanelRow
              k="20종목 준비"
              v={runtimeCap20ReadinessLabel(runtimeStatus)}
              chip={getRealtimeCap20ReadinessLabel(
                runtimeStatus?.readiness.cap20Readiness,
              )}
              chipColor="var(--gold-text)"
            />
            {runtimeStatusError && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 9px',
                  background: 'var(--accent-soft)',
                  borderRadius: 7,
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                {REALTIME_STATUS_FETCH_ERROR_MESSAGE}
              </div>
            )}
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid var(--border-soft)',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                통합 실시간은 기본 상시 운영이며, REST 폴링은 fallback으로 계속 유지됩니다.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function runtimeStatusLabel(
  status: RealtimeStatusPayload | null,
  hasError: boolean,
): string {
  if (hasError) return '조회 실패';
  if (status === null) return '조회 중';
  return RUNTIME_STATE_LABEL[status.state];
}

function runtimeGateLabel(status: RealtimeStatusPayload | null): string {
  if (status === null) return '대기';
  return `${status.websocketEnabled ? 'WS on' : 'WS off'} / ${
    status.applyTicksToPriceStore ? 'apply on' : 'apply off'
  }`;
}

function runtimeSessionLabel(status: RealtimeStatusPayload | null): string {
  if (status === null) return '대기';
  if (!status.sessionRealtimeEnabled) {
    return getRealtimeSessionStateLabel({
      state: 'disabled',
      sessionEnabled: false,
      endReason: status.session.endReason,
    });
  }
  return getRealtimeSessionStateLabel({
    state: status.state,
    sessionEnabled: status.sessionRealtimeEnabled,
    endReason: status.session.endReason,
  });
}

function runtimeCountersLabel(status: RealtimeStatusPayload | null): string {
  if (status === null) return '0 / 0 / 0';
  return `${status.parsedTickCount} / ${status.appliedTickCount} / ${status.ignoredStaleTickCount}`;
}

function runtimeSessionLimitLabel(status: RealtimeStatusPayload | null): string {
  if (status === null) return '대기';
  const appliedMax = status.session.maxAppliedTicks ?? '-';
  const parsedMax = status.session.maxParsedTicks ?? '-';
  return `적용 ${status.session.sessionAppliedTickCount}/${appliedMax} · 수신 ${status.session.sessionParsedTickCount}/${parsedMax}`;
}

function runtimeSessionEndReasonLabel(status: RealtimeStatusPayload | null): string {
  const label = getRealtimeSessionEndReasonLabel(status?.session.endReason ?? null);
  return label === '—' ? '대기' : label;
}

function runtimeCap10ReadinessLabel(status: RealtimeStatusPayload | null): string {
  if (status === null) return '대기';
  if (status.readiness.cap10UiHardLimitReady) return 'UI hard-limit 검증됨';
  if (status.readiness.cap10UiHardLimitConditional) {
    return '버튼 확인 · 유동성 조건부';
  }
  return '미검증';
}

function runtimeCap20ReadinessLabel(status: RealtimeStatusPayload | null): string {
  if (status === null) return '대기';
  return getRealtimeCap20PreviewLabel(status.readiness.cap20Preview);
}

interface PanelRowProps {
  k: string;
  v: string;
  chip: string;
  chipColor: string;
}

function PanelRow({ k, v, chip, chipColor }: PanelRowProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '7px 0',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
        {k}
      </span>
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {v}
      </span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 800,
          color: chipColor,
          border: `1px solid ${chipColor}`,
          padding: '2px 5px',
          borderRadius: 4,
          letterSpacing: 0.3,
        }}
      >
        {chip}
      </span>
    </div>
  );
}
