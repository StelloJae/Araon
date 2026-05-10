import { describe, expect, it, vi } from 'vitest';

import { KisRestError, type KisRestClient, type KisRestRequest } from '../kis-rest-client.js';
import { createKisRestProfileRouter } from '../kis-rest-profile-router.js';

function mockClient(
  impl: (req: KisRestRequest) => Promise<{ payload: unknown; headers?: { trCont: string | null } }>,
): KisRestClient {
  const requestWithMeta = vi.fn(async (req: KisRestRequest) => {
    const result = await impl(req);
    return {
      payload: result.payload,
      headers: result.headers ?? { trCont: null },
    };
  });
  return {
    requestWithMeta,
    request: vi.fn(async (req: KisRestRequest) => (await requestWithMeta(req)).payload),
    postToken: vi.fn(async () => ({ access_token: 'token', token_type: 'Bearer' })),
  };
}

describe('createKisRestProfileRouter', () => {
  it('round-robins background-safe REST classes across eligible profiles', async () => {
    const primary = mockClient(async () => ({ payload: { profile: 'primary' } }));
    const secondary = mockClient(async () => ({ payload: { profile: 'secondary' } }));
    const router = createKisRestProfileRouter({
      profiles: [
        { profileId: 'primary', label: 'Primary', isPaper: false, enabled: true, client: primary },
        { profileId: 'secondary', label: 'Secondary', isPaper: false, enabled: true, client: secondary },
      ],
    });

    await router.request({ method: 'GET', path: '/quote', endpointClass: 'polling' });
    await router.request({ method: 'GET', path: '/quote', endpointClass: 'polling' });

    expect(primary.requestWithMeta).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'primary', endpointClass: 'polling' }),
    );
    expect(secondary.requestWithMeta).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'secondary', endpointClass: 'polling' }),
    );
    expect(router.snapshot().profiles).toEqual([
      expect.objectContaining({ profileId: 'primary', selectedCount: 1, successCount: 1 }),
      expect.objectContaining({ profileId: 'secondary', selectedCount: 1, successCount: 1 }),
    ]);
  });

  it('fails over foreground requests when one profile reports a KIS throttle', async () => {
    const primary = mockClient(async () => {
      throw new KisRestError('limited', 429, null, 'EGW00201', null);
    });
    const secondary = mockClient(async () => ({ payload: { ok: true } }));
    const router = createKisRestProfileRouter({
      now: (() => {
        let now = 1_000;
        return () => {
          now += 100;
          return now;
        };
      })(),
      profiles: [
        { profileId: 'primary', label: 'Primary', isPaper: false, enabled: true, client: primary },
        { profileId: 'secondary', label: 'Secondary', isPaper: false, enabled: true, client: secondary },
      ],
    });

    await expect(
      router.request({ method: 'GET', path: '/quote', endpointClass: 'foreground' }),
    ).resolves.toEqual({ ok: true });

    expect(primary.requestWithMeta).toHaveBeenCalledOnce();
    expect(secondary.requestWithMeta).toHaveBeenCalledOnce();
    expect(router.snapshot().profiles).toEqual([
      expect.objectContaining({
        profileId: 'primary',
        failureCount: 1,
        failoverFromCount: 1,
        lastFailureKind: 'KIS_RATE_LIMIT_SECOND_WINDOW',
        lastFailureCode: 'EGW00201',
      }),
      expect.objectContaining({
        profileId: 'secondary',
        successCount: 1,
        failoverToCount: 1,
      }),
    ]);
  });

  it('does not fail over token or approval classes', async () => {
    const primary = mockClient(async () => {
      throw new KisRestError('limited', 429, null, 'EGW00201', null);
    });
    const secondary = mockClient(async () => ({ payload: { ok: true } }));
    const router = createKisRestProfileRouter({
      profiles: [
        { profileId: 'primary', label: 'Primary', isPaper: false, enabled: true, client: primary },
        { profileId: 'secondary', label: 'Secondary', isPaper: false, enabled: true, client: secondary },
      ],
    });

    await expect(
      router.request({ method: 'POST', path: '/oauth2/Approval', endpointClass: 'approval' }),
    ).rejects.toMatchObject({ msgCd: 'EGW00201' });

    expect(primary.requestWithMeta).toHaveBeenCalledOnce();
    expect(secondary.requestWithMeta).not.toHaveBeenCalled();
  });

  it('exposes sanitized profile routing state only', () => {
    const client = mockClient(async () => ({ payload: { ok: true } }));
    const router = createKisRestProfileRouter({
      profiles: [
        { profileId: 'primary', label: 'Primary', isPaper: false, enabled: true, client },
        {
          profileId: 'paper-profile',
          label: 'Paper',
          isPaper: true,
          enabled: true,
          ineligibleReason: 'paper_mismatch',
        },
        {
          profileId: 'disabled-profile',
          label: 'Disabled',
          isPaper: false,
          enabled: false,
          ineligibleReason: 'disabled',
        },
      ],
    });

    const snapshot = router.snapshot();

    expect(snapshot.eligibleProfileCount).toBe(1);
    expect(snapshot.profiles).toEqual([
      expect.objectContaining({ profileId: 'primary', eligible: true }),
      expect.objectContaining({ profileId: 'paper-profile', eligible: false, ineligibleReason: 'paper_mismatch' }),
      expect.objectContaining({ profileId: 'disabled-profile', eligible: false, ineligibleReason: 'disabled' }),
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(/appKey|appSecret|accessToken/i);
  });
});
