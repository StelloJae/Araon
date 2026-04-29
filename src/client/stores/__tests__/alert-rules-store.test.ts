import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'araon-rules-v1';

function makeMemoryLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(i: number) {
      return Array.from(map.keys())[i] ?? null;
    },
    getItem(k: string) {
      return map.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      map.set(k, String(v));
    },
    removeItem(k: string) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
  } satisfies Storage;
}

beforeEach(() => {
  vi.resetModules();
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeMemoryLocalStorage(),
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('useAlertRulesStore', () => {
  it('starts empty when storage has nothing', async () => {
    const { useAlertRulesStore } = await import('../alert-rules-store');
    expect(useAlertRulesStore.getState().rules).toEqual([]);
  });

  it('add stores a rule with id, createdAt, default cooldown', async () => {
    const mod = await import('../alert-rules-store');
    const rule = mod.useAlertRulesStore.getState().add({
      ticker: '005930',
      kind: 'changePctAbove',
      threshold: 5,
    });
    expect(rule.id).toMatch(/.+/);
    expect(rule.createdAt).toBeTypeOf('number');
    expect(rule.enabled).toBe(true);
    expect(rule.cooldownMs).toBe(mod.DEFAULT_RULE_COOLDOWN_MS);
    expect(mod.useAlertRulesStore.getState().rules).toHaveLength(1);
  });

  it('toggle flips enabled', async () => {
    const mod = await import('../alert-rules-store');
    const r = mod.useAlertRulesStore.getState().add({
      ticker: '005930',
      kind: 'priceAbove',
      threshold: 100_000,
    });
    mod.useAlertRulesStore.getState().toggle(r.id);
    expect(mod.useAlertRulesStore.getState().rules[0]?.enabled).toBe(false);
    mod.useAlertRulesStore.getState().toggle(r.id);
    expect(mod.useAlertRulesStore.getState().rules[0]?.enabled).toBe(true);
  });

  it('remove deletes the rule', async () => {
    const mod = await import('../alert-rules-store');
    const r = mod.useAlertRulesStore.getState().add({
      ticker: '005930',
      kind: 'priceBelow',
      threshold: 50_000,
    });
    mod.useAlertRulesStore.getState().remove(r.id);
    expect(mod.useAlertRulesStore.getState().rules).toEqual([]);
  });

  it('persists to localStorage and reloads on next import', async () => {
    const mod = await import('../alert-rules-store');
    mod.useAlertRulesStore.getState().add({
      ticker: '000660',
      kind: 'volumeAbove',
      threshold: 1_000_000,
    });
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    vi.resetModules();
    const reloaded = await import('../alert-rules-store');
    expect(reloaded.useAlertRulesStore.getState().rules).toHaveLength(1);
    expect(reloaded.useAlertRulesStore.getState().rules[0]?.ticker).toBe(
      '000660',
    );
  });

  it('skips invalid items when reloading', async () => {
    const valid = {
      id: 'r1',
      ticker: '005930',
      kind: 'priceAbove',
      threshold: 100_000,
      enabled: true,
      cooldownMs: 60_000,
      createdAt: Date.now(),
    };
    const corrupt = [
      valid,
      { id: 'bad', ticker: '', kind: 'priceAbove', threshold: 1, enabled: true, cooldownMs: 0, createdAt: 0 },
      { id: 'kindBad', ticker: '111', kind: 'unknownKind', threshold: 1, enabled: true, cooldownMs: 0, createdAt: 0 },
      'not an object',
      { id: 'noThr', ticker: '111', kind: 'priceAbove', enabled: true, cooldownMs: 0, createdAt: 0 },
    ];
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(corrupt));
    const { useAlertRulesStore } = await import('../alert-rules-store');
    const rules = useAlertRulesStore.getState().rules;
    expect(rules).toHaveLength(1);
    expect(rules[0]?.id).toBe('r1');
  });

  it('falls back to empty array on malformed JSON', async () => {
    globalThis.localStorage.setItem(STORAGE_KEY, '{not json');
    const { useAlertRulesStore } = await import('../alert-rules-store');
    expect(useAlertRulesStore.getState().rules).toEqual([]);
  });

  it('update patches an existing rule', async () => {
    const mod = await import('../alert-rules-store');
    const r = mod.useAlertRulesStore.getState().add({
      ticker: '005930',
      kind: 'changePctAbove',
      threshold: 5,
    });
    mod.useAlertRulesStore.getState().update(r.id, { threshold: 10 });
    expect(mod.useAlertRulesStore.getState().rules[0]?.threshold).toBe(10);
  });
});
