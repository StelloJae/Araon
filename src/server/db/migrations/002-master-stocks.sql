-- UP ---

-- Full universe of KRX-listed equities used for client-side search.
-- Distinct from `stocks` (the small "추적 카탈로그" the user actually watches)
-- so that pricing / polling stays scoped to opted-in tickers.
CREATE TABLE IF NOT EXISTS master_stocks (
  ticker          TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  market          TEXT NOT NULL CHECK(market IN ('KOSPI', 'KOSDAQ')),
  standard_code   TEXT,
  market_cap_tier TEXT,
  source          TEXT NOT NULL DEFAULT 'kis_mst',
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_master_stocks_market ON master_stocks(market);

-- Free-form key/value table for refresh metadata: last_refreshed_at,
-- last_error, last_row_count, etc. Keeps refresh status separate from row
-- mutations so a partial swap doesn't corrupt the timestamp.
CREATE TABLE IF NOT EXISTS master_stock_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- DOWN ---

DROP INDEX IF EXISTS idx_master_stocks_market;
DROP TABLE IF EXISTS master_stocks;
DROP TABLE IF EXISTS master_stock_meta;
