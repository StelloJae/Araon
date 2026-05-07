import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MarketBadge } from '../MarketBadge';

describe('MarketBadge', () => {
  it('shows Korean market phase next to the live/snapshot indicator', () => {
    const open = renderToStaticMarkup(createElement(MarketBadge, { status: 'open' }));
    const preOpen = renderToStaticMarkup(createElement(MarketBadge, { status: 'pre-open' }));
    const closed = renderToStaticMarkup(createElement(MarketBadge, { status: 'closed' }));

    expect(open).toContain('LIVE · 장중');
    expect(preOpen).toContain('PRE · 장전');
    expect(closed).toContain('SNAPSHOT · 장후');
  });
});
