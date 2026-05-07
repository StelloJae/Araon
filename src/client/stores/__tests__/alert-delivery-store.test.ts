import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'araon-alert-deliveries-v1';

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

describe('useAlertDeliveryStore', () => {
  it('starts empty and records latest entries first', async () => {
    const { useAlertDeliveryStore } = await import('../alert-delivery-store');

    useAlertDeliveryStore.getState().record({
      ts: 1,
      ticker: '005930',
      name: '삼성전자',
      title: '삼성전자 · 룰 발동',
      detail: '005930 · 등락률 ≥ 5%',
      kind: 'rule',
      direction: 'up',
      channel: 'toast',
      status: 'sent',
    });
    useAlertDeliveryStore.getState().record({
      ts: 2,
      ticker: '000660',
      name: 'SK하이닉스',
      title: 'SK하이닉스 +5.00%',
      detail: '000660 · 100,000원',
      kind: 'fav-pct',
      direction: 'up',
      channel: 'phone',
      status: 'failed',
      reason: 'SERVER_ERROR_WITH_A_VERY_LONG_MESSAGE_THAT_SHOULD_BE_TRUNCATED',
    });

    const entries = useAlertDeliveryStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      ticker: '000660',
      channel: 'phone',
      status: 'failed',
    });
    expect(entries[0]?.reason?.length).toBeLessThanOrEqual(80);
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('caps retained entries to 200 and persists reloads', async () => {
    const { useAlertDeliveryStore } = await import('../alert-delivery-store');

    for (let i = 0; i < 205; i += 1) {
      useAlertDeliveryStore.getState().record({
        ts: i,
        ticker: '005930',
        name: '삼성전자',
        title: `알림 ${i}`,
        detail: 'detail',
        kind: 'rule',
        direction: 'up',
        channel: 'toast',
        status: 'sent',
      });
    }

    expect(useAlertDeliveryStore.getState().entries).toHaveLength(200);
    expect(useAlertDeliveryStore.getState().entries[0]?.title).toBe('알림 204');

    vi.resetModules();
    const reloaded = await import('../alert-delivery-store');
    expect(reloaded.useAlertDeliveryStore.getState().entries).toHaveLength(200);
    expect(reloaded.useAlertDeliveryStore.getState().entries[0]?.title).toBe(
      '알림 204',
    );
  });

  it('clears entries from memory and storage', async () => {
    const { useAlertDeliveryStore } = await import('../alert-delivery-store');

    useAlertDeliveryStore.getState().record({
      ts: 1,
      ticker: '005930',
      name: '삼성전자',
      title: '알림',
      detail: 'detail',
      kind: 'rule',
      direction: 'up',
      channel: 'toast',
      status: 'sent',
    });
    useAlertDeliveryStore.getState().clear();

    expect(useAlertDeliveryStore.getState().entries).toEqual([]);
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
