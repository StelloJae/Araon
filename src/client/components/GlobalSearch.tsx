/**
 * GlobalSearch — header search box.
 *
 * Behavior:
 *   - ⌘K / Ctrl+K / `/` (when no input focused) focuses the box.
 *   - Typing filters across BOTH the tracked catalog and the master KRX
 *     universe via `rankStockSearchCombined`.
 *   - Tracked-row hits show a "추적 중" badge and open the detail modal
 *     directly. Master-only hits show a "전체 종목" badge and a `+ 추가`
 *     button — clicking either pushes the ticker into the tracked catalog
 *     (`POST /stocks/from-master`) and then opens the detail modal.
 *   - Empty query + open shows the most recent picks (localStorage).
 *   - First focus calls `useMasterStore.ensureLoaded()` so the master list
 *     is available even when `requestIdleCallback` preload was skipped.
 *   - ↑/↓ moves the active row, Enter picks it, Esc closes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { addStockFromMaster, type ApiError } from '../lib/api-client';
import { fmtPct, fmtPrice, krColor } from '../lib/format';
import { CloseIcon, SearchIcon } from '../lib/icons';
import {
  MAX_SEARCH_RESULTS,
  rankStockSearchCombined,
  type CombinedSearchResult,
} from '../lib/stock-search';
import { syncTrackedCatalogAfterMasterAdd } from '../lib/tracked-catalog-sync';
import type { StockViewModel } from '../lib/view-models';
import { useMasterStore } from '../stores/master-store';
import { useStocksStore } from '../stores/stocks-store';

const RECENT_KEY = 'araon-recent-searches';
const MAX_RECENT = 8;
const MAX_RECENT_VISIBLE = 5;

function loadRecent(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw === null) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === 'string')
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecent(codes: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(codes.slice(0, MAX_RECENT)));
  } catch {
    // private mode — silent skip
  }
}

interface GlobalSearchProps {
  allStocks: ReadonlyArray<StockViewModel>;
  onPickStock: (stock: StockViewModel) => void;
  /** Called after a master-only hit is promoted into the tracked catalog. */
  onPickMasterTicker?: (ticker: string) => void;
}

