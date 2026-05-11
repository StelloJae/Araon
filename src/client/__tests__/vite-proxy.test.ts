import { describe, expect, it } from 'vitest';

import config from '../../../vite.config';

describe('Vite dev proxy', () => {
  it('proxies market summary requests to the backend', () => {
    const resolved = typeof config === 'function' ? config({ command: 'serve', mode: 'test' }) : config;
    const proxy = 'server' in resolved ? resolved.server?.proxy : undefined;

    expect(proxy).toMatchObject({
      '/market': 'http://127.0.0.1:3000',
      '/toss': 'http://127.0.0.1:3000',
    });
  });
});
