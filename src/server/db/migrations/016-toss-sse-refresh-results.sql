CREATE TABLE IF NOT EXISTS toss_sse_refresh_results (
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL CHECK (
    resource IN (
      'quote',
      'pending-orders',
      'completed-orders',
      'account-summary',
      'portfolio-positions',
      'user-notifications',
      'preferences',
      'icons'
    )
  ),
  ticker TEXT,
  source_type TEXT NOT NULL,
  received_at TEXT NOT NULL,
  result TEXT NOT NULL CHECK (
    result IN ('refreshed', 'ignored', 'throttled', 'in_flight', 'failed')
  ),
  reason TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_toss_sse_refresh_results_recorded
  ON toss_sse_refresh_results (recorded_at DESC, id DESC);

-- DOWN ---
DROP INDEX IF EXISTS idx_toss_sse_refresh_results_recorded;
DROP TABLE IF EXISTS toss_sse_refresh_results;
