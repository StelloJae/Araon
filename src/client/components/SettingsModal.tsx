/**
 * SettingsModal — four-tab settings dialog.
 *
 *   [연결] — readonly KIS runtime status (no credential values shown).
 *   [알림] — notifications: master switch, threshold, sound, desktop push.
 *   [급상승] — surge threshold (live + today aggregator pick this up).
 *   [룰]   — alert rules CRUD (localStorage). Firing engine ships in Phase 6.
 *
 * Behaviors fixed by Phase 5 plan:
 *   - Connection tab does NOT expose appKey / appSecret / account number,
 *     not even masked.
 *   - Desktop notification permission is requested only when the user flips
 *     the toggle ON (never on mount or load).
 *   - All settings persist via `useSettingsStore`; rules via
 *     `useAlertRulesStore`. Both are localStorage-backed and validate on
 *     load with default fallback.
 *
 * Listeners:
 *   - ESC closes; cleaned up on unmount.
 *   - Connection tab fetch uses AbortController so a pending request is
 *     cancelled when the modal closes or a different tab is opened.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CloseIcon } from '../lib/icons';
import {
  ALERT_RULE_KIND_LABEL,
  ALERT_RULE_KIND_SUFFIX,
  ALERT_RULE_KINDS,
  DEFAULT_RULE_COOLDOWN_MS,
  useAlertRulesStore,
  type AlertRuleKind,
} from '../stores/alert-rules-store';
import {
  useSettingsStore,
  type ClientSettings,
} from '../stores/settings-store';
import { useStocksStore } from '../stores/stocks-store';
import { Field, Slider, Toggle } from './ui/SettingsControls';
import { ensureAudioUnlocked, playBleep } from '../lib/sound';
import {
  ApiError,
  disableRealtimeSession,
  enableRealtimeSession,
  getFavorites,
  getRealtimeStatus,
  getStocks,
  getThemesWithStocks,
  importKisWatchlist,
  type KisWatchlistImportResult,
  type RealtimeStatusPayload,
} from '../lib/api-client';
import {
  REALTIME_STATUS_FETCH_ERROR_MESSAGE,
  getRealtimeCap20PreviewLabel,
  getRealtimeCap20ReadinessLabel,
  getRealtimeCapVerificationDescription,
  getRealtimeCapOptionLabel,
  getRealtimeSessionEndReasonLabel,
  getRealtimeSessionMaxMsForCap,
  getRealtimeSessionStateLabel,
  getRealtimeSessionUiState,
  requestRealtimeSessionEnable,
  sanitizeRealtimeOperatorMessage,
  SESSION_REALTIME_CAP_OPTIONS,
  type SessionRealtimeCap,
} from '../lib/realtime-session-control';
import { useMasterStore } from '../stores/master-store';
import { useWatchlistStore } from '../stores/watchlist-store';

const TABS = ['연결', '알림', '급상승', '룰'] as const;
type TabId = (typeof TABS)[number];

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [tab, setTab] = useState<TabId>('알림');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="설정"
      data-testid="settings-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        animation: 'fadeIn 180ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 100%)',
          height: 'min(640px, 90vh)',
          background: 'var(--bg-card)',
          borderRadius: 14,
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: -0.2,
            }}
          >
            설정
          </div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            title="닫기 (ESC)"
            aria-label="닫기"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--bg-tint)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        <div
          style={{
            padding: '0 22px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            gap: 4,
          }}
        >
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              data-testid={t === '연결' ? 'settings-connection-tab' : undefined}
              style={{
                padding: '12px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
                color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', padding: '20px 22px', flex: 1 }}>
          {tab === '연결' && <ConnectionTab />}
          {tab === '알림' && <NotifTab />}
          {tab === '급상승' && <SurgeTab />}
          {tab === '룰' && <RulesTab />}
        </div>
      </div>
    </div>
  );
}

// ---------- Connection tab ----------

interface CredentialStatus {
  configured: boolean;
  isPaper: boolean | null;
  runtime: 'unconfigured' | 'starting' | 'started' | 'failed';
  errorMessage: string | null;
}

type ImportPhase =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; result: KisWatchlistImportResult }
  | { kind: 'error'; message: string };

type RealtimeOperatorPhase =
  | { kind: 'idle' }
  | { kind: 'running'; action: 'enable' | 'disable' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

function ConnectionTab() {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatusPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importPhase, setImportPhase] = useState<ImportPhase>({ kind: 'idle' });
  const [operatorPhase, setOperatorPhase] =
    useState<RealtimeOperatorPhase>({ kind: 'idle' });
  const [selectedCap, setSelectedCap] = useState<SessionRealtimeCap>(1);
  const [operatorConfirmed, setOperatorConfirmed] = useState(false);

  const setCatalog = useStocksStore((s) => s.setCatalog);
  const setThemes = useStocksStore((s) => s.setThemes);
  const setFavorites = useWatchlistStore((s) => s.setFavorites);

  async function reloadCatalog(): Promise<void> {
    // Match App.tsx's hydration flow: catalog set wipes sectorId, so re-apply
    // themes immediately after.
    const [stocks, themes, favs] = await Promise.all([
      getStocks(),
      getThemesWithStocks(),
      getFavorites().catch((err) => {
        if (err instanceof ApiError && err.status === 503) return [];
        throw err;
      }),
    ]);
    setCatalog(stocks);
    setThemes(themes);
    setFavorites(favs.map((f) => f.ticker));
  }

  async function handleImport(): Promise<void> {
    setImportPhase({ kind: 'running' });
    try {
      const result = await importKisWatchlist();
      await reloadCatalog();
      setImportPhase({ kind: 'success', result });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `${err.status} ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      setImportPhase({ kind: 'error', message });
    }
  }

  async function reloadRealtimeStatus(): Promise<void> {
    setRealtimeStatus(await getRealtimeStatus());
  }

  useEffect(() => {
    if (realtimeStatus?.sessionRealtimeEnabled !== true) return;
    const id = window.setInterval(() => {
      void getRealtimeStatus()
        .then(setRealtimeStatus)
        .catch((err) => {
          setOperatorPhase({
            kind: 'error',
            message: `${REALTIME_STATUS_FETCH_ERROR_MESSAGE} (${operatorErrorMessage(err)})`,
          });
        });
    }, 5_000);
    return () => window.clearInterval(id);
  }, [realtimeStatus?.sessionRealtimeEnabled]);

  async function handleSessionEnable(): Promise<void> {
    setOperatorPhase({ kind: 'running', action: 'enable' });
    try {
      const result = await requestRealtimeSessionEnable({
        cap: selectedCap,
        confirmed: operatorConfirmed,
        maxSessionMs: getRealtimeSessionMaxMsForCap(selectedCap),
        enable: enableRealtimeSession,
      });
      if (result.kind === 'blocked') {
        setOperatorPhase({
          kind: 'error',
          message:
            result.reason === 'confirm_required'
              ? '확인 체크가 필요합니다'
              : '허용되지 않은 종목 수입니다',
        });
        return;
      }
      await reloadRealtimeStatus();
      setOperatorPhase({
        kind: 'success',
        message:
          result.data.outcome === 'no_candidates'
            ? '실시간 후보 즐겨찾기가 없습니다'
            : '이 세션에서 실시간 시세를 켰습니다',
      });
    } catch (err) {
      setOperatorPhase({
        kind: 'error',
        message: operatorErrorMessage(err),
      });
    }
  }

  async function handleSessionDisable(): Promise<void> {
    setOperatorPhase({ kind: 'running', action: 'disable' });
    try {
      await disableRealtimeSession();
      await reloadRealtimeStatus();
      setOperatorPhase({
        kind: 'success',
        message: '이 세션의 실시간 시세를 껐습니다',
      });
    } catch (err) {
      setOperatorPhase({
        kind: 'error',
        message: operatorErrorMessage(err),
      });
    }
  }

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/credentials/status', {
          signal: ctrl.signal,
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: {
            configured?: boolean;
            isPaper?: boolean | null;
            runtime?: CredentialStatus['runtime'];
            error?: { message?: string };
          };
        };
        if (cancelled) return;
        const data = json.data;
        if (data === undefined) {
          setLoadError('상태를 읽을 수 없습니다');
          return;
        }
        setStatus({
          configured: data.configured === true,
          isPaper: data.isPaper ?? null,
          runtime: data.runtime ?? 'unconfigured',
          errorMessage: data.error?.message ?? null,
        });
        const realtime = await getRealtimeStatus();
        if (!cancelled) {
          setRealtimeStatus(realtime);
        }
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        if (!cancelled) {
          setLoadError(REALTIME_STATUS_FETCH_ERROR_MESSAGE);
        }
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  if (loadError !== null) {
    return (
      <div
        style={{
          padding: '12px 14px',
          background: 'var(--accent-soft)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}
      >
        연결 상태를 가져오지 못했습니다: {loadError}
      </div>
    );
  }
  if (status === null) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>불러오는 중…</div>
    );
  }

  const runtimeLabel: Record<CredentialStatus['runtime'], string> = {
    unconfigured: '미설정',
    starting: '시작 중',
    started: '연결됨',
    failed: '실패',
  };
  const runtimeColor =
    status.runtime === 'started'
      ? 'var(--kr-up)'
      : status.runtime === 'failed'
        ? 'var(--kr-down)'
        : 'var(--text-muted)';

  return (
    <div>
      <Row k="런타임 상태" v={runtimeLabel[status.runtime]} chipColor={runtimeColor} />
      <Row
        k="자격증명"
        v={status.configured ? '저장됨' : '미저장'}
        chipColor={status.configured ? 'var(--text-secondary)' : 'var(--text-muted)'}
      />
      <Row
        k="투자 구분"
        v={
          status.isPaper === null
            ? '—'
            : status.isPaper
              ? '모의투자'
              : '실전투자'
        }
        chipColor="var(--text-secondary)"
      />
      <Row
        k="REST 폴링"
        v={status.runtime === 'started' ? '활성' : '대기'}
        chipColor="var(--text-muted)"
      />
      <Row
        k="WebSocket"
        v={
          realtimeStatus?.canApplyTicksToPriceStore
            ? '상시 활성'
            : realtimeStatus?.sessionRealtimeEnabled
              ? '세션 활성'
              : '대기'
        }
        chipColor={
          realtimeStatus?.canApplyTicksToPriceStore
            ? 'var(--kr-up)'
            : 'var(--text-muted)'
        }
      />
      <RealtimeSessionControl
        status={realtimeStatus}
        selectedCap={selectedCap}
        confirmed={operatorConfirmed}
        phase={operatorPhase}
        runtimeStarted={status.runtime === 'started'}
        onCapChange={setSelectedCap}
        onConfirmChange={setOperatorConfirmed}
        onEnable={() => void handleSessionEnable()}
        onDisable={() => void handleSessionDisable()}
      />

      {status.errorMessage !== null && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            background: 'var(--accent-soft)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {status.errorMessage}
        </div>
      )}

      <div
        style={{
          marginTop: 18,
          padding: '12px 14px',
          background: 'var(--bg-tint)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          fontSize: 11,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}
      >
        보안을 위해 App Key / App Secret / 계좌번호는 표시하지 않습니다.
        <br />
        자격증명 변경은 다음 버전에서 지원됩니다.
      </div>

      <MasterCatalogPanel />

      <div
        style={{
          marginTop: 22,
          paddingTop: 18,
          borderTop: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: 6,
          }}
        >
          KIS 관심종목 가져오기
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            marginBottom: 12,
          }}
        >
          KIS HTS/MTS에 등록된 관심종목 그룹의 종목을 추적 카탈로그에 추가합니다.
          <br />
          전체 종목 검색은 다음 업데이트에서 활성화됩니다.
        </div>
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={
            importPhase.kind === 'running' || status?.runtime !== 'started'
          }
          style={{
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            background:
              importPhase.kind === 'running' || status?.runtime !== 'started'
                ? 'var(--text-inactive)'
                : 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            cursor:
              importPhase.kind === 'running' || status?.runtime !== 'started'
                ? 'not-allowed'
                : 'pointer',
          }}
        >
          {importPhase.kind === 'running' ? '가져오는 중…' : '관심종목 가져오기'}
        </button>
        {importPhase.kind === 'success' && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              background: 'var(--up-tint-1)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            새 종목 {importPhase.result.imported}개 추가, 기존 종목{' '}
            {importPhase.result.skipped}개 건너뜀
            {importPhase.result.groups.length > 0 && (
              <>
                <br />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  그룹: {importPhase.result.groups.join(', ')}
                </span>
              </>
            )}
          </div>
        )}
        {importPhase.kind === 'error' && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              background: 'var(--accent-soft)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            가져오기 실패: {importPhase.message}
          </div>
        )}
      </div>
    </div>
  );
}

function RealtimeSessionControl({
  status,
  selectedCap,
  confirmed,
  phase,
  runtimeStarted,
  onCapChange,
  onConfirmChange,
  onEnable,
  onDisable,
}: {
  status: RealtimeStatusPayload | null;
  selectedCap: SessionRealtimeCap;
  confirmed: boolean;
  phase: RealtimeOperatorPhase;
  runtimeStarted: boolean;
  onCapChange: (cap: SessionRealtimeCap) => void;
  onConfirmChange: (confirmed: boolean) => void;
  onEnable: () => void;
  onDisable: () => void;
}) {
  const busy = phase.kind === 'running';
  const sessionActive = status?.sessionRealtimeEnabled === true;
  const runtimeApplyActive = status?.canApplyTicksToPriceStore === true;
  const runtimeReceiving =
    status?.state === 'connecting' || status?.state === 'connected';
  const session = status?.session;
  const uiState = getRealtimeSessionUiState({
    runtimeStarted,
    confirmed,
    busy,
    sessionRealtimeEnabled: sessionActive,
  });
  const endReason = status?.session?.endReason ?? null;
  const cap20Label = getRealtimeCap20ReadinessLabel(
    status?.readiness.cap20Readiness,
  );
  const cap20Preview = getRealtimeCap20PreviewLabel(
    status?.readiness.cap20Preview,
  );
  const sessionStateLabel = getRealtimeSessionStateLabel({
    state: status?.state ?? null,
    sessionEnabled: sessionActive || runtimeApplyActive,
    endReason,
    hasError: phase.kind === 'error',
  });
  return (
    <div
      data-testid="realtime-session-control"
      style={{
        marginTop: 18,
        padding: '12px 14px',
        background: 'var(--bg-tint)',
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
          통합 실시간 시세
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: 'var(--gold-text)',
            border: '1px solid var(--gold)',
            borderRadius: 4,
            padding: '2px 5px',
          }}
        >
          실험 기능
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        통합 실시간 시세는 H0UNCNT0 기반으로 상시 운영됩니다.
        <br />
        REST 폴링은 fallback으로 계속 유지됩니다.
        <br />
        아래 수동 세션 버튼은 짧은 재검증/정리용이며, 시간 또는 tick 제한에 도달하면 자동으로 정리됩니다.
        <br />
        검증 완료: 1 / 3 / 5 / 10 / 20 / 40종목.
        <br />
        {getRealtimeCapVerificationDescription(40)}
        <br />
        20종목 상태: {cap20Label}. {cap20Preview}.
        <br />
        40종목까지 controlled live smoke는 완료됐지만, 40종목 초과 구독은 허용하지 않습니다.
        <br />
        raw key / account / secret 정보는 표시하지 않습니다.
      </div>
      <div
        data-testid="realtime-status-panel"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginTop: 10,
        }}
      >
        <Row
          k="현재 상태"
          v={sessionStateLabel}
          chipColor={runtimeReceiving ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
        <Row
          k="소스"
          v="통합"
          chipColor="var(--text-muted)"
        />
        <Row
          k="현재 cap"
          v={session?.cap !== null && session?.cap !== undefined
            ? `${session.cap}종목`
            : `${selectedCap}종목 선택`}
          chipColor="var(--text-muted)"
        />
        <Row
          k="구독 수"
          v={`${status?.subscribedTickerCount ?? 0} 종목`}
          chipColor="var(--text-muted)"
        />
        <Row
          k="파싱/반영/무시"
          v={
            status === null
              ? '0 / 0 / 0'
              : `${status.parsedTickCount} / ${status.appliedTickCount} / ${status.ignoredStaleTickCount}`
          }
          chipColor="var(--text-muted)"
        />
        <Row
          k="최근 tick"
          v={status?.lastTickAt !== undefined && status.lastTickAt !== null
            ? formatLocal(status.lastTickAt)
            : '없음'}
          chipColor="var(--text-muted)"
        />
        <Row
          k="세션 진행"
          v={
            session !== undefined
              ? `적용 ${session.sessionAppliedTickCount}/${session.maxAppliedTicks ?? '-'}`
              : '60초 / 대기'
          }
          chipColor="var(--text-muted)"
        />
        <Row
          k="세션 제한"
          v={
            session !== undefined
              ? `${Math.round(session.maxSessionMs / 1000)}초 / 수신 ${session.sessionParsedTickCount}/${session.maxParsedTicks ?? '-'}`
              : '60초 / 대기'
          }
          chipColor="var(--text-muted)"
        />
        <Row
          k="종료 사유"
          v={getRealtimeSessionEndReasonLabel(endReason)}
          chipColor={endReason === null ? 'var(--text-muted)' : 'var(--gold-text)'}
        />
        <Row
          k="10종목"
          v={status?.readiness.cap10UiHardLimitReady
            ? '검증됨'
            : status?.readiness.cap10UiHardLimitConditional
              ? '조건부'
              : '미검증'}
          chipColor="var(--gold-text)"
        />
        <Row
          k="20종목"
          v={`${cap20Label} · ${cap20Preview}`}
          chipColor="var(--gold-text)"
        />
        <Row
          k="40종목"
          v={status?.readiness.readyForCap40 ? '준비됨' : '미검증'}
          chipColor="var(--gold-text)"
        />
      </div>
      <label
        style={{
          display: 'block',
          marginTop: 12,
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-secondary)',
        }}
      >
        최대 종목 수
        <select
          value={selectedCap}
          onChange={(e) => onCapChange(Number(e.target.value) as SessionRealtimeCap)}
          disabled={uiState.capSelectDisabled}
          data-testid="realtime-cap-select"
          style={{
            display: 'block',
            marginTop: 6,
            width: '100%',
            padding: '8px 10px',
            borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: uiState.capSelectDisabled
              ? 'var(--text-muted)'
              : 'var(--text-primary)',
            fontFamily: 'inherit',
            fontSize: 12,
            cursor: uiState.capSelectDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {SESSION_REALTIME_CAP_OPTIONS.map((cap) => (
            <option key={cap} value={cap} data-testid={`realtime-cap-${cap}`}>
              {getRealtimeCapOptionLabel(cap)}
            </option>
          ))}
        </select>
      </label>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 10,
          fontSize: 11,
          color: 'var(--text-secondary)',
        }}
      >
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirmChange(e.currentTarget.checked)}
          data-testid="realtime-confirm-checkbox"
        />
        이 세션에서만 켜는 실험 기능임을 확인했습니다
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={onEnable}
          disabled={uiState.enableDisabled}
          data-testid="realtime-session-enable"
          style={operatorButtonStyle(!uiState.enableDisabled)}
        >
          {phase.kind === 'running' && phase.action === 'enable'
            ? '켜는 중…'
            : sessionActive
              ? '진행 중'
              : '세션에서 켜기'}
        </button>
        <button
          type="button"
          onClick={onDisable}
          disabled={uiState.disableDisabled}
          data-testid="realtime-session-disable"
          style={operatorButtonStyle(!uiState.disableDisabled)}
        >
          {phase.kind === 'running' && phase.action === 'disable'
            ? '끄는 중…'
            : '끄기'}
        </button>
      </div>
      {phase.kind === 'success' && (
        <div style={operatorMessageStyle('var(--up-tint-1)')}>{phase.message}</div>
      )}
      {phase.kind === 'error' && (
        <div style={operatorMessageStyle('var(--accent-soft)')}>{phase.message}</div>
      )}
    </div>
  );
}

function operatorErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return sanitizeRealtimeOperatorMessage(`${err.status} ${err.message}`);
  }
  return sanitizeRealtimeOperatorMessage(
    err instanceof Error ? err.message : String(err),
  );
}

function operatorButtonStyle(enabled: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 800,
    background: enabled ? 'var(--accent)' : 'var(--text-inactive)',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}

function operatorMessageStyle(background: string): CSSProperties {
  return {
    marginTop: 10,
    padding: '9px 10px',
    background,
    borderRadius: 7,
    fontSize: 11,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  };
}

interface RowProps {
  k: string;
  v: string;
  chipColor: string;
}

function Row({ k, v, chipColor }: RowProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      <span
        style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}
      >
        {k}
      </span>
      <span
        style={{
          fontSize: 12,
          color: chipColor,
          textAlign: 'right',
          fontWeight: 700,
        }}
      >
        {v}
      </span>
    </div>
  );
}

// ---------- Master catalog panel (connection tab) ----------

function MasterCatalogPanel() {
  const refreshedAt = useMasterStore((s) => s.refreshedAt);
  const rowCount = useMasterStore((s) => s.rowCount);
  const fresh = useMasterStore((s) => s.fresh);
  const stale = useMasterStore((s) => s.stale);
  const refreshStatus = useMasterStore((s) => s.refreshStatus);
  const refreshError = useMasterStore((s) => s.refreshError);
  const triggerRefresh = useMasterStore((s) => s.triggerRefresh);
  const ensureLoaded = useMasterStore((s) => s.ensureLoaded);

  // Make sure the panel reflects current state even if it's the very first
  // render of the modal (App's idle preload may still be pending).
  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const refreshing = refreshStatus === 'running';
  const lastLabel = refreshedAt !== null
    ? formatLocal(refreshedAt)
    : '없음';
  const statusLabel = refreshing
    ? '갱신 중…'
    : refreshError !== null
      ? '실패'
      : stale
        ? '오래됨'
        : fresh
          ? '최신'
          : '대기';
  const statusColor = refreshing
    ? 'var(--gold-text)'
    : refreshError !== null
      ? 'var(--kr-up)'
      : stale
        ? 'var(--gold-text)'
        : 'var(--text-secondary)';

  return (
    <div
      style={{
        marginTop: 22,
        paddingTop: 18,
        borderTop: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: 6,
        }}
      >
        전체 종목 데이터 (검색용)
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
          marginBottom: 12,
        }}
      >
        한국거래소 전 종목 마스터를 검색용으로 보유합니다. 매일 1회 자동
        갱신되며, 최근 갱신 후 7일이 지나면 수동 갱신을 권장합니다.
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: 10,
          alignItems: 'center',
          padding: '8px 0',
          borderBottom: '1px solid var(--border-soft)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
          종목 수
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-primary)',
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {rowCount.toLocaleString('ko-KR')}
        </span>
        <span />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: 10,
          alignItems: 'center',
          padding: '8px 0',
          borderBottom: '1px solid var(--border-soft)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
          마지막 갱신
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
          {lastLabel}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            color: statusColor,
            border: `1px solid ${statusColor}`,
            padding: '2px 5px',
            borderRadius: 4,
            letterSpacing: 0.3,
          }}
        >
          {statusLabel}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => void triggerRefresh()}
          disabled={refreshing}
          style={{
            padding: '7px 12px',
            fontSize: 12,
            fontWeight: 700,
            background: refreshing ? 'var(--text-inactive)' : 'var(--bg-tint)',
            color: refreshing ? '#fff' : 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            cursor: refreshing ? 'not-allowed' : 'pointer',
          }}
        >
          {refreshing ? '갱신 중…' : '지금 갱신'}
        </button>
        {stale && !refreshing && refreshError === null && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--gold-text)',
              lineHeight: 1.4,
            }}
          >
            전체 종목 데이터가 7일 이상 오래되었습니다. 갱신을 권장합니다.
          </span>
        )}
      </div>
      {refreshError !== null && (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            background: 'var(--accent-soft)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          갱신 실패: {refreshError}
        </div>
      )}
    </div>
  );
}

function formatLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// ---------- Notif tab ----------

function NotifTab() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  const set = (patch: Partial<ClientSettings>) => update(patch);

  const desktopSupported =
    typeof window !== 'undefined' && 'Notification' in window;
  const [permissionMsg, setPermissionMsg] = useState<string | null>(null);
  const [soundMsg, setSoundMsg] = useState<string | null>(null);

  // Toggling sound ON inside this user-gesture handler unlocks the
  // AudioContext so later toast-driven beeps actually play.
  async function handleSoundToggle(next: boolean) {
    if (!next) {
      set({ soundOn: false });
      setSoundMsg(null);
      return;
    }
    set({ soundOn: true });
    const ok = await ensureAudioUnlocked();
    if (!ok) {
      setSoundMsg('이 브라우저에서 오디오 컨텍스트를 활성화하지 못했습니다.');
    } else {
      setSoundMsg(null);
    }
  }

  async function handleSoundTest() {
    const ok = await ensureAudioUnlocked();
    if (!ok) {
      setSoundMsg('이 브라우저에서 오디오 컨텍스트를 활성화하지 못했습니다.');
      return;
    }
    setSoundMsg(null);
    playBleep(settings.soundVolume, 'up');
  }

  async function handleDesktopToggle(next: boolean) {
    if (!next) {
      set({ desktopNotif: false });
      setPermissionMsg(null);
      return;
    }
    if (!desktopSupported) {
      setPermissionMsg('이 브라우저는 데스크톱 알림을 지원하지 않습니다.');
      return;
    }
    if (Notification.permission === 'granted') {
      set({ desktopNotif: true });
      setPermissionMsg(null);
      return;
    }
    if (Notification.permission === 'denied') {
      set({ desktopNotif: false });
      setPermissionMsg(
        '브라우저 알림 권한이 거부되어 있습니다. 브라우저 설정에서 허용한 뒤 다시 켜주세요.',
      );
      return;
    }
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        set({ desktopNotif: true });
        setPermissionMsg(null);
      } else {
        set({ desktopNotif: false });
        setPermissionMsg('데스크톱 알림 권한이 부여되지 않았습니다.');
      }
    } catch {
      set({ desktopNotif: false });
      setPermissionMsg('권한 요청 중 오류가 발생했습니다.');
    }
  }

  const dependentDisabled = !settings.notifGlobalEnabled;

  return (
    <div>
      <Field label="">
        <Toggle
          value={settings.notifGlobalEnabled}
          onChange={(v) => set({ notifGlobalEnabled: v })}
          label="알림 전체 활성화"
        />
      </Field>

      <div
        style={{
          opacity: dependentDisabled ? 0.45 : 1,
          pointerEvents: dependentDisabled ? 'none' : 'auto',
        }}
      >
        <Field
          label={`등락률 임계값 (±${settings.notifPctThreshold}%)`}
          hint="즐겨찾기 종목이 이 % 이상 변동하면 토스트 알림이 표시됩니다. (Phase 6 발동)"
        >
          <Slider
            value={settings.notifPctThreshold}
            onChange={(v) => set({ notifPctThreshold: v })}
            min={1}
            max={20}
            step={0.5}
            suffix="%"
          />
        </Field>

        <Field label="">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Toggle
              value={settings.soundOn}
              onChange={(v) => void handleSoundToggle(v)}
              label="사운드 알림 (기본 OFF)"
            />
            <button
              type="button"
              onClick={() => void handleSoundTest()}
              disabled={!settings.soundOn}
              style={{
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 700,
                background: settings.soundOn ? 'var(--bg-tint)' : 'transparent',
                color: settings.soundOn
                  ? 'var(--text-secondary)'
                  : 'var(--text-inactive)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: settings.soundOn ? 'pointer' : 'not-allowed',
              }}
            >
              테스트음
            </button>
          </div>
        </Field>
        {soundMsg !== null && (
          <div
            style={{
              marginTop: -10,
              marginBottom: 14,
              fontSize: 11,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            {soundMsg}
          </div>
        )}

        <Field label={`사운드 볼륨 (${Math.round(settings.soundVolume * 100)}%)`}>
          <Slider
            value={Math.round(settings.soundVolume * 100)}
            onChange={(v) => set({ soundVolume: v / 100 })}
            min={0}
            max={100}
            step={5}
            suffix="%"
            disabled={!settings.soundOn}
          />
        </Field>

        <Field label="">
          <Toggle
            value={settings.desktopNotif}
            onChange={(v) => void handleDesktopToggle(v)}
            label="데스크톱 푸시 알림"
            disabled={!desktopSupported}
          />
        </Field>
        {permissionMsg !== null && (
          <div
            style={{
              marginTop: -6,
              marginBottom: 14,
              fontSize: 11,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            {permissionMsg}
          </div>
        )}

        <Field
          label={`토스트 표시 시간 (${(settings.toastDurationMs / 1_000).toFixed(1)}초)`}
        >
          <Slider
            value={settings.toastDurationMs}
            onChange={(v) => set({ toastDurationMs: v })}
            min={2_000}
            max={15_000}
            step={500}
            format={(v) => `${(v / 1_000).toFixed(1)}s`}
          />
        </Field>

        <Field
          label={`중복 알림 cooldown (${(settings.alertCooldownMs / 60_000).toFixed(1)}분)`}
          hint="같은 종목·룰 조합의 토스트가 이 시간 동안 다시 발생하지 않습니다."
        >
          <Slider
            value={settings.alertCooldownMs}
            onChange={(v) => set({ alertCooldownMs: v })}
            min={30_000}
            max={30 * 60_000}
            step={30_000}
            format={(v) => `${(v / 60_000).toFixed(1)}m`}
          />
        </Field>
      </div>
    </div>
  );
}

// ---------- Surge tab ----------

function SurgeTab() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  return (
    <div>
      <Field
        label={`급상승 임계값 (${settings.surgeThreshold}% 이상)`}
        hint="실시간 급상승 spawn 및 오늘 누적 / 전체 필터에 즉시 반영됩니다."
      >
        <Slider
          value={settings.surgeThreshold}
          onChange={(v) => update({ surgeThreshold: v })}
          min={1}
          max={15}
          step={0.5}
          suffix="%"
        />
      </Field>

      <Field label="기간 설정 (active / fade)">
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--bg-tint)',
            border: '1px solid var(--border-soft)',
            borderRadius: 8,
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}
        >
          현재 활성 60초 / 페이드 30초로 고정. 다음 단계에서 조정 가능합니다.
        </div>
      </Field>

      <Field label="시총 / 거래량 배수 기반 필터">
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--bg-tint)',
            border: '1px solid var(--border-soft)',
            borderRadius: 8,
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}
        >
          시총 / 평균 거래량 데이터가 백엔드에 추가된 후 활성화됩니다.
        </div>
      </Field>
    </div>
  );
}

// ---------- Rules tab ----------

interface DraftRule {
  ticker: string;
  kind: AlertRuleKind;
  threshold: string;
  cooldownMinutes: string;
}

const EMPTY_DRAFT: DraftRule = {
  ticker: '',
  kind: 'changePctAbove',
  threshold: '5',
  cooldownMinutes: String(DEFAULT_RULE_COOLDOWN_MS / 60_000),
};

function RulesTab() {
  const rules = useAlertRulesStore((s) => s.rules);
  const addRule = useAlertRulesStore((s) => s.add);
  const removeRule = useAlertRulesStore((s) => s.remove);
  const toggleRule = useAlertRulesStore((s) => s.toggle);
  const catalog = useStocksStore((s) => s.catalog);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftRule>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const sortedTickers = useMemo(
    () =>
      Object.entries(catalog)
        .map(([ticker, meta]) => ({ ticker, name: meta.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [catalog],
  );

  function reset() {
    setDraft(EMPTY_DRAFT);
    setAdding(false);
    setError(null);
  }

  function submit() {
    const threshold = Number(draft.threshold);
    if (!Number.isFinite(threshold)) {
      setError('임계값을 숫자로 입력해주세요.');
      return;
    }
    if (draft.ticker === '') {
      setError('종목을 선택해주세요.');
      return;
    }
    const cooldownMin = Number(draft.cooldownMinutes);
    const cooldownMs = Number.isFinite(cooldownMin) && cooldownMin > 0
      ? cooldownMin * 60_000
      : DEFAULT_RULE_COOLDOWN_MS;
    addRule({
      ticker: draft.ticker,
      kind: draft.kind,
      threshold,
      cooldownMs,
    });
    reset();
  }

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          lineHeight: 1.55,
          marginBottom: 14,
          padding: '10px 12px',
          background: 'var(--bg-tint)',
          borderRadius: 8,
          border: '1px solid var(--border-soft)',
        }}
      >
        룰은 이 브라우저의 localStorage에만 저장됩니다. 서버 동기화는 아직
        지원하지 않습니다. 알림 발동은 다음 단계에서 활성화됩니다.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
          {rules.length === 0
            ? '등록된 알림 룰 없음'
            : `${rules.length}개 룰 · ${rules.filter((r) => r.enabled).length}개 활성`}
        </div>
        <div style={{ flex: 1 }} />
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{
              padding: '7px 12px',
              fontSize: 12,
              fontWeight: 700,
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 7,
              cursor: 'pointer',
            }}
          >
            + 룰 추가
          </button>
        )}
      </div>

      {adding && (
        <div
          style={{
            padding: 14,
            marginBottom: 14,
            borderRadius: 10,
            background: 'var(--bg-tint)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <DraftField label="종목">
              <select
                value={draft.ticker}
                onChange={(e) => setDraft({ ...draft, ticker: e.target.value })}
                style={selectStyle}
              >
                <option value="">— 종목 선택 —</option>
                {sortedTickers.map((s) => (
                  <option key={s.ticker} value={s.ticker}>
                    {s.name} ({s.ticker})
                  </option>
                ))}
              </select>
            </DraftField>
            <DraftField label="조건">
              <select
                value={draft.kind}
                onChange={(e) =>
                  setDraft({ ...draft, kind: e.target.value as AlertRuleKind })
                }
                style={selectStyle}
              >
                {ALERT_RULE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ALERT_RULE_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </DraftField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <DraftField label={`임계값 (${ALERT_RULE_KIND_SUFFIX[draft.kind]})`}>
              <input
                type="number"
                value={draft.threshold}
                step="any"
                onChange={(e) =>
                  setDraft({ ...draft, threshold: e.target.value })
                }
                style={inputStyle}
              />
            </DraftField>
            <DraftField label="중복 방지 (분)">
              <input
                type="number"
                value={draft.cooldownMinutes}
                step="0.5"
                min="0"
                onChange={(e) =>
                  setDraft({ ...draft, cooldownMinutes: e.target.value })
                }
                style={inputStyle}
              />
            </DraftField>
          </div>
          {error !== null && (
            <div style={{ fontSize: 11, color: 'var(--kr-up)' }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                cursor: 'pointer',
              }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={draft.ticker === ''}
              style={{
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 700,
                background:
                  draft.ticker === ''
                    ? 'var(--text-inactive)'
                    : 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                cursor: draft.ticker === '' ? 'not-allowed' : 'pointer',
              }}
            >
              추가
            </button>
          </div>
        </div>
      )}

      {rules.length === 0 && !adding ? (
        <div
          style={{
            padding: '40px 14px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 8 }}>◔</div>
          종목별 가격·등락률·거래량 기반 알림 룰을
          <br />
          추가해 보세요
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rules.map((r) => {
            const meta = catalog[r.ticker];
            return (
              <div
                key={r.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'var(--bg-tint)',
                  border: '1px solid var(--border)',
                  opacity: r.enabled ? 1 : 0.55,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleRule(r.id)}
                  aria-pressed={r.enabled}
                  style={{
                    width: 32,
                    height: 18,
                    borderRadius: 9,
                    background: r.enabled ? 'var(--accent)' : 'var(--text-inactive)',
                    border: 'none',
                    position: 'relative',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: r.enabled ? 16 : 2,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 150ms ease',
                    }}
                  />
                </button>
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {meta?.name ?? r.ticker}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      marginTop: 1,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {r.ticker} · {ALERT_RULE_KIND_LABEL[r.kind]}{' '}
                    {Number(r.threshold).toLocaleString('ko-KR')}
                    {ALERT_RULE_KIND_SUFFIX[r.kind]} · cooldown{' '}
                    {(r.cooldownMs / 60_000).toFixed(1)}분
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeRule(r.id)}
                  title="룰 삭제"
                  aria-label="룰 삭제"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

interface DraftFieldProps {
  label: string;
  children: React.ReactNode;
}

function DraftField({ label, children }: DraftFieldProps) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-secondary)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

const selectStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontVariantNumeric: 'tabular-nums',
};
