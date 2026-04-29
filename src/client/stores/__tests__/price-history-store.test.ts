import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  // Nothing to clean up — this store has no global side effects.
});

describe('usePriceHistoryStore', () => {
  it('starts empty', async () => {
    const { usePriceHistoryStore } = await import('../price-history-store');
    expect(usePriceHistoryStore.getState().byTicker).toEqual({});
  });

  it('appendPoint adds points keyed by ticker', async () => {
    const { usePriceHistoryStore } = await import('../price-history-store');
    const s = usePriceHistoryStore.getState();
    s.appendPoint('005930', { price: 78_900, changePct: 2.34, ts: 1_000 });
    s.appendPoint('005930', { price: 79_000, changePct: 2.46, ts: 2_000 });
    s.appendPoint('000660', { price: 212_500, changePct: 3.12, ts: 1_500 });

    const next = usePriceHistoryStore.getState().byTicker;
    expect(next['005930']).toHaveLength(2);
    expect(next['000660']).toHaveLength(1);
  });

  it('prunes points older than HISTORY_TTL_MS on each append', async () => {
    const mod = await import('../price-history-store');
    const s = mod.usePriceHistoryStore.getState();
    s.appendPoint('005930', { price: 100, changePct: 0, ts: 1_000 });
    // Far-future ts pushes the cutoff past the first point.
    const farFuture = 1_000 + mod.HISTORY_TTL_MS + 5_000;
    s.appendPoint('005930', { price: 105, changePct: 1, ts: farFuture });
    const points = mod.usePriceHistoryStore.getState().byTicker['005930'];
    expect(points).toHaveLength(1);
    expect(points?.[0]?.ts).toBe(farFuture);
  });

  it('caps each ticker to MAX_POINTS_PER_TICKER (drops oldest)', async () => {
    const mod = await import('../price-history-store');
    const s = mod.usePriceHistoryStore.getState();
    const cap = mod.MAX_POINTS_PER_TICKER;
    for (let i = 0; i < cap + 50; i++) {
      s.appendPoint('005930', { price: 100 + i, changePct: 0, ts: 10_000 + i });
    }
    const points = mod.usePriceHistoryStore.getState().byTicker['005930'];
    expect(points).toHaveLength(cap);
    // Oldest preserved point should be the (50)th original push (i=50 → ts=10050).
    expect(points?.[0]?.ts).toBe(10_000 + 50);
  });

  it('drops the least-recently-touched ticker once MAX_TRACKED_TICKERS exceeded', async () => {
    const mod = await import('../price-history-store');
    const s = mod.usePriceHistoryStore.getState();
    const cap = mod.MAX_TRACKED_TICKERS;
    for (let i = 0; i < cap; i++) {
      s.appendPoint(`T${i}`, { price: 100, changePct: 0, ts: 1_000 + i });
    }
    expect(Object.keys(mod.usePriceHistoryStore.getState().byTicker)).toHaveLength(cap);
    // Adding one more must evict the oldest (T0)
    s.appendPoint('NEW', { price: 200, changePct: 0, ts: 1_000 + cap });
    const after = mod.usePriceHistoryStore.getState().byTicker;
    expect(Object.keys(after)).toHaveLength(cap);
    expect(after['T0']).toBeUndefined();
    expect(after['NEW']).toBeDefined();
  });

  it('skips appending an exact-duplicate last tick', async () => {
    const { usePriceHistoryStore } = await import('../price-history-store');
    const s = usePriceHistoryStore.getState();
    s.appendPoint('A', { price: 100, changePct: 0, ts: 1_000 });
    s.appendPoint('A', { price: 100, changePct: 0, ts: 1_000 });
    expect(usePriceHistoryStore.getState().byTicker['A']).toHaveLength(1);
  });

  it('selectHistory returns empty array for unknown ticker', async () => {
    const { usePriceHistoryStore, selectHistory } = await import(
      '../price-history-store'
    );
    expect(selectHistory(usePriceHistoryStore.getState(), 'ZZZ')).toEqual([]);
  });

  it('clearTicker removes points and lastTouch for a single ticker', async () => {
    const { usePriceHistoryStore } = await import('../price-history-store');
    const s = usePriceHistoryStore.getState();
    s.appendPoint('005930', { price: 100, changePct: 0, ts: 1_000 });
    s.appendPoint('000660', { price: 200, changePct: 0, ts: 1_000 });

    s.clearTicker('005930');

    const next = usePriceHistoryStore.getState();
    expect(next.byTicker['005930']).toBeUndefined();
    expect(next.lastTouch['005930']).toBeUndefined();
    // Untouched ticker survives
    expect(next.byTicker['000660']).toHaveLength(1);
  });

  it('clearTicker is a no-op for unknown ticker (state reference stable)', async () => {
    const { usePriceHistoryStore } = await import('../price-history-store');
    const s = usePriceHistoryStore.getState();
    s.appendPoint('005930', { price: 100, changePct: 0, ts: 1_000 });
    const before = usePriceHistoryStore.getState().byTicker;

    s.clearTicker('ZZZ');

    expect(usePriceHistoryStore.getState().byTicker).toBe(before);
  });
});
