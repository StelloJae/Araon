import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  // No global side effects to clean up.
});

describe('useWatchlistStore.removeFavorite', () => {
  it('removes ticker when present', async () => {
    const { useWatchlistStore } = await import('../watchlist-store');
    const s = useWatchlistStore.getState();
    s.setFavorites(['005930', '000660']);

    useWatchlistStore.getState().removeFavorite('005930');

    const next = useWatchlistStore.getState().favorites;
    expect(next.has('005930')).toBe(false);
    expect(next.has('000660')).toBe(true);
  });

  it('is a no-op when ticker is not a favorite (state reference stable)', async () => {
    const { useWatchlistStore } = await import('../watchlist-store');
    const s = useWatchlistStore.getState();
    s.setFavorites(['000660']);
    const before = useWatchlistStore.getState().favorites;

    useWatchlistStore.getState().removeFavorite('005930');

    expect(useWatchlistStore.getState().favorites).toBe(before);
  });
});
