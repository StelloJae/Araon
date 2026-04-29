/**
 * useThemeStore — light / dark with localStorage persistence.
 *
 * The initial theme is set by an inline script in index.html (before React
 * mounts) to avoid FOUC. This store reads the existing `data-theme` attribute,
 * then keeps the DOM and localStorage in sync on subsequent toggles.
 */

import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'araon-theme';

function readInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const cur = document.documentElement.getAttribute('data-theme');
  return cur === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // private mode / localStorage disabled — skip silently
  }
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readInitialTheme(),
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },
  set: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));
