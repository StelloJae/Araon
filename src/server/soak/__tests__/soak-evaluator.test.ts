import { describe, expect, it } from 'vitest';

import { evaluateSoakSamples } from '../soak-evaluator.js';

describe('evaluateSoakSamples', () => {
  it('accepts safe 2xx JSON health samples', () => {
    const result = evaluateSoakSamples([
      {
        endpoint: '/runtime/realtime/status',
        status: 200,
        bodyText: JSON.stringify({
          success: true,
          data: {
            approvalKey: { status: 'none', issuedAt: null },
            runtimeStatus: 'unconfigured',
          },
        }),
      },
    ]);

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('flags non-2xx, non-json, and sensitive-looking values', () => {
    const result = evaluateSoakSamples([
      { endpoint: '/runtime/data-health', status: 503, bodyText: '{}' },
      { endpoint: '/runtime/signals/outcomes', status: 200, bodyText: 'not-json' },
      {
        endpoint: '/runtime/realtime/status',
        status: 200,
        bodyText: JSON.stringify({
          success: true,
          data: { approvalKey: 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKL' },
        }),
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'HTTP_ERROR',
      'NON_JSON',
      'RAW_SECRET_VALUE',
    ]);
  });
});
