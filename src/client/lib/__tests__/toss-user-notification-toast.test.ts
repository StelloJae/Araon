import { describe, expect, it } from 'vitest';
import type { TossUserNotificationEvent } from '@shared/types';

import {
  maybeTossUserNotificationToToastSpec,
  tossUserNotificationToToastSpec,
} from '../toss-user-notification-toast';

function notification(
  overrides: Partial<TossUserNotificationEvent['notification']> = {},
): TossUserNotificationEvent {
  return {
    type: 'toss-user-notification',
    id: 11,
    notification: {
      id: 'toss-web-push:005930:2026-05-11T06:00:02.000Z',
      ticker: '005930',
      receivedAt: '2026-05-11T06:00:02.000Z',
      sourceType: 'web-push',
      reason: 'Toss SSE web-push notification received',
      ...overrides,
    },
  };
}

describe('toss user notification toast helpers', () => {
  it('creates a compact toast without raw web-push payload fields', () => {
    const spec = tossUserNotificationToToastSpec(notification(), '삼성전자', 1_111);

    expect(spec).toEqual({
      id: 'toss-user-notification-toss-web-push:005930:2026-05-11T06:00:02.000Z',
      cooldownKey: 'toss-user-notification:toss-web-push:005930:2026-05-11T06:00:02.000Z',
      ticker: '005930',
      name: '삼성전자',
      kind: 'rule',
      direction: 'up',
      changePct: 0,
      title: 'Toss 알림: 삼성전자',
      detail: 'web-push · 원문 비공개 · 2026-05-11 15:00',
      ts: 1_111,
    });
    expect(JSON.stringify(spec)).not.toContain(`raw-${'content'}-id`);
    expect(JSON.stringify(spec)).not.toContain('SESSION');
  });

  it('does not create a toast when disabled or tickerless', () => {
    expect(maybeTossUserNotificationToToastSpec(notification(), '삼성전자', false, 1_111)).toBeNull();
    expect(maybeTossUserNotificationToToastSpec(notification({ ticker: null }), undefined, true, 1_111)).toBeNull();
  });
});
