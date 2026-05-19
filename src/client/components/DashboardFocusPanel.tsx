import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MarketStatus } from '@shared/types';

import type { StockViewModel } from '../lib/view-models';
import { buildSignalExplanation } from '../lib/signal-explainer';
import {
  fmtAbs,
  fmtClock,
  fmtPct,
  fmtPrice,
  fmtVolMan,
  krColor,
} from '../lib/format';
import { ExpandIcon, StarIcon } from '../lib/icons';
import { SignalReasonList } from './SignalReasonList';
import { StockCandleChart } from './StockCandleChart';
import { StockNewsDisclosurePanel } from './StockNewsDisclosurePanel';
import { ProductAvatar } from './ProductAvatar';
import { TradingViewAdvancedChart } from './TradingViewAdvancedChart';

interface DashboardFocusPanelProps {
  stock: StockViewModel | null;
  allStocks: ReadonlyArray<StockViewModel>;
  isFavorite: boolean;
  marketStatus: MarketStatus;
  iconUrl?: string | null;
  onOpenFullChart: () => void;
  onToggleFav: (code: string) => void;
  presentation?: 'home' | 'fullChart';
}

type FocusTab = 'chart' | 'orderbook' | 'news' | 'disclosures' | 'signals';

const FOCUS_TABS: ReadonlyArray<{ id: FocusTab; label: string }> = [
  { id: 'chart', label: '차트' },
  { id: 'orderbook', label: '호가' },
  { id: 'news', label: '뉴스' },
  { id: 'disclosures', label: '공시' },
  { id: 'signals', label: '시그널' },
];

