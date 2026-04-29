/**
 * SectionHeader — sector / tag block title row (ARAON compact variant).
 *
 *   [chevron] [name]  [count pill] [sort select]
 *
 * Smaller than v1 (10px 14px padding, 14/700 title) so it stacks tighter inside
 * the right-column SectionStack.
 */

import { ChevronDownIcon } from '../lib/icons';
import type { SectorViewModel, SortKey } from '../lib/view-models';

interface SectionHeaderProps {
  sector: Pick<SectorViewModel, 'name' | 'tagline'>;
  count: number;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const SORT_OPTIONS: ReadonlyArray<{ id: SortKey; label: string }> = [
  { id: 'changeDesc', label: '등락률 ↓' },
  { id: 'changeAsc',  label: '등락률 ↑' },
  { id: 'volume',     label: '거래량' },
  { id: 'name',       label: '이름' },
];

export function SectionHeader({
  sector,
  count,
  sortKey,
  onSortChange,
  collapsed,
  onToggle,
}: SectionHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: collapsed ? 12 : '12px 12px 0 0',
        borderBottom: collapsed ? '1px solid var(--border)' : 'none',
        flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? '섹션 펼치기' : '섹션 접기'}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
          color: 'var(--text-muted)',
          lineHeight: 0,
          flexShrink: 0,
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 160ms ease',
        }}
      >
        <ChevronDownIcon size={12} />
      </button>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: -0.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sector.name}
        </div>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-secondary)',
          background: 'var(--bg-tint)',
          padding: '2px 7px',
          borderRadius: 50,
          letterSpacing: 0.3,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {count}
      </span>
      <select
        value={sortKey}
        onChange={(e) => onSortChange(e.target.value as SortKey)}
        style={{
          fontSize: 11,
          fontWeight: 600,
          background: 'var(--bg-tint)',
          border: 'none',
          padding: '4px 6px',
          borderRadius: 6,
          color: 'var(--text-primary)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
