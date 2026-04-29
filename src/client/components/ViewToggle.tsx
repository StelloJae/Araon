/**
 * ViewToggle — segmented control for `섹터 / 태그 / 혼합` views.
 *
 * Active pill: white card on snow track, soft shadow. Theme-aware via tokens.
 */

export type ViewKind = 'sector' | 'tag' | 'mixed';

const OPTIONS: ReadonlyArray<{ id: ViewKind; label: string }> = [
  { id: 'sector', label: '섹터' },
  { id: 'tag',    label: '태그' },
  { id: 'mixed',  label: '혼합' },
];

interface ViewToggleProps {
  value: ViewKind;
  onChange: (value: ViewKind) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        background: 'var(--bg-tint)',
        padding: 3,
        borderRadius: 8,
        gap: 2,
      }}
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            style={{
              background: active ? 'var(--bg-card)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: active ? 'var(--shadow) 0px 1px 3px 0px' : 'none',
              transition: 'background 120ms ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