export function DashboardFocusPanel({
  stock,
  allStocks,
  isFavorite,
  marketStatus,
  iconUrl = null,
  onOpenFullChart,
  onToggleFav,
  presentation = 'home',
}: DashboardFocusPanelProps) {
  const [activeTab, setActiveTab] = useState<FocusTab>('chart');
  const compactChart = presentation === 'home';
  const chartHeight = presentation === 'fullChart' ? 560 : 220;
  const panelShellStyle = {
    ...shellStyle,
    minHeight: 0,
  };
  const workspaceStyle =
    activeTab === 'chart' ? chartWorkspaceWrapStyle : scrollWorkspaceWrapStyle;
  const signalExplanation = useMemo(
    () =>
      stock === null
        ? null
        : buildSignalExplanation({
            stock,
            allStocks,
            isFavorite,
            marketStatus,
          }),
    [allStocks, isFavorite, marketStatus, stock],
  );
  const liveQuote = useMemo(
    () =>
      stock === null
        ? null
        : {
            ticker: stock.code,
            price: stock.price,
            volume: stock.volume,
            updatedAt: stock.updatedAt,
            isSnapshot: stock.isSnapshot,
            source: stock.source ?? null,
          },
    [stock],
  );

  if (stock === null) {
    return (
      <section style={panelShellStyle} data-testid="dashboard-focus-panel">
        <div style={emptyStateStyle}>
          <div style={emptyTitleStyle}>선택된 종목 없음</div>
          <div style={emptyTextStyle}>
            검색, TOP100, 즐겨찾기에서 종목을 선택하면 차트와 뉴스가 여기에 표시됩니다.
          </div>
        </div>
      </section>
    );
  }

  const color = krColor(stock.changePct);
  const lastUpdated = parseDate(stock.updatedAt);
  const changeLabel = [
    fmtPct(stock.changePct),
    stock.changeAbs === null ? '전일대비 미제공' : fmtAbs(stock.changeAbs),
  ].join(' · ');

  return (
    <section
      className={`dashboard-focus-panel dashboard-focus-panel--${presentation}`}
      style={panelShellStyle}
      data-testid="dashboard-focus-panel"
    >
      <div style={headerStyle}>
        <ProductAvatar
          name={stock.name}
          iconUrl={iconUrl}
          ticker={stock.code}
          size={28}
          style={focusAvatarStyle}
        />
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div style={nameRowStyle}>
            <h2 style={titleStyle}>{stock.name}</h2>
            <span style={codePillStyle}>{stock.code}</span>
            <span style={codePillStyle}>{stock.market}</span>
            {stock.isSnapshot && <span style={mutedPillStyle}>SNAPSHOT</span>}
          </div>
          <div style={quoteSummaryStyle}>
            <span style={{ ...priceSummaryStyle, color }}>{fmtPrice(stock.price)}</span>
            <span style={{ color }}>{changeLabel}</span>
            <span>거래량 {fmtVolMan(stock.volume)}</span>
            <span>{lastUpdated === null ? '수집 중' : fmtClock(lastUpdated)}</span>
          </div>
          <div style={subLineStyle}>
            <span>{stock.effectiveSector.name}</span>
            <span>데이터 소스 · Toss 우선 · 실시간 추적</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggleFav(stock.code)}
          aria-pressed={isFavorite}
          title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
          style={favoriteIconButtonStyle}
        >
          <StarIcon size={17} filled={isFavorite} />
        </button>
        {presentation === 'home' && (
          <button
            type="button"
            onClick={onOpenFullChart}
            className="araon-icon-action dashboard-focus-panel__expand-button"
            aria-label="차트 확장"
            title="차트 확장"
          >
            <ExpandIcon size={17} />
          </button>
        )}
      </div>

      <div style={tabRowStyle}>
        {FOCUS_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={active ? activeTabStyle : inactiveTabStyle}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={workspaceStyle}>
        {activeTab === 'chart' && (
          presentation === 'fullChart' ? (
            <TradingViewAdvancedChart
              code={stock.code}
              market={stock.market}
              name={stock.name}
              fallback={
                <StockCandleChart
                  ticker={stock.code}
                  height={chartHeight}
                  compact={false}
                  fillHeight
                  liveQuote={liveQuote}
                />
              }
            />
          ) : (
            <StockCandleChart
              ticker={stock.code}
              height={chartHeight}
              compact={compactChart}
              fillHeight
              liveQuote={liveQuote}
            />
          )
        )}
        {activeTab === 'orderbook' && (
          <UnavailablePanel
            title="호가 / 체결"
            detail="호가 데이터 연결 준비 중입니다. 준비 전까지 실제 호가창은 표시하지 않습니다."
          />
        )}
        {activeTab === 'news' && (
          <StockNewsDisclosurePanel ticker={stock.code} name={stock.name} mode="news" />
        )}
        {activeTab === 'disclosures' && (
          <StockNewsDisclosurePanel ticker={stock.code} name={stock.name} mode="disclosures" />
        )}
        {activeTab === 'signals' && (
          <div style={signalsWrapStyle}>
            {signalExplanation !== null && (
              <SignalReasonList explanation={signalExplanation} mode="list" />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function UnavailablePanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={unavailablePanelStyle}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function parseDate(value: string): Date | null {
  if (value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const shellStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  minWidth: 0,
  height: '100%',
  minHeight: 0,
};

const headerStyle: CSSProperties = {
  padding: '12px 14px 10px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  minWidth: 0,
  flexShrink: 0,
};

const focusAvatarStyle: CSSProperties = {
  marginTop: 1,
};

const nameRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  minWidth: 0,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.1,
  fontWeight: 900,
  color: 'var(--text-strong)',
  letterSpacing: 0,
};

const subLineStyle: CSSProperties = {
  marginTop: 6,
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
};

const quoteSummaryStyle: CSSProperties = {
  marginTop: 6,
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  minWidth: 0,
  flexWrap: 'wrap',
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--text-muted)',
};

const priceSummaryStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  color: 'var(--text-primary)',
};

const codePillStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--text-secondary)',
  background: 'var(--bg-tint)',
  border: '1px solid var(--border-soft)',
  borderRadius: 50,
  padding: '3px 8px',
  whiteSpace: 'nowrap',
};

const mutedPillStyle: CSSProperties = {
  ...codePillStyle,
  color: 'var(--text-muted)',
};

const iconButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const favoriteIconButtonStyle: CSSProperties = {
  ...iconButtonStyle,
  background: 'var(--bg-tint)',
  color: 'var(--gold)',
};

const tabRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  padding: '8px 14px 0',
  borderBottom: '1px solid var(--border-soft)',
};

const activeTabStyle: CSSProperties = {
  borderTop: 'none',
  borderRight: 'none',
  borderLeft: 'none',
  background: 'transparent',
  paddingBottom: 10,
  borderBottom: '2px solid var(--accent)',
  color: 'var(--text-primary)',
  fontSize: 12,
  fontWeight: 900,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const inactiveTabStyle: CSSProperties = {
  borderTop: 'none',
  borderRight: 'none',
  borderLeft: 'none',
  borderBottom: '2px solid transparent',
  background: 'transparent',
  paddingBottom: 10,
  color: 'var(--text-muted)',
  fontSize: 12,
  fontWeight: 800,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const workspaceWrapStyleBase: CSSProperties = {
  padding: 10,
  flex: '1 1 0',
  minWidth: 0,
  minHeight: 0,
};

const chartWorkspaceWrapStyle: CSSProperties = {
  ...workspaceWrapStyleBase,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const scrollWorkspaceWrapStyle: CSSProperties = {
  ...workspaceWrapStyleBase,
  overflow: 'auto',
};

const signalsWrapStyle: CSSProperties = {
  minHeight: 0,
};

const unavailablePanelStyle: CSSProperties = {
  minHeight: 280,
  border: '1px dashed var(--border)',
  borderRadius: 12,
  background: 'var(--bg-tint)',
  color: 'var(--text-muted)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  textAlign: 'center',
  padding: 24,
  fontSize: 12,
  fontWeight: 700,
};

const emptyStateStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: 36,
  textAlign: 'center',
};

const emptyTitleStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 900,
  color: 'var(--text-primary)',
};

const emptyTextStyle: CSSProperties = {
  maxWidth: 360,
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-muted)',
  lineHeight: 1.45,
};
