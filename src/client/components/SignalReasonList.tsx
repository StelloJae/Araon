import type { SignalExplanation, SignalLevel } from '../lib/signal-explainer';

interface SignalReasonListProps {
  explanation: SignalExplanation;
  mode: 'compact' | 'list';
}

export function SignalReasonList({
  explanation,
  mode,
}: SignalReasonListProps) {
  if (mode === 'compact') {
    const pieces =
      explanation.reasons.length > 0
        ? explanation.reasons.slice(0, 3).map((reason) => reason.text)
        : [explanation.primaryReason];
    const caveat = explanation.caveats[0];
    if (caveat !== undefined) pieces.push(caveat);

    return (
      <span
        style={{
          display: 'block',
          marginLeft: 11,
          marginTop: 3,
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-secondary)',
          lineHeight: 1.35,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {pieces.join(' · ')}
      </span>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--bg-card)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '11px 12px',
          borderBottom: '1px solid var(--border-soft)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: 'var(--text-primary)',
          }}
        >
          {explanation.primaryReason}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            fontWeight: 800,
            color: levelColor(explanation.level),
            border: `1px solid ${levelColor(explanation.level)}`,
            borderRadius: 50,
            padding: '2px 7px',
            letterSpacing: 0.4,
          }}
        >
          {levelLabel(explanation.level)}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-muted)',
            border: '1px solid var(--border-soft)',
            borderRadius: 50,
            padding: '2px 7px',
            letterSpacing: 0.3,
          }}
        >
          {confidenceLabel(explanation.confidence)}
        </span>
      </div>

      {explanation.reasons.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 1,
            background: 'var(--border-soft)',
          }}
        >
          {explanation.reasons.map((reason) => (
            <div
              key={`${reason.kind}-${reason.text}`}
              style={{
                background: 'var(--bg-card)',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: 0.4,
                }}
              >
                +{reason.weight}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color:
                    reason.tone === 'warning'
                      ? 'var(--accent)'
                      : 'var(--text-primary)',
                  lineHeight: 1.35,
                }}
              >
                {reason.text}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: '14px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}
        >
          관찰 가능한 조건이 아직 충분하지 않습니다.
        </div>
      )}

      {explanation.caveats.length > 0 && (
        <div
          style={{
            padding: '8px 12px',
            borderTop: '1px solid var(--border-soft)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            lineHeight: 1.45,
          }}
        >
          {explanation.caveats.join(' · ')}
        </div>
      )}
    </div>
  );
}

function levelLabel(level: SignalLevel): string {
  switch (level) {
    case 'urgent':
      return '긴급 관찰';
    case 'strong':
      return '강한 관찰';
    case 'watch':
      return '관찰';
    case 'none':
      return '대기';
  }
}

function levelColor(level: SignalLevel): string {
  switch (level) {
    case 'urgent':
      return 'var(--kr-down)';
    case 'strong':
      return 'var(--accent)';
    case 'watch':
      return 'var(--kr-up)';
    case 'none':
      return 'var(--text-muted)';
  }
}

function confidenceLabel(confidence: SignalExplanation['confidence']): string {
  switch (confidence) {
    case 'live':
      return 'LIVE';
    case 'snapshot':
      return 'SNAPSHOT';
    case 'collecting':
      return '수집 중';
  }
}
