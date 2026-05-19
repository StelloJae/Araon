CREATE TABLE IF NOT EXISTS agent_event_alert_deliveries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'news_detected',
      'disclosure_detected',
      'toss_signal_detected',
      'market_movement_detected'
    )
  ),
  ticker TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel = 'browser-sse'),
  target TEXT NOT NULL CHECK (target = 'local-ui'),
  status TEXT NOT NULL CHECK (status IN ('dispatched', 'skipped_no_client')),
  client_count INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_event_alert_deliveries_created
  ON agent_event_alert_deliveries (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_event_alert_deliveries_event
  ON agent_event_alert_deliveries (event_id, created_at DESC, id DESC);

-- DOWN ---
DROP INDEX IF EXISTS idx_agent_event_alert_deliveries_event;
DROP INDEX IF EXISTS idx_agent_event_alert_deliveries_created;
DROP TABLE IF EXISTS agent_event_alert_deliveries;
