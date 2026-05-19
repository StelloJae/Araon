import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProductAvatar } from '../ProductAvatar';

describe('ProductAvatar', () => {
  it('renders a safe product icon when one is provided', () => {
    const html = renderToStaticMarkup(
      createElement(ProductAvatar, {
        name: '삼성전자',
        iconUrl: 'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png',
      }),
    );

    expect(html).toContain('icn-sec-fill-005930.png');
    expect(html).not.toContain('>삼<');
  });

  it('falls back to the first product character without an icon', () => {
    const html = renderToStaticMarkup(
      createElement(ProductAvatar, {
        name: '삼성전자',
        iconUrl: null,
      }),
    );

    expect(html).toContain('>삼<');
  });

  it('derives the Toss static icon URL from a KR ticker when metadata has no icon', () => {
    const html = renderToStaticMarkup(
      createElement(ProductAvatar, {
        name: '삼성전자',
        iconUrl: null,
        ticker: '005930',
      }),
    );

    expect(html).toContain('icn-sec-fill-005930.png');
    expect(html).not.toContain('>삼<');
  });

  it('derives the Toss static icon URL from an A-prefixed product code', () => {
    const html = renderToStaticMarkup(
      createElement(ProductAvatar, {
        name: '삼성전자',
        iconUrl: null,
        productCode: 'A005930',
      }),
    );

    expect(html).toContain('icn-sec-fill-005930.png');
  });

  it('does not render arbitrary remote images', () => {
    const html = renderToStaticMarkup(
      createElement(ProductAvatar, {
        name: '삼성전자',
        iconUrl: 'https://example.com/logo.png',
      }),
    );

    expect(html).not.toContain('example.com');
    expect(html).toContain('>삼<');
  });
});
