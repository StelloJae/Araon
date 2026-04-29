/**
 * useSettingsStore — client-only settings persisted in localStorage.
 *
 * No credentials live in this store: appKey / appSecret stay on the server
 * (created via Bootstrap's /credentials POST). The settings here only drive
 * client-side behavior — notification visibility, sound, surge tuning, etc.
 *
 * Each field is validated on load. Unknown / malformed JSON falls back to
 * the typed defaults; a single corrupted setting doesn't reset the rest.
 */

import { create } from 'zustand';

/** Surge block first-row filter — see `lib/surge-aggregator.ts`. */
export type SurgeFilter = 'live' | 'today' | 'all';

export interface ClientSettings {
  /** Master switch for all client-generated alert/toast/sound output. */
  notifGlobalEnabled: boolean;
  /** Surge block filter, persisted across reloads. */
  surgeFilter: SurgeFilter;

  // Alerts ---------------------------------------------------------------
  /** Threshold for "큰 변동" generic toast (favorites). |%|. */
  notifPctThreshold: number;
  /** Beep on threshold/rule firing. Default OFF — user must opt in. */
  soundOn: boolean;
  /** 0..1; multiplied with the oscillator gain. */
  soundVolume: number;
  /** Web Notification API push toggle. Permission granted lazily. */
  desktopNotif: boolean;
  /** Per-toast auto-dismiss in ms. */
  toastDurationMs: number;
  /** Min interval between repeats of the same (ticker, rule) toast. */
  alertCooldownMs: number;

  // Surge tuning ---------------------------------------------------------
  /** Threshold % for both 실시간 surge spawn and 오늘 누적 view. */
  surgeThreshold: number;
}

const DEFAULTS: ClientSettings = {
  notifGlobalEnabled: true,
  surgeFilter: 'live',

  notifPctThreshold: 5,
  soundOn: false,
  soundVolume: 0.4,
  desktopNotif: false,
  toastDurationMs: 5_500,
  alertCooldownMs: 5 * 60_000,

  surgeThreshold: 3,
};

const VALID_SURGE_FILTERS: ReadonlySet<SurgeFilter> = new Set([
  'live',
  'today',
  'all',
]);

const STORAGE_KEY = 'araon-settings-v1';

function clampNumber(
  raw: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  if (raw < min) return min;
  if (raw > max) return max;
  return raw;
}

function loadSettings(): ClientSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return { ...DEFAULTS };
    const obj = parsed as Record<string, unknown>;
    const merged: ClientSettings = { ...DEFAULTS };
    if (typeof obj.notifGlobalEnabled === 'boolean') {
      merged.notifGlobalEnabled = obj.notifGlobalEnabled;
    }
    if (
      typeof obj.surgeFilter === 'string' &&
      VALID_SURGE_FILTERS.has(obj.surgeFilter as SurgeFilter)
    ) {
      merged.surgeFilter = obj.surgeFilter as SurgeFilter;
    }
    merged.notifPctThreshold = clampNumber(
      obj.notifPctThreshold,
      0.5,
      30,
      DEFAULTS.notifPctThreshold,
    );
    if (typeof obj.soundOn === 'boolean') merged.soundOn = obj.soundOn;
    merged.soundVolume = clampNumber(
      obj.soundVolume,
      0,
      1,
      DEFAULTS.soundVolume,
    );
    if (typeof obj.desktopNotif === 'boolean') {
      merged.desktopNotif = obj.desktopNotif;
    }
    merged.toastDurationMs = clampNumber(
      obj.toastDurationMs,
      2_000,
      30_000,
      DEFAULTS.toastDurationMs,
    );
    merged.alertCooldownMs = clampNumber(
      obj.alertCooldownMs,
      30_000,
      60 * 60_000,
      DEFAULTS.alertCooldownMs,
    );
    merged.surgeThreshold = clampNumber(
      obj.surgeThreshold,
      0.5,
      30,
      DEFAULTS.surgeThreshold,
    );
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings: ClientSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // private mode / localStorage disabled — ignore silently
  }
}

interface SettingsState {
  settings: ClientSettings;
  settingsOpen: boolean;
  update: (patch: Partial<ClientSettings>) => void;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: loadSettings(),
  settingsOpen: false,

  update: (patch) => {
    const next: ClientSettings = { ...get().settings, ...patch };
    saveSettings(next);
    set({ settings: next });
  },

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}));
