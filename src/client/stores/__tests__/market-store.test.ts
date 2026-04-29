import { describe, expect, it, beforeEach } from 'vitest';
import { useMarketStore } from '../market-store';

describe('useMarketStore', () => {
  beforeEach(() => {
    useMarketStore.setState({
      marketStatus: 'snapshot',
      sseStatus: 'connecting',
      lastUpdate: null,
    });
  });

  it('throttles visible update timestamps during live SSE bursts', () => {
    useMarketStore.getState().markUpdate(1_000);
    const firstUpdate = useMarketStore.getState().lastUpdate;

    useMarketStore.getState().markUpdate(1_100);
    useMarketStore.getState().markUpdate(1_999);

    expect(useMarketStore.getState().lastUpdate).toBe(firstUpdate);

    useMarketStore.getState().markUpdate(2_000);

    expect(useMarketStore.getState().lastUpdate).not.toBe(firstUpdate);
    expect(useMarketStore.getState().lastUpdate?.getTime()).toBe(2_000);
  });
});
