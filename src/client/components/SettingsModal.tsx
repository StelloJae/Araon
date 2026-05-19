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
import { agentEventUserSummary } from '../lib/agent-candidate-view-model';
import {
  ApiError,
  cancelTossLogin,
  clearTossSession,
  disableRealtimeSession,
  emergencyDisableRealtime,
  enableRealtimeSession,
  extendTossSession,
  exportLocalBackup,
  getTossAuthStatus,
  getAgentEventAlertDeliveries,
  getAgentOrderIntentApprovalChallenges,
  getAgentOrderIntentAudit,
  getAgentOrderIntents,
  getAgentOrderIntentLivePolicy,
  getAgentEvents,
  getTossAccountSummary,
  getTossCompletedOrders,
  getTossLoginStatus,
  getTossPendingOrders,
  getTossPortfolioPositions,
  getTossSseRefreshResults,
  getTossSseStatus,
  getTossTransactions,
  getTossTransactionsOverview,
  getTossWatchlist,
  getAraonWatchlist,
  getAgentEventMonitorStatus,
  getKisWsSlotStatus,
  getPhoneNotificationStatus,
  getRealtimeStatus,
  getRuntimeDataHealth,
  getServerSettings,
  getStocks,
  getThemesWithStocks,
  importKisWatchlist,
  restoreLocalBackup,
  runAgentEventMonitorTick,
  sendPhoneNotificationTest,
  startAgentEventMonitor,
  startTossLogin,
  startTossSse,
  stopAgentEventMonitor,
  stopTossSse,
  updateServerSettings,
  type KisWatchlistImportResult,
  type RealtimeStatusPayload,
  type RuntimeDataHealthPayload,
  type ServerRuntimeSettings,
  type AgentEventAlertDeliveriesPayload,
  type AgentEventAlertDeliveryPayload,
  type AgentEventAlertDeliverySummaryPayload,
  type AgentEventPayload,
  type AgentEventMonitorRunResult,
  type AgentEventMonitorStatusPayload,
  type KisWsSlotCandidatePayload,
  type KisWsSlotSource,
  type KisWsSlotStatusPayload,
  type OrderIntentAuditEntryPayload,
  type OrderIntentApprovalChallengePayload,
  type OrderIntentLivePolicyPayload,
  type OrderIntentPreviewPayload,
  type PhoneNotificationStatusPayload,
  type TossAccountSummaryPayload,
  type TossCompletedOrdersPayload,
  type TossLoginStatusPayload,
  type TossPendingOrdersPayload,
  type TossPortfolioPositionsPayload,
  type TossSessionStatusPayload,
  type TossSseRefreshResultsPayload,
  type TossSseStatusPayload,
  type TossTransactionsOverviewPayload,
  type TossTransactionsPayload,
  type TossWatchlistPayload,
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
import { tossLoginRailNotice } from '../lib/toss-login-flow';
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
  currentTicker?: string | null;
}

function emptyAgentEventAlertDeliveries(): AgentEventAlertDeliveriesPayload {
  return {
    items: [],
    returnedCount: 0,
    summary: {
      targetFirstSeenToDispatchMs: 30_000,
      totalCount: 0,
      dispatchedCount: 0,
      skippedNoClientCount: 0,
      dispatchedWithinTargetCount: 0,
      dispatchedLateCount: 0,
      lastDispatchLatencyMs: null,
      maxDispatchLatencyMs: null,
    },
  };
}

export function SettingsModal({ onClose, currentTicker = null }: SettingsModalProps) {
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
          {tab === '연결' && <ConnectionTab currentTicker={currentTicker} />}
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
        | 'extend-session'
        | 'start-realtime'
        | 'stop-realtime';
    }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

type AgentEventMonitorPhase =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; result: AgentEventMonitorRunResult }
  | { kind: 'error'; message: string };

type AgentEventsFeedPhase =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

type TossAccountSurfacePhase =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

type OrderIntentApprovalPhase =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success' }
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

