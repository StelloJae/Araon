import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AlertDeliveryLogPanel } from '../AlertDeliveryLogPanel';

describe('AlertDeliveryLogPanel', () => {
  it('renders a quiet empty state', () => {
    const html = renderToStaticMarkup(
      createElement(AlertDeliveryLogPanel, {
        entries: [],
        onClear: vi.fn(),
      }),
    );

    expect(html).toContain('최근 알림 전송 기록');
    expect(html).toContain('아직 전송된 알림이 없습니다');
  });

  it('renders recent deliveries without raw secrets', () => {
    const html = renderToStaticMarkup(
      createElement(AlertDeliveryLogPanel, {
        entries: [
          {
            id: 'delivery-1',
            ts: 1_700_000_000_000,
            ticker: '005930',
            name: '삼성전자',
            title: '삼성전자 · 룰 발동',
            detail: '005930 · 등락률 ≥ 5%',
            kind: 'rule',
            direction: 'up',
            channel: 'phone',
            status: 'failed',
            reason: 'TELEGRAM_NOT_CONFIGURED',
          },
        ],
        onClear: vi.fn(),
      }),
    );

    expect(html).toContain('삼성전자');
    expect(html).toContain('폰');
    expect(html).toContain('실패');
    expect(html).toContain('TELEGRAM_NOT_CONFIGURED');
    expect(html).not.toContain('token');
    expect(html).not.toContain('secret');
  });
});
