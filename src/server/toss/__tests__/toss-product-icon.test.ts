import { describe, expect, it } from 'vitest';

import {
  createTossProductIconCache,
  resolveTossProductIconUrl,
  sanitizeTossProductIconUrl,
} from '../toss-product-icon.js';

describe('Toss product icon helpers', () => {
  it('accepts Toss static securities icons', () => {
    expect(
      sanitizeTossProductIconUrl(
        'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png?20240717',
      ),
    ).toBe('https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png?20240717');
  });

  it('rejects non-product and non-https URLs', () => {
    expect(sanitizeTossProductIconUrl('http://static.toss.im/png-icons/securities/a.png')).toBeNull();
    expect(sanitizeTossProductIconUrl('https://example.com/png-icons/securities/a.png')).toBeNull();
    expect(sanitizeTossProductIconUrl('https://static.toss.im/assets/news.png')).toBeNull();
  });

  it('caches safe icons by normalized product identity', () => {
    const cache = createTossProductIconCache();
    cache.set('A005930', 'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png');

    expect(cache.get('005930')).toBe('https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png');
    expect(cache.snapshot().get('005930')).toBe('https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png');
  });

  it('does not cache arbitrary icons or unrecognized product keys', () => {
    const cache = createTossProductIconCache();
    cache.set('A005930', 'https://example.com/logo.png');
    cache.set('SESSION=secret', 'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png');

    expect(cache.get('005930')).toBeNull();
    expect(cache.snapshot().size).toBe(0);
  });

  it('resolves from cache when later payloads omit icon fields', () => {
    const cache = createTossProductIconCache();
    const first = resolveTossProductIconUrl({
      record: { logoImageUrl: 'https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png' },
      productCode: 'A005930',
      cache,
    });
    const second = resolveTossProductIconUrl({
      record: {},
      productCode: '005930',
      cache,
    });

    expect(first).toBe('https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png');
    expect(second).toBe('https://static.toss.im/png-icons/securities/icn-sec-fill-005930.png');
  });
});
