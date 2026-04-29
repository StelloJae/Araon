/**
 * Client-side view models.
 *
 * The design's StockCard / MoverRow / SectionHeader props differ from the
 * backend's `Price` + `Stock` shapes. Keeping a separate VM type means the
 * pure-presentation components stay decoupled from server field names —
 * Phase 4's adapter (BackendPrice → StockViewModel) is the only place where
 * the rename happens.
 */

import type { EffectiveSector } from './effective-sector';

export type SortKey = 'changeDesc' | 'changeAsc' | 'volume' | 'name';

/** A flattened, render-ready quote. */
export interface StockViewModel {
  /** 6-digit KRX ticker — '005930' for 삼성전자. */
  code: string;
  /** 한글 종목명. */
  name: string;
  /** Current price in 원. */
  price: number;
  /** Signed percent change vs previous close, e.g. +2.34. */
  changePct: number;
  /** Signed absolute change in 원. `null` until the first KIS tick fills it. */
  changeAbs: number | null;
  /** Raw share volume from KIS (`acml_vol`). Display via `fmtVolMan`. */
  volume: number;
  /** Current cumulative volume divided by same-session/time-bucket baseline. */
  volumeSurgeRatio?: number | null;
  /** Baseline readiness for honest surge-ratio display. */
  volumeBaselineStatus?: 'collecting' | 'ready' | 'unavailable';
  market: 'KOSPI' | 'KOSDAQ';
  /** ISO timestamp of the last update — drives stale badging. */
  updatedAt: string;
  /** True when the underlying price is from the warm snapshot, not a live tick. */
  isSnapshot: boolean;
  /**
   * Manual theme id this ticker belongs to (from the theme catalog).
   * Null when the ticker isn't part of any theme — SectionStack groups those
   * by `effectiveSector` instead, falling back to the synthetic '기타' bucket.
   */
  sectorId: string | null;
  /**
   * Resolved sector for display + grouping: manual > autoSector > 기타.
   * Computed by `buildStockVM` so consumers don't re-implement priority.
   */
  effectiveSector: EffectiveSector;
}

/** A grouping (sector / theme) that holds an ordered list of stocks. */
export interface SectorViewModel {
  id: string;
  name: string;
  /** Short description shown under the section title (e.g. '파운드리 · 메모리 · 장비'). */
  tagline: string;
  stocks: StockViewModel[];
}
