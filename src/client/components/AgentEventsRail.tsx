import type { CSSProperties } from 'react';

import { useProductDisplayNames } from '../hooks/useProductDisplayNames';
import type { AgentEventPayload } from '../lib/api-client';
import {
  buildAgentCandidateViewModel,
  dedupeAgentCandidateEvents,
} from '../lib/agent-candidate-view-model';

interface AgentEventsRailProps {
  events: readonly AgentEventPayload[];
  loading: boolean;
  onOpenTicker: (ticker: string) => void;
  onCreateBuyPreview?: (event: AgentEventPayload) => void;
  onOpenDetails?: () => void;
  displayNamesOverride?: Readonly<Record<string, string>>;
  compact?: boolean;
}

const DEFAULT_VISIBLE = 2;
const COMPACT_VISIBLE = 4;

export function AgentEventsRail({
  events,
  loading,
  onOpenTicker,
  onCreateBuyPreview,
  onOpenDetails,
  displayNamesOverride,
  compact = false,
}: AgentEventsRailProps) {
  const maxVisible = compact ? COMPACT_VISIBLE : DEFAULT_VISIBLE;
  const candidates = dedupeAgentCandidateEvents(events);
  const visible = candidates.slice(0, maxVisible);
  const hiddenCount = Math.max(0, candidates.length - visible.length);
  const resolvedDisplayNames = useProductDisplayNames(displayNamesOverride);
  return (
    <div style={shellStyle} data-testid="agent-events-rail">
      <div style={compact ? compactHeaderStyle : headerStyle}>
        <div style={titleStyle}>감지된 거래 후보</div>
        <span style={pillStyle}>{loading ? '수집 중' : `${events.length}건`}</span>
        {onOpenDetails !== undefined ? (
          <button
            type="button"
            onClick={onOpenDetails}
            style={compact ? compactDetailButtonStyle : detailButtonStyle}
          >
            확장
          </button>
        ) : null}
      </div>
      <div style={compact ? compactSubtitleStyle : subtitleStyle}>
        {compact
          ? '판단 보조 · 실거래 잠금'
          : '현재 단계: 판단 보조 · 감지 → 후보 → 근거 → 모의 → 리스크 → 승인 → 잠금'}
      </div>
      <div style={listStyle}>
        {visible.length === 0 ? (
          <div style={emptyStyle}>
            {loading ? '이벤트 확인 중' : '거래 판단 후보 없음'}
          </div>
        ) : (
          visible.map((event, index) => {
            const props: AgentEventRowProps = {
              event,
              displayNames: resolvedDisplayNames,
              isFirst: index === 0,
              onOpenTicker,
              compact,
            };
            if (onCreateBuyPreview !== undefined) {
              props.onCreateBuyPreview = onCreateBuyPreview;
            }
            return <AgentEventRow key={event.id} {...props} />;
          })
        )}
        {hiddenCount > 0 ? (
          <div style={compact ? compactMoreStyle : moreStyle}>
            외 {hiddenCount}건
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface AgentEventRowProps {
  event: AgentEventPayload;
  displayNames: Readonly<Record<string, string>>;
  isFirst: boolean;
  onOpenTicker: (ticker: string) => void;
  onCreateBuyPreview?: (event: AgentEventPayload) => void;
  compact: boolean;
}

function AgentEventRow({
  event,
  displayNames,
  isFirst,
  onOpenTicker,
  onCreateBuyPreview,
  compact,
}: AgentEventRowProps) {
  const view = buildAgentCandidateViewModel(event, displayNames);
  const reasonLabel = compact ? compactAgentReasonLabel(view.reasonLabel) : view.reasonLabel;
  const metaLabel = compact
    ? `${view.stageLabel} · ${view.freshnessLabel}`
    : `${view.stageLabel} · ${view.sourceLabel} · ${view.freshnessLabel} · ${view.confidenceLabel}`;
  const previewLabel = view.decision === 'sell' ? '모의 매도' : '모의 매수';
  return (
    <div
      style={{
        ...rowShellStyle,
        ...(compact ? compactRowShellStyle : {}),
        borderTop: isFirst ? 'none' : '1px solid var(--border-soft)',
      }}
    >
      <button
        type="button"
        onClick={() => onOpenTicker(view.ticker)}
        style={compact ? compactOpenButtonStyle : openButtonStyle}
        title={`${view.typeLabel} · ${view.decisionLabel} · ${view.decisionReasonLabel}`}
      >
        <span style={eventTypeStyle}>{view.decisionLabel}</span>
        <span style={eventBodyStyle}>
          <span style={tickerStyle}>{view.displayName}</span>
          {!compact && view.showTicker ? <span style={sourceStyle}> · {view.ticker}</span> : null}
          <span style={reasonStyle}> · {reasonLabel}</span>
        </span>
        <span style={metaStyle}>
          {metaLabel}
        </span>
      </button>
      {onCreateBuyPreview !== undefined && view.canCreatePreview ? (
        <button
          type="button"
          onClick={() => onCreateBuyPreview(event)}
          style={compact ? compactPreviewButtonStyle : previewButtonStyle}
          title={`${previewLabel} 미리보기 생성`}
        >
          {compact ? '미리보기' : previewLabel}
        </button>
      ) : null}
    </div>
  );
}

function compactAgentReasonLabel(label: string): string {
  const pieces = label.split(' · ').filter(Boolean);
  return pieces.slice(0, 2).join(' · ') || label;
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

const compactHeaderStyle: CSSProperties = {
  ...headerStyle,
  padding: '8px 10px 3px',
  gap: 6,
};

const titleStyle: CSSProperties = {
  fontSize: 14,
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

const compactDetailButtonStyle: CSSProperties = {
  ...detailButtonStyle,
  height: 20,
  padding: '0 7px',
  fontSize: 9,
};

const subtitleStyle: CSSProperties = {
  padding: '0 14px 9px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-soft)',
};

const compactSubtitleStyle: CSSProperties = {
  ...subtitleStyle,
  padding: '0 10px 7px',
  fontSize: 10,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
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

const compactRowShellStyle: CSSProperties = {
  padding: '6px 9px',
  gap: 6,
};

const openButtonStyle: CSSProperties = {
  minWidth: 0,
  padding: 0,
  display: 'grid',
  gridTemplateColumns: '64px minmax(0, 1fr)',
  gap: '2px 8px',
  alignItems: 'start',
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

const compactOpenButtonStyle: CSSProperties = {
  ...openButtonStyle,
  gridTemplateColumns: '38px minmax(0, 1fr)',
  gap: '1px 6px',
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

const compactPreviewButtonStyle: CSSProperties = {
  ...previewButtonStyle,
  height: 22,
  padding: '0 7px',
  fontSize: 9,
};

const eventTypeStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  color: 'var(--gold-text)',
  paddingTop: 2,
  whiteSpace: 'nowrap',
};

const eventBodyStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'baseline',
  overflow: 'hidden',
  lineHeight: 1.35,
  fontSize: 12,
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

const metaStyle: CSSProperties = {
  gridColumn: '2',
  justifySelf: 'start',
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};

const emptyStyle: CSSProperties = {
  padding: '16px 14px',
  fontSize: 12,
  color: 'var(--text-muted)',
  textAlign: 'center',
};

const moreStyle: CSSProperties = {
  padding: '7px 12px 9px',
  borderTop: '1px solid var(--border-soft)',
  color: 'var(--text-muted)',
  fontSize: 10,
  fontWeight: 800,
  textAlign: 'right',
};

const compactMoreStyle: CSSProperties = {
  ...moreStyle,
  padding: '5px 9px 7px',
};
