import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MarketBadge } from '../MarketBadge';

describe('MarketBadge', () => {
  it('shows Korean market phase next to the live/snapshot indicator', () => {
    const open = renderToStaticMarkup(
      createElement(MarketBadge, {
        status: 'open',
        now: new Date('2026-05-09T00:10:00.000Z'), // 09:10 KST
      }),
    );
    const preOpen = renderToStaticMarkup(createElement(MarketBadge, { status: 'pre-open' }));
    const closed = renderToStaticMarkup(createElement(MarketBadge, { status: 'closed' }));

    expect(open).toContain('LIVE · 장중');
    expect(preOpen).toContain('PRE · 장전');
    expect(closed).toContain('SNAPSHOT · 장후');
  });

  it('separates integrated live hours into Korean premarket regular and after-hours labels', () => {
    const premarket = renderToStaticMarkup(
      createElement(MarketBadge, {
        status: 'open',
        now: new Date('2026-05-08T23:10:00.000Z'), // 08:10 KST
      }),
    );
    const openingWait = renderToStaticMarkup(
      createElement(MarketBadge, {
        status: 'open',
        now: new Date('2026-05-08T23:55:00.000Z'), // 08:55 KST
      }),
    );
    const regular = renderToStaticMarkup(
      createElement(MarketBadge, {
        status: 'open',
        now: new Date('2026-05-09T00:10:00.000Z'), // 09:10 KST
      }),
    );
    const afterHours = renderToStaticMarkup(
      createElement(MarketBadge, {
        status: 'open',
        now: new Date('2026-05-09T06:40:00.000Z'), // 15:40 KST
      }),
    );

    expect(premarket).toContain('PRE · 장전');
    expect(openingWait).toContain('PRE · 시가대기');
    expect(regular).toContain('LIVE · 장중');
    expect(afterHours).toContain('AFTER · 장후');
  });
});
