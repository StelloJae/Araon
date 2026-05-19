DROP INDEX IF EXISTS idx_stock_signal_events_ticker_signal_desc;

ALTER TABLE stock_signal_events
  RENAME TO stock_signal_events_v21;

CREATE TABLE stock_signal_events (
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
  UNIQUE (ticker, signal_at, signal_type, momentum_window)
);

INSERT INTO stock_signal_events (
  id, ticker, name, signal_type, source, signal_price, signal_at,
  baseline_price, baseline_at, momentum_pct, momentum_window,
  daily_change_pct, volume, volume_surge_ratio, volume_baseline_status,
  created_at, updated_at
)
SELECT
  id, ticker, name, signal_type, source, signal_price, signal_at,
  baseline_price, baseline_at, momentum_pct, momentum_window,
  daily_change_pct, volume, volume_surge_ratio, volume_baseline_status,
  created_at, updated_at
FROM stock_signal_events_v21;

DROP TABLE stock_signal_events_v21;

CREATE INDEX IF NOT EXISTS idx_stock_signal_events_ticker_signal_desc
  ON stock_signal_events (ticker, signal_at DESC);

-- DOWN ---
DROP INDEX IF EXISTS idx_stock_signal_events_ticker_signal_desc;

ALTER TABLE stock_signal_events
  RENAME TO stock_signal_events_v21;

CREATE TABLE stock_signal_events (
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

INSERT INTO stock_signal_events (
  id, ticker, name, signal_type, source, signal_price, signal_at,
  baseline_price, baseline_at, momentum_pct, momentum_window,
  daily_change_pct, volume, volume_surge_ratio, volume_baseline_status,
  created_at, updated_at
)
SELECT
  id, ticker, name, signal_type, source, signal_price, signal_at,
  baseline_price, baseline_at, momentum_pct, momentum_window,
  daily_change_pct, volume, volume_surge_ratio, volume_baseline_status,
  created_at, updated_at
FROM stock_signal_events_v21
WHERE ticker IN (SELECT ticker FROM stocks);

DROP TABLE stock_signal_events_v21;

CREATE INDEX IF NOT EXISTS idx_stock_signal_events_ticker_signal_desc
  ON stock_signal_events (ticker, signal_at DESC);
