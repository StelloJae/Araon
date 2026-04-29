/**
 * useSSE — EventSource wrapper with exponential backoff reconnect.
 *
 * State machine:
 *   disconnected ─connect─▶ connecting ─open─▶ connected
 *   connected    ─error──▶  connecting (backoff) ─retry─▶ connected | …
 *
 * Browser EventSource sends `Last-Event-ID` automatically on reconnect, so
 * the server can resume from the last delivered event id without any extra
 * client code.
 *
 * Dispatch path:
 *   onmessage → JSON.parse → narrow on `type` → store action
 */

import { useEffect, useRef } from 'react';
import type { Price, SSEEvent } from '@shared/types';
import { useMarketStore } from '../stores/market-store';
import { useStocksStore } from '../stores/stocks-store';
import { useErrorStore } from '../stores/error-store';
import { useSurgeStore } from '../stores/surge-store';
import { usePriceHistoryStore } from '../stores/price-history-store';
import {
  selectMomentumBuckets,
  useMomentumHistoryStore,
} from '../stores/momentum-history-store';
import { isMarketLive } from '../lib/market-status';
import {
  createMomentumFeedState,
  evaluateRealtimeMomentumPrice,
  momentumSessionFromMarketStatus,
  shouldProcessRealtimeMomentumPrice,
} from '../lib/realtime-momentum-feed';

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_FACTOR = 2;
const PRICE_UPDATE_FLUSH_MS = 100;

/**
 * Open a persistent SSE connection to `url` and dispatch events to the
 * Zustand stores. Call once at the top of the dashboard.
 */
