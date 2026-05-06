-- UP ---

CREATE TABLE IF NOT EXISTS stock_notes (
  id         TEXT PRIMARY KEY,
  ticker     TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (ticker) REFERENCES stocks(ticker) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stock_notes_ticker_created_desc
  ON stock_notes (ticker, created_at DESC);

-- DOWN ---

DROP INDEX IF EXISTS idx_stock_notes_ticker_created_desc;
DROP TABLE IF EXISTS stock_notes;
