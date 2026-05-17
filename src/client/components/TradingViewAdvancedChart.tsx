import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

type TradingViewMarket = 'KOSPI' | 'KOSDAQ';

interface TradingViewAdvancedChartProps {
  code: string;
  market: TradingViewMarket;
  name: string;
  fallback: ReactNode;
}

type TradingViewWindow = Window & {
  TradingView?: {
    widget: new (options: Record<string, unknown>) => unknown;
  };
};

let tradingViewScriptPromise: Promise<void> | null = null;

export function tradingViewSymbolForStock(stock: {
  code: string;
  market: TradingViewMarket;
}): string {
  return `KRX:${stock.code}`;
}

export function tradingViewEmbedModeForStock(stock: {
  code: string;
  market: TradingViewMarket;
}): 'widget' | 'local-datafeed-required' {
  void stock.code;
  return stock.market === 'KOSPI' || stock.market === 'KOSDAQ'
    ? 'local-datafeed-required'
    : 'widget';
}

export function TradingViewAdvancedChart({
  code,
  market,
  name,
  fallback,
}: TradingViewAdvancedChartProps) {
  const rawId = useId();
  const containerId = useMemo(
    () => `tradingview-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [rawId],
  );
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const symbol = tradingViewSymbolForStock({ code, market });
  const embeddedWidgetUnavailable =
    tradingViewEmbedModeForStock({ code, market }) === 'local-datafeed-required';

  useEffect(() => {
    let cancelled = false;
    setFailed(embeddedWidgetUnavailable);
    if (embeddedWidgetUnavailable) return () => undefined;

    loadTradingViewScript()
      .then(() => {
        if (cancelled) return;
        const host = hostRef.current;
        const tv = (window as TradingViewWindow).TradingView;
        if (host === null || tv === undefined) {
          setFailed(true);
          return;
        }
        host.innerHTML = '';
        new tv.widget({
          autosize: true,
          symbol,
          interval: '60',
          timezone: 'Asia/Seoul',
          theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
          style: '1',
          locale: 'kr',
          enable_publishing: false,
          allow_symbol_change: true,
          hide_side_toolbar: false,
          hide_top_toolbar: false,
          withdateranges: true,
          details: true,
          calendar: false,
          studies: ['Volume@tv-basicstudies'],
          container_id: containerId,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (hostRef.current !== null) hostRef.current.innerHTML = '';
    };
  }, [containerId, embeddedWidgetUnavailable, symbol]);

  if (failed) {
    return (
      <div
        className="tradingview-advanced-chart tradingview-advanced-chart--fallback"
        aria-label={`${name} 풀 차트`}
      >
        {fallback}
      </div>
    );
  }

  return (
    <div className="tradingview-advanced-chart" aria-label={`${name} 고급 차트`}>
      <div id={containerId} ref={hostRef} className="tradingview-advanced-chart__host" />
    </div>
  );
}

function loadTradingViewScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('browser required'));
  }
  if ((window as TradingViewWindow).TradingView !== undefined) {
    return Promise.resolve();
  }
  if (tradingViewScriptPromise !== null) return tradingViewScriptPromise;

  tradingViewScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-araon-tradingview-widget="true"]',
    );
    if (existing !== null) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('script failed')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.dataset.araonTradingviewWidget = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('script failed')), {
      once: true,
    });
    document.head.appendChild(script);
  });

  return tradingViewScriptPromise;
}
