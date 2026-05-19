import { useMemo, useState, type CSSProperties } from 'react';

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
import { ProductAvatar } from './ProductAvatar';

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
  onOpenTicker?: (ticker: string) => void;
}

type PositionSortKey =
  | 'profitRateDesc'
  | 'profitRateAsc'
  | 'marketValueDesc'
  | 'marketValueAsc'
  | 'dailyProfitRateDesc'
  | 'dailyProfitRateAsc'
  | 'nameAsc'
  | 'manual';

type PositionValueMode = 'current' | 'evaluation';

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
  onOpenTicker,
}: TossAccountRailProps) {
  const [positionSortKey, setPositionSortKey] = useState<PositionSortKey>('marketValueDesc');
  const [positionValueMode, setPositionValueMode] = useState<PositionValueMode>('evaluation');
  const positionCount = positions?.positions.length ?? 0;
  const sortedPositions = useMemo(
    () => sortPositions(positions?.positions ?? [], positionSortKey),
    [positions, positionSortKey],
  );
  const positionGroups = groupPositions(sortedPositions);
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
        {sessionReady && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Toss 계좌 새로고침"
            title="Toss 계좌 새로고침"
            style={{
              ...refreshIconButtonStyle,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.56 : 1,
            }}
          >
            ↻
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
              <div style={positionToolbarStyle} aria-label="보유 종목 표시 설정">
                <label style={sortSelectLabelStyle}>
                  <span>정렬</span>
                  <select
                    value={positionSortKey}
                    onChange={(event) => setPositionSortKey(event.currentTarget.value as PositionSortKey)}
                    style={sortSelectStyle}
                    aria-label="보유 종목 정렬"
                  >
                    <option value="profitRateDesc">총 수익률 높은 순</option>
                    <option value="profitRateAsc">총 수익률 낮은 순</option>
                    <option value="marketValueDesc">평가금 높은 순</option>
                    <option value="marketValueAsc">평가금 낮은 순</option>
                    <option value="dailyProfitRateDesc">일간 수익률 높은 순</option>
                    <option value="dailyProfitRateAsc">일간 수익률 낮은 순</option>
                    <option value="nameAsc">가나다 순</option>
                    <option value="manual">직접 설정하기</option>
                  </select>
                </label>
                <div style={valueToggleStyle} role="group" aria-label="보유 금액 표시 방식">
                  <button
                    type="button"
                    onClick={() => setPositionValueMode('current')}
                    style={toggleButtonStyle(positionValueMode === 'current')}
                  >
                    현재가
                  </button>
                  <button
                    type="button"
                    onClick={() => setPositionValueMode('evaluation')}
                    style={toggleButtonStyle(positionValueMode === 'evaluation')}
                  >
                    평가금
                  </button>
                </div>
              </div>
            ) : null}
            {positionCount > 0 ? (
              <div style={positionsListStyle} aria-label="Toss 보유 포지션">
                {positionGroups.map((group) => (
                  group.positions.length > 0 && (
                    <section key={group.key} style={positionGroupStyle}>
                      <div style={positionGroupLabelStyle}>{group.label}</div>
                      {group.positions.map((position) => (
                        <PositionRow
                          key={`${position.marketCode}-${position.symbol}`}
                          position={position}
                          valueMode={positionValueMode}
                          {...(onOpenTicker !== undefined ? { onOpenTicker } : {})}
                        />
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

function PositionRow({
  position,
  valueMode,
  onOpenTicker,
}: {
  position: TossPortfolioPosition;
  valueMode: PositionValueMode;
  onOpenTicker?: (ticker: string) => void;
}) {
  const foreign = isForeignPosition(position);
  const displayAmount = valueMode === 'current'
    ? positionCurrentDisplayAmount(position)
    : positionEvaluationDisplayAmount(position);
  const amount = foreign ? formatUsd(displayAmount) : formatKrw(displayAmount);
  const pnl = foreign
    ? formatSignedUsd(position.unrealizedPnlUsd || position.unrealizedPnl)
    : formatSignedKrw(position.unrealizedPnl);
  const profitRate = foreign && position.profitRateUsd !== 0
    ? position.profitRateUsd
    : position.profitRate;
  const pnlValue = foreign ? position.unrealizedPnlUsd || position.unrealizedPnl : position.unrealizedPnl;
  const ticker = positionTickerForChart(position);
  const canOpen = ticker !== null && onOpenTicker !== undefined;
  return (
    <button
      type="button"
      className="toss-account-rail__position-row"
      style={{
        ...positionRowStyle,
        cursor: canOpen ? 'pointer' : 'default',
      }}
      onClick={
        canOpen
          ? () => {
              if (ticker !== null) onOpenTicker?.(ticker);
            }
          : undefined
      }
      disabled={!canOpen}
      aria-label={`${position.name} 차트 보기`}
    >
      <ProductAvatar
        name={position.name}
        iconUrl={position.iconUrl ?? null}
        productCode={position.productCode}
        ticker={position.symbol}
        size={28}
        style={positionLogoStyle}
      />
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
    </button>
  );
}

function sortPositions(
  positions: readonly TossPortfolioPosition[],
  sortKey: PositionSortKey,
): TossPortfolioPosition[] {
  const sorted = [...positions];
  sorted.sort((left, right) => {
    switch (sortKey) {
      case 'profitRateDesc':
        return positionTotalProfitRate(right) - positionTotalProfitRate(left);
      case 'profitRateAsc':
        return positionTotalProfitRate(left) - positionTotalProfitRate(right);
      case 'marketValueDesc':
        return positionEvaluationValue(right) - positionEvaluationValue(left);
      case 'marketValueAsc':
        return positionEvaluationValue(left) - positionEvaluationValue(right);
      case 'dailyProfitRateDesc':
        return positionDailyProfitRate(right) - positionDailyProfitRate(left);
      case 'dailyProfitRateAsc':
        return positionDailyProfitRate(left) - positionDailyProfitRate(right);
      case 'nameAsc':
        return left.name.localeCompare(right.name, 'ko-KR');
      case 'manual':
        return 0;
      default:
        return 0;
    }
  });
  return sorted;
}

function positionTotalProfitRate(position: TossPortfolioPosition): number {
  return isForeignPosition(position) && position.profitRateUsd !== 0
    ? position.profitRateUsd
    : position.profitRate;
}

function positionDailyProfitRate(position: TossPortfolioPosition): number {
  return isForeignPosition(position) && position.dailyProfitRateUsd !== 0
    ? position.dailyProfitRateUsd
    : position.dailyProfitRate;
}

function positionEvaluationValue(position: TossPortfolioPosition): number {
  return isForeignPosition(position)
    ? position.marketValueUsd || position.marketValue
    : position.marketValue;
}

function positionCurrentDisplayAmount(position: TossPortfolioPosition): number {
  return isForeignPosition(position)
    ? position.currentPriceUsd || position.currentPrice
    : position.currentPrice;
}

function positionEvaluationDisplayAmount(position: TossPortfolioPosition): number {
  return positionEvaluationValue(position);
}

function positionTickerForChart(position: TossPortfolioPosition): string | null {
  if (!isDomesticPosition(position)) return null;
  const fromProduct = stripKrTicker(position.productCode);
  if (fromProduct !== null) return fromProduct;
  return stripKrTicker(position.symbol);
}

function stripKrTicker(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  const ticker = normalized.startsWith('A') ? normalized.slice(1) : normalized;
  return /^\d{6}$/.test(ticker) ? ticker : null;
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
  fontSize: 15,
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

const refreshIconButtonStyle: CSSProperties = {
  marginLeft: 'auto',
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--border-soft)',
  borderRadius: 50,
  background: 'var(--bg-tint)',
  color: 'var(--text-secondary)',
  fontSize: 14,
  fontWeight: 900,
  fontFamily: 'inherit',
  padding: 0,
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
  fontSize: 20,
  fontWeight: 900,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
  lineHeight: 1.05,
};

const assetPnlStyle: CSSProperties = {
  fontSize: 12,
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

const positionToolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  flexShrink: 0,
};

const sortSelectLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  minWidth: 0,
  color: 'var(--text-muted)',
  fontSize: 10,
  fontWeight: 800,
};

const sortSelectStyle: CSSProperties = {
  minWidth: 112,
  maxWidth: 148,
  height: 26,
  border: '1px solid var(--border-soft)',
  borderRadius: 7,
  background: 'var(--bg-tint)',
  color: 'var(--text-primary)',
  fontSize: 11,
  fontWeight: 800,
  fontFamily: 'inherit',
  padding: '0 6px',
};

const valueToggleStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  padding: 2,
  borderRadius: 8,
  background: 'var(--bg-tint)',
  border: '1px solid var(--border-soft)',
  flex: '0 0 auto',
};

function toggleButtonStyle(active: boolean): CSSProperties {
  return {
    height: 20,
    border: 'none',
    borderRadius: 6,
    background: active ? 'var(--bg-card)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: 10,
    fontWeight: 900,
    fontFamily: 'inherit',
    padding: '0 7px',
    cursor: 'pointer',
  };
}

const positionRowStyle: CSSProperties = {
  width: '100%',
  display: 'grid',
  gridTemplateColumns: '28px minmax(0, 1fr) minmax(88px, auto)',
  gap: 8,
  alignItems: 'center',
  padding: '7px 0',
  color: 'inherit',
  border: 'none',
  borderTop: '1px solid var(--border-soft)',
  fontFamily: 'inherit',
  textAlign: 'left',
};

const positionLogoStyle: CSSProperties = {
  fontSize: 11,
};

const positionNameStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontSize: 13,
  fontWeight: 800,
  color: 'var(--text-primary)',
};

const positionAmountStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  textAlign: 'right',
  fontSize: 13,
  fontWeight: 800,
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
