/**
 * SettingsModal — five-tab settings dialog.
 *
 *   [연결] — readonly KIS runtime status (no credential values shown).
 *   [알림] — user-facing notification delivery settings.
 *   [차트] — chart color and candle data display settings.
 *   [급상승] — dashboard surge list/filter settings.
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

import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
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
  type SurgeMarketCapFilter,
} from '../stores/settings-store';
import { useStocksStore } from '../stores/stocks-store';
import { Field, Slider, Toggle } from './ui/SettingsControls';
import { ensureAudioUnlocked, playBleep } from '../lib/sound';
import {
  ApiError,
  addCredentialProfile,
  cancelTossLogin,
  clearTossSession,
  disableRealtimeSession,
  emergencyDisableRealtime,
  enableRealtimeSession,
  exportLocalBackup,
  getTossAuthStatus,
  getTossLoginStatus,
  getTossSseStatus,
  getFavorites,
  getCredentialProfiles,
  getPhoneNotificationStatus,
  getRealtimeStatus,
  getRuntimeDataHealth,
  getServerSettings,
  getStocks,
  getThemesWithStocks,
  importKisWatchlist,
  restoreLocalBackup,
  sendPhoneNotificationTest,
  startTossLogin,
  startTossSse,
  stopTossSse,
  updateServerSettings,
  type KisWatchlistImportResult,
  type RealtimeStatusPayload,
  type RuntimeDataHealthPayload,
  type ServerRuntimeSettings,
  type CredentialProfileSummary,
  type PhoneNotificationStatusPayload,
  type TossLoginStatusPayload,
  type TossSessionStatusPayload,
  type TossSseStatusPayload,
} from '../lib/api-client';
import {
  REALTIME_ADVANCED_RECHECK_LABEL,
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
import { useAlertDeliveryStore } from '../stores/alert-delivery-store';
import { AlertDeliveryLogPanel } from './AlertDeliveryLogPanel';

type TopMoversMarketUniverse =
  NonNullable<RuntimeDataHealthPayload['marketTopMovers']['coverage']>['marketUniverse'];

const IS_DEV_BUILD =
  (import.meta as ImportMeta & { env: { DEV?: boolean } }).env.DEV === true;

const TABS = ['연결', '알림', '차트', '급상승', '룰'] as const;
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
          {tab === '차트' && <ChartSettingsTab />}
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

type TossOperatorPhase =
  | { kind: 'idle' }
  | {
      kind: 'running';
      action:
        | 'login'
        | 'cancel-login'
        | 'clear-session'
        | 'start-realtime'
        | 'stop-realtime';
    }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

type ServerSettingsPhase =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

type BackupPhase =
  | { kind: 'idle' }
  | { kind: 'running'; action: 'export' | 'restore' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

type ProfilePhase =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

function ConnectionTab() {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatusPayload | null>(null);
  const [tossSession, setTossSession] =
    useState<TossSessionStatusPayload | null>(null);
  const [tossLogin, setTossLogin] =
    useState<TossLoginStatusPayload | null>(null);
  const [tossRealtime, setTossRealtime] =
    useState<TossSseStatusPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importPhase, setImportPhase] = useState<ImportPhase>({ kind: 'idle' });
  const [operatorPhase, setOperatorPhase] =
    useState<RealtimeOperatorPhase>({ kind: 'idle' });
  const [tossPhase, setTossPhase] = useState<TossOperatorPhase>({ kind: 'idle' });
  const [serverSettings, setServerSettings] =
    useState<ServerRuntimeSettings | null>(null);
  const [dataHealth, setDataHealth] = useState<RuntimeDataHealthPayload | null>(null);
  const [serverSettingsPhase, setServerSettingsPhase] =
    useState<ServerSettingsPhase>({ kind: 'idle' });
  const [backupPhase, setBackupPhase] =
    useState<BackupPhase>({ kind: 'idle' });
  const [credentialProfiles, setCredentialProfiles] =
    useState<CredentialProfileSummary[]>([]);
  const [profilePhase, setProfilePhase] = useState<ProfilePhase>({ kind: 'idle' });
  const [profileLabel, setProfileLabel] = useState('');
  const [profileAppKey, setProfileAppKey] = useState('');
  const [profileAppSecret, setProfileAppSecret] = useState('');
  const [selectedCap, setSelectedCap] = useState<SessionRealtimeCap>(1);
  const [operatorConfirmed, setOperatorConfirmed] = useState(false);

  const clientSettings = useSettingsStore((s) => s.settings);
  const updateClientSettings = useSettingsStore((s) => s.update);
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

  async function handleBackupExport(): Promise<void> {
    setBackupPhase({ kind: 'running', action: 'export' });
    try {
      const backup = await exportLocalBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `araon-local-backup-${backup.exportedAt.slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setBackupPhase({
        kind: 'success',
        message: `백업 파일을 만들었습니다 · ${backup.stocks.length}종목`,
      });
    } catch (err) {
      setBackupPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleBackupRestore(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';
    if (file === null) return;
    setBackupPhase({ kind: 'running', action: 'restore' });
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const result = await restoreLocalBackup(
        parsed as Parameters<typeof restoreLocalBackup>[0],
      );
      await reloadCatalog();
      setBackupPhase({
        kind: 'success',
        message: `복원 완료 · ${result.stocks}종목 / ${result.favorites}즐겨찾기`,
      });
    } catch (err) {
      setBackupPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleAddCredentialProfile(): Promise<void> {
    setProfilePhase({ kind: 'saving' });
    try {
      const profile = await addCredentialProfile({
        label: profileLabel,
        appKey: profileAppKey,
        appSecret: profileAppSecret,
      });
      setCredentialProfiles(await getCredentialProfiles());
      setProfileLabel('');
      setProfileAppKey('');
      setProfileAppSecret('');
      setProfilePhase({
        kind: 'success',
        message: `${profile.label} 프로필을 추가했습니다`,
      });
    } catch (err) {
      setProfilePhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function reloadRealtimeStatus(): Promise<void> {
    setRealtimeStatus(await getRealtimeStatus());
  }

  async function reloadTossStatus(): Promise<void> {
    const [session, login, realtime] = await Promise.all([
      getTossAuthStatus(),
      getTossLoginStatus(),
      getTossSseStatus(),
    ]);
    setTossSession(session);
    setTossLogin(login);
    setTossRealtime(realtime);
  }

  async function handleTossLoginStart(): Promise<void> {
    setTossPhase({ kind: 'running', action: 'login' });
    try {
      setTossLogin(await startTossLogin());
      setTossSession(await getTossAuthStatus());
      setTossPhase({
        kind: 'success',
        message: '토스 QR 로그인 창을 열었습니다',
      });
    } catch (err) {
      setTossPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleTossLoginCancel(): Promise<void> {
    setTossPhase({ kind: 'running', action: 'cancel-login' });
    try {
      setTossLogin(await cancelTossLogin());
      setTossPhase({
        kind: 'success',
        message: '토스 로그인 캡처를 취소했습니다',
      });
    } catch (err) {
      setTossPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleTossSessionClear(): Promise<void> {
    setTossPhase({ kind: 'running', action: 'clear-session' });
    try {
      await stopTossSse().catch(() => null);
      setTossSession(await clearTossSession());
      setTossRealtime(await getTossSseStatus());
      setTossPhase({
        kind: 'success',
        message: '토스 세션을 삭제했습니다',
      });
    } catch (err) {
      setTossPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleTossRealtimeStart(): Promise<void> {
    setTossPhase({ kind: 'running', action: 'start-realtime' });
    try {
      setTossRealtime(await startTossSse());
      setTossPhase({
        kind: 'success',
        message: '토스 SSE 알림 연결을 시작했습니다',
      });
    } catch (err) {
      setTossPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleTossRealtimeStop(): Promise<void> {
    setTossPhase({ kind: 'running', action: 'stop-realtime' });
    try {
      setTossRealtime(await stopTossSse());
      setTossPhase({
        kind: 'success',
        message: '토스 SSE 알림 연결을 중지했습니다',
      });
    } catch (err) {
      setTossPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function saveServerSettings(
    patch: Partial<ServerRuntimeSettings>,
    message = '운영 설정을 저장했습니다',
  ): Promise<void> {
    if (serverSettings === null) return;
    const next = { ...serverSettings, ...patch };
    setServerSettingsPhase({ kind: 'saving' });
    try {
      const saved = await updateServerSettings(next);
      setServerSettings(saved);
      setServerSettingsPhase({
        kind: 'success',
        message,
      });
    } catch (err) {
      setServerSettingsPhase({
        kind: 'error',
        message: operatorErrorMessage(err),
      });
    }
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

  useEffect(() => {
    if (!isTossLoginRunning(tossLogin?.state) && !isTossRealtimeRunning(tossRealtime?.state)) return;
    const id = window.setInterval(() => {
      void reloadTossStatus().catch((err) => {
        setTossPhase({ kind: 'error', message: operatorErrorMessage(err) });
      });
    }, 3_000);
    return () => window.clearInterval(id);
  }, [tossLogin?.state, tossRealtime?.state]);

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

  async function handleRealtimeEmergencyDisable(): Promise<void> {
    setOperatorPhase({ kind: 'running', action: 'disable' });
    try {
      await emergencyDisableRealtime();
      const [realtime, settings] = await Promise.all([
        getRealtimeStatus(),
        getServerSettings(),
      ]);
      setRealtimeStatus(realtime);
      setServerSettings(settings);
      setOperatorPhase({
        kind: 'success',
        message: '통합 실시간 시세를 비상정지했습니다. REST 폴링은 계속 유지됩니다.',
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
        const [realtime, settings, health, tossSessionStatus, tossLoginStatus, tossRealtimeStatus] = await Promise.all([
          getRealtimeStatus(),
          getServerSettings(),
          getRuntimeDataHealth(),
          getTossAuthStatus(),
          getTossLoginStatus(),
          getTossSseStatus(),
        ]);
        const profiles = await getCredentialProfiles().catch(() => []);
        if (!cancelled) {
          setRealtimeStatus(realtime);
          setServerSettings(settings);
          setDataHealth(health);
          setTossSession(tossSessionStatus);
          setTossLogin(tossLoginStatus);
          setTossRealtime(tossRealtimeStatus);
          setCredentialProfiles(profiles);
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
        operatorDiagnosticsEnabled={IS_DEV_BUILD && clientSettings.devModeEnabled}
        onCapChange={setSelectedCap}
        onConfirmChange={setOperatorConfirmed}
        onEnable={() => void handleSessionEnable()}
        onDisable={() => void handleSessionDisable()}
        onEmergencyDisable={() => void handleRealtimeEmergencyDisable()}
      />
      <TossDataControl
        session={tossSession}
        login={tossLogin}
        realtime={tossRealtime}
        phase={tossPhase}
        onLoginStart={() => void handleTossLoginStart()}
        onLoginCancel={() => void handleTossLoginCancel()}
        onSessionClear={() => void handleTossSessionClear()}
        onRealtimeStart={() => void handleTossRealtimeStart()}
        onRealtimeStop={() => void handleTossRealtimeStop()}
      />
      {IS_DEV_BUILD && (
        <DevModeControl
          enabled={clientSettings.devModeEnabled}
          onChange={(enabled) => updateClientSettings({ devModeEnabled: enabled })}
        />
      )}
      <BackgroundBackfillControl
        settings={serverSettings}
        phase={serverSettingsPhase}
        runtimeStarted={status.runtime === 'started'}
        onEmergencyDisable={() => {
          void saveServerSettings(
            { backgroundDailyBackfillEnabled: false },
            '과거 일봉 자동 보강을 비상정지했습니다',
          );
        }}
      />
      <CredentialProfilesPanel
        configured={status.configured}
        profiles={credentialProfiles}
        phase={profilePhase}
        label={profileLabel}
        appKey={profileAppKey}
        appSecret={profileAppSecret}
        onLabelChange={setProfileLabel}
        onAppKeyChange={setProfileAppKey}
        onAppSecretChange={setProfileAppSecret}
        onAdd={() => void handleAddCredentialProfile()}
      />
      <DataHealthPanel health={dataHealth} />
      <LocalBackupPanel
        phase={backupPhase}
        onExport={() => void handleBackupExport()}
        onRestore={(event) => void handleBackupRestore(event)}
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
        첫 KIS 키는 온보딩에서 등록하고, 추가 키는 이 화면에서 프로필로 더할 수 있습니다.
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

export function RealtimeSessionControl({
  status,
  selectedCap,
  confirmed,
  phase,
  runtimeStarted,
  operatorDiagnosticsEnabled = false,
  onCapChange,
  onConfirmChange,
  onEnable,
  onDisable,
  onEmergencyDisable,
}: {
  status: RealtimeStatusPayload | null;
  selectedCap: SessionRealtimeCap;
  confirmed: boolean;
  phase: RealtimeOperatorPhase;
  runtimeStarted: boolean;
  operatorDiagnosticsEnabled?: boolean;
  onCapChange: (cap: SessionRealtimeCap) => void;
  onConfirmChange: (confirmed: boolean) => void;
  onEnable: () => void;
  onDisable: () => void;
  onEmergencyDisable: () => void;
}) {
  const busy = phase.kind === 'running';
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
          자동 운영
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        실시간 시세는 장중 통합 feed, 장전/장후 NXT feed로 자동 전환됩니다.
        <br />
        최대 40종목까지 실시간으로 받고 REST 폴링 fallback은 항상 유지됩니다.
        <br />
        일반 설정을 켤 필요 없이 Araon이 favorites와 추적 종목을 관리합니다.
        <br />
        raw key / account / secret 정보는 표시하지 않습니다.
      </div>
      {status?.coverage !== undefined && (
        <div
          data-testid="realtime-coverage-summary"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginTop: 12,
          }}
        >
          <Row
            k="프로필"
            v={`${status.coverage.enabledProfileCount}/${status.coverage.profileCount}`}
            chipColor="var(--text-muted)"
          />
          <Row
            k="커버리지"
            v={`${status.coverage.assignedTickerCount}/${status.coverage.totalCapacity} 후보`}
            chipColor="var(--gold-text)"
          />
          <Row
            k="활성 세션"
            v={`${status.coverage.activeSessionCount}개`}
            chipColor={status.coverage.activeSessionCount > 0 ? 'var(--kr-up)' : 'var(--text-muted)'}
          />
          <Row
            k="REST fallback"
            v={`${status.coverage.fallbackTickerCount}종목`}
            chipColor="var(--text-muted)"
          />
        </div>
      )}
      <button
        type="button"
        onClick={onEmergencyDisable}
        disabled={busy}
        data-testid="realtime-emergency-disable"
        style={{
          marginTop: 12,
          padding: '8px 10px',
          borderRadius: 7,
          border: '1px solid rgba(246, 70, 93, 0.45)',
          background: 'var(--bg-card)',
          color: 'var(--kr-down)',
          fontFamily: 'inherit',
          fontSize: 12,
          fontWeight: 800,
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        {phase.kind === 'running' && phase.action === 'disable'
          ? '비상정지 중…'
          : '실시간 비상정지'}
      </button>
      {operatorDiagnosticsEnabled && (
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          data-testid="realtime-advanced-toggle"
          style={{
            marginTop: 12,
            width: '100%',
            padding: '8px 10px',
            borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            fontFamily: 'inherit',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {REALTIME_ADVANCED_RECHECK_LABEL} {advancedOpen ? '닫기' : '열기'}
        </button>
      )}
      {operatorDiagnosticsEnabled && advancedOpen && (
        <div data-testid="realtime-advanced-panel">
          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              color: 'var(--text-muted)',
              lineHeight: 1.6,
            }}
          >
            아래 cap 선택은 운영자 재검증용입니다. 시간 또는 tick 제한에
            도달하면 자동으로 정리됩니다.
            <br />
            검증 완료: 1 / 3 / 5 / 10 / 20 / 40종목.
            <br />
            {getRealtimeCapVerificationDescription(40)}
            <br />
            20종목 상태: {cap20Label}. {cap20Preview}.
            <br />
            40종목까지 controlled live smoke는 완료됐지만, 40종목 초과 구독은 허용하지 않습니다.
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
            이 세션에서만 운영자 재검증을 실행합니다
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
      )}
    </div>
  );
}

export function TossDataControl({
  session,
  login,
  realtime,
  phase,
  onLoginStart,
  onLoginCancel,
  onSessionClear,
  onRealtimeStart,
  onRealtimeStop,
}: {
  session: TossSessionStatusPayload | null;
  login: TossLoginStatusPayload | null;
  realtime: TossSseStatusPayload | null;
  phase: TossOperatorPhase;
  onLoginStart: () => void;
  onLoginCancel: () => void;
  onSessionClear: () => void;
  onRealtimeStart: () => void;
  onRealtimeStop: () => void;
}) {
  const busy = phase.kind === 'running';
  const loginRunning = isTossLoginRunning(login?.state);
  const realtimeRunning = isTossRealtimeRunning(realtime?.state);
  const sessionReady =
    session?.configured === true &&
    session.state !== 'expired' &&
    session.state !== 'logged_out';
  return (
    <div
      data-testid="toss-data-control"
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
          토스 데이터 연결
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
          Toss-first
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        TOP100과 foreground quote는 토스 공개 데이터를 먼저 사용합니다.
        <br />
        로그인 세션은 알림 SSE 확인용이며 가격 갱신은 quote REST와 함께 처리됩니다.
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
          marginTop: 12,
        }}
      >
        <Row
          k="세션"
          v={tossSessionLabel(session)}
          chipColor={tossSessionColor(session)}
        />
        <Row
          k="로그인"
          v={tossLoginLabel(login)}
          chipColor={loginRunning ? 'var(--gold-text)' : 'var(--text-muted)'}
        />
        <Row
          k="SSE 알림"
          v={tossRealtimeLabel(realtime)}
          chipColor={realtimeRunning ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
        <Row
          k="수신 이벤트"
          v={`${realtime?.eventCount ?? 0}개`}
          chipColor={(realtime?.eventCount ?? 0) > 0 ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
        <Row
          k="가격 refresh"
          v={`${realtime?.priceRefreshEventCount ?? 0}개`}
          chipColor={(realtime?.priceRefreshEventCount ?? 0) > 0 ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        세션 만료: {formatMaybeLocal(session?.expiresAt ?? null)}
        <br />
        최근 SSE: {formatMaybeLocal(realtime?.lastEventAt ?? null)}
        <br />
        이벤트 종류: {formatTossRealtimeEventTypes(realtime?.eventTypes ?? [])}
        {realtime?.thinNotificationOnly === true && <> · thin notification</>}
        {realtime?.lastError !== null && realtime?.lastError !== undefined && (
          <>
            <br />
            SSE 상태: {realtime.lastError}
          </>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={onLoginStart}
          disabled={busy || loginRunning}
          data-testid="toss-login-start"
          style={operatorButtonStyle(!busy && !loginRunning)}
        >
          {phase.kind === 'running' && phase.action === 'login' ? '여는 중…' : 'QR 로그인'}
        </button>
        <button
          type="button"
          onClick={onLoginCancel}
          disabled={busy || !loginRunning}
          data-testid="toss-login-cancel"
          style={operatorButtonStyle(!busy && loginRunning)}
        >
          로그인 취소
        </button>
        <button
          type="button"
          onClick={onRealtimeStart}
          disabled={busy || !sessionReady || realtimeRunning}
          data-testid="toss-realtime-start"
          style={operatorButtonStyle(!busy && sessionReady && !realtimeRunning)}
        >
          {phase.kind === 'running' && phase.action === 'start-realtime'
            ? '연결 중…'
            : 'SSE 시작'}
        </button>
        <button
          type="button"
          onClick={onRealtimeStop}
          disabled={busy || !realtimeRunning}
          data-testid="toss-realtime-stop"
          style={operatorButtonStyle(!busy && realtimeRunning)}
        >
          SSE 중지
        </button>
      </div>
      <button
        type="button"
        onClick={onSessionClear}
        disabled={busy || session?.configured !== true}
        data-testid="toss-session-clear"
        style={{
          ...operatorButtonStyle(!busy && session?.configured === true),
          width: '100%',
          marginTop: 8,
        }}
      >
        {phase.kind === 'running' && phase.action === 'clear-session'
          ? '삭제 중…'
          : '토스 세션 삭제'}
      </button>
      {phase.kind === 'success' && (
        <div style={operatorMessageStyle('var(--up-tint-1)')}>{phase.message}</div>
      )}
      {phase.kind === 'error' && (
        <div style={operatorMessageStyle('var(--accent-soft)')}>{phase.message}</div>
      )}
    </div>
  );
}

export function DevModeControl({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div
      data-testid="dev-mode-control"
      style={{
        marginTop: 18,
        padding: '12px 14px',
        background: 'var(--bg-tint)',
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
        개발 모드
      </div>
      <div style={{ marginTop: 8 }}>
        <Toggle
          value={enabled}
          onChange={onChange}
          label={enabled ? '개발 도구 표시 중' : '개발 도구 숨김'}
        />
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        켜면 Simulated Market과 운영자 재검증 도구가 표시됩니다. 실제 KIS 호출을 만들지 않는 화면 검증용 도구입니다.
      </div>
    </div>
  );
}

export function CredentialProfilesPanel({
  configured,
  profiles,
  phase,
  label,
  appKey,
  appSecret,
  onLabelChange,
  onAppKeyChange,
  onAppSecretChange,
  onAdd,
}: {
  configured: boolean;
  profiles: readonly CredentialProfileSummary[];
  phase: ProfilePhase;
  label: string;
  appKey: string;
  appSecret: string;
  onLabelChange: (value: string) => void;
  onAppKeyChange: (value: string) => void;
  onAppSecretChange: (value: string) => void;
  onAdd: () => void;
}) {
  const canSubmit =
    configured &&
    phase.kind !== 'saving' &&
    label.trim().length > 0 &&
    appKey.trim().length >= 10 &&
    appSecret.trim().length >= 10;
  return (
    <div
      data-testid="credential-profiles-panel"
      style={{
        marginTop: 18,
        padding: '12px 14px',
        background: 'var(--bg-tint)',
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
        KIS API 프로필
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        온보딩에서 등록한 첫 키가 primary입니다. 추가 키는 여기서 저장해두고,
        실시간 coverage allocator가 사용할 수 있는 프로필로 관리합니다.
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
        {profiles.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            등록된 프로필이 없습니다.
          </div>
        ) : (
          profiles.map((profile) => (
            <div
              key={profile.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '7px 9px',
                borderRadius: 7,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-soft)',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
                {profile.label}
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)' }}>
                {profile.enabled ? 'enabled' : 'disabled'} · {profile.isPaper ? 'paper' : 'live'}
              </span>
            </div>
          ))
        )}
      </div>
      <div
        style={{
          marginTop: 12,
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 8,
        }}
      >
        <input
          value={label}
          onChange={(event) => onLabelChange(event.currentTarget.value)}
          placeholder="프로필 이름 예: KIS 2"
          disabled={!configured}
          data-testid="credential-profile-label"
          style={credentialInputStyle}
        />
        <input
          value={appKey}
          onChange={(event) => onAppKeyChange(event.currentTarget.value)}
          placeholder="App Key"
          disabled={!configured}
          data-testid="credential-profile-app-key"
          style={credentialInputStyle}
        />
        <input
          value={appSecret}
          onChange={(event) => onAppSecretChange(event.currentTarget.value)}
          placeholder="App Secret"
          type="password"
          disabled={!configured}
          data-testid="credential-profile-app-secret"
          style={credentialInputStyle}
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!canSubmit}
          data-testid="credential-profile-add"
          style={operatorButtonStyle(canSubmit)}
        >
          {phase.kind === 'saving' ? '저장 중…' : '프로필 추가'}
        </button>
      </div>
      {phase.kind === 'success' && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--kr-up)' }}>
          {phase.message}
        </div>
      )}
      {phase.kind === 'error' && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--kr-down)' }}>
          저장 실패: {phase.message}
        </div>
      )}
    </div>
  );
}

export function BackgroundBackfillControl({
  settings,
  phase,
  runtimeStarted,
  onEmergencyDisable,
}: {
  settings: ServerRuntimeSettings | null;
  phase: ServerSettingsPhase;
  runtimeStarted: boolean;
  onEmergencyDisable: () => void;
}) {
  const saving = phase.kind === 'saving';
  const enabled = settings?.backgroundDailyBackfillEnabled === true;
  const range = settings?.backgroundDailyBackfillRange ?? '3m';
  return (
    <div
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
          fontSize: 13,
          fontWeight: 800,
          color: 'var(--text-primary)',
          marginBottom: 8,
        }}
      >
        과거 일봉 자동 보강
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        credentials 등록 후 자동 운영됩니다. 장후/주말에만 favorites와 추적 종목을 낮은 속도로 보강합니다.
        <br />
        장중 07:55~20:05에는 서버 정책으로 자동 실행되지 않습니다.
      </div>
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginTop: 12,
        }}
      >
        <span style={{ fontSize: 11, color: enabled ? 'var(--kr-up)' : 'var(--kr-down)', fontWeight: 800 }}>
          {enabled ? `자동 운영 · ${range}` : '비상정지됨'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {runtimeStarted
            ? 'KIS 런타임 준비됨'
            : 'KIS 런타임 시작 후 실행 가능'}
        </span>
        <button
          type="button"
          onClick={onEmergencyDisable}
          disabled={settings === null || saving || !enabled}
          data-testid="backfill-emergency-disable"
          style={operatorButtonStyle(settings !== null && !saving && enabled)}
        >
          {saving ? '저장 중…' : '일봉 보강 비상정지'}
        </button>
      </div>
      {phase.kind === 'success' && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--kr-up)' }}>
          {phase.message}
        </div>
      )}
      {phase.kind === 'error' && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--kr-down)' }}>
          저장 실패: {phase.message}
        </div>
      )}
    </div>
  );
}

export function DataHealthPanel({ health }: { health: RuntimeDataHealthPayload | null }) {
  const oneMinute = health?.candles.find((row) => row.interval === '1m') ?? null;
  const daily = health?.candles.find((row) => row.interval === '1d') ?? null;
  const kisLimiterSummary = health !== null
    ? formatKisLimiterSummary(health.kisOutboundLimiter)
    : null;
  const topMoversSummary = health !== null
    ? formatMarketTopMoversSummary(health.marketTopMovers)
    : null;
  const tossQuoteSummary = health !== null
    ? formatTossQuotePollingSummary(health.tossQuotePolling)
    : null;
  return (
    <div
      data-testid="data-health-panel"
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
          fontSize: 13,
          fontWeight: 800,
          color: 'var(--text-primary)',
          marginBottom: 8,
        }}
      >
        데이터 건강 상태
      </div>
      {health === null ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          저장소 상태를 불러오는 중입니다.
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            <Row
              k="추적 / 즐겨찾기"
              v={`${health.tracking.trackedCount} / ${health.tracking.favoriteCount}`}
              chipColor="var(--text-muted)"
            />
            <Row
              k="일봉 보강"
              v={
                health.backfill.enabled
                  ? health.backfill.running
                    ? `실행 중 · ${health.backfill.range}`
                    : `자동 · ${health.backfill.range}`
                  : '비상정지'
              }
              chipColor={
                health.backfill.enabled
                  ? health.backfill.running
                    ? 'var(--kr-up)'
                    : 'var(--text-muted)'
                  : 'var(--kr-down)'
              }
            />
            <Row
              k="1분봉 coverage"
              v={`${oneMinute?.tickerCount ?? 0}종목 · ${oneMinute?.candleCount ?? 0}개`}
              chipColor="var(--text-muted)"
            />
            <Row
              k="일봉 coverage"
              v={`${daily?.tickerCount ?? 0}종목 · ${daily?.candleCount ?? 0}개`}
              chipColor="var(--text-muted)"
            />
            <Row
              k="오늘 백필 호출"
              v={`${health.backfill.dailyCallCount}회`}
              chipColor={health.backfill.cooldownActive ? 'var(--gold-text)' : 'var(--text-muted)'}
            />
            <Row
              k="KIS 요청 제한"
              v={kisLimiterSummary?.label ?? '대기'}
              chipColor={kisLimiterSummary?.chipColor ?? 'var(--text-muted)'}
            />
            <Row
              k="Toss 가격 갱신"
              v={tossQuoteSummary?.label ?? '대기'}
              chipColor={tossQuoteSummary?.chipColor ?? 'var(--text-muted)'}
            />
            <Row
              k="TOP100 보장"
              v={topMoversSummary?.label ?? '대기'}
              chipColor={topMoversSummary?.chipColor ?? 'var(--text-muted)'}
            />
            <Row
              k="보강 대기 제외"
              v={`${health.backfill.noWorkCooldownCount}종목`}
              chipColor={health.backfill.noWorkCooldownCount > 0 ? 'var(--gold-text)' : 'var(--text-muted)'}
            />
            <Row
              k="거래량 기준선"
              v={`${health.volumeBaseline.ready}/${health.volumeBaseline.total} 준비`}
              chipColor={health.volumeBaseline.ready > 0 ? 'var(--kr-up)' : 'var(--text-muted)'}
            />
            <Row
              k="신호 기록"
              v={`${health.growth.signals.eventCount}개 · ${health.growth.signals.retentionDays}일 보관`}
              chipColor="var(--text-muted)"
            />
            <Row
              k="자동 복기"
              v={`${health.signalOutcomes.evaluatedSignals}/${health.signalOutcomes.totalSignals} 평가`}
              chipColor={health.signalOutcomes.evaluatedSignals > 0 ? 'var(--kr-up)' : 'var(--text-muted)'}
            />
            <Row
              k="뉴스 캐시"
              v={`${health.growth.news.itemCount}개 · stale ${health.growth.news.staleItemCount}개`}
              chipColor={health.growth.news.staleItemCount > 0 ? 'var(--kr-down)' : 'var(--text-muted)'}
            />
            <Row
              k="공시 캐시"
              v={`${health.growth.disclosures.itemCount}개 · stale ${health.growth.disclosures.staleItemCount}개`}
              chipColor={health.growth.disclosures.staleItemCount > 0 ? 'var(--gold-text)' : 'var(--text-muted)'}
            />
            <Row
              k="폰 알림"
              v={
                health.notifications.phoneConfigured
                  ? `${health.notifications.phoneSentCount}/${health.notifications.phoneDeliveryCount} 전송`
                  : '미설정'
              }
              chipColor={
                health.notifications.phoneFailedCount > 0
                  ? 'var(--kr-down)'
                  : health.notifications.phoneConfigured
                    ? 'var(--kr-up)'
                    : 'var(--text-muted)'
              }
            />
            <Row
              k="candle 정리"
              v={health.maintenance.candlePruneLastError ?? formatMaybeLocal(health.maintenance.candlePruneLastRunAt)}
              chipColor={health.maintenance.candlePruneLastError === null ? 'var(--text-muted)' : 'var(--kr-down)'}
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            최신 1분봉: {formatMaybeLocal(oneMinute?.newestBucketAt ?? null)} · 최신 일봉:{' '}
            {formatMaybeLocal(daily?.newestBucketAt ?? null)}
            <br />
            KIS REST: {formatKisBudgetDetails(health.kisOutboundLimiter)}
            <br />
            Toss 가격: {formatTossQuotePollingDetails(health.tossQuotePolling)}
            {health.backfill.lastSkippedReason !== null && (
              <>
                <br />
                최근 일봉 보강 상태: {backfillSkippedReasonLabel(health.backfill.lastSkippedReason)}
              </>
            )}
            {health.backfill.cooldownActive && health.backfill.cooldownUntil !== null && (
              <>
                <br />
                백필 쿨다운: {formatLocal(health.backfill.cooldownUntil)}까지
              </>
            )}
            {health.backfill.noWorkCooldownCount > 0 && health.backfill.nextNoWorkRetryAt !== null && (
              <>
                <br />
                새 데이터 없음 대기: {health.backfill.noWorkCooldownCount}종목 · 다음 재확인{' '}
                {formatLocal(health.backfill.nextNoWorkRetryAt)}
              </>
            )}
            {health.backfill.recent.length > 0 && (
              <>
                <br />
                최근 보강: {formatBackfillRecent(health.backfill.recent)}
              </>
            )}
            {health.marketTopMovers.lastFetchedAt !== null && (
              <>
                <br />
                TOP100 갱신: {formatLocal(health.marketTopMovers.lastFetchedAt)}
              </>
            )}
            {hasText(health.marketTopMovers.sourceLabel) && (
              <>
                <br />
                TOP100 소스: {health.marketTopMovers.sourceLabel}
                {hasText(health.marketTopMovers.partialReason) && (
                  <>
                    {' '}
                    ·{' '}
                    {topMoversPartialReasonLabel(
                      health.marketTopMovers.partialReason,
                      health.marketTopMovers.coverage?.marketUniverse,
                    )}
                  </>
                )}
                {hasText(health.marketTopMovers.stopReason) && (
                  <>
                    {' '}
                    · 원인{' '}
                    {topMoversStopReasonLabel(
                      health.marketTopMovers.stopReason,
                      health.marketTopMovers.coverage?.marketUniverse,
                    )}
                  </>
                )}
                {health.marketTopMovers.rankingRateLimited && <> · KIS 호출 제한</>}
                {health.marketTopMovers.lastGoodAgeMs !== null && (
                  <> · 직전 {formatDurationLabel(health.marketTopMovers.lastGoodAgeMs)}</>
                )}
              </>
            )}
            {health.signalOutcomes.totalSignals > 0 && (
              <>
                <br />
                자동 복기: {formatSignalOutcomeSummary(health.signalOutcomes)}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function formatTossQuotePollingSummary(
  polling: RuntimeDataHealthPayload['tossQuotePolling'],
): { label: string; chipColor: string } {
  if (!polling.configured) {
    return { label: '미구성', chipColor: 'var(--text-muted)' };
  }
  if (!polling.enabled) {
    return { label: '꺼짐', chipColor: 'var(--text-muted)' };
  }
  if (polling.consecutiveFailureCount >= 2) {
    return { label: 'KIS fallback', chipColor: 'var(--gold-text)' };
  }
  if (polling.lastErrorCode !== null) {
    return { label: '복구 대기', chipColor: 'var(--gold-text)' };
  }
  if (!polling.running) {
    return { label: '대기', chipColor: 'var(--text-muted)' };
  }
  if (polling.missingCount > 0) {
    return {
      label: `${polling.returnedCount}/${polling.tickersInCycle} 수신`,
      chipColor: 'var(--gold-text)',
    };
  }
  if (polling.cycleCount === 0) {
    return { label: '시작 대기', chipColor: 'var(--text-muted)' };
  }
  return {
    label: `${polling.returnedCount}/${polling.tickersInCycle} 수신`,
    chipColor: 'var(--kr-up)',
  };
}

function formatTossQuotePollingDetails(
  polling: RuntimeDataHealthPayload['tossQuotePolling'],
): string {
  if (!polling.configured) return '미구성';
  const interval = polling.intervalMs !== null
    ? `${(polling.intervalMs / 1000).toFixed(1)}초 간격`
    : '간격 미정';
  const fallback = polling.suppressingKisPolling ? 'KIS polling 억제' : 'KIS fallback 허용';
  return [
    polling.enabled ? '켜짐' : '꺼짐',
    polling.running ? '실행 중' : '대기',
    interval,
    `${polling.returnedCount}/${polling.tickersInCycle} 수신`,
    polling.missingCount > 0 ? `누락 ${polling.missingCount}` : null,
    polling.errorCount > 0 ? `실패 ${polling.errorCount}` : null,
    fallback,
  ].filter((item): item is string => item !== null).join(' · ');
}

function formatKisLimiterSummary(
  limiter: RuntimeDataHealthPayload['kisOutboundLimiter'],
): { label: string; chipColor: string } {
  if (!limiter.configured) {
    return { label: '미시작', chipColor: 'var(--text-muted)' };
  }
  const budget = limiter.budget ?? defaultKisBudgetPayload();
  if (budget.riskState !== 'idle') {
    return {
      label: budget.riskReason !== null
        ? `${budget.riskLabel} · ${budget.riskReason}`
        : budget.riskLabel,
      chipColor: kisBudgetChipColor(budget.riskState),
    };
  }
  const activeCooldowns = limiter.profiles.filter((profile) => profile.cooldownActive);
  if (activeCooldowns.length > 0) {
    return { label: `쿨다운 ${activeCooldowns.length}개`, chipColor: 'var(--gold-text)' };
  }
  if (limiter.queueDepth > 0) {
    return { label: `대기 ${limiter.queueDepth}개`, chipColor: 'var(--gold-text)' };
  }
  const latestRecovery = latestObservedRecoveryMs(limiter);
  if (latestRecovery !== null) {
    return {
      label: `최근 회복 ${(latestRecovery / 1000).toFixed(1)}초`,
      chipColor: 'var(--text-muted)',
    };
  }
  return {
    label: limiter.ratePerSec !== null ? `${limiter.ratePerSec}/s` : '정상',
    chipColor: 'var(--text-muted)',
  };
}

function kisBudgetChipColor(
  riskState: RuntimeDataHealthPayload['kisOutboundLimiter']['budget']['riskState'],
): string {
  switch (riskState) {
    case 'safe':
      return 'var(--kr-up)';
    case 'busy':
    case 'recovering':
      return 'var(--gold-text)';
    case 'risky':
    case 'throttled':
      return 'var(--kr-down)';
    case 'idle':
      return 'var(--text-muted)';
  }
}

function formatKisBudgetDetails(limiter: RuntimeDataHealthPayload['kisOutboundLimiter']): string {
  const budget = limiter.budget ?? defaultKisBudgetPayload();
  const window = budget.windows.sixtySec;
  const classRate = (priorityClass: string) =>
    window.byClass
      .filter((item) => item.priorityClass === priorityClass)
      .reduce((sum, item) => sum + item.callPerSec, 0)
      .toFixed(2);
  return [
    `${budget.riskLabel} ${window.callPerSec.toFixed(2)}/s`,
    `polling ${classRate('polling')}/s`,
    `ranking ${classRate('ranking')}/s`,
    `foreground ${classRate('foreground')}/s`,
    `throttle ${window.throttlePerMin.toFixed(1)}/min`,
    `queue ${limiter.queueDepth}`,
    limiter.globalMinStartGapMs !== null
      ? `global gap ${limiter.globalMinStartGapMs}ms`
      : null,
  ].filter((item): item is string => item !== null).join(' · ');
}

function defaultKisBudgetPayload(): RuntimeDataHealthPayload['kisOutboundLimiter']['budget'] {
  const emptyWindow = {
    windowMs: 0,
    startedCount: 0,
    successCount: 0,
    failureCount: 0,
    throttleCount: 0,
    callPerSec: 0,
    successPerSec: 0,
    failurePerMin: 0,
    throttlePerMin: 0,
    byClass: [],
  };
  return {
    generatedAt: null,
    riskState: 'idle',
    riskLabel: 'KIS 대기',
    riskReason: null,
    windows: {
      tenSec: emptyWindow,
      sixtySec: emptyWindow,
    },
  };
}

function latestObservedRecoveryMs(
  limiter: RuntimeDataHealthPayload['kisOutboundLimiter'],
): number | null {
  let latest: { recoveredAtMs: number; observedRecoveryMs: number } | null = null;
  for (const profile of limiter.profiles) {
    if (profile.recoveredAt === null || profile.observedRecoveryMs === null) continue;
    const recoveredAtMs = Date.parse(profile.recoveredAt);
    if (!Number.isFinite(recoveredAtMs)) continue;
    if (latest === null || recoveredAtMs > latest.recoveredAtMs) {
      latest = { recoveredAtMs, observedRecoveryMs: profile.observedRecoveryMs };
    }
  }
  return latest?.observedRecoveryMs ?? null;
}

function formatMarketTopMoversSummary(
  topMovers: RuntimeDataHealthPayload['marketTopMovers'],
): { label: string; chipColor: string } {
  if (!topMovers.configured) {
    return { label: '미시작', chipColor: 'var(--text-muted)' };
  }
  const prefix = hasText(topMovers.sourceLabel) ? `${topMovers.sourceLabel} ` : '';
  if (topMovers.cooldownActive || topMovers.status === 'cooldown') {
    return { label: `${prefix}쿨다운`, chipColor: 'var(--gold-text)' };
  }
  if (topMovers.inflight || topMovers.status === 'refreshing') {
    return { label: `${prefix}갱신 중`, chipColor: 'var(--text-muted)' };
  }
  const coverage = topMovers.coverage;
  if (coverage === null) {
    return { label: topMovers.status, chipColor: 'var(--text-muted)' };
  }
  if (coverage.guaranteedTop100) {
    return {
      label: `${prefix}${topMoversUniverseLabel(coverage.marketUniverse)}`,
      chipColor: 'var(--kr-up)',
    };
  }
  const count = Math.max(coverage.gainersCount, coverage.losersCount);
  if (count > 0) {
    return { label: `${prefix}부분 ${count}/${coverage.requestedLimit}`, chipColor: 'var(--gold-text)' };
  }
  return { label: `${prefix}대기`, chipColor: 'var(--text-muted)' };
}

function topMoversPartialReasonLabel(
  reason: string,
  marketUniverse: TopMoversMarketUniverse | undefined,
): string {
  const source = topMoversShortSourceLabel(marketUniverse);
  switch (reason) {
    case 'under_requested_limit':
      return `${source} 부분 수신`;
    case 'smaller_refresh_retained':
      return '직전 유지';
    case 'rate_limited':
      return `${source} 호출 제한`;
    case 'no_continuation':
      return `${source} 응답 종료`;
    case 'timeout':
      return '시간 초과';
    case 'malformed_response':
      return '응답 해석 실패';
    case 'upstream_partial_limit_suspected':
      return `${source} 부분 응답 한계 의심`;
    case 'source_unsupported':
      return '미지원';
    default:
      return reason;
  }
}

function topMoversStopReasonLabel(
  reason: string,
  marketUniverse: TopMoversMarketUniverse | undefined,
): string {
  const source = topMoversShortSourceLabel(marketUniverse);
  switch (reason) {
    case 'complete':
      return '완료';
    case 'no_continuation':
      return `${source} 응답 종료`;
    case 'under_requested_limit':
      return '요청 미달';
    case 'rate_limited':
      return `${source} 요청 제한`;
    case 'timeout':
      return '시간 초과';
    case 'malformed_response':
      return '응답 해석 실패';
    case 'smaller_refresh_retained':
      return '직전 데이터 유지';
    case 'unsupported_source':
      return '미지원';
    case 'upstream_partial_limit_suspected':
      return `${source} 부분 응답 한계 의심`;
    default:
      return reason;
  }
}

function topMoversUniverseLabel(
  marketUniverse: TopMoversMarketUniverse,
): string {
  return marketUniverse === 'toss-web-ranking' ? '토스 웹 랭킹' : 'KIS 전체시장';
}

function topMoversShortSourceLabel(
  marketUniverse: TopMoversMarketUniverse | undefined,
): string {
  return marketUniverse === 'toss-web-ranking' ? '토스' : 'KIS';
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function formatDurationLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return '1분 미만';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.round(minutes / 60)}시간 전`;
}

export function LocalBackupPanel({
  phase,
  onExport,
  onRestore,
}: {
  phase: BackupPhase;
  onExport: () => void;
  onRestore: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const running = phase.kind === 'running';
  return (
    <div
      data-testid="local-backup-panel"
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
          fontSize: 13,
          fontWeight: 800,
          color: 'var(--text-primary)',
          marginBottom: 8,
        }}
      >
        로컬 백업 / 복원
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        추적 종목과 즐겨찾기만 JSON으로 백업합니다.
        credentials, 토큰, 계좌, candle 데이터는 포함하지 않습니다.
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onExport}
          disabled={running}
          style={operatorButtonStyle(!running)}
        >
          {phase.kind === 'running' && phase.action === 'export'
            ? '백업 중…'
            : '백업 내보내기'}
        </button>
        <label
          style={{
            ...operatorButtonStyle(!running),
            textAlign: 'center',
          }}
        >
          {phase.kind === 'running' && phase.action === 'restore'
            ? '복원 중…'
            : '백업 복원'}
          <input
            type="file"
            accept="application/json,.json"
            onChange={onRestore}
            disabled={running}
            style={{ display: 'none' }}
          />
        </label>
      </div>
      {phase.kind === 'success' && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--kr-up)' }}>
          {phase.message}
        </div>
      )}
      {phase.kind === 'error' && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--kr-down)' }}>
          백업 처리 실패: {phase.message}
        </div>
      )}
    </div>
  );
}

function isTossLoginRunning(state: TossLoginStatusPayload['state'] | undefined): boolean {
  return state === 'starting' || state === 'waiting_for_qr' || state === 'waiting_for_persistent';
}

function isTossRealtimeRunning(state: TossSseStatusPayload['state'] | undefined): boolean {
  return state === 'connecting' || state === 'connected' || state === 'reconnecting';
}

function tossSessionLabel(session: TossSessionStatusPayload | null): string {
  if (session === null) return '확인 중';
  switch (session.state) {
    case 'logged_out':
      return '로그아웃';
    case 'session_scoped':
      return '세션 범위';
    case 'persistent':
      return '세션 유지';
    case 'expiring':
      return '만료 임박';
    case 'expired':
      return '만료됨';
  }
}

function tossSessionColor(session: TossSessionStatusPayload | null): string {
  if (session === null) return 'var(--text-muted)';
  switch (session.state) {
    case 'persistent':
      return 'var(--kr-up)';
    case 'session_scoped':
    case 'expiring':
      return 'var(--gold-text)';
    case 'logged_out':
    case 'expired':
      return 'var(--text-muted)';
  }
}

function tossLoginLabel(login: TossLoginStatusPayload | null): string {
  if (login === null) return '대기';
  switch (login.state) {
    case 'idle':
      return '대기';
    case 'starting':
      return '시작 중';
    case 'waiting_for_qr':
      return 'QR 대기';
    case 'waiting_for_persistent':
      return '세션 유지 대기';
    case 'succeeded':
      return '완료';
    case 'failed':
      return '실패';
    case 'cancelled':
      return '취소됨';
  }
}

function tossRealtimeLabel(realtime: TossSseStatusPayload | null): string {
  if (realtime === null) return '확인 중';
  switch (realtime.state) {
    case 'idle':
      return '대기';
    case 'connecting':
      return '연결 중';
    case 'connected':
      return '연결됨';
    case 'reconnecting':
      return '재연결';
    case 'stopped':
      return '중지됨';
    case 'failed':
      return '실패';
  }
}

function formatTossRealtimeEventTypes(
  eventTypes: TossSseStatusPayload['eventTypes'],
): string {
  if (eventTypes.length === 0) return '수집 전';
  return eventTypes
    .slice(0, 3)
    .map((item) => `${item.type} ${item.count}`)
    .join(', ');
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

const credentialInputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
  fontSize: 12,
};

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

function formatMaybeLocal(iso: string | null): string {
  return iso === null ? '없음' : formatLocal(iso);
}

function backfillSkippedReasonLabel(
  reason: RuntimeDataHealthPayload['backfill']['lastSkippedReason'],
): string {
  switch (reason) {
    case 'disabled':
      return '비상정지됨';
    case 'market_not_allowed':
      return '장중 대기';
    case 'no_tickers':
      return '추적 종목 없음';
    case 'no_stale_tickers':
      return '최신 상태';
    case 'already_running':
      return '이미 실행 중';
    case 'cooldown':
      return '쿨다운';
    case null:
      return '정상';
  }
}

function formatBackfillRecent(
  recent: RuntimeDataHealthPayload['backfill']['recent'],
): string {
  return recent.slice(-3).map((item) => {
    if (item.status === 'failed') {
      return `${item.ticker} 실패 ${item.errorCode ?? 'UNKNOWN'}`;
    }
    return `${item.ticker} 성공 +${item.inserted}/~${item.updated}`;
  }).join(' · ');
}

function formatSignalOutcomeSummary(
  dashboard: RuntimeDataHealthPayload['signalOutcomes'],
): string {
  return dashboard.horizons.map((item) => {
    if (item.averageChangePct === null) {
      return `${item.horizon} 대기 ${item.pending}/${item.total}`;
    }
    return `${item.horizon} 평균 ${formatSignedPct(item.averageChangePct)} (${item.ready}/${item.total})`;
  }).join(' · ');
}

function formatSignedPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

// ---------- Notif tab ----------

export function NotifTab() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const alertDeliveryEntries = useAlertDeliveryStore((s) => s.entries);
  const clearAlertDeliveryEntries = useAlertDeliveryStore((s) => s.clear);

  const set = (patch: Partial<ClientSettings>) => update(patch);

  const desktopSupported =
    typeof window !== 'undefined' && 'Notification' in window;
  const [permissionMsg, setPermissionMsg] = useState<string | null>(null);
  const [soundMsg, setSoundMsg] = useState<string | null>(null);
  const [phoneStatus, setPhoneStatus] =
    useState<PhoneNotificationStatusPayload | null>(null);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPhoneNotificationStatus()
      .then((status) => {
        if (alive) setPhoneStatus(status);
      })
      .catch(() => {
        if (alive) {
          setPhoneStatus(null);
          setPhoneMsg('폰 알림 상태를 확인하지 못했습니다.');
        }
      });
    return () => {
      alive = false;
    };
  }, []);

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
    const played = playBleep(settings.soundVolume, 'up');
    setSoundMsg(
      played
        ? '테스트음을 재생했습니다.'
        : '이 환경에서 사운드를 시작하지 못했습니다. Windows 볼륨 믹서와 앱 출력 장치를 확인해 주세요.',
    );
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

  async function handlePhoneTest() {
    setPhoneLoading(true);
    setPhoneMsg(null);
    try {
      await sendPhoneNotificationTest();
      setPhoneMsg('Telegram 테스트 알림을 보냈습니다.');
      const status = await getPhoneNotificationStatus();
      setPhoneStatus(status);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setPhoneMsg('서버 env에 Telegram bot token/chat id가 설정되지 않았습니다.');
      } else {
        setPhoneMsg('Telegram 테스트 알림 전송에 실패했습니다.');
      }
    } finally {
      setPhoneLoading(false);
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
          label={`즐겨찾기 알림 기준 (±${settings.notifPctThreshold}%)`}
          hint="즐겨찾기 종목이 이 % 이상 움직이면 토스트·사운드·폰 알림을 보냅니다. 메인 급상승 목록에는 영향을 주지 않습니다."
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

        <Field label="">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Toggle
              value={settings.phoneNotifEnabled}
              onChange={(v) => set({ phoneNotifEnabled: v })}
              label="폰 Telegram 알림"
            />
            <button
              type="button"
              onClick={() => void handlePhoneTest()}
              disabled={phoneLoading || phoneStatus?.configured !== true}
              style={{
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 700,
                background:
                  phoneStatus?.configured === true
                    ? 'var(--bg-tint)'
                    : 'transparent',
                color:
                  phoneStatus?.configured === true
                    ? 'var(--text-secondary)'
                    : 'var(--text-inactive)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor:
                  phoneLoading || phoneStatus?.configured !== true
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {phoneLoading ? '전송 중' : '테스트'}
            </button>
          </div>
        </Field>
        <div
          style={{
            marginTop: -6,
            marginBottom: 14,
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          {phoneStatus?.configured === true
            ? 'Telegram 브릿지가 설정되어 있습니다. 룰/즐겨찾기 crossing 알림이 폰으로 전달됩니다.'
            : '서버 env에 ARAON_TELEGRAM_BOT_TOKEN과 ARAON_TELEGRAM_CHAT_ID를 설정하면 폰 알림을 사용할 수 있습니다.'}
          {phoneMsg !== null && <div style={{ marginTop: 4 }}>{phoneMsg}</div>}
        </div>

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
      <AlertDeliveryLogPanel
        entries={alertDeliveryEntries}
        onClear={clearAlertDeliveryEntries}
      />
    </div>
  );
}

// ---------- Surge tab ----------

export function SurgeTab() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  return (
    <div>
      <Field
        label={`메인 급상승 표시 기준 (${settings.surgeThreshold}% 이상)`}
        hint="메인 화면의 최근 급상승·오늘 강세 목록에 종목을 표시하는 기준입니다. 알림을 보내지는 않습니다."
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

      <Field label="시총 / 거래량 필터">
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
          메인 최근 급상승 카드에서 KIS 시총 규모별 필터를 바로 사용할 수
          있습니다. 거래량 배수는 기준선이 준비된 종목만 정직하게 표시됩니다.
        </div>
      </Field>
    </div>
  );
}

export function ChartSettingsTab() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  return (
    <div>
      <Field
        label="차트 색상"
        hint="한국 주식 화면에 맞춰 기본값은 빨강=상승, 파랑=하락입니다. 미국식 색상도 선택할 수 있습니다."
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ChoiceButton
            active={settings.chartColorScheme === 'kr'}
            onClick={() => update({ chartColorScheme: 'kr' })}
          >
            한국식 · 빨강 상승
          </ChoiceButton>
          <ChoiceButton
            active={settings.chartColorScheme === 'us'}
            onClick={() => update({ chartColorScheme: 'us' })}
          >
            미국식 · 초록 상승
          </ChoiceButton>
        </div>
      </Field>
      <Field label="분봉 차트 기준">
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
          1m/3m/5m 차트는 저장된 1분봉으로 그립니다. 과거 intraday는 저장된
          candle이 있을 때만 표시하고, 1D/1W/1M은 KIS 일봉을 기준으로 보강합니다.
        </div>
      </Field>
    </div>
  );
}

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent-soft)' : 'var(--bg-card)',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        borderRadius: 8,
        padding: '8px 10px',
        fontSize: 12,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ---------- Rules tab ----------

interface DraftRule {
  ticker: string;
  kind: AlertRuleKind;
  threshold: string;
  marketCapFilter: SurgeMarketCapFilter;
  cooldownMinutes: string;
}

const EMPTY_DRAFT: DraftRule = {
  ticker: '',
  kind: 'changePctAbove',
  threshold: '5',
  marketCapFilter: 'all',
  cooldownMinutes: String(DEFAULT_RULE_COOLDOWN_MS / 60_000),
};

const MARKET_CAP_RULE_OPTIONS: ReadonlyArray<{
  value: SurgeMarketCapFilter;
  label: string;
}> = [
  { value: 'all', label: '시총 전체' },
  { value: 'large', label: '대형' },
  { value: 'mid', label: '중형' },
  { value: 'small', label: '소형' },
];

function marketCapRuleLabel(value: SurgeMarketCapFilter): string {
  return MARKET_CAP_RULE_OPTIONS.find((item) => item.value === value)?.label ?? '시총 전체';
}

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
      marketCapFilter: draft.marketCapFilter,
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
        지원하지 않습니다. 실시간 장중 crossing 시 토스트·데스크톱·폰 알림으로
        발동됩니다.
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <DraftField label="시총 범위">
              <select
                value={draft.marketCapFilter}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    marketCapFilter: e.target.value as SurgeMarketCapFilter,
                  })
                }
                style={selectStyle}
              >
                {MARKET_CAP_RULE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </DraftField>
            <div />
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
                    {(r.marketCapFilter ?? 'all') !== 'all'
                      ? ` · ${marketCapRuleLabel(r.marketCapFilter ?? 'all')}`
                      : ''}
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
