ALTER TABLE agent_event_alert_deliveries
  ADD COLUMN dispatch_latency_ms INTEGER NOT NULL DEFAULT 0;

-- DOWN ---
DROP INDEX IF EXISTS idx_agent_event_alert_deliveries_event;
DROP INDEX IF EXISTS idx_agent_event_alert_deliveries_created;

ALTER TABLE agent_event_alert_deliveries
  RENAME TO agent_event_alert_deliveries_v19;

CREATE TABLE agent_event_alert_deliveries (
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

INSERT INTO agent_event_alert_deliveries (
  id, event_id, event_type, ticker, channel, target, status,
  client_count, reason, created_at
)
SELECT
  id, event_id, event_type, ticker, channel, target, status,
  client_count, reason, created_at
FROM agent_event_alert_deliveries_v19;

DROP TABLE agent_event_alert_deliveries_v19;

CREATE INDEX IF NOT EXISTS idx_agent_event_alert_deliveries_created
  ON agent_event_alert_deliveries (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_event_alert_deliveries_event
  ON agent_event_alert_deliveries (event_id, created_at DESC, id DESC);
