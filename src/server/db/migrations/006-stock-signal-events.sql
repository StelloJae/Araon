CREATE TABLE IF NOT EXISTS stock_signal_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  source TEXT NOT NULL,
  signal_price REAL NOT NULL,
  signal_at TEXT NOT NULL,
  baseline_price REAL,
  baseline_at TEXT,
  momentum_pct REAL NOT NULL,
  momentum_window TEXT NOT NULL,
  daily_change_pct REAL,
  volume INTEGER,
  volume_surge_ratio REAL,
  volume_baseline_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (ticker) REFERENCES stocks(ticker) ON DELETE CASCADE,
  UNIQUE (ticker, signal_at, signal_type, momentum_window)
);

CREATE INDEX IF NOT EXISTS idx_stock_signal_events_ticker_signal_desc
  ON stock_signal_events (ticker, signal_at DESC);

-- DOWN ---
DROP INDEX IF EXISTS idx_stock_signal_events_ticker_signal_desc;
DROP TABLE IF EXISTS stock_signal_events;
