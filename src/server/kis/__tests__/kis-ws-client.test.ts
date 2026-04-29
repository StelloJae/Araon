import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WS_RECONNECT_BASE_MS,
  WS_SUBSCRIBE_INTERVAL_MS,
} from '@shared/kis-constraints.js';
import {
  createKisWsClient,
  DEFAULT_RECONNECT_DELAYS_MS,
  type KisWsClient,
  type KisWsClientOptions,
  type WsSocketLike,
  type WsSubscription,
} from '../kis-ws-client.js';

type Listener = (arg?: unknown) => void;

class MockWs implements WsSocketLike {
  readyState = 0;
  readonly sent: string[] = [];
  closed = false;
  private readonly listeners: Record<string, Listener[]> = {
    open: [],
    message: [],
    error: [],
    close: [],
  };

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.emit('close');
  }

  addEventListener(event: 'open', handler: () => void): void;
  addEventListener(event: 'message', handler: (e: { data: unknown }) => void): void;
  addEventListener(event: 'close', handler: () => void): void;
  addEventListener(event: 'error', handler: (e: unknown) => void): void;
  addEventListener(event: string, handler: Listener): void {
    const bucket = this.listeners[event];
    if (bucket !== undefined) bucket.push(handler);
  }

  private emit(event: string, arg?: unknown): void {
    const bucket = this.listeners[event];
    if (bucket === undefined) return;
    for (const handler of [...bucket]) handler(arg);
  }

  simulateOpen(): void {
    this.readyState = 1;
    this.emit('open');
  }

  simulateMessage(data: unknown): void {
    this.emit('message', { data });
  }

  simulateClose(): void {
    this.readyState = 3;
    this.emit('close');
  }

  simulateError(err: unknown): void {
    this.emit('error', err);
  }
}

function decodeFrame(raw: string): {
  approval_key: string;
  tr_type: string;
  tr_id: string;
  tr_key: string;
} {
  const parsed = JSON.parse(raw) as {
    header?: { approval_key?: string; tr_type?: string; tr_id?: string };
    body?: { input?: { tr_id?: string; tr_key?: string } };
  };
  return {
    approval_key: parsed.header?.approval_key ?? '',
    tr_type: parsed.header?.tr_type ?? '',
    tr_id: parsed.body?.input?.tr_id ?? parsed.header?.tr_id ?? '',
    tr_key: parsed.body?.input?.tr_key ?? '',
  };
}

const approvalKey = 'test-approval-key-1234';
const sub1: WsSubscription = { trId: 'H0STCNT0', trKey: '005930' };
const sub2: WsSubscription = { trId: 'H0STASP0', trKey: '000660' };

