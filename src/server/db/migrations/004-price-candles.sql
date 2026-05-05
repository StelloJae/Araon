-- UP ---

CREATE TABLE IF NOT EXISTS price_candles (
  ticker       TEXT NOT NULL,
  interval     TEXT NOT NULL CHECK(interval IN ('1m', '1d')),
  bucket_at    TEXT NOT NULL,
  session      TEXT NOT NULL CHECK(session IN ('pre', 'regular', 'after', 'unknown')),
  open         REAL NOT NULL,
  high         REAL NOT NULL,
  low          REAL NOT NULL,
  close        REAL NOT NULL,
  volume       INTEGER NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  source       TEXT,
  is_partial   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (ticker, interval, bucket_at),
  FOREIGN KEY (ticker) REFERENCES stocks(ticker) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_candles_ticker_interval_bucket_desc
  ON price_candles (ticker, interval, bucket_at DESC);

-- DOWN ---

DROP INDEX IF EXISTS idx_price_candles_ticker_interval_bucket_desc;
DROP TABLE IF EXISTS price_candles;
