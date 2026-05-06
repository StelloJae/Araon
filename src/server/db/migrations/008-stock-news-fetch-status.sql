CREATE TABLE IF NOT EXISTS stock_news_fetch_status (
  ticker TEXT PRIMARY KEY,
  last_fetch_status TEXT NOT NULL,
  last_fetch_error_code TEXT,
  last_fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (ticker) REFERENCES stocks(ticker) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stock_news_fetch_status_updated_desc
  ON stock_news_fetch_status (updated_at DESC);

-- DOWN ---
DROP INDEX IF EXISTS idx_stock_news_fetch_status_updated_desc;
DROP TABLE IF EXISTS stock_news_fetch_status;
