import { beforeEach, describe, expect, it, vi } from 'vitest';

const emptyMasterPayload = {
  items: [],
  refreshedAt: null,
  rowCount: 0,
  fresh: false,
  stale: false,
  source: 'db',
};

const populatedMasterPayload = {
  items: [
    {
      ticker: '005930',
      name: '삼성전자',
      market: 'KOSPI' as const,
      standardCode: 'KR7005930003',
      marketCapTier: 'large',
    },
  ],
  refreshedAt: '2026-05-08T00:00:00.000Z',
  rowCount: 1,
  fresh: true,
  stale: false,
  source: 'db',
};

const refreshStatus = {
  status: 'success' as const,
  refreshedAt: '2026-05-08T00:00:00.000Z',
  rowCount: 1,
  lastError: null,
  fresh: true,
  stale: false,
};

beforeEach(() => {
  vi.resetModules();
});

describe('useMasterStore.ensureLoaded', () => {
  it('loads an existing master catalog without refreshing', async () => {
    const getMasterList = vi.fn().mockResolvedValue(populatedMasterPayload);
    const getCredentialsStatus = vi.fn();
    const refreshMaster = vi.fn();

    vi.doMock('../../lib/api-client', () => ({
      getCredentialsStatus,
      getMasterList,
      refreshMaster,
    }));

    const { useMasterStore } = await import('../master-store');
    await useMasterStore.getState().ensureLoaded();

    expect(refreshMaster).not.toHaveBeenCalled();
    expect(useMasterStore.getState().items).toEqual(populatedMasterPayload.items);
    expect(useMasterStore.getState().rowCount).toBe(1);
    expect(useMasterStore.getState().loadStatus).toBe('loaded');
  });

  it('refreshes once when the initial catalog is empty and uninitialized', async () => {
    const getMasterList = vi
      .fn()
      .mockResolvedValueOnce(emptyMasterPayload)
      .mockResolvedValueOnce(populatedMasterPayload);
    const getCredentialsStatus = vi.fn().mockResolvedValue({
      configured: true,
      isPaper: false,
      runtime: 'started',
    });
    const refreshMaster = vi.fn().mockResolvedValue(refreshStatus);

    vi.doMock('../../lib/api-client', () => ({
      getCredentialsStatus,
      getMasterList,
      refreshMaster,
    }));

    const { useMasterStore } = await import('../master-store');
    await useMasterStore.getState().ensureLoaded();

    expect(refreshMaster).toHaveBeenCalledTimes(1);
    expect(getMasterList).toHaveBeenCalledTimes(2);
    expect(useMasterStore.getState().items).toEqual(populatedMasterPayload.items);
    expect(useMasterStore.getState().refreshStatus).toBe('success');
    expect(useMasterStore.getState().loadStatus).toBe('loaded');
  });

  it('does not auto-refresh an empty catalog before KIS credentials exist', async () => {
    const getMasterList = vi.fn().mockResolvedValue(emptyMasterPayload);
    const getCredentialsStatus = vi.fn().mockResolvedValue({
      configured: false,
      isPaper: null,
      runtime: 'unconfigured',
    });
    const refreshMaster = vi.fn();

    vi.doMock('../../lib/api-client', () => ({
      getCredentialsStatus,
      getMasterList,
      refreshMaster,
    }));

    const { useMasterStore } = await import('../master-store');
    await useMasterStore.getState().ensureLoaded();

    expect(getCredentialsStatus).toHaveBeenCalledTimes(1);
    expect(refreshMaster).not.toHaveBeenCalled();
    expect(getMasterList).toHaveBeenCalledTimes(1);
    expect(useMasterStore.getState().items).toEqual([]);
    expect(useMasterStore.getState().loadStatus).toBe('loaded');
  });
});
