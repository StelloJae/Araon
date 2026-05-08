import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('sound fallback', () => {
  it('falls back to an HTMLAudioElement when Web Audio cannot be unlocked', async () => {
    const play = vi.fn(() => Promise.resolve());
    class FakeAudio {
      src = '';
      volume = 0;
      play = play;
    }

    Object.defineProperty(globalThis, 'window', {
      value: { Audio: FakeAudio },
      configurable: true,
    });

    const { ensureAudioUnlocked, playBleep } = await import('../sound');

    await expect(ensureAudioUnlocked()).resolves.toBe(false);
    expect(playBleep(0.5, 'up')).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
