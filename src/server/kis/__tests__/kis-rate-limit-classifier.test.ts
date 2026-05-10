import { describe, expect, it } from 'vitest';
import { KisRestError } from '../kis-rest-client.js';
import {
  classifyKisRestFailure,
  isKisSecondWindowThrottle,
} from '../kis-rate-limit-classifier.js';

describe('classifyKisRestFailure', () => {
  it('classifies EGW00201 envelopes as second-window KIS throttles even on HTTP 500', () => {
    const result = classifyKisRestFailure(
      new KisRestError(
        'KIS HTTP 500 GET /quote: 초당 거래건수를 초과하였습니다.',
        500,
        '1',
        'EGW00201',
        { msg1: '초당 거래건수를 초과하였습니다.', appSecret: 'SHOULD_NOT_LEAK' },
      ),
    );

    expect(result).toEqual({
      kind: 'KIS_RATE_LIMIT_SECOND_WINDOW',
      throttle: true,
      retryable: true,
      code: 'EGW00201',
      safeMessage: 'KIS 초당 거래건수 제한에 걸렸습니다.',
    });
    expect(JSON.stringify(result)).not.toContain('SHOULD_NOT_LEAK');
  });

  it('detects the Korean second-window throttle message when msg_cd is missing', () => {
    const result = classifyKisRestFailure(
      new Error('KIS rt_cd=1: 초당 거래건수를 초과하였습니다.'),
    );

    expect(result.kind).toBe('KIS_RATE_LIMIT_SECOND_WINDOW');
    expect(isKisSecondWindowThrottle(result)).toBe(true);
  });

  it('separates other EGW or upstream 5xx failures from second-window throttles', () => {
    const result = classifyKisRestFailure(
      new KisRestError(
        'KIS HTTP 500 GET /quote: upstream unavailable',
        500,
        '1',
        'EGW99999',
        { msg1: 'upstream unavailable' },
      ),
    );

    expect(result).toMatchObject({
      kind: 'upstream_5xx',
      throttle: false,
      retryable: true,
      code: 'EGW99999',
    });
  });

  it('classifies auth failures without encouraging retry loops', () => {
    const result = classifyKisRestFailure(
      new KisRestError('KIS HTTP 403 GET /quote', 403, '1', 'AUTH001', null),
    );

    expect(result).toMatchObject({
      kind: 'auth_failure',
      throttle: false,
      retryable: false,
    });
  });

  it('classifies request timeouts separately from malformed responses', () => {
    expect(
      classifyKisRestFailure(
        new KisRestError('KIS request timeout after 5000ms', 408, null, null, null),
      ),
    ).toMatchObject({
      kind: 'network_timeout',
      retryable: true,
    });

    expect(classifyKisRestFailure(new SyntaxError('Unexpected token <'))).toMatchObject({
      kind: 'malformed_response',
      retryable: false,
    });
  });
});
