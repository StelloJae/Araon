import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'araon-settings-v1';

function makeMemoryLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(i: number) {
      return Array.from(map.keys())[i] ?? null;
    },
    getItem(k: string) {
      return map.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      map.set(k, String(v));
    },
    removeItem(k: string) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
  } satisfies Storage;
}

beforeEach(() => {
  vi.resetModules();
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeMemoryLocalStorage(),
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('useSettingsStore', () => {
  it('uses defaults when localStorage is empty', async () => {
    const { useSettingsStore } = await import('../settings-store');
    expect(useSettingsStore.getState().settings.notifGlobalEnabled).toBe(true);
    expect(useSettingsStore.getState().settings.surgeFilter).toBe('live');
  });

  it('persists notif update and reloads it on next import', async () => {
    const mod = await import('../settings-store');
    mod.useSettingsStore.getState().update({ notifGlobalEnabled: false });
    expect(mod.useSettingsStore.getState().settings.notifGlobalEnabled).toBe(false);

    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string).notifGlobalEnabled).toBe(false);

    vi.resetModules();
    const reloaded = await import('../settings-store');
    expect(reloaded.useSettingsStore.getState().settings.notifGlobalEnabled).toBe(false);
  });

  it('persists surgeFilter and reloads it on next import', async () => {
    const mod = await import('../settings-store');
    mod.useSettingsStore.getState().update({ surgeFilter: 'all' });
    expect(mod.useSettingsStore.getState().settings.surgeFilter).toBe('all');

    vi.resetModules();
    const reloaded = await import('../settings-store');
    expect(reloaded.useSettingsStore.getState().settings.surgeFilter).toBe('all');
  });

  it('rejects unknown surgeFilter values from storage', async () => {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ surgeFilter: 'bogus' }),
    );
    const { useSettingsStore } = await import('../settings-store');
    expect(useSettingsStore.getState().settings.surgeFilter).toBe('live');
  });

  it('falls back to defaults on malformed JSON', async () => {
    globalThis.localStorage.setItem(STORAGE_KEY, '{not json');
    const { useSettingsStore } = await import('../settings-store');
    expect(useSettingsStore.getState().settings.notifGlobalEnabled).toBe(true);
    expect(useSettingsStore.getState().settings.surgeFilter).toBe('live');
  });

  it('open/close toggles settingsOpen', async () => {
    const { useSettingsStore } = await import('../settings-store');
    expect(useSettingsStore.getState().settingsOpen).toBe(false);
    useSettingsStore.getState().openSettings();
    expect(useSettingsStore.getState().settingsOpen).toBe(true);
    useSettingsStore.getState().closeSettings();
    expect(useSettingsStore.getState().settingsOpen).toBe(false);
  });

  it('exposes notification + sound + surge defaults', async () => {
    const { useSettingsStore } = await import('../settings-store');
    const s = useSettingsStore.getState().settings;
    expect(s.notifPctThreshold).toBe(5);
    expect(s.soundOn).toBe(false);
    expect(s.soundVolume).toBeCloseTo(0.4);
    expect(s.desktopNotif).toBe(false);
    expect(s.toastDurationMs).toBe(5_500);
    expect(s.alertCooldownMs).toBe(5 * 60_000);
    expect(s.surgeThreshold).toBe(3);
  });

  it('clamps numeric settings to their valid ranges', async () => {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        notifPctThreshold: 9_999,
        soundVolume: 5,
        toastDurationMs: 100,
        alertCooldownMs: 0,
        surgeThreshold: -10,
      }),
    );
    const { useSettingsStore } = await import('../settings-store');
    const s = useSettingsStore.getState().settings;
    expect(s.notifPctThreshold).toBeLessThanOrEqual(30);
    expect(s.soundVolume).toBeLessThanOrEqual(1);
    expect(s.toastDurationMs).toBeGreaterThanOrEqual(2_000);
    expect(s.alertCooldownMs).toBeGreaterThanOrEqual(30_000);
    expect(s.surgeThreshold).toBeGreaterThanOrEqual(0.5);
  });

  it('rejects non-number values and falls back to defaults', async () => {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        notifPctThreshold: 'lots',
        surgeThreshold: 'high',
        soundVolume: null,
      }),
    );
    const { useSettingsStore } = await import('../settings-store');
    const s = useSettingsStore.getState().settings;
    expect(s.notifPctThreshold).toBe(5);
    expect(s.surgeThreshold).toBe(3);
    expect(s.soundVolume).toBeCloseTo(0.4);
  });

  it('persists notifPctThreshold and surgeThreshold across reloads', async () => {
    const mod = await import('../settings-store');
    mod.useSettingsStore.getState().update({
      notifPctThreshold: 7,
      surgeThreshold: 4.5,
      soundOn: true,
    });
    vi.resetModules();
    const reloaded = await import('../settings-store');
    const s = reloaded.useSettingsStore.getState().settings;
    expect(s.notifPctThreshold).toBe(7);
    expect(s.surgeThreshold).toBe(4.5);
    expect(s.soundOn).toBe(true);
  });
});