function ConnectionTab({ currentTicker }: { currentTicker: string | null }) {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatusPayload | null>(null);
  const [tossSession, setTossSession] =
    useState<TossSessionStatusPayload | null>(null);
  const [tossLogin, setTossLogin] =
    useState<TossLoginStatusPayload | null>(null);
  const [tossRealtime, setTossRealtime] =
    useState<TossSseStatusPayload | null>(null);
  const [tossRefreshResults, setTossRefreshResults] =
    useState<TossSseRefreshResultsPayload | null>(null);
  const [tossAccountSummary, setTossAccountSummary] =
    useState<TossAccountSummaryPayload | null>(null);
  const [tossPortfolioPositions, setTossPortfolioPositions] =
    useState<TossPortfolioPositionsPayload | null>(null);
  const [tossPendingOrders, setTossPendingOrders] =
    useState<TossPendingOrdersPayload | null>(null);
  const [tossCompletedOrders, setTossCompletedOrders] =
    useState<TossCompletedOrdersPayload | null>(null);
  const [tossTransactions, setTossTransactions] =
    useState<TossTransactionsPayload | null>(null);
  const [tossTransactionsOverview, setTossTransactionsOverview] =
    useState<TossTransactionsOverviewPayload | null>(null);
  const [tossWatchlist, setTossWatchlist] =
    useState<TossWatchlistPayload | null>(null);
  const [orderIntentPreviews, setOrderIntentPreviews] =
    useState<OrderIntentPreviewPayload[] | null>(null);
  const [orderIntentAudit, setOrderIntentAudit] =
    useState<OrderIntentAuditEntryPayload[] | null>(null);
  const [orderIntentApprovalChallenges, setOrderIntentApprovalChallenges] =
    useState<OrderIntentApprovalChallengePayload[] | null>(null);
  const [orderIntentLivePolicy, setOrderIntentLivePolicy] =
    useState<OrderIntentLivePolicyPayload | null>(null);
  const [agentMonitor, setAgentMonitor] =
    useState<AgentEventMonitorStatusPayload | null>(null);
  const [agentEvents, setAgentEvents] =
    useState<AgentEventPayload[] | null>(null);
  const [agentEventDeliveries, setAgentEventDeliveries] =
    useState<AgentEventAlertDeliveryPayload[] | null>(null);
  const [agentEventDeliverySummary, setAgentEventDeliverySummary] =
    useState<AgentEventAlertDeliverySummaryPayload | null>(null);
  const [kisSlots, setKisSlots] = useState<KisWsSlotStatusPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importPhase, setImportPhase] = useState<ImportPhase>({ kind: 'idle' });
  const [operatorPhase, setOperatorPhase] =
    useState<RealtimeOperatorPhase>({ kind: 'idle' });
  const [tossPhase, setTossPhase] = useState<TossOperatorPhase>({ kind: 'idle' });
  const [tossAccountPhase, setTossAccountPhase] =
    useState<TossAccountSurfacePhase>({ kind: 'idle' });
  const [orderIntentPhase, setOrderIntentPhase] =
    useState<OrderIntentApprovalPhase>({ kind: 'idle' });
  const [agentMonitorPhase, setAgentMonitorPhase] =
    useState<AgentEventMonitorPhase>({ kind: 'idle' });
  const [agentEventsPhase, setAgentEventsPhase] =
    useState<AgentEventsFeedPhase>({ kind: 'idle' });
  const [serverSettings, setServerSettings] =
    useState<ServerRuntimeSettings | null>(null);
  const [dataHealth, setDataHealth] = useState<RuntimeDataHealthPayload | null>(null);
  const [serverSettingsPhase, setServerSettingsPhase] =
    useState<ServerSettingsPhase>({ kind: 'idle' });
  const [backupPhase, setBackupPhase] =
    useState<BackupPhase>({ kind: 'idle' });
  const [selectedCap, setSelectedCap] = useState<SessionRealtimeCap>(1);
  const [operatorConfirmed, setOperatorConfirmed] = useState(false);

  const clientSettings = useSettingsStore((s) => s.settings);
  const updateClientSettings = useSettingsStore((s) => s.update);
  const setCatalog = useStocksStore((s) => s.setCatalog);
  const setThemes = useStocksStore((s) => s.setThemes);
  const setWatchlistItems = useWatchlistStore((s) => s.setWatchlistItems);

  async function reloadCatalog(): Promise<void> {
    // Match App.tsx's hydration flow: catalog set wipes sectorId, so re-apply
    // themes immediately after.
    const [stocks, themes, watchlist] = await Promise.all([
      getStocks(),
      getThemesWithStocks(),
      getAraonWatchlist().catch((err) => {
        if (err instanceof ApiError && err.status === 503) return [];
        throw err;
      }),
    ]);
    setCatalog(stocks);
    setThemes(themes);
    setWatchlistItems(Array.isArray(watchlist) ? [] : watchlist.items);
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

  async function reloadRealtimeStatus(): Promise<void> {
    setRealtimeStatus(await getRealtimeStatus());
  }

  async function reloadTossStatus(): Promise<void> {
    const [session, login, realtime, refreshResults] = await Promise.all([
      getTossAuthStatus(),
      getTossLoginStatus(),
      getTossSseStatus(),
      getTossSseRefreshResults(5).catch(() => ({ items: [], returnedCount: 0 })),
    ]);
    setTossSession(session);
    setTossLogin(login);
    setTossRealtime(realtime);
    setTossRefreshResults(refreshResults);
  }

  async function reloadAgentMonitorStatus(): Promise<void> {
    setAgentMonitor(await getAgentEventMonitorStatus());
  }

  async function reloadAgentEvents(): Promise<void> {
    setAgentEventsPhase({ kind: 'running' });
    try {
      const [snapshot, deliveries] = await Promise.all([
        getAgentEvents(10),
        getAgentEventAlertDeliveries(10).catch(() => emptyAgentEventAlertDeliveries()),
      ]);
      setAgentEvents(snapshot.items);
      setAgentEventDeliveries(deliveries.items);
      setAgentEventDeliverySummary(deliveries.summary);
      setAgentEventsPhase({ kind: 'success' });
    } catch (err) {
      setAgentEventsPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function reloadKisSlotStatus(): Promise<void> {
    setKisSlots(await getKisWsSlotStatus(currentTicker));
  }

  async function handleTossLoginStart(): Promise<void> {
    setTossPhase({ kind: 'running', action: 'login' });
    try {
      setTossLogin(await startTossLogin());
      setTossSession(await getTossAuthStatus());
      setTossPhase({
        kind: 'success',
        message: '토스 QR 로그인 창을 열었습니다. 최대 10분 대기합니다',
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

  async function handleTossSessionExtend(): Promise<void> {
    setTossPhase({ kind: 'running', action: 'extend-session' });
    try {
      const result = await extendTossSession(60_000);
      setTossSession(await getTossAuthStatus());
      if (result.state === 'succeeded') {
        setTossPhase({
          kind: 'success',
          message: `토스 세션을 연장했습니다 · 만료 ${formatMaybeLocal(result.serverExpiresAt)}`,
        });
        return;
      }
      setTossPhase({
        kind: 'error',
        message: `토스 세션 연장 ${tossSessionExtensionLabel(result.state)}`,
      });
    } catch (err) {
      setTossPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleTossRealtimeStart(): Promise<void> {
    setTossPhase({ kind: 'running', action: 'start-realtime' });
    try {
      setTossRealtime(await startTossSse());
      setTossRefreshResults(await getTossSseRefreshResults(5).catch(() => ({ items: [], returnedCount: 0 })));
      setTossPhase({
        kind: 'success',
        message: '토스 알림 연결을 시작했습니다',
      });
    } catch (err) {
      setTossPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleTossRealtimeStop(): Promise<void> {
    setTossPhase({ kind: 'running', action: 'stop-realtime' });
    try {
      setTossRealtime(await stopTossSse());
      setTossRefreshResults(await getTossSseRefreshResults(5).catch(() => ({ items: [], returnedCount: 0 })));
      setTossPhase({
        kind: 'success',
        message: '토스 알림 연결을 중지했습니다',
      });
    } catch (err) {
      setTossPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleTossAccountRefresh(): Promise<void> {
    setTossAccountPhase({ kind: 'running' });
    try {
      const summary = await getTossAccountSummary();
      const [
        positions,
        pendingOrders,
        completedOrders,
        transactions,
        transactionsOverview,
        watchlist,
      ] = await Promise.all([
        optionalTossAccountSurface(getTossPortfolioPositions),
        optionalTossAccountSurface(getTossPendingOrders),
        optionalTossAccountSurface(() => getTossCompletedOrders({ size: 10 })),
        optionalTossAccountSurface(() => getTossTransactions({ size: 10 })),
        optionalTossAccountSurface(() => getTossTransactionsOverview('kr')),
        optionalTossAccountSurface(getTossWatchlist),
      ]);
      setTossAccountSummary(summary);
      setTossPortfolioPositions(positions);
      setTossPendingOrders(pendingOrders);
      setTossCompletedOrders(completedOrders);
      setTossTransactions(transactions);
      setTossTransactionsOverview(transactionsOverview);
      setTossWatchlist(watchlist);
      setTossAccountPhase({ kind: 'success' });
    } catch (err) {
      setTossAccountPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleOrderIntentRefresh(): Promise<void> {
    setOrderIntentPhase({ kind: 'running' });
    try {
      const [previews, audit, approvalChallenges, livePolicy] = await Promise.all([
        getAgentOrderIntents(20),
        getAgentOrderIntentAudit(20),
        getAgentOrderIntentApprovalChallenges(20),
        getAgentOrderIntentLivePolicy(),
      ]);
      setOrderIntentPreviews(previews.items);
      setOrderIntentAudit(audit.items);
      setOrderIntentApprovalChallenges(approvalChallenges.items);
      setOrderIntentLivePolicy(livePolicy.policy);
      setOrderIntentPhase({ kind: 'success' });
    } catch (err) {
      setOrderIntentPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleAgentMonitorTick(): Promise<void> {
    setAgentMonitorPhase({ kind: 'running' });
    try {
      const result = await runAgentEventMonitorTick();
      setAgentMonitor(await getAgentEventMonitorStatus());
      const [snapshot, deliveries] = await Promise.all([
        getAgentEvents(10),
        getAgentEventAlertDeliveries(10).catch(() => emptyAgentEventAlertDeliveries()),
      ]);
      setAgentEvents(snapshot.items);
      setAgentEventDeliveries(deliveries.items);
      setAgentEventDeliverySummary(deliveries.summary);
      setAgentMonitorPhase({ kind: 'success', result });
    } catch (err) {
      setAgentMonitorPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleAgentMonitorStart(): Promise<void> {
    setAgentMonitorPhase({ kind: 'running' });
    try {
      setAgentMonitor(await startAgentEventMonitor());
      setAgentMonitorPhase({ kind: 'idle' });
    } catch (err) {
      setAgentMonitorPhase({ kind: 'error', message: operatorErrorMessage(err) });
    }
  }

  async function handleAgentMonitorStop(): Promise<void> {
    setAgentMonitorPhase({ kind: 'running' });
    try {
      setAgentMonitor(await stopAgentEventMonitor());
      setAgentMonitorPhase({ kind: 'idle' });
    } catch (err) {
      setAgentMonitorPhase({ kind: 'error', message: operatorErrorMessage(err) });
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
        currentTicker,
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
        message: '통합 실시간 시세를 비상정지했습니다. Toss 가격 갱신은 계속 유지됩니다.',
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
        const [
          realtime,
          settings,
          health,
          tossSessionStatus,
          tossLoginStatus,
          tossRealtimeStatus,
          tossRefreshResultsSnapshot,
          monitorStatus,
          agentEventsSnapshot,
          agentEventDeliveriesSnapshot,
          kisSlotStatus,
        ] = await Promise.all([
          getRealtimeStatus(),
          getServerSettings(),
          getRuntimeDataHealth(),
          getTossAuthStatus(),
          getTossLoginStatus(),
          getTossSseStatus(),
          getTossSseRefreshResults(5).catch(() => ({ items: [], returnedCount: 0 })),
          getAgentEventMonitorStatus(),
          getAgentEvents(10).catch(() => ({ items: [], returnedCount: 0 })),
          getAgentEventAlertDeliveries(10).catch(() => emptyAgentEventAlertDeliveries()),
          getKisWsSlotStatus(currentTicker),
        ]);
        const [approvalChallenges, livePolicy] = await Promise.all([
          getAgentOrderIntentApprovalChallenges(20).catch(() => ({ items: [], returnedCount: 0 })),
          getAgentOrderIntentLivePolicy().catch(() => ({ policy: null })),
        ]);
        if (!cancelled) {
          setRealtimeStatus(realtime);
          setServerSettings(settings);
          setDataHealth(health);
          setTossSession(tossSessionStatus);
          setTossLogin(tossLoginStatus);
          setTossRealtime(tossRealtimeStatus);
          setTossRefreshResults(tossRefreshResultsSnapshot);
          setAgentMonitor(monitorStatus);
          setAgentEvents(agentEventsSnapshot.items);
          setAgentEventDeliveries(agentEventDeliveriesSnapshot.items);
          setAgentEventDeliverySummary(agentEventDeliveriesSnapshot.summary);
          setOrderIntentApprovalChallenges(approvalChallenges.items);
          setOrderIntentLivePolicy(livePolicy.policy);
          setKisSlots(kisSlotStatus);
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
  }, [currentTicker]);

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
  const tossSessionReady =
    tossSession?.configured === true &&
    tossSession.state !== 'expired' &&
    tossSession.state !== 'logged_out';
  const showAdvancedConnectionTools = IS_DEV_BUILD && clientSettings.devModeEnabled;

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
        k="Toss 가격 갱신"
        v={status.runtime === 'started' ? '활성' : '대기'}
        chipColor="var(--text-muted)"
      />
      <Row
        k="실시간 연결"
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
      <KisWsSlotControl
        status={kisSlots}
        onReload={() => void reloadKisSlotStatus()}
      />
      <TossDataControl
        session={tossSession}
        login={tossLogin}
        realtime={tossRealtime}
        refreshResults={tossRefreshResults}
        phase={tossPhase}
        onLoginStart={() => void handleTossLoginStart()}
        onLoginCancel={() => void handleTossLoginCancel()}
        onSessionClear={() => void handleTossSessionClear()}
        onSessionExtend={() => void handleTossSessionExtend()}
        onRealtimeStart={() => void handleTossRealtimeStart()}
        onRealtimeStop={() => void handleTossRealtimeStop()}
      />
      <TossAccountSurfaceControl
        sessionReady={tossSessionReady}
        busy={tossAccountPhase.kind === 'running'}
        error={tossAccountPhase.kind === 'error' ? tossAccountPhase.message : null}
        summary={tossAccountSummary}
        positions={tossPortfolioPositions}
        pendingOrders={tossPendingOrders}
        completedOrders={tossCompletedOrders}
        transactions={tossTransactions}
        transactionsOverview={tossTransactionsOverview}
        watchlist={tossWatchlist}
        onRefresh={() => void handleTossAccountRefresh()}
      />
      <OrderIntentApprovalControl
        previews={orderIntentPreviews}
        audit={orderIntentAudit}
        approvalChallenges={orderIntentApprovalChallenges}
        livePolicy={orderIntentLivePolicy}
        busy={orderIntentPhase.kind === 'running'}
        error={orderIntentPhase.kind === 'error' ? orderIntentPhase.message : null}
        onRefresh={() => void handleOrderIntentRefresh()}
      />
      <AgentEventMonitorControl
        status={agentMonitor}
        phase={agentMonitorPhase}
        onTick={() => void handleAgentMonitorTick()}
        onStart={() => void handleAgentMonitorStart()}
        onStop={() => void handleAgentMonitorStop()}
        onReload={() => void reloadAgentMonitorStatus()}
      />
      <AgentEventsFeedControl
        events={agentEvents}
        deliveries={agentEventDeliveries}
        deliverySummary={agentEventDeliverySummary}
        busy={agentEventsPhase.kind === 'running'}
        error={agentEventsPhase.kind === 'error' ? agentEventsPhase.message : null}
        onRefresh={() => void reloadAgentEvents()}
      />
      {IS_DEV_BUILD && (
        <DevModeControl
          enabled={clientSettings.devModeEnabled}
          onChange={(enabled) => updateClientSettings({ devModeEnabled: enabled })}
        />
      )}
      {showAdvancedConnectionTools && (
        <>
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
          <DataHealthPanel health={dataHealth} />
          <LocalBackupPanel
            phase={backupPhase}
            onExport={() => void handleBackupExport()}
            onRestore={(event) => void handleBackupRestore(event)}
          />
        </>
      )}

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
        KIS 키는 선택 실시간 추적용입니다.
        <br />
        기본 시장 데이터와 계좌 화면은 Toss 중심으로 동작합니다.
      </div>

      {showAdvancedConnectionTools && <MasterCatalogPanel />}

      {showAdvancedConnectionTools && (
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
          이전 관심종목 가져오기
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            marginBottom: 12,
          }}
        >
          Toss 로그인 후 즐겨찾기는 Toss 관심종목을 기준으로 사용합니다.
          <br />
          이 버튼은 예전 KIS HTS/MTS 관심종목을 로컬 백업 카탈로그로 옮기는 이전 호환 도구입니다.
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
          {importPhase.kind === 'running' ? '가져오는 중…' : 'KIS 관심종목 가져오기'}
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
      )}
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
        실시간 시세는 장중 통합 시세 흐름, 장전/장후 NXT 흐름으로 자동 전환됩니다.
        <br />
        실시간 추적은 최대 40개 한국 종목만 저지연으로 따라붙고, 기본 가격 갱신은 Toss가 맡습니다.
        <br />
        일반 설정을 켤 필요 없이 Araon이 즐겨찾기와 화면 종목을 관리합니다.
        <br />
        민감한 키와 계좌 정보는 표시하지 않습니다.
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
            k="추적 범위"
            v={`${status.coverage.assignedTickerCount}/${status.coverage.totalCapacity} 후보`}
            chipColor="var(--gold-text)"
          />
          <Row
            k="활성 세션"
            v={`${status.coverage.activeSessionCount}개`}
            chipColor={status.coverage.activeSessionCount > 0 ? 'var(--kr-up)' : 'var(--text-muted)'}
          />
          <Row
            k="추적 대기"
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
            아래 상한 선택은 운영자 재검증용입니다. 시간 또는 수신 제한에
            도달하면 자동으로 정리됩니다.
            <br />
            검증 완료: 1 / 3 / 5 / 10 / 20 / 40종목.
            <br />
            {getRealtimeCapVerificationDescription(40)}
            <br />
            20종목 상태: {cap20Label}. {cap20Preview}.
            <br />
            40종목까지 제어된 실시간 검증은 완료됐지만, 40종목 초과 구독은 허용하지 않습니다.
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
              k="현재 상한"
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
              k="최근 가격"
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

export function KisWsSlotControl({
  status,
  onReload,
}: {
  status: KisWsSlotStatusPayload | null;
  onReload?: () => void;
}) {
  const active = status?.enabled === true;
  const topCandidates = status?.candidates.slice(0, 5) ?? [];
  return (
    <div
      data-testid="kis-ws-slot-control"
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
          실시간 추적 슬롯
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: active ? 'var(--kr-up)' : 'var(--text-muted)',
            border: `1px solid ${active ? 'var(--kr-up)' : 'var(--border)'}`,
            borderRadius: 4,
            padding: '2px 5px',
          }}
        >
          선택 추적
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        KIS는 계좌/주문 기준이 아니라 고가치 종목의 저지연 실시간 가격 감시 경로입니다.
        <br />
        슬롯이 부족한 종목은 Toss 기본 가격 갱신으로 계속 확인합니다.
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
          k="사용량"
          v={
            status === null
              ? '불러오는 중'
              : `${status.activeCount} / ${status.perProfileCap}`
          }
          chipColor={active ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
        <Row
          k="대기"
          v={`${status?.fallbackCount ?? 0}종목`}
          chipColor={(status?.fallbackCount ?? 0) > 0 ? 'var(--gold-text)' : 'var(--text-muted)'}
        />
        <Row
          k="변경 예정"
          v={
            status === null
              ? '+0 / -0'
              : `+${status.diff.subscribe.length} / -${status.diff.unsubscribe.length}`
          }
          chipColor="var(--text-muted)"
        />
        <Row
          k="교체 대기"
          v={
            status === null
              ? '—'
              : `${Math.round(status.churnCooldownMs / 1000)}초`
          }
          chipColor="var(--text-muted)"
        />
        <Row
          k="상태"
          v={active ? '연결됨' : '대기'}
          chipColor={active ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
      </div>
      <div style={{ marginTop: 10 }}>
        {topCandidates.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            슬롯 후보가 아직 없습니다.
          </div>
        ) : (
          topCandidates.map((candidate) => (
            <KisWsSlotCandidateRow
              key={`${candidate.ticker}-${candidate.state}`}
              candidate={candidate}
            />
          ))
        )}
      </div>
      {onReload !== undefined && (
        <button
          type="button"
          onClick={onReload}
          data-testid="kis-ws-slot-reload"
          style={{
            ...operatorButtonStyle(true),
            width: '100%',
            marginTop: 12,
          }}
        >
          슬롯 상태 새로고침
        </button>
      )}
    </div>
  );
}

function KisWsSlotCandidateRow({
  candidate,
}: {
  candidate: KisWsSlotCandidatePayload;
}) {
  const subscribed = candidate.state === 'subscribed';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 0',
        borderTop: '1px solid var(--border-soft)',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
        {candidate.ticker}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {kisWsSourceLabel(candidate.source)} · {formatKisWsCandidateReason(candidate.reason)}
        {candidate.pinned ? ' · 고정' : ''}
        <br />
        우선순위 {candidate.score.toFixed(2)} · {formatMaybeLocal(candidate.lastSeenAt)}
        {candidate.ttlMs !== null ? ` · 유지 ${formatTtlMs(candidate.ttlMs)}` : ''}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: subscribed ? 'var(--kr-up)' : 'var(--gold-text)',
          border: `1px solid ${subscribed ? 'var(--kr-up)' : 'var(--gold)'}`,
          borderRadius: 4,
          padding: '2px 5px',
          whiteSpace: 'nowrap',
        }}
      >
        {subscribed ? '실시간 구독' : '대기'}
      </span>
    </div>
  );
}

export function TossDataControl({
  session,
  login,
  realtime,
  refreshResults,
  phase,
  onLoginStart,
  onLoginCancel,
  onSessionClear,
  onSessionExtend,
  onRealtimeStart,
  onRealtimeStop,
}: {
  session: TossSessionStatusPayload | null;
  login: TossLoginStatusPayload | null;
  realtime: TossSseStatusPayload | null;
  refreshResults: TossSseRefreshResultsPayload | null;
  phase: TossOperatorPhase;
  onLoginStart: () => void;
  onLoginCancel: () => void;
  onSessionClear: () => void;
  onSessionExtend: () => void;
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
          Toss 중심
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        TOP100과 현재 화면 시세는 토스 공개 데이터를 먼저 사용합니다.
        <br />
        로그인 세션은 알림 확인용이며 가격 갱신은 토스 가격 데이터와 함께 처리됩니다.
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
          k="토스 알림"
          v={tossRealtimeLabel(realtime)}
          chipColor={realtimeRunning ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
        <Row
          k="수신 이벤트"
          v={`${realtime?.eventCount ?? 0}개`}
          chipColor={(realtime?.eventCount ?? 0) > 0 ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
        <Row
          k="가격 알림"
          v={`${realtime?.priceRefreshEventCount ?? 0}개`}
          chipColor={(realtime?.priceRefreshEventCount ?? 0) > 0 ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
        <Row
          k="사용자 알림"
          v={`${realtime?.userNotificationEventCount ?? 0}개`}
          chipColor={(realtime?.userNotificationEventCount ?? 0) > 0 ? 'var(--gold-text)' : 'var(--text-muted)'}
        />
        <Row
          k="가격 갱신"
          v={`${realtime?.priceRefreshDispatchCount ?? 0}회`}
          chipColor={(realtime?.priceRefreshDispatchCount ?? 0) > 0 ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        유효 만료: {formatMaybeLocal(session?.effectiveExpiresAt ?? null)}
        <br />
        서버 만료: {formatMaybeLocal(session?.serverExpiresAt ?? null)} · 쿠키 만료: {formatMaybeLocal(session?.expiresAt ?? null)}
        <br />
        로그인 진단: {formatTossLoginDiagnostic(login)}
        <br />
        최근 알림: {formatMaybeLocal(realtime?.lastEventAt ?? null)}
        <br />
        최근 사용자 알림: {formatMaybeLocal(realtime?.lastUserNotificationAt ?? null)}
        <br />
        이벤트 종류: {formatTossRealtimeEventTypes(realtime?.eventTypes ?? [])}
        {realtime?.thinNotificationOnly === true && <> · 알림 후 REST 갱신</>}
        {realtime?.lastError !== null && realtime?.lastError !== undefined && (
          <>
            <br />
            알림 상태: {realtime.lastError}
          </>
        )}
      </div>
      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--border-soft)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)' }}>
            데이터 갱신 결과
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
            최근 {refreshResults?.returnedCount ?? 0}건
          </span>
        </div>
        {(refreshResults?.items.length ?? 0) === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            아직 갱신 결과 없음
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {refreshResults?.items.slice(0, 3).map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 8,
                  alignItems: 'center',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.resource}
                  {item.ticker !== null ? ` · ${item.ticker}` : ''}
                </span>
                <span
                  style={{
                    color: tossRefreshResultColor(item.result),
                    border: `1px solid ${tossRefreshResultColor(item.result)}`,
                    borderRadius: 4,
                    padding: '1px 5px',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatTossRefreshResultLabel(item.result)}
                </span>
                <span
                  style={{
                    gridColumn: '1 / -1',
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatTossRefreshSourceType(item.sourceType)} · {formatMaybeLocal(item.recordedAt)}
                  {item.error !== null ? ` · ${item.error}` : ''}
                </span>
              </div>
            ))}
          </div>
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
            : '알림 시작'}
        </button>
        <button
          type="button"
          onClick={onRealtimeStop}
          disabled={busy || !realtimeRunning}
          data-testid="toss-realtime-stop"
          style={operatorButtonStyle(!busy && realtimeRunning)}
        >
          알림 중지
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={onSessionExtend}
          disabled={busy || !sessionReady}
          data-testid="toss-session-extend"
          style={operatorButtonStyle(!busy && sessionReady)}
        >
          {phase.kind === 'running' && phase.action === 'extend-session'
            ? '연장 대기 중…'
            : '세션 연장'}
        </button>
        <button
          type="button"
          onClick={onSessionClear}
          disabled={busy || session?.configured !== true}
          data-testid="toss-session-clear"
          style={operatorButtonStyle(!busy && session?.configured === true)}
        >
          {phase.kind === 'running' && phase.action === 'clear-session'
            ? '삭제 중…'
            : '토스 세션 삭제'}
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

export function TossAccountSurfaceControl({
  sessionReady,
  busy,
  error,
  summary,
  positions,
  pendingOrders,
  completedOrders,
  transactions,
  transactionsOverview,
  watchlist,
  onRefresh,
}: {
  sessionReady: boolean;
  busy: boolean;
  error: string | null;
  summary: TossAccountSummaryPayload | null;
  positions: TossPortfolioPositionsPayload | null;
  pendingOrders: TossPendingOrdersPayload | null;
  completedOrders: TossCompletedOrdersPayload | null;
  transactions: TossTransactionsPayload | null;
  transactionsOverview: TossTransactionsOverviewPayload | null;
  watchlist: TossWatchlistPayload | null;
  onRefresh: () => void;
}) {
  const positionList = positions?.positions.slice(0, 3) ?? [];
  const pendingCount = pendingOrders?.orders.length ?? 0;
  const completedCount = completedOrders?.orders.length ?? 0;
  const transactionCount = transactions?.items.length ?? 0;
  const watchlistCount = watchlist?.items.length ?? 0;
  const completedList = completedOrders?.orders.slice(0, 2) ?? [];
  const transactionList = transactions?.items.slice(0, 2) ?? [];
  const depositList = transactionsOverview?.deposit.slice(0, 2) ?? [];
  const settlementList = transactionsOverview?.estimateSettlement.slice(0, 2) ?? [];
  const watchlistPreview = watchlist?.items.slice(0, 3) ?? [];
  const loaded =
    summary !== null ||
    positions !== null ||
    pendingOrders !== null ||
    completedOrders !== null ||
    transactions !== null ||
    transactionsOverview !== null ||
    watchlist !== null;
  return (
    <div
      data-testid="toss-account-surface-control"
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
          토스 계좌 / 포트폴리오
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '2px 5px',
          }}
        >
          읽기 전용
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        토스 세션이 준비된 뒤 계좌 요약, 보유 포지션, 미체결 주문을 조회합니다.
        <br />
        주문 실행/취소/정정은 여기서 수행하지 않습니다.
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
          k="총 자산"
          v={summary === null ? (sessionReady ? '수집 전' : '로그인 필요') : formatKrw(summary.totalAssetAmount)}
          chipColor={summary === null ? 'var(--text-muted)' : 'var(--text-secondary)'}
        />
        <Row
          k="주문가능"
          v={summary === null ? '—' : formatKrw(summary.orderableAmountKrw)}
          chipColor="var(--text-muted)"
        />
        <Row
          k="보유 포지션"
          v={`${positions?.positions.length ?? 0}종목`}
          chipColor={(positions?.positions.length ?? 0) > 0 ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
        <Row
          k="미체결"
          v={`미체결 ${pendingCount}건`}
          chipColor={pendingCount > 0 ? 'var(--gold-text)' : 'var(--text-muted)'}
        />
        <Row
          k="완료 주문"
          v={`${completedCount}건`}
          chipColor={completedCount > 0 ? 'var(--text-secondary)' : 'var(--text-muted)'}
        />
        <Row
          k="거래내역"
          v={`${transactionCount}건`}
          chipColor={transactionCount > 0 ? 'var(--text-secondary)' : 'var(--text-muted)'}
        />
        <Row
          k="예정입금"
          v={transactionsOverview === null ? '—' : `${depositList.length}건`}
          chipColor={depositList.length > 0 ? 'var(--gold-text)' : 'var(--text-muted)'}
        />
        <Row
          k="토스 관심"
          v={`${watchlistCount}종목`}
          chipColor={watchlistCount > 0 ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
      </div>
      <div style={{ marginTop: 10 }}>
        {positionList.length > 0 ? (
          positionList.map((position) => (
            <TossPositionRow key={`${position.marketCode}-${position.symbol}`} position={position} />
          ))
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {loaded ? '보유 포지션이 없습니다.' : '아직 조회하지 않았습니다.'}
          </div>
        )}
      </div>
      {completedList.length > 0 && (
        <TossAccountMiniList
          title="최근 완료 주문"
          items={completedList.map((order) => `${order.name} · ${order.side} · ${formatKrw(order.averageExecutionPrice)}`)}
        />
      )}
      {transactionList.length > 0 && (
        <TossAccountMiniList
          title="최근 거래내역"
          items={transactionList.map((item) => `${item.displayName || item.name || item.symbol} · ${formatKrw(item.amount)}`)}
        />
      )}
      {depositList.length > 0 && (
        <TossAccountMiniList
          title="예정입금"
          items={depositList.map((bucket) => `${bucket.date ?? '날짜 미정'} · ${formatKrw(bucket.krw)}`)}
        />
      )}
      {settlementList.length > 0 && (
        <TossAccountMiniList
          title="결제 예정"
          items={settlementList.map((item) => {
            const sell = item.sellAmount > 0 ? `매도 ${formatKrw(item.sellAmount)}` : '';
            const buy = item.buyAmount > 0 ? `매수 ${formatKrw(item.buyAmount)}` : '';
            return `${item.date ?? '날짜 미정'} · ${[sell, buy].filter(Boolean).join(' / ')}`;
          })}
        />
      )}
      {watchlistPreview.length > 0 && (
        <TossAccountMiniList
          title="토스 관심종목"
          items={watchlistPreview.map((item) => `${item.name} · ${item.groupName}`)}
        />
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy || !sessionReady}
        data-testid="toss-account-refresh"
        style={{
          ...operatorButtonStyle(!busy && sessionReady),
          width: '100%',
          marginTop: 12,
        }}
      >
        {busy ? '조회 중…' : sessionReady ? '계좌 화면 새로고침' : '토스 로그인 필요'}
      </button>
      {error !== null && (
        <div style={operatorMessageStyle('var(--accent-soft)')}>{error}</div>
      )}
    </div>
  );
}

function TossAccountMiniList({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)' }}>
        {title}
      </div>
      <div style={{ marginTop: 5, display: 'grid', gap: 4 }}>
        {items.map((item) => (
          <div
            key={item}
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function TossPositionRow({ position }: { position: TossPortfolioPositionsPayload['positions'][number] }) {
  const pnlColor = position.unrealizedPnl >= 0 ? 'var(--kr-up)' : 'var(--kr-down)';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 0',
        borderTop: '1px solid var(--border-soft)',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-primary)' }}>{position.name || position.symbol}</strong>
        <br />
        {position.symbol} · {position.quantity.toLocaleString('ko-KR')}주
      </span>
      <span style={{ fontSize: 12, fontWeight: 800, color: pnlColor, textAlign: 'right' }}>
        {formatKrw(position.marketValue)}
        <br />
        {formatSignedPct(position.profitRate)}
      </span>
    </div>
  );
}

export function OrderIntentApprovalControl({
  previews,
  audit,
  approvalChallenges,
  livePolicy,
  busy,
  error,
  onRefresh,
}: {
  previews: OrderIntentPreviewPayload[] | null;
  audit: OrderIntentAuditEntryPayload[] | null;
  approvalChallenges?: OrderIntentApprovalChallengePayload[] | null;
  livePolicy?: OrderIntentLivePolicyPayload | null;
  busy: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const previewCount = previews?.length ?? 0;
  const auditCount = audit?.length ?? 0;
  const challengeCount = approvalChallenges?.length ?? 0;
  const latestPreview = previews?.[0] ?? null;
  const latestAudit = audit?.[0] ?? null;
  const latestChallenge = approvalChallenges?.[0] ?? null;
  return (
    <div
      data-testid="order-intent-approval-control"
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
          주문 미리보기 / 승인 기록
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
          실거래 잠금
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        에이전트는 모의 미리보기와 기록까지만 남깁니다.
        <br />
        실제 주문, 취소, 정정은 별도 실거래 승인 전까지 실행되지 않습니다.
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
          k="미리보기"
          v={previews === null ? '수집 전' : `${previewCount}건`}
          chipColor={previewCount > 0 ? 'var(--gold-text)' : 'var(--text-muted)'}
        />
        <Row
          k="기록"
          v={audit === null ? '수집 전' : `${auditCount}건`}
          chipColor={auditCount > 0 ? 'var(--gold-text)' : 'var(--text-muted)'}
        />
        <Row
          k="실거래"
          v="잠금"
          chipColor="var(--gold-text)"
        />
        <Row
          k="실거래 정책"
          v={livePolicy === null || livePolicy === undefined
            ? '정책 확인 전'
            : orderIntentLivePolicyLabel(livePolicy)}
          chipColor="var(--gold-text)"
        />
        <Row
          k="승인"
          v={approvalChallenges === null || approvalChallenges === undefined
            ? '승인 확인 필요'
            : `${challengeCount}건`}
          chipColor={challengeCount > 0 ? 'var(--gold-text)' : 'var(--text-muted)'}
        />
      </div>
      <div style={{ marginTop: 10 }}>
        {livePolicy !== null && livePolicy !== undefined && (
          <OrderIntentLivePolicyRow policy={livePolicy} />
        )}
        {latestPreview === null ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            아직 생성된 주문 미리보기가 없습니다.
          </div>
        ) : (
          <OrderIntentPreviewRow preview={latestPreview} />
        )}
        {latestChallenge !== null && <OrderIntentApprovalChallengeRow challenge={latestChallenge} />}
        {latestAudit !== null && <OrderIntentAuditRow entry={latestAudit} />}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        data-testid="order-intent-audit-refresh"
        style={{
          ...operatorButtonStyle(!busy),
          width: '100%',
          marginTop: 12,
        }}
      >
        {busy ? '불러오는 중…' : '미리보기 / 기록 새로고침'}
      </button>
      {error !== null && (
        <div style={operatorMessageStyle('var(--accent-soft)')}>{error}</div>
      )}
    </div>
  );
}

function OrderIntentLivePolicyRow({ policy }: { policy: OrderIntentLivePolicyPayload }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 0',
        borderTop: '1px solid var(--border-soft)',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
        정책
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {orderIntentLivePolicyLabel(policy)}
        <br />
        필수 정책 {policy.missingConstraints.length}개 미승인
        <br />
        자동거래 준비 {policy.automationReadinessGaps.length}개 필요
        <br />
        {orderIntentAutomationReadinessSummary(policy)}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: 'var(--gold-text)',
          border: '1px solid var(--gold)',
          borderRadius: 4,
          padding: '2px 5px',
          whiteSpace: 'nowrap',
        }}
      >
        실행 없음
      </span>
    </div>
  );
}

function OrderIntentPreviewRow({ preview }: { preview: OrderIntentPreviewPayload }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 0',
        borderTop: '1px solid var(--border-soft)',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
        {preview.ticker}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {orderSideLabel(preview.side)} · {orderExecutionModeLabel(preview.executionMode)} · {orderTypeLabel(preview.orderType)}
        <br />
        {orderIntentAmountLabel(preview)} · 만료 {formatMaybeLocal(preview.expiresAt)}
        {preview.lifecycle.length > 0 ? (
          <>
            <br />
            판단 단계 · {orderIntentLifecycleSummary(preview)}
          </>
        ) : null}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: 'var(--gold-text)',
          border: '1px solid var(--gold)',
          borderRadius: 4,
          padding: '2px 5px',
          whiteSpace: 'nowrap',
        }}
      >
        {preview.liveExecutionLocked ? '실거래 잠금' : '미리보기'}
      </span>
    </div>
  );
}

function OrderIntentApprovalChallengeRow({
  challenge,
}: {
  challenge: OrderIntentApprovalChallengePayload;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 0',
        borderTop: '1px solid var(--border-soft)',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
        {challenge.ticker}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>승인 확인</strong>
        {' · 확인 문구 준비됨'}
        <br />
        만료 {formatMaybeLocal(challenge.expiresAt)}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: 'var(--gold-text)',
          border: '1px solid var(--gold)',
          borderRadius: 4,
          padding: '2px 5px',
          whiteSpace: 'nowrap',
        }}
      >
        {orderIntentApprovalChallengeStatusLabel(challenge.status)}
      </span>
    </div>
  );
}

function OrderIntentAuditRow({ entry }: { entry: OrderIntentAuditEntryPayload }) {
  const blocked = entry.decision === 'blocked';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 0',
        borderTop: '1px solid var(--border-soft)',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
        {entry.ticker}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {orderIntentAuditEventLabel(entry.event)} · {orderExecutionModeLabel(entry.requestedMode)}
        <br />
        {formatMaybeLocal(entry.createdAt)}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: blocked ? 'var(--kr-down)' : 'var(--kr-up)',
          border: `1px solid ${blocked ? 'var(--kr-down)' : 'var(--kr-up)'}`,
          borderRadius: 4,
          padding: '2px 5px',
          whiteSpace: 'nowrap',
        }}
      >
        {blocked ? '차단' : '허용'}
      </span>
    </div>
  );
}

export function AgentEventMonitorControl({
  status,
  phase,
  onTick,
  onStart,
  onStop,
  onReload,
}: {
  status: AgentEventMonitorStatusPayload | null;
  phase: AgentEventMonitorPhase;
  onTick: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onReload?: () => void;
}) {
  const busy = phase.kind === 'running';
  const enabled = status?.enabled === true;
  const watched = status?.watchedTickers ?? [];
  const watchedCandidates = status?.watchedCandidates ?? [];
  const candidateLabel = watchedCandidates.length > 0
    ? watchedCandidates
      .map((candidate) => `${candidate.ticker} · ${candidate.reason}`)
      .join(', ')
    : watched.length > 0
      ? watched.join(', ')
      : '없음';
  return (
    <div
      data-testid="agent-event-monitor-control"
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
          뉴스·공시·시그널 감시
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: enabled ? 'var(--kr-up)' : 'var(--text-muted)',
            border: `1px solid ${enabled ? 'var(--kr-up)' : 'var(--border)'}`,
            borderRadius: 4,
            padding: '2px 5px',
          }}
        >
          {enabled ? '감시 중' : '선택 전'}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        명시적으로 켜기 전까지 자동 호출 없음.
        <br />
        감시 범위는 관심/추적 종목에서 작은 배치로 제한됩니다.
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
          k="상태"
          v={
            status === null
              ? '불러오는 중'
              : enabled
                ? status.running
                  ? '자동 실행 중'
                  : '자동 대기'
                : '자동 꺼짐'
          }
          chipColor={enabled ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
        <Row
          k="주기 / 범위"
          v={
            status === null
              ? '—'
              : `${Math.round(status.intervalMs / 1000)}초 · 최대 ${status.maxTickersPerCycle}종목`
          }
          chipColor="var(--text-muted)"
        />
        <Row
          k="제공자 보호"
          v={
            status === null
              ? '—'
              : `${Math.round(status.providerCooldownMs / 1000)}초 · 건너뜀 ${status.lastSkippedRefreshes}회`
          }
          chipColor={(status?.lastSkippedRefreshes ?? 0) > 0 ? 'var(--kr-down)' : 'var(--text-muted)'}
        />
        <Row
          k="전달 목표"
          v={status === null ? '—' : agentMonitorDispatchPolicyLabel(status.dispatchPolicy)}
          chipColor="var(--text-muted)"
        />
        <Row
          k="감시 범위"
          v={status === null ? '—' : agentMonitorWatchScopeLabel(status.watchPolicy)}
          chipColor="var(--text-muted)"
        />
        <Row
          k="제공자"
          v={status === null ? '—' : agentMonitorProviderLabel(status)}
          chipColor={
            status?.providers.tossNews === true || status?.providers.tossSignal === true
              ? 'var(--kr-up)'
              : 'var(--text-muted)'
          }
        />
        <Row
          k="제공자 정책"
          v={status === null ? '—' : agentMonitorProviderPolicyLabel(status.providerPolicies)}
          chipColor="var(--text-muted)"
        />
        <Row
          k="제공자 지연"
          v={status === null ? '—' : agentMonitorProviderObservationLabel(status.providerObservations)}
          chipColor="var(--text-muted)"
        />
        <Row
          k="Toss 시그널 확인"
          v={status === null ? '—' : agentMonitorTossSignalContractLabel(status.tossSignalContract)}
          chipColor={
            status?.tossSignalContract.externalCallsEnabled === true
              ? 'var(--kr-up)'
              : 'var(--text-muted)'
          }
        />
        <Row
          k="실행 횟수"
          v={`${status?.cycleCount ?? 0}회`}
          chipColor={(status?.cycleCount ?? 0) > 0 ? 'var(--kr-up)' : 'var(--text-muted)'}
        />
        <Row
          k="마지막 실행"
          v={formatMaybeLocal(status?.lastCycleAt ?? null)}
          chipColor={status?.lastErrorCode ? 'var(--kr-down)' : 'var(--text-muted)'}
        />
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        감시 후보: {candidateLabel}
        <br />
        {status?.dispatchPolicy.providerPublicationGuarantee === false
          ? '제공자 발행 시점 보장 아님'
          : '제공자 지연 확인 중'}
        <br />
        {status === null
          ? 'Toss 시그널 확인 중'
          : 'Toss 시그널 후보: 후보 경로 관찰됨'
            + ` · 형식 후보: ${agentMonitorTossSignalShapeProbeHosts(status.tossSignalContract)}`
            + ` · ${agentMonitorTossSignalSemanticPolicyLabel(status.tossSignalContract)}`
            + ' · 원문 템플릿 숨김'}
        <br />
        최근 결과:{' '}
        {phase.kind === 'success'
          ? `${phase.result.tickers.length}종목 · 이벤트 ${phase.result.insertedEvents}개`
            + ` · 토스뉴스 ${phase.result.refreshedTossNews}회`
            + ` · 토스시그널 ${phase.result.refreshedTossSignals}회`
            + (phase.result.skippedRefreshes > 0 ? ` · 건너뜀 ${phase.result.skippedRefreshes}` : '')
          : status?.lastErrorCode ?? '대기'}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
        gap: 8,
        marginTop: 12,
      }}>
        <button
          type="button"
          onClick={onTick}
          disabled={busy}
          data-testid="agent-event-monitor-tick"
          style={operatorButtonStyle(!busy)}
        >
          {busy ? '확인 중…' : '수동 확인'}
        </button>
        {onStart !== undefined && (
          <button
            type="button"
            onClick={onStart}
            disabled={busy || !enabled || status?.running === true}
            data-testid="agent-event-monitor-start"
            style={operatorButtonStyle(!busy && enabled && status?.running !== true)}
          >
            자동 시작
          </button>
        )}
        {onStop !== undefined && (
          <button
            type="button"
            onClick={onStop}
            disabled={busy || status?.running !== true}
            data-testid="agent-event-monitor-stop"
            style={operatorButtonStyle(!busy && status?.running === true)}
          >
            자동 정지
          </button>
        )}
        {onReload !== undefined && (
          <button
            type="button"
            onClick={onReload}
            disabled={busy}
            data-testid="agent-event-monitor-reload"
            style={operatorButtonStyle(!busy)}
          >
            상태 새로고침
          </button>
        )}
      </div>
      {phase.kind === 'success' && (
        <div style={operatorMessageStyle('var(--up-tint-1)')}>
          {phase.result.state === 'disabled'
            ? '자동 감시는 꺼져 있습니다'
            : `수동 확인 완료 · 뉴스 ${phase.result.refreshedNews}회 · 토스뉴스 ${phase.result.refreshedTossNews}회 · 토스시그널 ${phase.result.refreshedTossSignals}회 · 공시 ${phase.result.refreshedDisclosures}회`
              + (phase.result.skippedRefreshes > 0 ? ` · 제공자 보호 ${phase.result.skippedRefreshes}회` : '')}
        </div>
      )}
      {phase.kind === 'error' && (
        <div style={operatorMessageStyle('var(--accent-soft)')}>{phase.message}</div>
      )}
    </div>
  );
}

function agentMonitorProviderLabel(status: AgentEventMonitorStatusPayload): string {
  const states = status.providerStates;
  if (states === undefined) {
    const labels = ['뉴스'];
    if (status.providers.tossNews) labels.push('토스 뉴스');
    if (status.providers.tossSignal) labels.push('토스 시그널');
    if (status.providers.disclosure) labels.push('공시');
    return labels.join(' · ');
  }
  return [
    providerStateLabel('네이버', states.news),
    providerStateLabel('토스 뉴스', states.tossNews),
    providerStateLabel('토스 시그널', states.tossSignal),
    providerStateLabel('공시', states.disclosure),
  ].join(' · ');
}

function agentMonitorWatchScopeLabel(
  watchPolicy: AgentEventMonitorStatusPayload['watchPolicy'],
): string {
  const label = watchPolicy.sources.map((source) => {
    switch (source) {
      case 'favorite':
        return '즐겨찾기';
      case 'agent_event':
        return '에이전트 이벤트';
      case 'tracked':
        return '로컬 캐시';
    }
  }).join(' · ');
  return watchPolicy.fullMarket ? `${label} · 전체시장` : label;
}

function agentMonitorDispatchPolicyLabel(
  policy: AgentEventMonitorStatusPayload['dispatchPolicy'],
): string {
  const min = Math.round(policy.targetFirstSeenToDispatchMs.min / 1_000);
  const max = Math.round(policy.targetFirstSeenToDispatchMs.max / 1_000);
  return `처음 감지 후 ${min}-${max}초 목표`;
}

function agentMonitorProviderPolicyLabel(
  policies: AgentEventMonitorStatusPayload['providerPolicies'],
): string {
  return [
    providerPolicyLabel('네이버', policies.news),
    providerPolicyLabel('토스 뉴스', policies.tossNews),
    providerPolicyLabel('토스 시그널', policies.tossSignal),
    providerPolicyLabel('공시', policies.disclosure),
  ].join(' · ');
}

function providerPolicyLabel(
  label: string,
  policy: AgentEventMonitorStatusPayload['providerPolicies']['news'],
): string {
  if (!policy.enabled) return `${label} 꺼짐`;
  return `${label} ${Math.round(policy.cooldownMs / 1_000)}초`;
}

function agentMonitorProviderObservationLabel(
  observations: AgentEventMonitorStatusPayload['providerObservations'],
): string {
  return [
    providerObservationLabel('네이버', observations.news),
    providerObservationLabel('토스 뉴스', observations.tossNews),
    providerObservationLabel('토스 시그널', observations.tossSignal),
    providerObservationLabel('공시', observations.disclosure),
  ].join(' · ');
}

function providerObservationLabel(
  label: string,
  observation: AgentEventMonitorStatusPayload['providerObservations']['news'],
): string {
  switch (observation.lastOutcome) {
    case 'refreshed':
      return `${label} 갱신 ${providerLatencyLabel(observation.lastDurationMs)} · ${observation.lastInsertedEvents}건`;
    case 'skipped_cooldown':
      return `${label} 대기`;
    case 'failed':
      return `${label} 실패`;
    case null:
      return `${label} 대기`;
  }
}

function providerLatencyLabel(durationMs: number | null): string {
  if (durationMs === null) return '지연 정보 없음';
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(1)}초`;
}

function agentMonitorTossSignalContractLabel(
  contract: AgentEventMonitorStatusPayload['tossSignalContract'],
): string {
  const bodyLabel = contract.bodyContract === 'configured' ? '요청 형식 준비' : '관찰 필요';
  const callLabel = contract.externalCallsEnabled ? '외부 호출 켜짐' : '외부 호출 꺼짐';
  const captureLabel = contract.captureGuidance.required
    ? '사용자 로그인 + 브라우저 관찰 필요'
    : '관찰 완료';
  return `${bodyLabel} · ${callLabel} · ${captureLabel}`;
}

function agentMonitorTossSignalShapeProbeHosts(
  contract: AgentEventMonitorStatusPayload['tossSignalContract'],
): string {
  const count = contract.shapeProbeCandidates.length;
  return count > 0 ? `후보 ${count}개` : '없음';
}

function agentMonitorTossSignalSemanticPolicyLabel(
  contract: AgentEventMonitorStatusPayload['tossSignalContract'],
): string {
  if (
    contract.semanticPolicy.emptyResponse === 'supported_empty_not_actionable' &&
    contract.semanticPolicy.eventEmission === 'non_empty_items_only'
  ) {
    return '빈 응답은 비시그널 · 항목이 있을 때만 이벤트';
  }
  return '시그널 판정 정책 확인 중';
}

function providerStateLabel(
  label: string,
  state: AgentEventMonitorStatusPayload['providerStates']['news'],
): string {
  switch (state.reason) {
    case 'refresh-ready':
      return `${label} 준비`;
    case 'session-gated':
      return `${label} 세션 필요`;
    case 'session-required':
      return `${label} 로그인 필요`;
    case 'request-body-template-configured':
      return `${label} 준비`;
    case 'request-body-template-missing':
      return `${label} 요청 형식 필요`;
    case 'dart-configured':
      return `${label} 준비`;
    case 'dart-not-configured':
      return `${label} 미구성`;
    case 'disclosure-store-missing':
      return `${label} 대기`;
  }
}

export function AgentEventsFeedControl({
  events,
  deliveries,
  deliverySummary,
  busy,
  error,
  onRefresh,
}: {
  events: AgentEventPayload[] | null;
  deliveries?: AgentEventAlertDeliveryPayload[] | null;
  deliverySummary?: AgentEventAlertDeliverySummaryPayload | null;
  busy: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const latest = events?.slice(0, 5) ?? [];
  const latestDeliveries = deliveries?.slice(0, 3) ?? [];
  return (
    <div
      data-testid="agent-events-feed-control"
      style={{
        marginTop: 18,
        padding: '12px 14px',
        background: 'var(--bg-tint)',
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
          에이전트 이벤트 피드
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '2px 5px',
          }}
        >
          읽기 전용
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        감지된 이벤트와 알림 전달 상태만 표시합니다.
        <br />
        내부 키와 제공자 원문은 화면에 노출하지 않습니다.
      </div>
      <div style={{ marginTop: 10 }}>
        {events === null ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            아직 이벤트 피드를 불러오지 않았습니다.
          </div>
        ) : latest.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            아직 감지된 에이전트 이벤트가 없습니다.
          </div>
        ) : (
          latest.map((event) => <AgentEventFeedRow key={event.id} event={event} />)
        )}
      </div>
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--border-soft)',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)' }}>
          알림 전달 기록
        </div>
        {deliverySummary !== null && deliverySummary !== undefined ? (
          <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            목표 {agentEventFreshnessLabel(deliverySummary.targetFirstSeenToDispatchMs)}
            {' · '}
            목표 내 {deliverySummary.dispatchedWithinTargetCount.toLocaleString('ko-KR')}건
            {' · '}
            초과 {deliverySummary.dispatchedLateCount.toLocaleString('ko-KR')}건
          </div>
        ) : null}
        <div style={{ marginTop: 6 }}>
          {deliveries === null || deliveries === undefined ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              아직 전달 기록을 불러오지 않았습니다.
            </div>
          ) : latestDeliveries.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              아직 기록된 알림 전달 시도가 없습니다.
            </div>
          ) : (
            latestDeliveries.map((entry) => (
              <AgentEventDeliveryRow key={entry.id} entry={entry} />
            ))
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        data-testid="agent-events-feed-refresh"
        style={{
          ...operatorButtonStyle(!busy),
          width: '100%',
          marginTop: 12,
        }}
      >
        {busy ? '불러오는 중…' : '이벤트 새로고침'}
      </button>
      {error !== null && (
        <div style={operatorMessageStyle('var(--accent-soft)')}>{error}</div>
      )}
    </div>
  );
}

function AgentEventDeliveryRow({ entry }: { entry: AgentEventAlertDeliveryPayload }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '7px 0',
        borderTop: '1px solid var(--border-soft)',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
        {entry.ticker}
      </span>
      <span style={{ minWidth: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>
          {agentEventTypeLabel(entry.eventType)}
        </strong>
        {' · '}
        {agentEventDeliveryChannelLabel(entry.channel)}
        <br />
        {formatMaybeLocal(entry.createdAt)}
        {' · '}
        dispatch {agentEventFreshnessLabel(entry.dispatchLatencyMs)}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: entry.status === 'dispatched' ? 'var(--kr-up)' : 'var(--text-muted)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '2px 5px',
          whiteSpace: 'nowrap',
        }}
      >
        {agentEventDeliveryStatusLabel(entry)}
      </span>
    </div>
  );
}

function AgentEventFeedRow({ event }: { event: AgentEventPayload }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 0',
        borderTop: '1px solid var(--border-soft)',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
        {event.ticker}
      </span>
      <span style={{ minWidth: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>
          {agentEventTypeLabel(event.type)}
        </strong>
        {' · '}
        {settingsAgentEventReasonLabel(event)}
        <br />
        처음 감지 {formatMaybeLocal(event.firstSeenAt)}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: event.freshnessMs !== null && event.freshnessMs <= 30_000
            ? 'var(--kr-up)'
            : 'var(--text-muted)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '2px 5px',
          whiteSpace: 'nowrap',
        }}
      >
        {agentEventFreshnessLabel(event.freshnessMs)}
      </span>
    </div>
  );
}

function settingsAgentEventReasonLabel(event: AgentEventPayload): string {
  return agentEventUserSummary(event)
    .replace(/Provider signal surfaced after a long delay/gi, '신호 표시 지연')
    .trim();
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
        켜면 모의 시장과 운영자 재검증 도구가 표시됩니다. 실제 KIS 호출을 만들지 않는 화면 검증용 도구입니다.
      </div>
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
        Toss 차트 보강
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Toss 차트 데이터를 우선 사용합니다. KIS 차트 경로는 기본 경로가 아니며, 명시적으로 켠 이전 호환 경로에서만 사용됩니다.
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
            ? '보강 실행 준비됨'
            : '실행 시작 후 가능'}
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
  const providerSummary = health !== null
    ? formatMarketDataProviderSummary(health.marketDataProviders)
    : null;
  const kisLegacyRestSummary = health !== null
    ? formatKisLegacyRestSummary(health.kisLegacyRest)
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
              k="이전 KIS 경로"
              v={kisLegacyRestSummary?.label ?? '대기'}
              chipColor={kisLegacyRestSummary?.chipColor ?? 'var(--text-muted)'}
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
              k="데이터 소스"
              v={providerSummary?.label ?? '대기'}
              chipColor={providerSummary?.chipColor ?? 'var(--text-muted)'}
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
            이전 KIS 호출: {formatKisBudgetDetails(health.kisOutboundLimiter)}
            <br />
            Toss 가격: {formatTossQuotePollingDetails(health.tossQuotePolling)}
            <br />
            데이터 소스: {formatMarketDataProviderDetails(health.marketDataProviders)}
            <br />
            이전 KIS 경로: {formatKisLegacyRestProfileSummary(health.kisLegacyRest)}
            {health.kisLegacyRest.surfaces.map((surface) => (
              <span key={surface.id} style={{ display: 'block' }}>
                • {formatKisLegacySurfaceLabel(surface.label)}: {formatKisLegacySurfaceState(surface.state)} ·{' '}
                {formatKisLegacySurfaceMode(surface.mode)} ·{' '}
                {surface.automatic ? '자동 가능' : '자동 꺼짐'} ·{' '}
                {surface.envGate ?? '환경 제한 없음'} · {surface.primaryProvider}
                {' · '}
                {formatKisLegacyReason(surface.reason)}
              </span>
            ))}
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
                {health.marketTopMovers.rankingRateLimited && (
                  <> · {topMoversShortSourceLabel(health.marketTopMovers.coverage?.marketUniverse)} 호출 제한</>
                )}
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
    return {
      label: polling.suppressingKisPolling ? '추적 잠금' : '실시간 추적',
      chipColor: 'var(--gold-text)',
    };
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
  const fallback = polling.suppressingKisPolling
    ? polling.consecutiveFailureCount >= 2
      ? '실시간 추적 비활성'
      : '실시간 추적 억제'
    : '실시간 추적 허용';
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

function formatMarketDataProviderSummary(
  providers: RuntimeDataHealthPayload['marketDataProviders'],
): { label: string; chipColor: string } {
  const toss = providers.find((provider) => provider.providerId === 'toss-public');
  if (toss !== undefined) {
    if (toss.status === 'ready') {
      return { label: 'Toss 기본', chipColor: 'var(--kr-up)' };
    }
    if (toss.status === 'degraded') {
      return { label: 'Toss 점검', chipColor: 'var(--gold-text)' };
    }
  }
  const kis = providers.find((provider) => provider.providerId === 'kis-legacy');
  if (kis?.status === 'ready') {
    return { label: '실시간 추적', chipColor: 'var(--gold-text)' };
  }
  return { label: '대기', chipColor: 'var(--text-muted)' };
}

function formatMarketDataProviderDetails(
  providers: RuntimeDataHealthPayload['marketDataProviders'],
): string {
  if (providers.length === 0) return '미구성';
  return providers.map((provider) => {
    const status = provider.status === 'ready'
      ? '준비'
      : provider.status === 'degraded'
        ? '주의'
        : '꺼짐';
    return `${formatProviderLabel(provider.label)} ${status}`;
  }).join(' · ');
}

function formatProviderLabel(label: string): string {
  return label
    .replace(/KIS legacy REST helper/gi, '이전 호환 보조 경로')
    .replace(/legacy REST helper/gi, '이전 호환 보조 경로')
    .replace(/fallback/gi, '보조');
}

function formatKisLegacyRestSummary(
  legacyRest: RuntimeDataHealthPayload['kisLegacyRest'],
): { label: string; chipColor: string } {
  const availableCount = legacyRest.surfaces.filter((surface) => surface.state === 'available').length;
  const suppressedCount = legacyRest.surfaces.filter((surface) => surface.state === 'suppressed').length;
  const offCount = legacyRest.surfaces.filter((surface) => surface.state === 'off').length;
  if (availableCount > 0) {
    return {
      label: `활성 ${availableCount} / 억제 ${suppressedCount} / 꺼짐 ${offCount}`,
      chipColor: 'var(--kr-up)',
    };
  }
  if (suppressedCount > 0) {
    return {
      label: `억제 ${suppressedCount} / 꺼짐 ${offCount}`,
      chipColor: 'var(--gold-text)',
    };
  }
  return {
    label: `꺼짐 ${offCount}`,
    chipColor: 'var(--text-muted)',
  };
}

function formatKisLegacyRestProfileSummary(
  legacyRest: RuntimeDataHealthPayload['kisLegacyRest'],
): string {
  return [
    `역할=${kisLegacyRoleLabel(legacyRest.role)}`,
    `실시간=${legacyRest.realtimeRail ? '사용' : '미사용'}`,
    `계좌/주문 기준=${legacyRest.accountOrderTruthSource ? '예' : '아니오'}`,
    `실거래 기준=${legacyRest.liveTradingTruthSource ? '예' : '아니오'}`,
  ].join(' · ');
}

function kisLegacyRoleLabel(role: RuntimeDataHealthPayload['kisLegacyRest']['role']): string {
  switch (role) {
    case 'optional_fallback':
      return '선택 보조';
    default:
      return String(role).replace(/fallback/gi, '보조');
  }
}

function formatKisLegacySurfaceState(state: RuntimeDataHealthPayload['kisLegacyRest']['surfaces'][number]['state']): string {
  switch (state) {
    case 'available':
      return '활성';
    case 'suppressed':
      return '억제';
    default:
      return '꺼짐';
  }
}

function formatKisLegacySurfaceLabel(label: string): string {
  switch (label) {
    case 'Foreground quote legacy REST helper':
      return '전경 시세 이전 호환 보조';
    case 'Watchlist quote legacy REST helper':
      return '관심종목 시세 이전 호환 보조';
    case 'Daily chart legacy REST helper':
      return '일봉 차트 이전 호환 보조';
    case 'Minute chart legacy REST helper':
      return '분봉 차트 이전 호환 보조';
    case 'Master metadata refresh':
      return '마스터 메타데이터 수동 갱신';
    case 'KIS watchlist import':
      return 'KIS 관심종목 수동 가져오기';
    default:
      return label;
  }
}

function formatKisLegacySurfaceMode(mode: RuntimeDataHealthPayload['kisLegacyRest']['surfaces'][number]['mode']): string {
  switch (mode) {
    case 'credentials_required':
      return '자격증명 필요';
    case 'suppressed_by_default':
      return '기본 억제';
    case 'explicit_opt_in':
      return '직접 켬';
    case 'conditional_fallback':
      return '조건부 보조';
    case 'manual_only':
      return '수동 도구';
  }
}

function formatKisLegacyReason(reason: string): string {
  return reason
    .replace(/Toss quote refresh가/gi, 'Toss 가격 갱신이')
    .replace(/Toss quote refresh는/gi, 'Toss 가격 갱신은')
    .replace(/Toss quote refresh/gi, 'Toss 가격 갱신')
    .replace(/KIS credentials/gi, 'KIS 자격증명')
    .replace(/KIS REST 보조 경로/gi, 'KIS 이전 호환 보조 경로')
    .replace(/KIS foreground quote REST helper/gi, 'KIS 전경 시세 이전 호환 보조 경로')
    .replace(/KIS watchlist REST/gi, 'KIS 관심종목 이전 호환 경로')
    .replace(/KIS chart REST helper/gi, 'KIS 차트 이전 호환 보조 경로')
    .replace(/KIS chart REST/gi, 'KIS 차트 이전 호환 경로')
    .replace(/KIS WS rail/gi, 'KIS 실시간 추적')
    .replace(/realtime/gi, '실시간')
    .replace(/KIS refresh/gi, 'KIS 갱신')
    .replace(/manual helper/gi, '수동 도구')
    .replace(/legacy REST helper/gi, '이전 호환 보조 경로')
    .replace(/legacy REST/gi, '이전 호환 경로')
    .replace(/Toss quote polling/gi, 'Toss 가격 갱신')
    .replace(/fallback/gi, '보조');
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
    `가격 갱신 ${classRate('polling')}/s`,
    `랭킹 ${classRate('ranking')}/s`,
    `전경 ${classRate('foreground')}/s`,
    `제한 ${window.throttlePerMin.toFixed(1)}/min`,
    `대기 ${limiter.queueDepth}`,
    limiter.globalMinStartGapMs !== null
      ? `전역 간격 ${limiter.globalMinStartGapMs}ms`
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

function formatTtlMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '만료';
  if (ms < 120_000) return `${Math.ceil(ms / 1000)}초`;
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}분`;
  return `${Math.ceil(minutes / 60)}시간`;
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

async function optionalTossAccountSurface<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
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

function tossSessionExtensionLabel(state: 'succeeded' | 'failed' | 'timeout' | 'rejected'): string {
  switch (state) {
    case 'succeeded':
      return '완료';
    case 'failed':
      return '실패';
    case 'timeout':
      return '시간 초과';
    case 'rejected':
      return '거절됨';
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
      return '확인 중';
    case 'succeeded':
      return '완료';
    case 'failed':
      return '실패';
    case 'cancelled':
      return '취소됨';
  }
}

function formatTossLoginDiagnostic(login: TossLoginStatusPayload | null): string {
  if (login === null) return '대기';
  const parts = [tossLoginRailNotice(login) ?? tossLoginLabel(login)];
  if (login.persistent) {
    parts.push('persistent');
  } else if (login.state !== 'idle') {
    parts.push(
      `쿠키 ${login.cookieCount}`,
      `local ${login.localStorageKeyCount}`,
      `session ${login.sessionStorageKeyCount}`,
    );
  }
  if (login.missingCookieCount > 0 || login.missingLocalStorageKeyCount > 0) {
    parts.push(`누락 ${login.missingCookieCount + login.missingLocalStorageKeyCount}`);
  }
  if (login.finishedAt !== null) {
    parts.push(`종료 ${formatMaybeLocal(login.finishedAt)}`);
  }
  return parts.join(' · ');
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
    .map((item) => `${formatTossRealtimeEventType(item.type)} ${item.count}`)
    .join(', ');
}

function formatTossRealtimeEventType(type: string): string {
  return type
    .replace(/wts-notification/gi, '토스 알림')
    .replace(/share-holdings/gi, '보유 변동')
    .replace(/order-refresh/gi, '주문 갱신')
    .replace(/portfolio-positions/gi, '포트폴리오 갱신');
}

function formatTossRefreshSourceType(sourceType: string): string {
  return sourceType
    .replace(/share-holdings/gi, '보유 변동')
    .replace(/order-refresh/gi, '주문 갱신')
    .replace(/portfolio-positions/gi, '포트폴리오 갱신')
    .replace(/completed-orders/gi, '체결 주문')
    .replace(/pending-orders/gi, '대기 주문');
}

function formatTossRefreshResultLabel(
  result: TossSseRefreshResultsPayload['items'][number]['result'],
): string {
  switch (result) {
    case 'refreshed':
      return '갱신됨';
    case 'failed':
      return '실패';
    case 'throttled':
      return '속도 제한';
    case 'in_flight':
      return '진행 중';
    case 'ignored':
      return '무시됨';
  }
}

function tossRefreshResultColor(
  result: TossSseRefreshResultsPayload['items'][number]['result'],
): string {
  switch (result) {
    case 'refreshed':
      return 'var(--kr-up)';
    case 'failed':
      return 'var(--kr-down)';
    case 'throttled':
    case 'in_flight':
      return 'var(--gold-text)';
    case 'ignored':
      return 'var(--text-muted)';
  }
}

function kisWsSourceLabel(source: KisWsSlotSource): string {
  switch (source) {
    case 'holding':
      return '보유종목';
    case 'user_pin':
      return '사용자 고정핀';
    case 'current_view':
      return '현재 화면';
    case 'recent_news':
      return '최근 뉴스';
    case 'recent_disclosure':
      return '최근 공시';
    case 'toss_signal':
      return '토스 시그널';
    case 'agent_candidate':
      return '에이전트 후보';
    case 'manual_watchlist':
      return '관심종목';
    case 'top100_rotation':
      return 'TOP100 샘플';
  }
}

function formatKisWsCandidateReason(reason: string): string {
  return reason
    .replace(/realtime/gi, '실시간')
    .replace(/pinned/gi, '고정')
    .replace(/watchlist/gi, '관심종목')
    .replace(/agent/gi, '에이전트')
    .replace(/top100/gi, 'TOP100');
}

function orderIntentAmountLabel(preview: OrderIntentPreviewPayload): string {
  if (preview.cashAmount !== null) return formatKrw(preview.cashAmount);
  if (preview.quantity !== null) return `${preview.quantity.toLocaleString('ko-KR')}주`;
  return '금액 미지정';
}

function orderIntentLivePolicyLabel(policy: OrderIntentLivePolicyPayload): string {
  if (!policy.liveExecutionEnabled && policy.killSwitch === 'engaged') {
    return '정책 미승인 · 긴급 정지 켜짐';
  }
  return policy.policyApproved ? '정책 승인됨' : '정책 미승인';
}

function orderIntentAutomationReadinessSummary(policy: OrderIntentLivePolicyPayload): string {
  if (policy.automationReadinessGaps.length === 0) return '추가 준비 항목 없음';
  const visible = policy.automationReadinessGaps.slice(0, 4);
  const suffix = policy.automationReadinessGaps.length > visible.length
    ? ` 외 ${policy.automationReadinessGaps.length - visible.length}개`
    : '';
  return `${visible.map((gap) => gap.label).join(' · ')}${suffix}`;
}

function orderIntentLifecycleSummary(preview: OrderIntentPreviewPayload): string {
  return preview.lifecycle
    .map((step) => `${step.label} ${orderIntentLifecycleStatusLabel(step.status)}`)
    .join(' / ');
}

function orderIntentLifecycleStatusLabel(
  status: OrderIntentPreviewPayload['lifecycle'][number]['status'],
): string {
  switch (status) {
    case 'complete':
      return '완료';
    case 'pending':
      return '대기';
    case 'blocked':
      return '차단';
    case 'not_ready':
      return '준비 안됨';
  }
}

function orderIntentAuditEventLabel(
  event: OrderIntentAuditEntryPayload['event'],
): string {
  switch (event) {
    case 'preview_created':
      return '미리보기 생성';
    case 'live_execution_blocked':
      return '실거래 차단';
    case 'confirm_challenge_created':
      return '승인 확인 생성';
    case 'confirm_token_verified_live_locked':
      return '승인 확인 완료';
    case 'confirm_token_rejected':
      return '승인 거절';
    case 'confirm_token_expired':
      return '승인 만료';
  }
}

function orderIntentApprovalChallengeStatusLabel(
  status: OrderIntentApprovalChallengePayload['status'],
): string {
  switch (status) {
    case 'pending_confirmation':
      return '승인 대기';
    case 'confirmed_live_locked':
      return '승인 확인 · 실행 잠금';
    case 'rejected':
      return '승인 거절';
    case 'expired':
      return '승인 만료';
  }
}

function orderSideLabel(side: string): string {
  if (side === 'buy') return '매수';
  if (side === 'sell') return '매도';
  return side;
}

function orderExecutionModeLabel(mode: string): string {
  if (mode === 'simulated') return '모의';
  if (mode === 'paper') return '페이퍼';
  if (mode === 'live') return '실거래';
  return mode;
}

function orderTypeLabel(type: string): string {
  if (type === 'market') return '시장가';
  if (type === 'limit') return '지정가';
  return type;
}

function agentEventTypeLabel(type: AgentEventPayload['type']): string {
  switch (type) {
    case 'news_detected':
      return '뉴스 감지';
    case 'disclosure_detected':
      return '공시 감지';
    case 'toss_signal_detected':
      return 'Toss 시그널';
    case 'market_movement_detected':
      return '시장 움직임';
    case 'watchlist_changed':
      return '관심 변경';
    case 'position_changed':
      return '보유 변경';
    case 'order_intent_created':
      return '주문 후보 생성';
    case 'order_intent_skipped':
      return '주문 후보 제외';
    case 'approval_requested':
      return '승인 요청';
    case 'approval_granted':
      return '승인 기록';
    case 'approval_denied':
      return '승인 거절';
    case 'execution_locked':
      return '실행 잠금';
    case 'risk_check_completed':
      return '리스크 확인';
    case 'preview_created':
      return '미리보기 생성';
  }
}

function agentEventFreshnessLabel(freshnessMs: number | null): string {
  if (freshnessMs === null) return '지연 정보 없음';
  return compactAgentEventDurationLabel(freshnessMs);
}

function compactAgentEventDurationLabel(durationMs: number): string {
  const normalizedMs = Math.max(0, Math.round(durationMs));
  if (normalizedMs < 1_000) return `${normalizedMs}ms`;

  const seconds = normalizedMs / 1_000;
  if (seconds < 60) return `${seconds.toFixed(1)}초`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간`;

  return `${Math.floor(hours / 24)}일`;
}

function agentEventDeliveryChannelLabel(
  channel: AgentEventAlertDeliveryPayload['channel'],
): string {
  switch (channel) {
    case 'browser-sse':
      return '브라우저 알림';
  }
}

function agentEventDeliveryStatusLabel(entry: AgentEventAlertDeliveryPayload): string {
  switch (entry.status) {
    case 'dispatched':
      return `전달 ${entry.clientCount}명`;
    case 'skipped_no_client':
      return '연결 없음';
  }
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
        한국거래소 전 종목 마스터를 검색용 로컬 캐시로 보유합니다. Toss 검색을
        우선 사용하며, KIS 마스터 갱신은 필요한 경우 수동으로 실행합니다.
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

function formatKrw(value: number): string {
  if (!Number.isFinite(value)) return '수집 중';
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
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
          1m/3m/5m 차트는 Toss 차트와 저장된 1분봉을 우선 사용합니다.
          과거 분봉은 저장된 봉이 있을 때만 표시하고, KIS 차트 경로는 명시적으로 켠 이전 호환 경로에서만 사용됩니다.
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
