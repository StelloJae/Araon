CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (
    type IN (
      'news_detected',
      'disclosure_detected',
      'toss_signal_detected',
      'market_movement_detected'
    )
  ),
  ticker TEXT NOT NULL,
  source TEXT NOT NULL,
  published_at TEXT,
  first_seen_at TEXT NOT NULL,
  freshness_ms INTEGER,
  relevance REAL,
  confidence REAL NOT NULL,
  reason TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload_ref TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_events_created
  ON agent_events (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_ticker_created
  ON agent_events (ticker, created_at DESC, id DESC);

-- DOWN ---
DROP INDEX IF EXISTS idx_agent_events_ticker_created;
DROP INDEX IF EXISTS idx_agent_events_created;
DROP TABLE IF EXISTS agent_events;
