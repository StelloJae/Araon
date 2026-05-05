import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  applyDevMarketFrame,
  buildDevMarketFrame,
  isDevMarketSimulatorVisible,
  SIMULATED_MARKET_LABEL,
  type DevMarketScenarioId,
} from '../lib/dev-market-simulator';
import { useStocksStore } from '../stores/stocks-store';

interface DevMarketSimulatorProps {
  isAvailable?: boolean;
}

const SCENARIOS: Array<{ id: DevMarketScenarioId; label: string }> = [
  { id: 'momentum-burst', label: '급가속' },
  { id: 'sector-rotation', label: '섹터 동반' },
  { id: 'volume-ready', label: '거래량 기준선' },
  { id: 'snapshot-caveat', label: '스냅샷 주의' },
];

export function DevMarketSimulator({
  isAvailable = readClientDevFlag(),
}: DevMarketSimulatorProps) {
  const visible = isDevMarketSimulatorVisible(isAvailable);
  const catalog = useStocksStore((s) => s.catalog);
  const [scenarioId, setScenarioId] =
    useState<DevMarketScenarioId>('momentum-burst');
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);

  const catalogSize = useMemo(() => Object.keys(catalog).length, [catalog]);

  const injectTick = useCallback(() => {
    const next = stepRef.current + 1;
    stepRef.current = next;
    const frame = buildDevMarketFrame({
      scenarioId,
      step: next,
      now: Date.now(),
      catalog: useStocksStore.getState().catalog,
    });
    applyDevMarketFrame(frame);
    setStep(next);
  }, [scenarioId]);

  useEffect(() => {
    if (!visible || !running) return;
    const id = setInterval(injectTick, 900);
    return () => clearInterval(id);
  }, [visible, running, injectTick]);

  if (!visible) return null;

  return (
    <div
      data-testid="dev-market-simulator"
      style={{
        position: 'fixed',
        right: 14,
        bottom: 54,
        zIndex: 120,
        width: 292,
        background: 'var(--bg-card)',
        border: '1px solid var(--gold)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '9px 11px',
          borderBottom: '1px solid var(--border-soft)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--gold)',
            animation: running ? 'liveDotPulse 1.4s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              color: 'var(--gold-text)',
              letterSpacing: 0.5,
            }}
          >
            {SIMULATED_MARKET_LABEL}
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-muted)',
              marginTop: 1,
            }}
          >
            개발 검증 전용 · 화면 메모리만 주입
          </div>
        </div>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            fontWeight: 800,
            color: running ? 'var(--kr-up)' : 'var(--text-muted)',
          }}
        >
          {running ? '재생 중' : `STEP ${step}`}
        </span>
      </div>

      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {SCENARIOS.map((scenario) => {
            const active = scenario.id === scenarioId;
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => {
                  setScenarioId(scenario.id);
                  setRunning(false);
                  stepRef.current = 0;
                  setStep(0);
                }}
                style={{
                  height: 28,
                  borderRadius: 6,
                  border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
                  background: active ? 'var(--gold-soft)' : 'var(--bg-tint)',
                  color: active ? 'var(--gold-text)' : 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {scenario.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={injectTick}
            style={primaryButtonStyle}
          >
            한 틱 주입
          </button>
          <button
            type="button"
            onClick={() => setRunning((value) => !value)}
            style={secondaryButtonStyle}
          >
            {running ? '중지' : '재생'}
          </button>
        </div>

        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            lineHeight: 1.45,
          }}
        >
          실제 KIS 호출 없음 · 서버 저장 없음 · 현재 catalog {catalogSize}종목
        </div>
      </div>
    </div>
  );
}

const primaryButtonStyle = {
  flex: 1,
  height: 30,
  borderRadius: 6,
  border: '1px solid var(--gold)',
  background: 'var(--gold)',
  color: 'var(--text-strong)',
  fontSize: 12,
  fontWeight: 900,
} satisfies CSSProperties;

const secondaryButtonStyle = {
  flex: 1,
  height: 30,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: 800,
} satisfies CSSProperties;

function readClientDevFlag(): boolean {
  return (
    (import.meta as ImportMeta & { env: { DEV?: boolean } }).env.DEV === true
  );
}
