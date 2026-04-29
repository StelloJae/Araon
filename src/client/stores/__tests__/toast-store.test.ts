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
