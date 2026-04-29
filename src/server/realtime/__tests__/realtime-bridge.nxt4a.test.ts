import { describe, expect, it, vi } from 'vitest';

import type { Price } from '@shared/types.js';
import { PriceStore } from '../../price/price-store.js';
import {
  createRealtimeBridge,
  type RealtimeBridgeStats,
  type ParsedWsFrame,
  type WsTickParser,
} from '../realtime-bridge.js';
import {
  createRealtimeSessionGate,
  sessionLimitEndReason,
  shouldApplyRuntimeWsTicks,
} from '../runtime-operator.js';
import type {
  KisWsClient,
  WsConnectionState,
  WsMessageHandler,
  WsSubscription,
} from '../../kis/kis-ws-client.js';

interface FakeWs {
  readonly client: KisWsClient;
  emitMessage(raw: string): void;
}

function makeFakeWs(): FakeWs {
  const handlers = new Set<WsMessageHandler>();
  let state: WsConnectionState = 'idle';

  const client: KisWsClient = {
    async connect(): Promise<void> {
      state = 'connected';
    },
    async disconnect(): Promise<void> {
      state = 'stopped';
    },
    async subscribe(_sub: WsSubscription): Promise<void> {
      return undefined;
    },
    async unsubscribe(_sub: WsSubscription): Promise<void> {
      return undefined;
    },
    onMessage(handler: WsMessageHandler): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    state(): WsConnectionState {
      return state;
    },
    activeSubscriptions(): readonly WsSubscription[] {
      return [];
    },
    getStatus() {
      return {
        state,
        reconnectAttempts: 0,
        nextReconnectAt: null,
        lastConnectedAt: null,
        lastError: null,
        stopReason: null,
      };
    },
  };

  return {
    client,
    emitMessage(raw: string): void {
      for (const handler of handlers) handler(raw);
    },
  };
}

function liveTick(
  ticker: string,
  updatedAt: string,
  price = 223500,
): {
  trId: 'H0UNCNT0';
  source: 'integrated';
  ticker: string;
  price: number;
  changeAbs: number;
  changeRate: number;
  volume: number;
  tradeTime: string;
  updatedAt: string;
  isSnapshot: false;
} {
  return {
    trId: 'H0UNCNT0',
    source: 'integrated',
    ticker,
    price,
    changeAbs: 4000,
    changeRate: 1.82,
    volume: 39260243,
    tradeTime: '171405',
    updatedAt,
    isSnapshot: false,
  };
}

function ticksFrame(...ticks: ReturnType<typeof liveTick>[]): ParsedWsFrame {
  return { kind: 'ticks', ticks } as unknown as ParsedWsFrame;
}

const baseRuntimeGates = {
  websocketEnabled: false,
  applyTicksToPriceStore: false,
};

function makeWriter(initial: Price[] = []): {
  readonly writes: Price[];
  readonly store: {
    setPrice(price: Price): void;
    getPrice(ticker: string): Price | undefined;
  };
} {
  const prices = new Map<string, Price>();
  for (const price of initial) prices.set(price.ticker, price);
  const writes: Price[] = [];
  return {
    writes,
    store: {
      setPrice(price: Price): void {
        writes.push(price);
        prices.set(price.ticker, price);
      },
      getPrice(ticker: string): Price | undefined {
        return prices.get(ticker);
      },
    },
  };
}

function bridgeWith(
  frame: ParsedWsFrame,
  options: {
    applyTicksToPriceStore?: boolean;
    canApplyTicksToPriceStore?: (
      ticker?: string,
      stats?: RealtimeBridgeStats,
    ) => boolean;
    getApplyDisabledReason?: (
      ticker: string,
      stats: RealtimeBridgeStats,
    ) => 'apply_disabled' | 'session_limit_reached' | null;
    onPriceApplied?: (price: Price, stats: RealtimeBridgeStats) => void;
    initialPrices?: Price[];
    priceStore?: {
      setPrice(price: Price): void;
      getPrice(ticker: string): Price | undefined;
    };
  } = {},
): { ws: FakeWs; writes: Price[]; bridge: ReturnType<typeof createRealtimeBridge> } {
  const ws = makeFakeWs();
  const writer =
    options.priceStore !== undefined
      ? { writes: [] as Price[], store: options.priceStore }
      : makeWriter(options.initialPrices);
  const parseTick: WsTickParser = (): ParsedWsFrame => frame;
  const bridge = createRealtimeBridge({
    wsClient: ws.client,
    priceStore: writer.store,
    parseTick,
    applyTicksToPriceStore: options.applyTicksToPriceStore,
    canApplyTicksToPriceStore: options.canApplyTicksToPriceStore,
    getApplyDisabledReason: options.getApplyDisabledReason,
    onPriceApplied: options.onPriceApplied,
  });
  return { ws, writes: writer.writes, bridge };
}

