import { describe, expect, it, vi } from 'vitest';

import type { TossWatchlistClient, TossWatchlistPayload } from '../toss-watchlist-client.js';
import { runTossWatchlistLiveSmoke } from '../toss-watchlist-live-smoke.js';

describe('toss watchlist live smoke', () => {
  it('adds and removes a redacted candidate without exposing product identifiers', async () => {
    const state = new Set<string>();
    const candidate = 'A123456';
    const client = fakeClient({
      list: vi.fn(async () => payload([...state])),
      add: vi.fn(async ({ productCode }) => {
        state.add(productCode);
        return {
          provider: 'toss',
          productCode,
          mutatedAt: '2026-05-17T13:00:00.000Z',
          action: 'added' as const,
        };
      }),
      remove: vi.fn(async ({ productCode }) => {
        state.delete(productCode);
        return {
          provider: 'toss',
          productCode,
          mutatedAt: '2026-05-17T13:00:00.000Z',
          action: 'removed' as const,
        };
      }),
    });

    const report = await runTossWatchlistLiveSmoke({
      client,
      mutationApproved: true,
      candidates: [{ productCode: candidate, kind: 'test-probe' }],
      now: () => new Date('2026-05-17T13:00:00.000Z'),
      wait: { timeoutMs: 1, intervalMs: 0 },
    });

    expect(report.ok).toBe(true);
    expect(report.outcome).toBe('ok');
    expect(report.before).toEqual({ itemCount: 0, containsCandidate: false, errorCode: null });
    expect(report.afterAdd).toEqual({ itemCount: 1, containsCandidate: true, errorCode: null });
    expect(report.afterRemove).toEqual({ itemCount: 0, containsCandidate: false, errorCode: null });
    expect(report.restored).toBe(true);
    expect(JSON.stringify(report)).not.toContain(candidate);
  });

  it('refuses to run when live mutation is not approved', async () => {
    const add = vi.fn();
    const report = await runTossWatchlistLiveSmoke({
      client: fakeClient({
        list: vi.fn(async () => payload([])),
        add,
        remove: vi.fn(),
      }),
      mutationApproved: false,
      now: () => new Date('2026-05-17T13:00:00.000Z'),
    });

    expect(report.ok).toBe(false);
    expect(report.outcome).toBe('approval_required');
    expect(report.approval.provided).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it('does not choose a candidate already present in the watchlist', async () => {
    const client = fakeClient({
      list: vi.fn(async () => payload(['A111111'])),
      add: vi.fn(),
      remove: vi.fn(),
    });

    const report = await runTossWatchlistLiveSmoke({
      client,
      mutationApproved: true,
      candidates: [{ productCode: 'A111111', kind: 'test-probe' }],
      now: () => new Date('2026-05-17T13:00:00.000Z'),
    });

    expect(report.ok).toBe(false);
    expect(report.outcome).toBe('no_candidate');
    expect(JSON.stringify(report)).not.toContain('A111111');
  });

  it('still tries to restore the candidate when add verification fails', async () => {
    const candidate = 'A222222';
    const remove = vi.fn(async ({ productCode }) => ({
      provider: 'toss' as const,
      productCode,
      mutatedAt: '2026-05-17T13:00:00.000Z',
      action: 'unchanged' as const,
    }));
    const client = fakeClient({
      list: vi.fn(async () => payload([])),
      add: vi.fn(async ({ productCode }) => ({
        provider: 'toss' as const,
        productCode,
        mutatedAt: '2026-05-17T13:00:00.000Z',
        action: 'added' as const,
      })),
      remove,
    });

    const report = await runTossWatchlistLiveSmoke({
      client,
      mutationApproved: true,
      candidates: [{ productCode: candidate, kind: 'test-probe' }],
      now: () => new Date('2026-05-17T13:00:00.000Z'),
      wait: { timeoutMs: 1, intervalMs: 0 },
    });

    expect(report.ok).toBe(false);
    expect(report.outcome).toBe('not_proven');
    expect(report.restored).toBe(true);
    expect(remove).toHaveBeenCalledWith({ productCode: candidate });
    expect(JSON.stringify(report)).not.toContain(candidate);
  });

  it('reports session-required without leaking the upstream error text', async () => {
    const report = await runTossWatchlistLiveSmoke({
      client: fakeClient({
        list: vi.fn(async () => {
          throw new Error('Toss session is required');
        }),
        add: vi.fn(),
        remove: vi.fn(),
      }),
      mutationApproved: true,
      now: () => new Date('2026-05-17T13:00:00.000Z'),
    });

    expect(report.ok).toBe(false);
    expect(report.outcome).toBe('session_required');
    expect(report.before.errorCode).toBe('SESSION_REQUIRED');
    expect(JSON.stringify(report)).not.toContain('Toss session is required');
  });
});

function fakeClient(input: {
  list: TossWatchlistClient['listWatchlist'];
  add: NonNullable<TossWatchlistClient['addProductToWatchlist']>;
  remove: NonNullable<TossWatchlistClient['removeProductFromWatchlist']>;
}): TossWatchlistClient {
  return {
    listWatchlist: input.list,
    addProductToWatchlist: input.add,
    removeProductFromWatchlist: input.remove,
  };
}

function payload(productCodes: string[]): TossWatchlistPayload {
  return {
    provider: 'toss',
    fetchedAt: '2026-05-17T13:00:00.000Z',
    groups: [],
    items: productCodes.map((productCode) => ({
      ref: 'redacted',
      groupRef: 'redacted',
      groupName: 'redacted',
      productCode,
      symbol: productCode,
      name: 'redacted',
      currency: 'KRW',
      base: 0,
      last: 0,
    })),
  };
}
