-- UP ---

CREATE TABLE IF NOT EXISTS price_history_points (
  ticker       TEXT NOT NULL,
  bucket_at    TEXT NOT NULL,
  price        REAL NOT NULL,
  change_rate  REAL NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  source       TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (ticker, bucket_at),
  FOREIGN KEY (ticker) REFERENCES stocks(ticker) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_history_points_ticker_bucket_desc
  ON price_history_points (ticker, bucket_at DESC);

-- DOWN ---

DROP INDEX IF EXISTS idx_price_history_points_ticker_bucket_desc;
DROP TABLE IF EXISTS price_history_points;
