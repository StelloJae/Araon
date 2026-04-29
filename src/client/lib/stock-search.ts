/**
 * Stock search ranking — pure function, kept out of the React component so it
 * can be unit-tested without a DOM environment (vitest is configured for
 * `environment: 'node'`).
 *
 * 8-bucket ranking (smaller = better, capped at `limit` total):
 *   1. ticker exact
 *   2. ticker startsWith
 *   3. name exact
 *   4. name startsWith
 *   5. chosung exact
 *   6. chosung startsWith
 *   7. name OR ticker includes (substring)
 *   8. chosung includes
 *
 * Bucket 1 always wins so a typed ticker code never gets buried under
 * chosung matches. Chosung 매칭은 한글 이름의 보조 랭킹으로만 동작.
 *
 * Results within each bucket preserve input order, so a stable upstream sort
 * (e.g. by sector) is reflected in the dropdown.
 */

import type { MasterStockEntry } from './api-client';
import type { StockViewModel } from './view-models';
import { getChosung } from './chosung';

export const MAX_SEARCH_RESULTS = 8;

export function rankStockSearch(
  query: string,
  stocks: ReadonlyArray<StockViewModel>,
  limit: number = MAX_SEARCH_RESULTS,
): StockViewModel[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const q = trimmed.toLowerCase();
  const qCho = getChosung(trimmed);

  const hits: Array<{ rank: number; index: number; vm: StockViewModel }> = [];
  stocks.forEach((s, index) => {
    const code = s.code.toLowerCase();
    const name = s.name.toLowerCase();
    const nameCho = getChosung(s.name);
    const r = rankBucket(q, qCho, code, name, nameCho);
    if (r !== 0) hits.push({ rank: r, index, vm: s });
  });

  // Stable: equal rank preserves input order.
  hits.sort((a, b) => (a.rank - b.rank) || (a.index - b.index));
  return hits.slice(0, limit).map((h) => h.vm);
}

export interface CombinedSearchResult {
  /** 6-digit ticker. */
  code: string;
  /** Korean display name. */
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  /** Live VM if the ticker is in the user's tracked catalog; null otherwise. */
  vm: StockViewModel | null;
  isTracked: boolean;
}

/**
 * Returns 1..8 per the bucket order documented above, or 0 for no match.
 *
 * Chosung buckets are always evaluated. For pure-ASCII queries qCho == q,
 * so any chosung match is also caught by an earlier name/code bucket and
 * the lower-priority chosung rank is ignored. The cost is one extra
 * `includes` call per non-matching stock; correctness wins over the
 * micro-optimization.
 */
function rankBucket(
  q: string,
  qCho: string,
  code: string,
  name: string,
  nameCho: string,
): number {
  if (code === q) return 1;
  if (code.startsWith(q)) return 2;
  if (name === q) return 3;
  if (name.startsWith(q)) return 4;
  if (qCho.length > 0 && nameCho === qCho) return 5;
  if (qCho.length > 0 && nameCho.startsWith(qCho)) return 6;
  if (name.includes(q) || code.includes(q)) return 7;
  if (qCho.length > 0 && nameCho.includes(qCho)) return 8;
  return 0;
}

/**
 * Search both the tracked catalog and the master universe in one pass.
 * Tracked results are pushed first (so already-watched rows surface fastest),
 * then master-only results not already covered by the tracked half.
 */
export function rankStockSearchCombined(
  query: string,
  tracked: ReadonlyArray<StockViewModel>,
  master: ReadonlyArray<MasterStockEntry>,
  limit: number = MAX_SEARCH_RESULTS,
): CombinedSearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const q = trimmed.toLowerCase();
  const qCho = getChosung(trimmed);

  const trackedHits: Array<{ rank: number; index: number; vm: StockViewModel }> = [];
  tracked.forEach((s, index) => {
    const code = s.code.toLowerCase();
    const name = s.name.toLowerCase();
    const nameCho = getChosung(s.name);
    const r = rankBucket(q, qCho, code, name, nameCho);
    if (r !== 0) trackedHits.push({ rank: r, index, vm: s });
  });
  trackedHits.sort((a, b) => (a.rank - b.rank) || (a.index - b.index));

  const trackedCodes = new Set(trackedHits.map((t) => t.vm.code));
  const trackedAllCodes = new Set(tracked.map((s) => s.code));

  const masterHits: Array<{ rank: number; index: number; entry: MasterStockEntry }> = [];
  master.forEach((m, index) => {
    if (trackedCodes.has(m.ticker)) return;
    if (trackedAllCodes.has(m.ticker)) return; // already tracked, just no rank-match here
    const code = m.ticker.toLowerCase();
    const name = m.name.toLowerCase();
    const nameCho = getChosung(m.name);
    const r = rankBucket(q, qCho, code, name, nameCho);
    if (r !== 0) masterHits.push({ rank: r, index, entry: m });
  });
  masterHits.sort((a, b) => (a.rank - b.rank) || (a.index - b.index));

  const out: CombinedSearchResult[] = [];
  for (const t of trackedHits) {
    out.push({
      code: t.vm.code,
      name: t.vm.name,
      market: t.vm.market,
      vm: t.vm,
      isTracked: true,
    });
    if (out.length >= limit) return out;
  }
  for (const m of masterHits) {
    out.push({
      code: m.entry.ticker,
      name: m.entry.name,
      market: m.entry.market,
      vm: null,
      isTracked: false,
    });
    if (out.length >= limit) return out;
  }
  return out;
}
