/**
 * ThemeToggle — 32×32 button that flips light/dark.
 *
 * Sun icon when in dark mode (click → light), moon when in light mode (click → dark).
 * Hover lightens the icon stroke. Hooked into `useThemeStore`.
 */

import { useThemeStore } from '../stores/theme-store';
import { MoonIcon, SunIcon } from '../lib/icons';

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? '라이트 모드' : '다크 모드'}
      aria-label="테마 전환"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 8,
        background: 'var(--bg-tint)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        padding: 0,
        transition: 'background 150ms ease, color 150ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
    >
      {dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
    </button>
  );
}
