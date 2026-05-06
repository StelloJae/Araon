-- UP ---

CREATE TABLE IF NOT EXISTS candle_coverage_segments (
  ticker          TEXT NOT NULL,
  interval        TEXT NOT NULL CHECK(interval IN ('1m', '1d')),
  source          TEXT NOT NULL,
  range_from      TEXT NOT NULL,
  range_to        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK(status IN ('complete', 'partial', 'failed', 'skipped')),
  requested       INTEGER NOT NULL DEFAULT 0,
  inserted        INTEGER NOT NULL DEFAULT 0,
  updated         INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (ticker, interval, source, range_from, range_to),
  FOREIGN KEY (ticker) REFERENCES stocks(ticker) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_candle_coverage_segments_lookup
  ON candle_coverage_segments (ticker, interval, source, status, range_from, range_to);

-- DOWN ---

DROP INDEX IF EXISTS idx_candle_coverage_segments_lookup;
DROP TABLE IF EXISTS candle_coverage_segments;