export function GlobalSearch({
  allStocks,
  onPickStock,
  onPickMasterTicker,
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const masterItems = useMasterStore((s) => s.items);
  const ensureMasterLoaded = useMasterStore((s) => s.ensureLoaded);
  const setCatalog = useStocksStore((s) => s.setCatalog);
  const setThemes = useStocksStore((s) => s.setThemes);

  // ⌘K / Ctrl+K / `/` — focus the input. Cleanup on unmount.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      const ae = document.activeElement;
      const inInput =
        ae instanceof HTMLInputElement ||
        ae instanceof HTMLTextAreaElement ||
        (ae instanceof HTMLElement && ae.isContentEditable);
      if (e.key === '/' && !inInput) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Click-outside closes the dropdown.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (wrapRef.current !== null && !wrapRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const results = useMemo<CombinedSearchResult[]>(
    () =>
      rankStockSearchCombined(
        query,
        allStocks,
        masterItems,
        MAX_SEARCH_RESULTS,
      ),
    [query, allStocks, masterItems],
  );

  const showRecent = open && query.trim().length === 0;
  const recentResults = useMemo<CombinedSearchResult[]>(() => {
    if (!showRecent) return [];
    const trackedByCode = new Map<string, StockViewModel>();
    for (const s of allStocks) trackedByCode.set(s.code, s);
    const masterByCode = new Map<string, (typeof masterItems)[number]>();
    for (const m of masterItems) masterByCode.set(m.ticker, m);
    const out: CombinedSearchResult[] = [];
    for (const code of recent) {
      const tracked = trackedByCode.get(code);
      if (tracked !== undefined) {
        out.push({
          code: tracked.code,
          name: tracked.name,
          market: tracked.market,
          vm: tracked,
          isTracked: true,
        });
      } else {
        const master = masterByCode.get(code);
        if (master !== undefined) {
          out.push({
            code: master.ticker,
            name: master.name,
            market: master.market,
            vm: null,
            isTracked: false,
          });
        }
      }
      if (out.length >= MAX_RECENT_VISIBLE) break;
    }
    return out;
  }, [recent, showRecent, allStocks, masterItems]);

  const list = query.trim().length > 0 ? results : recentResults;

  function rememberRecent(code: string) {
    const next = [code, ...recent.filter((c) => c !== code)].slice(0, MAX_RECENT);
    setRecent(next);
    saveRecent(next);
  }

  async function pick(item: CombinedSearchResult) {
    setAddError(null);
    rememberRecent(item.code);

    if (item.isTracked && item.vm !== null) {
      setQuery('');
      setOpen(false);
      setActiveIdx(0);
      inputRef.current?.blur();
      onPickStock(item.vm);
      return;
    }

    // Master-only: promote into tracked catalog first, then open detail.
    setPendingAdd(item.code);
    try {
      await addStockFromMaster(item.code);
      await syncTrackedCatalogAfterMasterAdd({ setCatalog, setThemes });
      setQuery('');
      setOpen(false);
      setActiveIdx(0);
      inputRef.current?.blur();
      onPickMasterTicker?.(item.code);
    } catch (err) {
      const apiErr = err as ApiError | Error;
      setAddError(
        'message' in apiErr ? `${apiErr.message}` : '추가 실패',
      );
    } finally {
      setPendingAdd(null);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (list.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % list.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + list.length) % list.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = list[activeIdx] ?? list[0];
      if (target !== undefined) void pick(target);
    }
  }

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', flex: '0 1 380px', minWidth: 200 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          borderRadius: 8,
          background: 'var(--bg-tint)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          transition: 'border-color 120ms ease',
        }}
      >
        <span
          style={{ color: 'var(--text-muted)', flexShrink: 0, lineHeight: 0 }}
        >
          <SearchIcon size={14} />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            void ensureMasterLoaded();
          }}
          onKeyDown={onKeyDown}
          placeholder="종목명·코드 검색"
          aria-label="종목 검색"
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontWeight: 500,
            padding: 0,
          }}
        />
        {query.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setActiveIdx(0);
              inputRef.current?.focus();
            }}
            aria-label="검색어 지우기"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              color: 'var(--text-muted)',
              lineHeight: 0,
            }}
          >
            <CloseIcon size={14} />
          </button>
        ) : (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              padding: '1px 5px',
              borderRadius: 4,
              letterSpacing: 0.3,
              flexShrink: 0,
            }}
          >
            ⌘K
          </span>
        )}
      </div>

      {open && (list.length > 0 || query.trim().length > 0) && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 12px 28px -6px var(--shadow)',
            overflow: 'hidden',
            maxHeight: 460,
            overflowY: 'auto',
          }}
        >
          {showRecent && recentResults.length > 0 && (
            <div
              style={{
                padding: '8px 12px 4px',
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--text-muted)',
                letterSpacing: 0.6,
              }}
            >
              최근 검색
            </div>
          )}
          {list.map((item, i) => (
            <SearchRow
              key={item.code}
              item={item}
              active={i === activeIdx}
              pending={pendingAdd === item.code}
              onPick={() => void pick(item)}
              onHover={() => setActiveIdx(i)}
            />
          ))}
          {!showRecent && results.length === 0 && query.trim().length > 0 && (
            <div
              style={{
                padding: '18px 14px',
                fontSize: 12,
                color: 'var(--text-muted)',
                textAlign: 'center',
              }}
            >
              "{query}" 일치하는 종목 없음
            </div>
          )}
          {addError !== null && (
            <div
              style={{
                padding: '10px 14px',
                fontSize: 11,
                color: 'var(--kr-up)',
                background: 'var(--accent-soft)',
                borderTop: '1px solid var(--border-soft)',
              }}
            >
              추가 실패: {addError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SearchRowProps {
  item: CombinedSearchResult;
  active: boolean;
  pending: boolean;
  onPick: () => void;
  onHover: () => void;
}

function SearchRow({ item, active, pending, onPick, onHover }: SearchRowProps) {
  const tracked = item.isTracked && item.vm !== null;
  return (
    <div
      onClick={pending ? undefined : onPick}
      onMouseEnter={onHover}
      style={{
        padding: '9px 12px',
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: 10,
        alignItems: 'center',
        cursor: pending ? 'wait' : 'pointer',
        background: active ? 'var(--bg-tint)' : 'transparent',
        transition: 'background 80ms ease',
        opacity: pending ? 0.7 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.name}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: 0.3,
          }}
        >
          {item.code}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            padding: '1px 4px',
            borderRadius: 3,
            letterSpacing: 0.3,
          }}
        >
          {item.market}
        </span>
      </div>
      <span
        style={{
          fontSize: 9,
          fontWeight: 800,
          color: tracked ? 'var(--kr-up)' : 'var(--text-muted)',
          border: `1px solid ${tracked ? 'var(--kr-up)' : 'var(--border)'}`,
          padding: '2px 5px',
          borderRadius: 4,
          letterSpacing: 0.3,
          whiteSpace: 'nowrap',
        }}
      >
        {tracked ? '추적 중' : '전체 종목'}
      </span>
      {tracked && item.vm !== null ? (
        <>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textAlign: 'right',
            }}
          >
            {fmtPrice(item.vm.price)}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: krColor(item.vm.changePct),
              textAlign: 'right',
              minWidth: 64,
            }}
          >
            {fmtPct(item.vm.changePct)}
          </span>
        </>
      ) : (
        <>
          <span />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent)',
              textAlign: 'right',
              minWidth: 48,
            }}
          >
            {pending ? '추가 중…' : '+ 추가'}
          </span>
        </>
      )}
    </div>
  );
}
