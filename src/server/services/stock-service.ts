/**
 * Stock CRUD service — thin business-logic layer between routes and repositories.
 *
 * Sectors are resolved by name: if a sectorName is supplied the service does a
 * find-or-create inline (using `SectorRepository.findAll` + `upsert`) rather
 * than adding a new method to Phase 2's `repositories.ts`.
 */

import { randomUUID } from 'node:crypto';
import type { InstrumentType, Stock } from '@shared/types.js';
import type {
  StockRepository,
  SectorRepository,
  MasterStockRepository,
} from '../db/repositories.js';
import { mapStoredKisClassification } from '../data/kis-industry-sector-map.js';
import { createChildLogger } from '@shared/logger.js';

const log = createChildLogger('stock-service');

// === Dep injection interface ==================================================

export interface StockServiceDeps {
  stockRepo: StockRepository;
  sectorRepo: SectorRepository;
  /**
   * Optional — when provided, `list()` enriches each `Stock` with
   * `autoSector` derived from KIS official master classification. Callers
   * that don't have a master catalog (some unit tests) can omit this and the
   * `autoSector` field will simply be undefined.
   */
  masterRepo?: MasterStockRepository;
}

// === Public service interface =================================================

export interface AddOneInput {
  ticker: string;
  name: string;
  market: Stock['market'];
  sectorName?: string;
}

export interface AddOneResult {
  stock: Stock;
  sectorId: string | null;
}

export interface BulkAddResult {
  succeeded: number;
  failed: number;
  errors: Array<{ line: number; reason: string }>;
}

export interface StockService {
  addOne(input: AddOneInput): Promise<AddOneResult>;
  addBulk(stocks: Stock[], parseErrors: Array<{ line: number; reason: string }>): Promise<BulkAddResult>;
  remove(ticker: string): void;
  list(): Stock[];
}

// === Factory ==================================================================

export function createStockService(deps: StockServiceDeps): StockService {
  const { stockRepo, sectorRepo, masterRepo } = deps;

  /**
   * Finds an existing sector by name or creates a new one.
   * Does NOT modify repositories.ts — implements the pattern inline.
   */
  function findOrCreateSector(name: string): string {
    const existing = sectorRepo.findAll().find((s) => s.name === name);
    if (existing !== undefined) {
      return existing.id;
    }

    const newSector = {
      id: randomUUID(),
      name,
      order: Date.now(),
    };
    sectorRepo.upsert(newSector);
    log.debug({ sectorId: newSector.id, name }, 'sector created');
    return newSector.id;
  }

  return {
    addOne(input: AddOneInput): Promise<AddOneResult> {
      const stock: Stock = {
        ticker: input.ticker,
        name: input.name,
        market: input.market,
      };

      stockRepo.upsert(stock);
      log.debug({ ticker: stock.ticker }, 'stock upserted');

      let sectorId: string | null = null;
      if (input.sectorName !== undefined && input.sectorName.trim().length > 0) {
        sectorId = findOrCreateSector(input.sectorName.trim());
      }

      return Promise.resolve({ stock, sectorId });
    },

    async addBulk(
      stocks: Stock[],
      parseErrors: Array<{ line: number; reason: string }>,
    ): Promise<BulkAddResult> {
      if (stocks.length > 0) {
        await stockRepo.bulkUpsert(stocks);
        log.debug({ count: stocks.length }, 'bulk upsert complete');
      }

      return {
        succeeded: stocks.length,
        failed: parseErrors.length,
        errors: parseErrors,
      };
    },

    remove(ticker: string): void {
      stockRepo.delete(ticker);
      log.debug({ ticker }, 'stock deleted');
    },

    list(): Stock[] {
      const stocks = stockRepo.findAll();
      if (masterRepo === undefined || stocks.length === 0) return stocks;

      const classificationByTicker = masterRepo.findClassificationByTickers(
        stocks.map((s) => s.ticker),
      );
      return stocks.map((s) => {
        const classification = classificationByTicker.get(s.ticker);
        const result =
          classification === undefined
            ? null
            : mapStoredKisClassification(classification);
        return {
          ...s,
          autoSector: result?.sector ?? null,
          instrumentType: detectInstrumentType(
            s.name,
            classification?.securityGroupCode ?? null,
          ),
        };
      });
    },
  };
}

export function detectInstrumentType(
  name: string,
  securityGroupCode: string | null,
): InstrumentType {
  const normalized = name.toUpperCase();
  if (normalized.includes('ETN')) return 'etn';
  if (normalized.includes('ETF')) return 'etf';
  if (name.includes('리츠') || normalized.includes('REIT')) return 'reit';
  if (
    /^(KODEX|TIGER|ACE|RISE|SOL|PLUS|HANARO|ARIRANG|KOSEF|KBSTAR|TIMEFOLIO)\b/i
      .test(name)
  ) {
    return 'etf';
  }
  if (securityGroupCode !== null && securityGroupCode !== 'ST') return 'fund';
  return 'equity';
}
