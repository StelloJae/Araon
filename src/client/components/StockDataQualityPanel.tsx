import { useEffect, useMemo, useState } from 'react';
import type { StockViewModel } from '../lib/view-models';
import { getStockCandles } from '../lib/api-client';

interface CandleQualitySnapshot {
  minuteCount: number;
  minuteNewestAt: string | null;
  dailyCount: number;
  dailyNewestAt: string | null;
}

interface StockDataQualityPanelProps {
  stock: StockViewModel;
}

export function StockDataQualityPanel({ stock }: StockDataQualityPanelProps) {
  const [snapshot, setSnapshot] = useState<CandleQualitySnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSnapshot(null);
    void Promise.all([
      getStockCandles(stock.code, { interval: '1m', range: '1d' }),
      getStockCandles(stock.code, { interval: '1D', range: '3m' }),
    ])
      .then(([minute, daily]) => {
        if (cancelled) return;
        setSnapshot({
          minuteCount: minute.items.length,
          minuteNewestAt: minute.coverage.newestBucketAt,
          dailyCount: daily.items.length,
          dailyNewestAt: daily.coverage.newestBucketAt,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [stock.code]);

  const quality = useMemo(
    () => buildStockDataQuality(stock, snapshot),
    [stock, snapshot],
  );

  return (
    <StockDataQualityPanelView
      quality={quality}
      loading={snapshot === null && !failed}
      failed={failed}
    />
  );
}

export function StockDataQualityPanelView({
  quality,
  loading,
  failed,
}: {
  quality: StockDataQuality;
  loading: boolean;
  failed: boolean;
}) {
  return (
    <div
      data-testid="stock-data-quality"
      style={{
        marginTop: 10,
        padding: '9px 11px',
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-tint)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>
        데이터 품질 {loading ? '확인 중' : `${quality.score}점`}
      </strong>
      <span style={{ fontSize: 11, color: quality.color, fontWeight: 800 }}>
        {failed ? '확인 실패' : quality.stateLabel}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {quality.reasons.join(' · ')}
      </span>
    </div>
  );
}

interface StockDataQuality {
  score: number;
  stateLabel: string;
  color: string;
  reasons: string[];
}

export function buildStockDataQuality(
  stock: StockViewModel,
  snapshot: CandleQualitySnapshot | null,
): StockDataQuality {
  let score = 0;
  const reasons: string[] = [];

  if (!stock.isSnapshot && stock.updatedAt !== '') {
    score += 30;
    reasons.push(priceSourceReason(stock.source));
  } else {
    reasons.push('가격 snapshot');
  }

  if ((snapshot?.minuteCount ?? 0) > 0) {
    score += 25;
    reasons.push(`1분봉 ${snapshot?.minuteCount ?? 0}개`);
  } else {
    reasons.push('1분봉 수집 중');
  }

  if ((snapshot?.dailyCount ?? 0) > 0) {
    score += 25;
    reasons.push(`일봉 ${snapshot?.dailyCount ?? 0}개`);
  } else {
    reasons.push('일봉 보강 대기');
  }

  if (stock.volumeBaselineStatus === 'ready') {
    score += 20;
    reasons.push('거래량 기준선 준비');
  } else if (stock.volumeBaselineStatus === 'collecting') {
    reasons.push('거래량 기준선 수집 중');
  } else {
    reasons.push('거래량 기준선 없음');
  }

  return {
    score,
    stateLabel: score >= 80 ? '정상' : score >= 50 ? '부분' : '수집 중',
    color: score >= 80
      ? 'var(--kr-up)'
      : score >= 50
        ? 'var(--gold-text)'
        : 'var(--text-muted)',
    reasons,
  };
}

function priceSourceReason(source: StockViewModel['source']): string {
  switch (source) {
    case 'ws-integrated':
      return '통합 실시간';
    case 'ws-krx':
      return 'KRX 실시간';
    case 'ws-nxt':
      return 'NXT 실시간';
    case 'rest':
      return 'REST 보조';
    default:
      return '실시간 LIVE';
  }
}
