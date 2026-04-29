import { describe, expect, it, vi } from 'vitest';

import { createCliShutdownManager } from '../lifecycle.js';

describe('createCliShutdownManager', () => {
  it('calls close once when SIGINT is received', async () => {
    const close = vi.fn(async () => undefined);
    const exit = vi.fn();
    const on = vi.fn();
    const off = vi.fn();

    createCliShutdownManager({
      close,
      exit,
      onSignal: on,
      offSignal: off,
    });

    const sigintHandler = on.mock.calls.find(([signal]) => signal === 'SIGINT')?.[1];
    expect(sigintHandler).toBeTypeOf('function');

    await sigintHandler();
    await sigintHandler();

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
