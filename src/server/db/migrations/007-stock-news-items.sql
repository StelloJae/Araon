CREATE TABLE IF NOT EXISTS stock_news_items (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  FOREIGN KEY (ticker) REFERENCES stocks(ticker) ON DELETE CASCADE,
  UNIQUE (ticker, url)
);

CREATE INDEX IF NOT EXISTS idx_stock_news_items_ticker_fetched_desc
  ON stock_news_items (ticker, fetched_at DESC);

-- DOWN ---
DROP INDEX IF EXISTS idx_stock_news_items_ticker_fetched_desc;
DROP TABLE IF EXISTS stock_news_items;
