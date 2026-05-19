DROP INDEX IF EXISTS idx_agent_events_ticker_created;
DROP INDEX IF EXISTS idx_agent_events_created;

ALTER TABLE agent_events
  RENAME TO agent_events_v20;

CREATE TABLE agent_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (
    type IN (
      'news_detected',
      'disclosure_detected',
      'toss_signal_detected',
      'market_movement_detected',
      'watchlist_changed',
      'position_changed',
      'order_intent_created',
      'order_intent_skipped',
      'approval_requested',
      'approval_granted',
      'approval_denied',
      'execution_locked',
      'risk_check_completed',
      'preview_created'
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

INSERT INTO agent_events (
  id, type, ticker, source, published_at, first_seen_at, freshness_ms,
  relevance, confidence, reason, dedupe_key, payload_ref, created_at
)
SELECT
  id, type, ticker, source, published_at, first_seen_at, freshness_ms,
  relevance, confidence, reason, dedupe_key, payload_ref, created_at
FROM agent_events_v20;

DROP TABLE agent_events_v20;

CREATE INDEX IF NOT EXISTS idx_agent_events_created
  ON agent_events (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_ticker_created
  ON agent_events (ticker, created_at DESC, id DESC);

DROP INDEX IF EXISTS idx_agent_event_alert_deliveries_event;
DROP INDEX IF EXISTS idx_agent_event_alert_deliveries_created;

ALTER TABLE agent_event_alert_deliveries
  RENAME TO agent_event_alert_deliveries_v20;

CREATE TABLE agent_event_alert_deliveries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'news_detected',
      'disclosure_detected',
      'toss_signal_detected',
      'market_movement_detected',
      'watchlist_changed',
      'position_changed',
      'order_intent_created',
      'order_intent_skipped',
      'approval_requested',
      'approval_granted',
      'approval_denied',
      'execution_locked',
      'risk_check_completed',
      'preview_created'
    )
  ),
  ticker TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel = 'browser-sse'),
  target TEXT NOT NULL CHECK (target = 'local-ui'),
  status TEXT NOT NULL CHECK (status IN ('dispatched', 'skipped_no_client')),
  client_count INTEGER NOT NULL,
  dispatch_latency_ms INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO agent_event_alert_deliveries (
  id, event_id, event_type, ticker, channel, target, status,
  client_count, dispatch_latency_ms, reason, created_at
)
SELECT
  id, event_id, event_type, ticker, channel, target, status,
  client_count, dispatch_latency_ms, reason, created_at
FROM agent_event_alert_deliveries_v20;

DROP TABLE agent_event_alert_deliveries_v20;

CREATE INDEX IF NOT EXISTS idx_agent_event_alert_deliveries_created
  ON agent_event_alert_deliveries (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_event_alert_deliveries_event
  ON agent_event_alert_deliveries (event_id, created_at DESC, id DESC);

-- DOWN ---
DROP INDEX IF EXISTS idx_agent_event_alert_deliveries_event;
DROP INDEX IF EXISTS idx_agent_event_alert_deliveries_created;

ALTER TABLE agent_event_alert_deliveries
  RENAME TO agent_event_alert_deliveries_v20;

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
  dispatch_latency_ms INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO agent_event_alert_deliveries (
  id, event_id, event_type, ticker, channel, target, status,
  client_count, dispatch_latency_ms, reason, created_at
)
SELECT
  id, event_id, event_type, ticker, channel, target, status,
  client_count, dispatch_latency_ms, reason, created_at
FROM agent_event_alert_deliveries_v20
WHERE event_type IN (
  'news_detected',
  'disclosure_detected',
  'toss_signal_detected',
  'market_movement_detected'
);

DROP TABLE agent_event_alert_deliveries_v20;

CREATE INDEX IF NOT EXISTS idx_agent_event_alert_deliveries_created
  ON agent_event_alert_deliveries (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_event_alert_deliveries_event
  ON agent_event_alert_deliveries (event_id, created_at DESC, id DESC);

DROP INDEX IF EXISTS idx_agent_events_ticker_created;
DROP INDEX IF EXISTS idx_agent_events_created;

ALTER TABLE agent_events
  RENAME TO agent_events_v20;

CREATE TABLE agent_events (
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

INSERT INTO agent_events (
  id, type, ticker, source, published_at, first_seen_at, freshness_ms,
  relevance, confidence, reason, dedupe_key, payload_ref, created_at
)
SELECT
  id, type, ticker, source, published_at, first_seen_at, freshness_ms,
  relevance, confidence, reason, dedupe_key, payload_ref, created_at
FROM agent_events_v20
WHERE type IN (
  'news_detected',
  'disclosure_detected',
  'toss_signal_detected',
  'market_movement_detected'
);

DROP TABLE agent_events_v20;

CREATE INDEX IF NOT EXISTS idx_agent_events_created
  ON agent_events (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_ticker_created
  ON agent_events (ticker, created_at DESC, id DESC);
