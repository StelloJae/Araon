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
  tone: BackfillTone;
}

export function BackfillStatusStrip() {
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

  if (failed) {
    return (
      <BackfillStatusStripView
        status={{
          label: '과거 일봉 보강 상태 확인 실패',
          detail: '설정의 데이터 건강 상태에서 다시 확인할 수 있습니다.',
          tone: 'danger',
        }}
      />
    );
  }
  if (health === null) return null;

  return <BackfillStatusStripView status={describeDailyBackfillStatus(health)} />;
}

export function BackfillStatusStripView({ status }: { status: BackfillStatusCopy }) {
  return (
    <div
      data-testid="backfill-status-strip"
      style={{
        maxWidth: 1680,
        margin: '0 auto 14px',
        padding: '0 24px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 12px',
          border: `1px solid ${toneColor(status.tone, 0.35)}`,
          background: toneColor(status.tone, 0.08),
          borderRadius: 8,
          color: 'var(--text-secondary)',
          fontSize: 12,
          lineHeight: 1.45,
        }}
      >
        <span style={{ fontWeight: 900, color: toneTextColor(status.tone) }}>
          {status.label}
        </span>
        <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
          {status.detail}
        </span>
      </div>
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
  const budget = `${health.backfill.dailyCallCount}/${health.backfill.dailyCallBudget}회`;

  if (!health.backfill.enabled) {
    return {
      label: '과거 일봉 자동 보강 비상정지',
      detail: `${latestDaily} · REST/실시간 화면은 계속 동작합니다.`,
      tone: 'danger',
    };
  }
  if (health.backfill.running) {
    return {
      label: '과거 일봉 자동 보강 실행 중',
      detail: `이번 실행 ${health.backfill.lastSucceeded}/${health.backfill.lastAttempted} 성공 · 오늘 예산 ${budget}`,
      tone: 'ok',
    };
  }
  if (health.backfill.cooldownActive && health.backfill.cooldownUntil !== null) {
    return {
      label: '과거 일봉 자동 보강 쿨다운',
      detail: `${formatShortDateTime(health.backfill.cooldownUntil)}까지 대기 · 오늘 예산 ${budget}`,
      tone: 'watch',
    };
  }
  if (health.backfill.dailyCallCount >= health.backfill.dailyCallBudget) {
    return {
      label: '과거 일봉 자동 보강 오늘 예산 소진',
      detail: `${latestDaily} · 내일 다시 이어집니다 · 오늘 예산 ${budget}`,
      tone: 'watch',
    };
  }
  if (health.backfill.lastSkippedReason === 'market_not_allowed') {
    return {
      label: '과거 일봉 자동 보강 장중 대기',
      detail: `${latestDaily} · 20:05 이후 또는 주말에 자동 실행`,
      tone: 'muted',
    };
  }
  if (health.backfill.lastSkippedReason === 'no_stale_tickers') {
    return {
      label: '과거 일봉 자동 보강 최신 상태',
      detail: `${latestDaily} · 보강 필요한 추적 종목이 없습니다`,
      tone: 'ok',
    };
  }
  return {
    label: '과거 일봉 자동 보강 대기',
    detail: `${latestDaily} · favorites와 추적 종목을 낮은 속도로 보강 · 오늘 예산 ${budget}`,
    tone: 'muted',
  };
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