describe('RealtimeBridge NXT4a — guarded tick apply', () => {
  it('defaults to dry-run: ticks do not call priceStore.setPrice', () => {
    const { ws, writes } = bridgeWith(
      ticksFrame(liveTick('005930', '2026-04-27T08:14:05.000Z')),
    );

    ws.emitMessage('LIVE-TICK');

    expect(writes).toHaveLength(0);
  });

  it('keeps apply disabled when applyTicksToPriceStore=false explicitly', () => {
    const { ws, writes } = bridgeWith(
      ticksFrame(liveTick('005930', '2026-04-27T08:14:05.000Z')),
      { applyTicksToPriceStore: false },
    );

    ws.emitMessage('LIVE-TICK');

    expect(writes).toHaveLength(0);
  });

  it('applies ticks only when applyTicksToPriceStore=true', () => {
    const { ws, writes } = bridgeWith(
      ticksFrame(liveTick('005930', '2026-04-27T08:14:05.000Z')),
      { applyTicksToPriceStore: true },
    );

    ws.emitMessage('LIVE-TICK');

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      ticker: '005930',
      price: 223500,
      changeAbs: 4000,
      changeRate: 1.82,
      volume: 39260243,
      updatedAt: '2026-04-27T08:14:05.000Z',
      isSnapshot: false,
      source: 'ws-integrated',
    });
  });

  it('requires both runtime gates when a dynamic apply predicate is provided', () => {
    let gates = {
      websocketEnabled: false,
      applyTicksToPriceStore: false,
    };
    const { ws, writes } = bridgeWith(
      ticksFrame(liveTick('005930', '2026-04-27T08:14:05.000Z')),
      {
        canApplyTicksToPriceStore: () => shouldApplyRuntimeWsTicks(gates),
      },
    );

    ws.emitMessage('DEFAULT-GATES-FALSE');
    expect(writes).toHaveLength(0);

    gates = {
      websocketEnabled: true,
      applyTicksToPriceStore: false,
    };
    ws.emitMessage('WS-ONLY');
    expect(writes).toHaveLength(0);

    gates = {
      websocketEnabled: true,
      applyTicksToPriceStore: true,
    };
    ws.emitMessage('BOTH-GATES');
    expect(writes).toHaveLength(1);
  });

  it('does not apply malformed/parser error frames', () => {
    const { ws, writes } = bridgeWith(
      { kind: 'error', message: 'invalid_field_count' },
      { applyTicksToPriceStore: true },
    );

    ws.emitMessage('BAD-TICK');

    expect(writes).toHaveLength(0);
  });

  it('applies every tick in a multi-tick frame', () => {
    const { ws, writes } = bridgeWith(
      ticksFrame(
        liveTick('005930', '2026-04-27T08:14:05.000Z', 223500),
        liveTick('000660', '2026-04-27T08:14:06.000Z', 310000),
      ),
      { applyTicksToPriceStore: true },
    );

    ws.emitMessage('MULTI-TICK');

    expect(writes.map((p) => [p.ticker, p.price])).toEqual([
      ['005930', 223500],
      ['000660', 310000],
    ]);
  });

  it('ignores older and equal updatedAt ticks instead of overwriting current price', () => {
    const current: Price = {
      ticker: '005930',
      price: 224000,
      changeAbs: 4500,
      changeRate: 2.05,
      volume: 40000000,
      updatedAt: '2026-04-27T08:14:06.000Z',
      isSnapshot: false,
      source: 'rest',
    };
    const { ws, writes } = bridgeWith(
      ticksFrame(
        liveTick('005930', '2026-04-27T08:14:05.000Z', 223500),
        liveTick('005930', '2026-04-27T08:14:06.000Z', 223700),
        liveTick('005930', '2026-04-27T08:14:07.000Z', 224100),
      ),
      { applyTicksToPriceStore: true, initialPrices: [current] },
    );

    ws.emitMessage('STALE-THEN-NEW');

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      ticker: '005930',
      price: 224100,
      updatedAt: '2026-04-27T08:14:07.000Z',
    });
  });

  it('does not propagate WS apply failures to pollingScheduler.stop', () => {
    const pollingStop = vi.fn();
    const applyErrors: string[] = [];
    const ws = makeFakeWs();
    const parseTick: WsTickParser = (): ParsedWsFrame =>
      ticksFrame(liveTick('005930', '2026-04-27T08:14:05.000Z'));
    const bridge = createRealtimeBridge({
      wsClient: ws.client,
      priceStore: {
        setPrice(): void {
          throw new Error('write failed');
        },
        getPrice(): Price | undefined {
          return undefined;
        },
      },
      parseTick,
      applyTicksToPriceStore: true,
    });
    bridge.on('apply-error', (message) => {
      applyErrors.push(message);
    });

    expect(() => ws.emitMessage('LIVE-TICK')).not.toThrow();
    expect(pollingStop).not.toHaveBeenCalled();
    expect(applyErrors).toEqual(['write failed']);
  });

  it('can stop a session without detaching the WS message listener', async () => {
    const ws = makeFakeWs();
    const writes = makeWriter();
    const parseTick: WsTickParser = (): ParsedWsFrame =>
      ticksFrame(liveTick('005930', '2026-04-27T08:14:05.000Z'));
    const bridge = createRealtimeBridge({
      wsClient: ws.client,
      priceStore: writes.store,
      parseTick,
      applyTicksToPriceStore: true,
    });

    await bridge.stopSession();
    ws.emitMessage('NEXT-SESSION-TICK');

    expect(writes.writes).toHaveLength(1);
  });

  it('emits SSE price-update through PriceStore only on successful apply', () => {
    const store = new PriceStore();
    const events: Price[] = [];
    store.on('price-update', (price) => {
      events.push(price);
    });

    const dryRun = bridgeWith(
      ticksFrame(liveTick('005930', '2026-04-27T08:14:05.000Z')),
      { priceStore: store },
    );
    dryRun.ws.emitMessage('DRY-RUN-TICK');
    expect(events).toHaveLength(0);

    const enabled = bridgeWith(
      ticksFrame(liveTick('005930', '2026-04-27T08:14:06.000Z')),
      { priceStore: store, applyTicksToPriceStore: true },
    );
    enabled.ws.emitMessage('APPLY-TICK');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      ticker: '005930',
      source: 'ws-integrated',
    });
  });

  it('enforces the session applied tick limit before extra ticks in the same frame can write', () => {
    const sessionGate = createRealtimeSessionGate({
      now: () => '2026-04-28T02:00:00.000Z',
    });
    sessionGate.enable({
      cap: 1,
      tickers: ['005930'],
      stats: {
        parsedTickCount: 0,
        appliedTickCount: 0,
      },
    });
    const limitNowMs = Date.parse('2026-04-28T02:00:01.000Z');
    const maybeDisableForLimit = (
      stats: RealtimeBridgeStats,
    ): 'session_limit_reached' | null => {
      if (
        !sessionGate.snapshot().sessionRealtimeEnabled &&
        sessionGate.snapshot().sessionEndReason !== null
      ) {
        return 'session_limit_reached';
      }
      const reason = sessionLimitEndReason(sessionGate.snapshot(), {
        nowMs: limitNowMs,
        parsedTickCount: stats.parsedTickCount,
        appliedTickCount: stats.appliedTickCount,
      });
      if (reason === null) return null;
      sessionGate.disable(reason);
      return 'session_limit_reached';
    };
    const { ws, writes, bridge } = bridgeWith(
      ticksFrame(
        liveTick('005930', '2026-04-28T02:00:01.000Z', 100),
        liveTick('005930', '2026-04-28T02:00:02.000Z', 101),
        liveTick('005930', '2026-04-28T02:00:03.000Z', 102),
        liveTick('005930', '2026-04-28T02:00:04.000Z', 103),
        liveTick('005930', '2026-04-28T02:00:05.000Z', 104),
        liveTick('005930', '2026-04-28T02:00:06.000Z', 105),
      ),
      {
        getApplyDisabledReason: (ticker, stats) => {
          const limitReason = maybeDisableForLimit(stats);
          if (limitReason !== null) return limitReason;
          return shouldApplyRuntimeWsTicks(baseRuntimeGates, sessionGate.snapshot(), ticker)
            ? null
            : 'apply_disabled';
        },
        onPriceApplied: (_price, stats) => {
          maybeDisableForLimit(stats);
        },
      },
    );

    ws.emitMessage('MULTI-TICK-BURST');

    expect(writes).toHaveLength(5);
    expect(writes.map((price) => price.price)).toEqual([100, 101, 102, 103, 104]);
    expect(sessionGate.snapshot()).toMatchObject({
      sessionRealtimeEnabled: false,
      sessionEndReason: 'applied_tick_limit_reached',
    });
    expect(bridge.getStats().sessionLimitIgnoredCount).toBe(1);
  });

  it('blocks applies immediately when parsed or time session limits have already closed the gate', () => {
    const parsedLimited = bridgeWith(
      ticksFrame(
        liveTick('005930', '2026-04-28T02:00:01.000Z', 100),
        liveTick('005930', '2026-04-28T02:00:02.000Z', 101),
      ),
      {
        getApplyDisabledReason: (_ticker, stats) =>
          stats.parsedTickCount > 1 ? 'session_limit_reached' : null,
      },
    );

    parsedLimited.ws.emitMessage('PARSED-LIMIT-BURST');

    expect(parsedLimited.writes).toHaveLength(1);
    expect(parsedLimited.bridge.getStats().sessionLimitIgnoredCount).toBe(1);

    const timeLimited = bridgeWith(
      ticksFrame(liveTick('005930', '2026-04-28T02:01:01.000Z', 102)),
      {
        getApplyDisabledReason: () => 'session_limit_reached',
      },
    );

    timeLimited.ws.emitMessage('TIME-LIMITED-TICK');

    expect(timeLimited.writes).toHaveLength(0);
    expect(timeLimited.bridge.getStats().sessionLimitIgnoredCount).toBe(1);
  });
});