describe('kis-ws-client', () => {
  let mocks: MockWs[];

  beforeEach(() => {
    mocks = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeClient(
    overrides: Partial<KisWsClientOptions> = {},
  ): KisWsClient {
    return createKisWsClient({
      isPaper: true,
      getApprovalKey: async () => approvalKey,
      wsFactory: (_url: string) => {
        const socket = new MockWs();
        mocks.push(socket);
        return socket;
      },
      // Disable stagger + ping + jitter by default — tests that care override
      // explicitly. Determinism is non-negotiable for fake-timer assertions.
      subscribeIntervalMs: 0,
      pingIntervalMs: 60_000_000,
      jitterRatio: 0,
      ...overrides,
    });
  }

  async function openClient(overrides?: Partial<KisWsClientOptions>) {
    const client = makeClient(overrides);
    const p = client.connect();
    // Let getApprovalKey + factory settle.
    await Promise.resolve();
    await Promise.resolve();
    mocks[0]!.simulateOpen();
    await p;
    return client;
  }

  it('connect → message → disconnect clean path', async () => {
    const client = await openClient();
    const received: string[] = [];
    client.onMessage((raw) => received.push(raw));

    expect(client.state()).toBe('connected');

    mocks[0]!.simulateMessage('{"tick":"hello"}');
    expect(received).toEqual(['{"tick":"hello"}']);

    await client.disconnect();
    expect(mocks[0]!.closed).toBe(true);
    expect(client.state()).toBe('stopped');
    expect(client.getStatus().stopReason).toBe('manual');
  });

  it('rejects connect if close fires before open', async () => {
    const client = makeClient();
    const p = client.connect();
    await Promise.resolve();
    await Promise.resolve();
    mocks[0]!.simulateClose();
    await expect(p).rejects.toThrow(/closed before open/);
  });

  it('subscribe sends tr_type=1 frame with approval key; unsubscribe sends tr_type=2', async () => {
    const client = await openClient();

    await client.subscribe(sub1);
    expect(mocks[0]!.sent).toHaveLength(1);
    const subFrame = decodeFrame(mocks[0]!.sent[0]!);
    expect(subFrame.approval_key).toBe(approvalKey);
    expect(subFrame.tr_type).toBe('1');
    expect(subFrame.tr_id).toBe('H0STCNT0');
    expect(subFrame.tr_key).toBe('005930');

    await client.unsubscribe(sub1);
    expect(mocks[0]!.sent).toHaveLength(2);
    const unsubFrame = decodeFrame(mocks[0]!.sent[1]!);
    expect(unsubFrame.tr_type).toBe('2');
    expect(unsubFrame.tr_id).toBe('H0STCNT0');

    await client.disconnect();
  });

  it('staggers consecutive subscribes by WS_SUBSCRIBE_INTERVAL_MS', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const client = makeClient({
      subscribeIntervalMs: WS_SUBSCRIBE_INTERVAL_MS,
    });
    const connectPromise = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    mocks[0]!.simulateOpen();
    await connectPromise;

    // First subscribe: no prior send → flushes immediately.
    await client.subscribe(sub1);
    expect(mocks[0]!.sent).toHaveLength(1);

    // Second subscribe: issued immediately — must wait WS_SUBSCRIBE_INTERVAL_MS.
    const pending = client.subscribe(sub2);
    await vi.advanceTimersByTimeAsync(WS_SUBSCRIBE_INTERVAL_MS - 1);
    expect(mocks[0]!.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    await pending;
    expect(mocks[0]!.sent).toHaveLength(2);

    await client.disconnect();
  });

  it('emits PINGPONG at the configured ping interval once open', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const pingMs = 500;
    const client = makeClient({ pingIntervalMs: pingMs });
    const connectPromise = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    mocks[0]!.simulateOpen();
    await connectPromise;

    await vi.advanceTimersByTimeAsync(pingMs + 5);
    const pings = mocks[0]!.sent.filter((f) => f.includes('PINGPONG'));
    expect(pings.length).toBeGreaterThanOrEqual(1);

    await client.disconnect();
  });

  it('reconnects after a drop and replays active subscriptions on success', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const client = makeClient();
    const connectPromise = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    const first = mocks[0]!;
    first.simulateOpen();
    await connectPromise;

    await client.subscribe(sub1);
    await client.subscribe(sub2);
    expect(
      first.sent
        .map(decodeFrame)
        .filter((f) => f.tr_type === '1'),
    ).toHaveLength(2);

    // Drop the socket → backoff schedule kicks in.
    first.simulateClose();
    expect(client.state()).toBe('degraded');

    // Retry #1: delaysMs[0].
    await vi.advanceTimersByTimeAsync(DEFAULT_RECONNECT_DELAYS_MS[0]! - 1);
    expect(mocks).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(mocks).toHaveLength(2);
    // Fail the first retry too.
    mocks[1]!.simulateClose();

    // Retry #2: delaysMs[1].
    await vi.advanceTimersByTimeAsync(DEFAULT_RECONNECT_DELAYS_MS[1]! - 1);
    expect(mocks).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(mocks).toHaveLength(3);

    // This retry succeeds — subscriptions must be replayed.
    const third = mocks[2]!;
    third.simulateOpen();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    const replayed = third.sent
      .map(decodeFrame)
      .filter((f) => f.tr_type === '1');
    expect(replayed).toHaveLength(2);
    expect(new Set(replayed.map((f) => f.tr_id))).toEqual(
      new Set(['H0STCNT0', 'H0STASP0']),
    );

    await client.disconnect();
  });

  // === NXT0 safety guards =====================================================

  it('applies the configured reconnect delay sequence in order', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const delays = [10, 25, 50] as const;
    const client = makeClient({
      reconnectDelaysMs: delays,
      maxReconnectAttempts: 5,
    });
    const connectPromise = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    mocks[0]!.simulateOpen();
    await connectPromise;

    // Initial drop schedules retry #1 with delays[0].
    mocks[0]!.simulateClose();
    expect(client.state()).toBe('degraded');
    await vi.advanceTimersByTimeAsync(delays[0] - 1);
    expect(mocks).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(mocks).toHaveLength(2);

    // Fail retry #1 → schedule retry #2 with delays[1].
    mocks[1]!.simulateClose();
    await vi.advanceTimersByTimeAsync(delays[1] - 1);
    expect(mocks).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(mocks).toHaveLength(3);

    // Fail retry #2 → schedule retry #3 with delays[2].
    mocks[2]!.simulateClose();
    await vi.advanceTimersByTimeAsync(delays[2] - 1);
    expect(mocks).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(2);
    expect(mocks).toHaveLength(4);

    await client.disconnect();
  });

  it('stops with reason max_reconnect_attempts after exhausting retries', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const client = makeClient({
      reconnectDelaysMs: [10, 10, 10],
      maxReconnectAttempts: 3,
    });
    const connectPromise = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    mocks[0]!.simulateOpen();
    await connectPromise;

    // Drop → retry #1
    mocks[0]!.simulateClose();
    await vi.advanceTimersByTimeAsync(10);
    expect(mocks).toHaveLength(2);
    mocks[1]!.simulateClose();

    // retry #2
    await vi.advanceTimersByTimeAsync(10);
    expect(mocks).toHaveLength(3);
    mocks[2]!.simulateClose();

    // retry #3
    await vi.advanceTimersByTimeAsync(10);
    expect(mocks).toHaveLength(4);
    mocks[3]!.simulateClose();

    // close-before-open during a retry attempt rejects the connectInternal
    // promise, so the .catch → considerScheduleReconnect transition runs in a
    // microtask. Flush the microtask queue before asserting the terminal state.
    await vi.advanceTimersByTimeAsync(0);

    // attempts=3, max=3 → stopped
    expect(client.state()).toBe('stopped');
    const status = client.getStatus();
    expect(status.stopReason).toBe('max_reconnect_attempts');
    expect(status.reconnectAttempts).toBe(3);

    // No further retries even if time advances.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks).toHaveLength(4);
  });

  it('manual disconnect cancels pending reconnect timer', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const client = makeClient({
      reconnectDelaysMs: [5_000],
      maxReconnectAttempts: 3,
    });
    const connectPromise = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    mocks[0]!.simulateOpen();
    await connectPromise;

    // Drop schedules a retry 5s out.
    mocks[0]!.simulateClose();
    expect(client.state()).toBe('degraded');
    expect(client.getStatus().nextReconnectAt).not.toBeNull();

    // Manual stop before retry timer fires.
    await client.disconnect();
    expect(client.state()).toBe('stopped');
    expect(client.getStatus().stopReason).toBe('manual');
    expect(client.getStatus().nextReconnectAt).toBeNull();

    // Advance well past the would-be retry — no new socket.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks).toHaveLength(1);
  });

  it('auth failure during connect transitions to stopped without retry', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const authError = new Error('401 unauthorized: bad approval credentials');
    let approvalCalls = 0;
    const client = makeClient({
      getApprovalKey: async () => {
        approvalCalls += 1;
        throw authError;
      },
      reconnectDelaysMs: [10],
      maxReconnectAttempts: 5,
    });

    await expect(client.connect()).rejects.toThrow(/unauthorized/);

    expect(client.state()).toBe('stopped');
    expect(client.getStatus().stopReason).toBe('auth_failure');
    expect(approvalCalls).toBe(1);

    // Advance time — no auto-retry of approval-key failures.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(approvalCalls).toBe(1);
    expect(mocks).toHaveLength(0);
  });

  it('reset attempts counter only after stableResetMs of sustained connection', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const client = makeClient({
      reconnectDelaysMs: [10],
      maxReconnectAttempts: 10,
      stableResetMs: 1_000,
    });
    const connectPromise = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    mocks[0]!.simulateOpen();
    await connectPromise;

    // Drop quickly (before stableResetMs). attempts should NOT reset; new
    // attempt counts on top of the previous baseline.
    mocks[0]!.simulateClose();
    expect(client.getStatus().reconnectAttempts).toBe(1);

    // Retry connects + drops in <1s flap loop.
    await vi.advanceTimersByTimeAsync(10);
    mocks[1]!.simulateOpen();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.state()).toBe('connected');
    // Drop before the 1s stableResetMs elapses.
    await vi.advanceTimersByTimeAsync(500);
    mocks[1]!.simulateClose();
    // attempts continued accumulating (now 2).
    expect(client.getStatus().reconnectAttempts).toBe(2);

    // Now reach a stable connection ≥ stableResetMs.
    await vi.advanceTimersByTimeAsync(10);
    mocks[2]!.simulateOpen();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.state()).toBe('connected');
    await vi.advanceTimersByTimeAsync(1_001);
    expect(client.getStatus().reconnectAttempts).toBe(0);

    await client.disconnect();
  });

  it('getStatus exposes diagnostics including state and stopReason', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const client = makeClient({
      reconnectDelaysMs: [10_000],
      maxReconnectAttempts: 5,
    });

    expect(client.getStatus()).toEqual({
      state: 'idle',
      reconnectAttempts: 0,
      nextReconnectAt: null,
      lastConnectedAt: null,
      lastError: null,
      stopReason: null,
    });

    const connectPromise = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    mocks[0]!.simulateOpen();
    await connectPromise;

    const connectedStatus = client.getStatus();
    expect(connectedStatus.state).toBe('connected');
    expect(connectedStatus.lastConnectedAt).not.toBeNull();
    expect(connectedStatus.stopReason).toBeNull();

    mocks[0]!.simulateClose();
    const degradedStatus = client.getStatus();
    expect(degradedStatus.state).toBe('degraded');
    expect(degradedStatus.reconnectAttempts).toBe(1);
    expect(degradedStatus.nextReconnectAt).not.toBeNull();

    await client.disconnect();
    expect(client.getStatus().stopReason).toBe('manual');
  });

  it('lastError redacts approval keys, app secrets, and tokens', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const leakyError = new Error(
      'oauth2/Approval failed: approval_key=abc123secret&appsecret=xyz789 access_token=def456 Bearer raw-jwt-token',
    );
    const client = makeClient({
      getApprovalKey: async () => {
        throw leakyError;
      },
    });

    await expect(client.connect()).rejects.toThrow();
    const status = client.getStatus();
    expect(status.lastError).not.toBeNull();
    const message = status.lastError!.message;
    expect(message).not.toContain('abc123secret');
    expect(message).not.toContain('xyz789');
    expect(message).not.toContain('def456');
    expect(message).not.toContain('raw-jwt-token');
    expect(message).toContain('approval_key=[REDACTED]');
    expect(message).toContain('appsecret=[REDACTED]');
    expect(message).toContain('access_token=[REDACTED]');
    expect(message).toContain('Bearer [REDACTED]');
  });

  it('jitter keeps each scheduled delay within ±jitterRatio of the configured base', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    // Inject deterministic RNG: alternates between 0 (low end) and 0.999... (high end).
    const seq = [0, 0.999, 0.5, 0, 0.999];
    let i = 0;
    const random = (): number => {
      const v = seq[i % seq.length]!;
      i += 1;
      return v;
    };
    const baseDelay = 1_000;
    const client = makeClient({
      reconnectDelaysMs: [baseDelay, baseDelay, baseDelay, baseDelay, baseDelay],
      maxReconnectAttempts: 5,
      jitterRatio: 0.2, // ±20%
      random,
    });
    const connectPromise = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    mocks[0]!.simulateOpen();
    await connectPromise;

    mocks[0]!.simulateClose();
    // Random=0 → swing = -0.2 * 1000 = -200. delay = 800.
    await vi.advanceTimersByTimeAsync(799);
    expect(mocks).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(mocks).toHaveLength(2);

    mocks[1]!.simulateClose();
    // Random≈0.999 → swing ≈ +0.2 * 1000 = +200. delay = 1200.
    await vi.advanceTimersByTimeAsync(1199);
    expect(mocks).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(mocks).toHaveLength(3);

    await client.disconnect();
  });

  it('keeps base reference WS_RECONNECT_BASE_MS aligned with delaysMs[0]', () => {
    // Sanity guard: the historical base constant should remain consistent
    // with the explicit default sequence.
    expect(DEFAULT_RECONNECT_DELAYS_MS[0]).toBe(WS_RECONNECT_BASE_MS);
  });
});
