CREATE TABLE IF NOT EXISTS watchlist_sync_provenance (
  product_code TEXT PRIMARY KEY,
  kr_ticker TEXT,
  source TEXT NOT NULL CHECK (source IN ('holding_auto')),
  state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_watchlist_sync_provenance_state_source
  ON watchlist_sync_provenance (state, source);

-- DOWN ---
DROP INDEX IF EXISTS idx_watchlist_sync_provenance_state_source;
DROP TABLE IF EXISTS watchlist_sync_provenance;
