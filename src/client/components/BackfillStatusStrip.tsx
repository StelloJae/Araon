import { useEffect, useState } from 'react';
import {
  getRuntimeDataHealth,
  type RuntimeDataHealthPayload,
} from '../lib/api-client';

const REFRESH_MS = 30_000;

type BackfillTone = 'ok' | 'watch' | 'danger' | 'muted';

interface BackfillStatusCopy {
  label: string;
  detail: string;
  compactLabel: string;
  compactDetail: string | null;
  tone: BackfillTone;
}

function useDailyBackfillStatus(): BackfillStatusCopy | null {
  const [health, setHealth] = useState<RuntimeDataHealthPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await getRuntimeDataHealth();
        if (cancelled) return;
        setHealth(next);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    const id = window.setInterval(() => {
      void load();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (failed) return {
    label: '과거 일봉 보강 상태 확인 실패',
    detail: '설정의 데이터 건강 상태에서 다시 확인할 수 있습니다.',
    compactLabel: '일봉 오류',
    compactDetail: null,
    tone: 'danger',
  };
  if (health === null) return null;

  return describeDailyBackfillStatus(health);
}

export function BackfillStatusPill() {
  const status = useDailyBackfillStatus();
  if (status === null) return null;
  return <BackfillStatusPillView status={status} />;
}

export function BackfillStatusPillView({ status }: { status: BackfillStatusCopy }) {
  const compactText =
    status.compactDetail === null
      ? status.compactLabel
      : `${status.compactLabel} ${status.compactDetail}`;
  return (
    <div
      data-testid="backfill-status-pill"
      className="backfill-status-pill"
      title={compactText}
      aria-label={compactText}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        maxWidth: 140,
        height: 28,
        padding: '0 8px',
        border: `1px solid ${toneColor(status.tone, 0.28)}`,
        background: toneColor(status.tone, 0.07),
        borderRadius: 999,
        color: 'var(--text-muted)',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        flex: '0 1 auto',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: toneTextColor(status.tone),
          flexShrink: 0,
        }}
      />
      <span
        style={{
          color: toneTextColor(status.tone),
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {status.compactLabel}
      </span>
      {status.compactDetail !== null && (
        <span
          style={{
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {status.compactDetail}
        </span>
      )}
    </div>
  );
}

export function describeDailyBackfillStatus(
  health: RuntimeDataHealthPayload,
): BackfillStatusCopy {
  const daily = health.candles.find((row) => row.interval === '1d') ?? null;
  const latestDaily = daily?.newestBucketAt === null || daily?.newestBucketAt === undefined
    ? '일봉 없음'
    : `최신 일봉 ${formatShortDate(daily.newestBucketAt)}`;
  const calls = `${health.backfill.dailyCallCount}회`;

  if (!health.backfill.enabled) {
    return {
      label: '과거 일봉 자동 보강 비상정지',
      detail: `${latestDaily} · REST/실시간 화면은 계속 동작합니다.`,
      compactLabel: '일봉 중지',
      compactDetail: null,
      tone: 'danger',
    };
  }
  if (health.backfill.running) {
    if (health.backfill.lastAttempted === 0) {
      return {
        label: '과거 일봉 자동 보강 확인 중',
        detail: `${latestDaily} · 보강할 종목을 확인하는 중입니다 · 오늘 호출 ${calls}`,
        compactLabel: '일봉 확인 중',
        compactDetail: null,
        tone: 'muted',
      };
    }
    return {
      label: '과거 일봉 자동 보강 실행 중',
      detail: `이번 실행 ${health.backfill.lastSucceeded}/${health.backfill.lastAttempted} 성공 · 오늘 호출 ${calls}`,
      compactLabel: '일봉 보강 중',
      compactDetail: `${health.backfill.lastSucceeded}/${health.backfill.lastAttempted}`,
      tone: 'ok',
    };
  }
  if (health.backfill.cooldownActive && health.backfill.cooldownUntil !== null) {
    return {
      label: '과거 일봉 자동 보강 쿨다운',
      detail: `${formatShortDateTime(health.backfill.cooldownUntil)}까지 대기 · 오늘 호출 ${calls}`,
      compactLabel: '일봉 쿨다운',
      compactDetail: calls,
      tone: 'watch',
    };
  }
  if (health.backfill.lastSkippedReason === 'market_not_allowed') {
    return {
      label: '과거 일봉 자동 보강 장중 대기',
      detail: `${latestDaily} · 20:05 이후 또는 주말에 자동 실행`,
      compactLabel: '일봉 장중 대기',
      compactDetail: null,
      tone: 'muted',
    };
  }
  if (health.backfill.lastSkippedReason === 'no_stale_tickers') {
    return {
      label: '과거 일봉 자동 보강 최신 상태',
      detail: `${latestDaily} · 보강 필요한 화면 종목이 없습니다`,
      compactLabel: '일봉 최신',
      compactDetail: formatCompactLatestDaily(daily?.newestBucketAt),
      tone: 'ok',
    };
  }
  return {
    label: '과거 일봉 자동 보강 대기',
    detail: `${latestDaily} · 즐겨찾기와 화면 종목을 낮은 속도로 계속 보강 · 오늘 호출 ${calls}`,
    compactLabel: '일봉 대기',
    compactDetail: calls,
    tone: 'muted',
  };
}

function formatCompactLatestDaily(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return formatShortDate(value);
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
  });
}

function formatShortDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toneTextColor(tone: BackfillTone): string {
  switch (tone) {
    case 'ok':
      return 'var(--kr-up)';
    case 'watch':
      return 'var(--gold-text)';
    case 'danger':
      return 'var(--kr-down)';
    case 'muted':
      return 'var(--text-secondary)';
  }
}

function toneColor(tone: BackfillTone, alpha: number): string {
  switch (tone) {
    case 'ok':
      return `rgba(0, 200, 150, ${alpha})`;
    case 'watch':
      return `rgba(245, 170, 40, ${alpha})`;
    case 'danger':
      return `rgba(246, 70, 93, ${alpha})`;
    case 'muted':
      return `rgba(120, 135, 160, ${alpha})`;
  }
}
