import type { CSSProperties } from 'react';

import type {
  TossAccountSummaryPayload,
  TossCompletedOrdersPayload,
  TossPendingOrdersPayload,
  TossPortfolioPosition,
  TossPortfolioPositionsPayload,
  TossTransactionsOverviewPayload,
  TossTransactionsPayload,
  TossWatchlistPayload,
} from '../lib/api-client';

interface TossAccountRailProps {
  sessionReady: boolean;
  loading: boolean;
  summary: TossAccountSummaryPayload | null;
  positions: TossPortfolioPositionsPayload | null;
  pendingOrders: TossPendingOrdersPayload | null;
  completedOrders: TossCompletedOrdersPayload | null;
  transactionsOverview: TossTransactionsOverviewPayload | null;
  transactions: TossTransactionsPayload | null;
  watchlist: TossWatchlistPayload | null;
  error?: string | null;
  statusMessage?: string | null;
  onRefresh: () => void;
  onLoginStart?: () => void;
}

export function TossAccountRail({
  sessionReady,
  loading,
  summary,
  positions,
  pendingOrders,
  completedOrders,
  transactionsOverview,
  transactions,
  watchlist,
  error = null,
  statusMessage = null,
  onRefresh,
  onLoginStart,
}: TossAccountRailProps) {
  const positionCount = positions?.positions.length ?? 0;
  const positionGroups = groupPositions(positions?.positions ?? []);
  const pendingCount = pendingOrders?.orders.length ?? 0;
  const completedCount = completedOrders?.orders.length ?? 0;
  const transactionCount = transactions?.items.length ?? 0;
  const watchlistCount = watchlist?.items.length ?? 0;
  const orderableAmountKrw =
    transactionsOverview?.orderableAmountKrw ?? summary?.orderableAmountKrw ?? 0;
  const orderableAmountUsd =
    transactionsOverview?.orderableAmountUsd ?? summary?.orderableAmountUsd ?? 0;
  const actionDisabled = loading || (!sessionReady && onLoginStart === undefined);
  const handleAction = sessionReady ? onRefresh : onLoginStart;
  return (
    <div style={shellStyle} data-testid="toss-account-rail">
      <div style={headerStyle}>
        <div style={accountMarkStyle} aria-hidden>T</div>
        <div style={headerTextStyle}>
          <div style={titleStyle}>기본계좌</div>
          <div style={subtitleInlineStyle}>
            {sessionReady ? 'Toss 세션 준비' : '토스 로그인 필요'}
          </div>
        </div>
        <span style={pillStyle}>{loading ? '수집 중' : '읽기 전용'}</span>
        {sessionReady && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Toss 계좌 새로고침"
            title="Toss 계좌 새로고침"
            style={{
              ...miniRefreshButtonStyle,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.56 : 1,
            }}
          >
            새로고침
          </button>
        )}
      </div>
      <div style={bodyStyle}>
        {summary === null ? (
          <div style={emptyStyle}>
            {formatRailStatusMessage(error, statusMessage)}
          </div>
        ) : (
          <>
	            <div style={cashStripStyle} aria-label="주문 가능 현금">
	              <div style={cashCellStyle}>
	                <span style={cashLabelStyle}>원화</span>
	                <strong style={cashAmountStyle}>{formatKrw(orderableAmountKrw)}</strong>
	              </div>
	              <div style={cashDividerStyle} />
	              <div style={cashCellStyle}>
	                <span style={cashLabelStyle}>달러</span>
	                <strong style={cashAmountStyle}>{formatUsd(orderableAmountUsd)}</strong>
	              </div>
	            </div>
            <div style={investmentBlockStyle}>
              <div style={assetLabelStyle}>내 투자</div>
              <div style={assetValueStyle}>{formatKrw(summary.totalAssetAmount)}</div>
              <div
                style={{
                  ...assetPnlStyle,
                  color: summary.evaluatedProfitAmount >= 0 ? 'var(--kr-up)' : 'var(--kr-down)',
                }}
              >
                {formatSignedKrw(summary.evaluatedProfitAmount)} ({formatSignedPct(summary.profitRate)})
              </div>
            </div>
            <div style={statusLineStyle}>
              <span>보유 {positionCount.toLocaleString('ko-KR')}종목</span>
              <span>대기 {pendingCount.toLocaleString('ko-KR')}건</span>
              <span>체결 {completedCount.toLocaleString('ko-KR')}건</span>
              <span>거래 {transactionCount.toLocaleString('ko-KR')}건</span>
              <span>관심 {watchlistCount.toLocaleString('ko-KR')}종목</span>
            </div>
            {positionCount > 0 ? (
              <div style={positionsListStyle} aria-label="Toss 보유 포지션">
                {positionGroups.map((group) => (
                  group.positions.length > 0 && (
                    <section key={group.key} style={positionGroupStyle}>
                      <div style={positionGroupLabelStyle}>{group.label}</div>
                      {group.positions.map((position) => (
                        <PositionRow key={`${position.marketCode}-${position.symbol}`} position={position} />
                      ))}
                    </section>
                  )
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
      {!sessionReady && (
        <button
          type="button"
          onClick={handleAction}
          disabled={actionDisabled}
          style={{
            ...loginButtonStyle,
            cursor: actionDisabled ? 'not-allowed' : 'pointer',
            opacity: actionDisabled ? 0.56 : 1,
          }}
        >
          토스 QR 로그인
        </button>
      )}
    </div>
  );
}

function PositionRow({ position }: { position: TossPortfolioPosition }) {
  const foreign = isForeignPosition(position);
  const amount = foreign ? formatUsd(position.marketValueUsd || position.marketValue) : formatKrw(position.marketValue);
  const pnl = foreign
    ? formatSignedUsd(position.unrealizedPnlUsd || position.unrealizedPnl)
    : formatSignedKrw(position.unrealizedPnl);
  const profitRate = foreign && position.profitRateUsd !== 0
    ? position.profitRateUsd
    : position.profitRate;
  const pnlValue = foreign ? position.unrealizedPnlUsd || position.unrealizedPnl : position.unrealizedPnl;
  return (
    <div style={positionRowStyle}>
      <span style={positionLogoStyle}>{position.name.slice(0, 1)}</span>
      <span style={positionNameStyle}>
        <strong>{position.name}</strong>
        <em style={positionMetaStyle}>{formatQuantity(position.quantity)}주</em>
      </span>
      <span style={positionAmountStyle}>
        <strong>{amount}</strong>
        <em
          style={{
            ...positionPnlStyle,
            color: pnlValue >= 0 ? 'var(--kr-up)' : 'var(--kr-down)',
          }}
        >
          {pnl} · {formatSignedPct(profitRate)}
        </em>
      </span>
    </div>
  );
}

function groupPositions(positions: readonly TossPortfolioPosition[]): Array<{
  key: 'us' | 'kr' | 'other';
  label: string;
  positions: TossPortfolioPosition[];
}> {
  const foreignPositions: TossPortfolioPosition[] = [];
  const domesticPositions: TossPortfolioPosition[] = [];
  const otherPositions: TossPortfolioPosition[] = [];
  for (const position of positions) {
    if (isForeignPosition(position)) {
      foreignPositions.push(position);
    } else if (isDomesticPosition(position)) {
      domesticPositions.push(position);
    } else {
      otherPositions.push(position);
    }
  }
  return [
    { key: 'us', label: '해외주식', positions: foreignPositions },
    { key: 'kr', label: '국내주식', positions: domesticPositions },
    { key: 'other', label: '기타', positions: otherPositions },
  ];
}

function isForeignPosition(position: TossPortfolioPosition): boolean {
  const marketType = position.marketType.toUpperCase();
  const marketCode = position.marketCode.toUpperCase();
  return marketType === 'US'
    || marketType === 'US_STOCK'
    || marketCode === 'NASDAQ'
    || marketCode === 'NSQ'
    || marketCode === 'NYSE'
    || marketCode === 'NYS'
    || marketCode === 'AMEX'
    || marketCode === 'AMS';
}

function isDomesticPosition(position: TossPortfolioPosition): boolean {
  const marketType = position.marketType.toUpperCase();
  const marketCode = position.marketCode.toUpperCase();
  return marketType === 'KR'
    || marketType === 'KR_STOCK'
    || marketCode === 'KRX'
    || marketCode === 'KOSPI'
    || marketCode === 'KOSDAQ'
    || marketCode === 'KSP'
    || marketCode === 'KSQ';
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 4,
  })}`;
}

function formatSignedKrw(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatKrw(value)}`;
}

function formatSignedUsd(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatUsd(value)}`;
}

function formatSignedPct(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

function formatQuantity(value: number): string {
  return value.toLocaleString('ko-KR', {
    maximumFractionDigits: value < 1 ? 6 : 3,
  });
}

function formatRailStatusMessage(error: string | null, statusMessage: string | null): string {
  if (error !== null) {
    return '토스 세션 확인 실패';
  }
  return statusMessage ?? '계좌 데이터 없음';
}

const shellStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: 0,
  borderBottom: '1px solid var(--border)',
  borderRadius: 0,
  overflow: 'hidden',
  flex: '1 1 0',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'inherit',
  fontVariantNumeric: 'tabular-nums',
};

const headerStyle: CSSProperties = {
  padding: '12px 14px 10px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  borderBottom: '1px solid var(--border-soft)',
  flexShrink: 0,
};

const accountMarkStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  background: 'var(--bg-tint)',
  border: '1px solid var(--border-soft)',
  color: 'var(--kr-down)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 900,
  flex: '0 0 auto',
};

const headerTextStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const titleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: 'var(--text-primary)',
  lineHeight: 1.1,
};

const subtitleInlineStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  lineHeight: 1.2,
};

const pillStyle: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--text-secondary)',
  background: 'var(--bg-tint)',
  border: '1px solid var(--border-soft)',
  borderRadius: 50,
  padding: '2px 7px',
  whiteSpace: 'nowrap',
};

const miniRefreshButtonStyle: CSSProperties = {
  border: '1px solid var(--border-soft)',
  borderRadius: 50,
  background: 'var(--bg-tint)',
  color: 'var(--text-secondary)',
  fontSize: 10,
  fontWeight: 800,
  fontFamily: 'inherit',
  padding: '3px 7px',
  whiteSpace: 'nowrap',
};

const bodyStyle: CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  flex: '1 1 0',
  minHeight: 0,
  overflow: 'hidden',
};

const emptyStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  fontWeight: 700,
};

const cashStripStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 1px minmax(0, 1fr)',
  border: '1px solid var(--border-soft)',
  borderRadius: 10,
  overflow: 'hidden',
  background: 'var(--bg-tint)',
  flexShrink: 0,
};

const cashCellStyle: CSSProperties = {
  minWidth: 0,
  padding: '8px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  color: 'var(--text-secondary)',
  fontWeight: 800,
};

const cashLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  lineHeight: 1.15,
};

const cashAmountStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  lineHeight: 1.2,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
};

const cashDividerStyle: CSSProperties = {
  background: 'var(--border-soft)',
};

const investmentBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  flexShrink: 0,
};

const assetLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: 'var(--text-primary)',
};

const assetValueStyle: CSSProperties = {
  fontSize: 21,
  fontWeight: 900,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
  lineHeight: 1.05,
};

const assetPnlStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  whiteSpace: 'nowrap',
};

const statusLineStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px 9px',
  fontSize: 11,
  color: 'var(--text-primary)',
  fontWeight: 800,
  flexShrink: 0,
};

const positionsListStyle: CSSProperties = {
  borderTop: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 0',
  minHeight: 0,
  overflowY: 'auto',
  paddingTop: 4,
};

const positionRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '28px minmax(0, 1fr) minmax(88px, auto)',
  gap: 8,
  alignItems: 'center',
  padding: '7px 0',
  borderTop: '1px solid var(--border-soft)',
};

const positionLogoStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: 'var(--bg-tint)',
  border: '1px solid var(--border-soft)',
  color: 'var(--text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 900,
};

const positionNameStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontSize: 12,
  color: 'var(--text-primary)',
};

const positionAmountStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  textAlign: 'right',
  fontSize: 12,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
};

const positionMetaStyle: CSSProperties = {
  fontStyle: 'normal',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
};

const positionPnlStyle: CSSProperties = {
  fontStyle: 'normal',
  fontSize: 11,
  fontWeight: 700,
};

const positionGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
};

const positionGroupLabelStyle: CSSProperties = {
  padding: '9px 0 2px',
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--text-muted)',
};

const loginButtonStyle: CSSProperties = {
  width: 'calc(100% - 24px)',
  height: 26,
  margin: '0 12px 10px',
  border: '1px solid var(--border-soft)',
  borderRadius: 8,
  background: 'var(--bg-tint)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  fontWeight: 900,
  fontFamily: 'inherit',
};
