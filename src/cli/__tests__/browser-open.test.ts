import { describe, expect, it, vi } from 'vitest';

import { openBrowser } from '../browser-open.js';

describe('openBrowser', () => {
  it('uses a platform command to open the URL', async () => {
    const spawn = vi.fn(() => ({ once: vi.fn((event, cb) => event === 'error' ? undefined : cb(0)) }));

    await openBrowser('http://127.0.0.1:3000', { platform: 'darwin', spawn });

    expect(spawn).toHaveBeenCalledWith('open', ['http://127.0.0.1:3000'], expect.any(Object));
  });

  it('reports browser open failures without throwing', async () => {
    const spawn = vi.fn(() => ({
      once: vi.fn((event, cb) => {
        if (event === 'error') cb(new Error('no browser'));
      }),
    }));

    const result = await openBrowser('http://127.0.0.1:3000', { platform: 'linux', spawn });

    expect(result).toEqual({ opened: false, error: 'no browser' });
  });
});