export function useSSE(url: string = '/events'): void {
  const backoffRef = useRef<number>(BACKOFF_INITIAL_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    const market = useMarketStore.getState();
    const stocks = useStocksStore.getState();
    const errors = useErrorStore.getState();
    const pendingPrices: Price[] = [];
    const momentumFeedState = createMomentumFeedState();
    let priceFlushTimer: ReturnType<typeof setTimeout> | null = null;

    function flushPriceUpdates(): void {
      if (priceFlushTimer !== null) {
        clearTimeout(priceFlushTimer);
        priceFlushTimer = null;
      }
      if (cancelled || pendingPrices.length === 0) return;
      const batch = pendingPrices.splice(0, pendingPrices.length);
      stocks.applyPriceUpdates(batch);
    }

    function queuePriceUpdate(price: Price): void {
      pendingPrices.push(price);
      if (priceFlushTimer !== null) return;
      priceFlushTimer = setTimeout(flushPriceUpdates, PRICE_UPDATE_FLUSH_MS);
    }

    function connect(): void {
      if (cancelled) return;
      market.setSseStatus('connecting');

      const es = new window.EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        if (cancelled) {
          es.close();
          return;
        }
        backoffRef.current = BACKOFF_INITIAL_MS;
        market.setSseStatus('connected');
      };

      // Backend serializer emits frames with `event: <type>` headers (snapshot
      // / price-update / heartbeat / error). Per the EventSource spec, named
      // event types are routed to `addEventListener('<type>', ...)` and do
      // NOT fire `onmessage`. We attach one listener per known type.
      function handleFrame(event: MessageEvent<string>): void {
        if (cancelled) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data) as unknown;
        } catch {
          return;
        }
        const e = parsed as SSEEvent;
        market.markUpdate();

        switch (e.type) {
          case 'snapshot':
            flushPriceUpdates();
            stocks.applySnapshot(e.prices);
            market.setMarketStatus(e.marketStatus);
            break;
          case 'price-update':
            queuePriceUpdate(e.price);
            const currentMarketStatus = useMarketStore.getState().marketStatus;
            // History append is double-gated:
            //   1. `isSnapshot === false` — never accept warm-snapshot ticks.
            //   2. `isMarketLive` — closed/pre-open REST polling also emits
            //      `price-update` frames; treating those as intraday motion
            //      would make the hover sparkline lie about what happened
            //      during the session.
            if (
              e.price.isSnapshot === false &&
              isMarketLive(currentMarketStatus)
            ) {
              usePriceHistoryStore.getState().appendPoint(e.price.ticker, {
                price: e.price.price,
                changePct: e.price.changeRate,
                ts: Date.now(),
              });
            }
            if (shouldProcessRealtimeMomentumPrice(e.price, currentMarketStatus)) {
              const now = Date.now();
              const session = momentumSessionFromMarketStatus(currentMarketStatus);
              const momentumStore = useMomentumHistoryStore.getState();
              momentumStore.appendBucketPoint(e.price.ticker, {
                price: e.price.price,
                volume: e.price.volume,
                ts: now,
                session,
              });
              const buckets = selectMomentumBuckets(
                useMomentumHistoryStore.getState(),
                e.price.ticker,
                session,
              );
              const meta = useStocksStore.getState().catalog[e.price.ticker];
              const result = evaluateRealtimeMomentumPrice({
                price: e.price,
                marketStatus: currentMarketStatus,
                name: meta?.name ?? e.price.ticker,
                buckets,
                now,
                state: momentumFeedState,
              });
              const signal = result.decision.signal;
              if (signal !== null) {
                useSurgeStore.getState().spawn({
                  code: signal.ticker,
                  name: signal.name,
                  price: signal.price,
                  surgePct: signal.momentumPct,
                  source: signal.source,
                  signalType: signal.signalType,
                  momentumPct: signal.momentumPct,
                  momentumWindow: signal.momentumWindow,
                  baselinePrice: signal.baselinePrice,
                  baselineAt: signal.baselineAt,
                  currentAt: signal.currentAt,
                  dailyChangePct: signal.dailyChangePct,
                  volume: signal.volume,
                  volumeSurgeRatio: signal.volumeSurgeRatio,
                  volumeBaselineStatus: e.price.volumeBaselineStatus,
                });
              } else if (result.activeUpdate !== null) {
                useSurgeStore.getState().update(result.activeUpdate.ticker, {
                  price: result.activeUpdate.price,
                  currentAt: result.activeUpdate.currentAt,
                  ...(result.activeUpdate.exitWarning !== undefined
                    ? { exitWarning: result.activeUpdate.exitWarning }
                    : {}),
                });
              }
            }
            break;
          case 'heartbeat':
            // No-op: keepalive only; resets browser idle-close timer.
            break;
          case 'error':
            errors.push({
              title: errorTitleFromCode(e.code),
              detail: e.message,
            });
            break;
          default: {
            const _exhaustive: never = e;
            void _exhaustive;
          }
        }
      }

      es.addEventListener('snapshot', handleFrame as EventListener);
      es.addEventListener('price-update', handleFrame as EventListener);
      es.addEventListener('heartbeat', handleFrame as EventListener);
      es.addEventListener('error', handleFrame as EventListener);
      // Default `message` channel: kept as a fallback for un-named frames
      // so the dispatcher still works if the server stops setting `event:`.
      es.onmessage = handleFrame;

      es.onerror = () => {
        if (cancelled) return;
        es.close();
        esRef.current = null;
        market.setSseStatus('connecting');

        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * BACKOFF_FACTOR, BACKOFF_MAX_MS);

        timerRef.current = setTimeout(() => {
          if (!cancelled) connect();
        }, delay);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (priceFlushTimer !== null) {
        clearTimeout(priceFlushTimer);
        priceFlushTimer = null;
      }
      pendingPrices.length = 0;
      if (esRef.current !== null) {
        esRef.current.close();
        esRef.current = null;
      }
      market.setSseStatus('disconnected');
    };
    // url is intentionally excluded from deps: reconnecting on URL change is
    // an unlikely requirement and would require resetting backoff state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function errorTitleFromCode(code: string): string {
  switch (code) {
    case 'KIS_INVALID_CREDENTIALS':
      return 'KIS 인증 실패';
    case 'KIS_TOKEN_THROTTLED':
      return 'KIS 토큰 발급 제한';
    case 'KIS_UPSTREAM_FAILURE':
      return 'KIS 서버 오류';
    case 'WS_OVER_CAPACITY':
      return 'WS 40 상한 초과';
    case 'KIS_RUNTIME_NOT_READY':
      return 'KIS 런타임 준비 중';
    default:
      return code;
  }
}
