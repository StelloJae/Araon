import type { CSSProperties } from 'react';

import type { AgentEventPayload } from '../lib/api-client';

interface AgentEventsRailProps {
  events: readonly AgentEventPayload[];
  loading: boolean;
  onOpenTicker: (ticker: string) => void;
  onCreateBuyPreview?: (event: AgentEventPayload) => void;
  onOpenDetails?: () => void;
}

const MAX_VISIBLE = 2;

export function AgentEventsRail({
  events,
  loading,
  onOpenTicker,
  onCreateBuyPreview,
  onOpenDetails,
}: AgentEventsRailProps) {
  const visible = events.slice(0, MAX_VISIBLE);
  return (
    <div style={shellStyle} data-testid="agent-events-rail">
      <div style={headerStyle}>
        <div style={titleStyle}>에이전트 관찰</div>
        <span style={pillStyle}>{loading ? '수집 중' : `${events.length}건`}</span>
        {onOpenDetails !== undefined ? (
          <button type="button" onClick={onOpenDetails} style={detailButtonStyle}>
            확장
          </button>
        ) : null}
      </div>
      <div style={subtitleStyle}>뉴스·공시·급등 신호를 보고 거래 후보만 만듭니다</div>
      <div style={listStyle}>
        {visible.length === 0 ? (
          <div style={emptyStyle}>
            {loading ? '이벤트 확인 중' : '거래 판단 후보 없음'}
          </div>
        ) : (
          visible.map((event, index) => {
            const props: AgentEventRowProps = {
              event,
              isFirst: index === 0,
              onOpenTicker,
            };
            if (onCreateBuyPreview !== undefined) {
              props.onCreateBuyPreview = onCreateBuyPreview;
            }
            return <AgentEventRow key={event.id} {...props} />;
          })
        )}
      </div>
    </div>
  );
}

interface AgentEventRowProps {
  event: AgentEventPayload;
  isFirst: boolean;
  onOpenTicker: (ticker: string) => void;
  onCreateBuyPreview?: (event: AgentEventPayload) => void;
}

function AgentEventRow({
  event,
  isFirst,
  onOpenTicker,
  onCreateBuyPreview,
}: AgentEventRowProps) {
  return (
    <div
      style={{
        ...rowShellStyle,
        borderTop: isFirst ? 'none' : '1px solid var(--border-soft)',
      }}
    >
      <button
        type="button"
        onClick={() => onOpenTicker(event.ticker)}
        style={openButtonStyle}
        title={`${agentEventLabel(event.type)} · ${event.ticker}`}
      >
        <span style={eventTypeStyle}>{agentEventLabel(event.type)}</span>
        <span style={eventBodyStyle}>
          <span style={tickerStyle}>{event.ticker}</span>
          <span style={sourceStyle}> · {agentEventSourceLabel(event.source)}</span>
          <span style={reasonStyle}> · {agentEventReasonLabel(event.reason)}</span>
        </span>
        <span style={freshnessStyle}>{freshnessLabel(event.freshnessMs)}</span>
      </button>
      {onCreateBuyPreview !== undefined ? (
        <button
          type="button"
          onClick={() => onCreateBuyPreview(event)}
          style={previewButtonStyle}
          title="모의 매수 미리보기 생성"
        >
          모의 미리보기
        </button>
      ) : null}
    </div>
  );
}

function agentEventLabel(type: AgentEventPayload['type']): string {
  switch (type) {
    case 'news_detected':
      return '뉴스 감지';
    case 'disclosure_detected':
      return '공시 감지';
    case 'toss_signal_detected':
      return 'Toss 신호';
    case 'market_movement_detected':
      return '시장 급변';
    case 'watchlist_changed':
      return '관심 변경';
    case 'position_changed':
      return '보유 변경';
    case 'order_intent_created':
      return '후보 생성';
    case 'order_intent_skipped':
      return '후보 제외';
    case 'approval_requested':
      return '승인 요청';
    case 'approval_granted':
      return '승인 기록';
    case 'approval_denied':
      return '승인 거절';
    case 'execution_locked':
      return '실행 잠금';
  }
}

function agentEventSourceLabel(source: string): string {
  switch (source) {
    case 'kis-ws-tick':
    case 'kis-ws':
      return '실시간 추적';
    case 'toss-quote-refresh':
      return 'Toss 가격 갱신';
    case 'toss-top100-rotation':
      return 'Toss TOP100 변화';
    case 'realtime-momentum':
      return '급상승 신호';
    default:
      return source;
  }
}

function agentEventReasonLabel(reason: string): string {
  return reason
    .replace(/KIS WS tick\s*/g, '')
    .replace(/KIS WS 보조\s*/g, '')
    .replace(/^실시간 추적\s*/g, '')
    .replace(/가격 업데이트 감지/g, '가격 업데이트')
    .replace(/Toss TOP100 rotation\s*·\s*/g, '')
    .replace(/Toss quote refresh\s*/g, '')
    .trim();
}

function freshnessLabel(freshnessMs: number | null): string {
  if (freshnessMs === null) return '처음 감지';
  return compactDurationLabel(freshnessMs);
}

function compactDurationLabel(durationMs: number): string {
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

const shellStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  overflow: 'hidden',
  minHeight: 0,
  flexShrink: 0,
};

const headerStyle: CSSProperties = {
  padding: '10px 14px 4px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const titleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: 'var(--text-primary)',
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

const detailButtonStyle: CSSProperties = {
  height: 22,
  border: '1px solid var(--border-soft)',
  borderRadius: 50,
  background: 'var(--bg-tint)',
  color: 'var(--text-secondary)',
  padding: '0 8px',
  fontSize: 10,
  fontWeight: 900,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const subtitleStyle: CSSProperties = {
  padding: '0 14px 9px',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-soft)',
};

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const rowShellStyle: CSSProperties = {
  width: '100%',
  padding: '7px 12px',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 8,
  alignItems: 'center',
};

const openButtonStyle: CSSProperties = {
  minWidth: 0,
  padding: 0,
  display: 'grid',
  gridTemplateColumns: '48px minmax(0, 1fr)',
  gap: '2px 8px',
  alignItems: 'start',
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

const previewButtonStyle: CSSProperties = {
  height: 24,
  padding: '0 8px',
  border: '1px solid var(--gold)',
  borderRadius: 50,
  background: 'var(--gold-soft)',
  color: 'var(--gold-text)',
  fontSize: 10,
  fontWeight: 900,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const eventTypeStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  color: 'var(--gold-text)',
  paddingTop: 2,
};

const eventBodyStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'baseline',
  overflow: 'hidden',
  lineHeight: 1.35,
  fontSize: 11,
  whiteSpace: 'nowrap',
};

const tickerStyle: CSSProperties = {
  flexShrink: 0,
  whiteSpace: 'nowrap',
  fontWeight: 800,
  color: 'var(--text-primary)',
};

const sourceStyle: CSSProperties = {
  flexShrink: 0,
  whiteSpace: 'nowrap',
  color: 'var(--text-muted)',
};

const reasonStyle: CSSProperties = {
  minWidth: 0,
  flex: '1 1 auto',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--text-secondary)',
};

const freshnessStyle: CSSProperties = {
  gridColumn: '2',
  justifySelf: 'start',
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};

const emptyStyle: CSSProperties = {
  padding: '16px 14px',
  fontSize: 11,
  color: 'var(--text-muted)',
  textAlign: 'center',
};
