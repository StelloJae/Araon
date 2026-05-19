import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToastSpec } from '../../lib/alert-evaluator';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  // nothing
});

function spec(id: string): ToastSpec {
  return {
    id,
    cooldownKey: `key-${id}`,
    ticker: '005930',
    name: '삼성전자',
    kind: 'fav-pct',
    direction: 'up',
    changePct: 5.2,
    title: 'title',
    detail: 'detail',
    ts: 0,
  };
}

describe('useToastStore', () => {
  it('starts empty', async () => {
    const { useToastStore } = await import('../toast-store');
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('push appends and dismiss removes by id', async () => {
    const { useToastStore } = await import('../toast-store');
    useToastStore.getState().push(spec('a'));
    useToastStore.getState().push(spec('b'));
    expect(useToastStore.getState().toasts).toHaveLength(2);
    useToastStore.getState().dismiss('a');
    const ids = useToastStore.getState().toasts.map((t) => t.id);
    expect(ids).toEqual(['b']);
  });

  it('replaces a visible toast with the same id instead of stacking duplicates', async () => {
    const { useToastStore } = await import('../toast-store');
    useToastStore.getState().push(spec('a'));
    useToastStore.getState().push({ ...spec('a'), title: 'new title' });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.title).toBe('new title');
  });

  it('replaces a visible toast with the same cooldown key instead of stacking duplicates', async () => {
    const { useToastStore } = await import('../toast-store');
    useToastStore.getState().push({
      ...spec('a'),
      cooldownKey: 'market-movement:005930:30s:up',
      title: 'old title',
    });
    useToastStore.getState().push({
      ...spec('b'),
      cooldownKey: 'market-movement:005930:30s:up',
      title: 'new title',
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.id).toBe('b');
    expect(toasts[0]?.title).toBe('new title');
  });

  it('does not stack equivalent realtime momentum agent toasts with different event ids', async () => {
    const { useToastStore } = await import('../toast-store');
    const { maybeAgentEventToToastSpec } = await import('../../lib/agent-event-toast');

    const baseEvent = {
      type: 'agent-event' as const,
      id: 13,
      event: {
        id: 'agent-event-first',
        type: 'market_movement_detected' as const,
        ticker: '277810',
        source: 'realtime-momentum',
        publishedAt: '2026-05-11T06:00:20.000Z',
        firstSeenAt: '2026-05-11T06:00:20.000Z',
        freshnessMs: 0,
        freshness: 'near_realtime' as const,
        relevance: 0.5,
        confidence: 0.9,
        reason: '최근 급상승 · 0~30초 · +3.09%',
        payloadRef: null,
        createdAt: '2026-05-11T06:00:20.000Z',
      },
    };
    const nextEvent = {
      ...baseEvent,
      id: 14,
      event: {
        ...baseEvent.event,
        id: 'agent-event-second',
      },
    };
    const first = maybeAgentEventToToastSpec(
      baseEvent,
      '켄코아에어로스페이스',
      { notificationsEnabled: true, marketMovementThresholdPct: 3 },
      1_111,
    );
    const second = maybeAgentEventToToastSpec(
      nextEvent,
      '켄코아에어로스페이스',
      { notificationsEnabled: true, marketMovementThresholdPct: 3 },
      1_222,
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    useToastStore.getState().push(first!);
    useToastStore.getState().push(second!);

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.id).toBe('agent-event-agent-event-second');
    expect(toasts[0]?.cooldownKey).toBe('agent-event:market:277810:realtime-momentum:0-30s:up');
  });

  it('caps total toasts to MAX_TOASTS by evicting the oldest', async () => {
    const mod = await import('../toast-store');
    for (let i = 0; i < mod.MAX_TOASTS + 3; i++) {
      mod.useToastStore.getState().push(spec(String(i)));
    }
    const ids = mod.useToastStore.getState().toasts.map((t) => t.id);
    expect(ids).toHaveLength(mod.MAX_TOASTS);
    // oldest evicted, newest still present
    expect(ids).not.toContain('0');
    expect(ids).toContain(String(mod.MAX_TOASTS + 2));
  });

  it('clear empties everything', async () => {
    const { useToastStore } = await import('../toast-store');
    useToastStore.getState().push(spec('x'));
    useToastStore.getState().clear();
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
