/**
 * Data-integrity suite for the static theme catalog.
 *
 * These tests verify structural correctness of the theme data without any
 * database or network dependency.
 */

import { describe, it, expect } from 'vitest';
import { themes, getThemeById } from '../theme-stocks.js';
import type { ThemeDefinition } from '../theme-stocks.js';

const TICKER_REGEX = /^\d{6}$/;
const VALID_MARKETS = new Set(['KOSPI', 'KOSDAQ']);
const MIN_THEMES = 5;
const MIN_STOCKS_PER_THEME = 10;

describe('theme-stocks static catalog', () => {
  it('exports at least 5 themes', () => {
    expect(themes.length).toBeGreaterThanOrEqual(MIN_THEMES);
  });

  it('every theme has a non-empty id and name', () => {
    for (const theme of themes) {
      expect(theme.id.length, `theme id should be non-empty`).toBeGreaterThan(0);
      expect(theme.name.length, `theme name should be non-empty for id="${theme.id}"`).toBeGreaterThan(0);
    }
  });

  it('every theme has at least 10 stocks', () => {
    for (const theme of themes) {
      expect(
        theme.stocks.length,
        `theme "${theme.id}" has ${theme.stocks.length} stocks — need ≥${MIN_STOCKS_PER_THEME}`,
      ).toBeGreaterThanOrEqual(MIN_STOCKS_PER_THEME);
    }
  });

  it('all tickers match /^\\d{6}$/', () => {
    const violations: string[] = [];
    for (const theme of themes) {
      for (const stock of theme.stocks) {
        if (!TICKER_REGEX.test(stock.ticker)) {
          violations.push(`theme "${theme.id}": ticker "${stock.ticker}" is not 6 digits`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no duplicate tickers within a single theme', () => {
    const violations: string[] = [];
    for (const theme of themes) {
      const seen = new Set<string>();
      for (const stock of theme.stocks) {
        if (seen.has(stock.ticker)) {
          violations.push(`theme "${theme.id}": duplicate ticker "${stock.ticker}"`);
        }
        seen.add(stock.ticker);
      }
    }
    expect(violations).toEqual([]);
  });

  it('every stock conforms to the Stock interface (ticker, name, market)', () => {
    const violations: string[] = [];
    for (const theme of themes) {
      for (const stock of theme.stocks) {
        if (typeof stock.ticker !== 'string' || stock.ticker.length === 0) {
          violations.push(`theme "${theme.id}": stock missing ticker`);
        }
        if (typeof stock.name !== 'string' || stock.name.length === 0) {
          violations.push(`theme "${theme.id}": stock "${stock.ticker}" missing name`);
        }
        if (!VALID_MARKETS.has(stock.market)) {
          violations.push(
            `theme "${theme.id}": stock "${stock.ticker}" has invalid market "${stock.market}"`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  describe('getThemeById', () => {
    it('returns the correct theme for a valid id', () => {
      const theme = getThemeById('semiconductor');
      expect(theme).toBeDefined();
      expect((theme as ThemeDefinition).id).toBe('semiconductor');
    });

    it('returns undefined for an unknown id', () => {
      expect(getThemeById('nonexistent-theme')).toBeUndefined();
    });

    it('can look up every theme by its own id', () => {
      for (const theme of themes) {
        const found = getThemeById(theme.id);
        expect(found, `getThemeById("${theme.id}") should return the theme`).toBeDefined();
        expect((found as ThemeDefinition).id).toBe(theme.id);
      }
    });
  });
});
