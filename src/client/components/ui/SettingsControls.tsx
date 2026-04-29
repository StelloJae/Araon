/**
 * Reusable form controls for SettingsModal.
 *
 * Kept presentational — these don't read from any store. Parent components
 * own state and pass `value` / `onChange` so the same controls can be
 * dropped into other modals later (e.g. import wizard, watchlist editor).
 */

import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <div style={{ marginBottom: 18 }}>
      {label !== '' && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            marginBottom: 6,
            letterSpacing: 0.2,
          }}
        >
          {label}
        </div>
      )}
      {children}
      {hint !== undefined && hint.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Toggle({ value, onChange, label, disabled = false }: ToggleProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (!disabled) onChange(!value);
        }}
        disabled={disabled}
        aria-pressed={value}
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: value ? 'var(--accent)' : 'var(--border)',
          border: 'none',
          position: 'relative',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: 0,
          transition: 'background 150ms ease',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 150ms ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          }}
        />
      </button>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {label}
      </span>
    </label>
  );
}

interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  disabled?: boolean;
  /** Convert the raw slider value to the display value (e.g. ms → seconds). */
  format?: (v: number) => string;
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step,
  suffix = '',
  disabled = false,
  format,
}: SliderProps) {
  const display = format !== undefined ? format(value) : String(value) + suffix;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--accent)' }}
      />
      <div
        style={{
          minWidth: 64,
          textAlign: 'right',
          fontSize: 13,
          fontWeight: 700,
          color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {display}
      </div>
    </div>
  );
}

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: SegmentedProps<T>) {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 0,
        padding: 3,
        background: 'var(--bg-tint)',
        borderRadius: 8,
        border: '1px solid var(--border)',
      }}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              borderRadius: 6,
              background: active ? 'var(--bg-card)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
