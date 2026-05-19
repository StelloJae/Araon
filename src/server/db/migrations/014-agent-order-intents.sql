CREATE TABLE IF NOT EXISTS agent_order_intents (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  market TEXT NOT NULL CHECK (market IN ('KR', 'US')),
  requested_mode TEXT NOT NULL CHECK (requested_mode IN ('simulated', 'paper')),
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('simulated', 'paper')),
  status TEXT NOT NULL CHECK (status = 'preview_ready'),
  live_execution_locked INTEGER NOT NULL CHECK (live_execution_locked IN (0, 1)),
  quantity REAL,
  cash_amount REAL,
  order_type TEXT NOT NULL CHECK (order_type IN ('market', 'limit')),
  limit_price REAL,
  trigger_event_id TEXT,
  agent_id TEXT,
  reason TEXT NOT NULL,
  risk_checks_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  audit_ref TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_order_intents_created
  ON agent_order_intents (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_order_intents_ticker_created
  ON agent_order_intents (ticker, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS agent_order_intent_audit_entries (
  id TEXT PRIMARY KEY,
  intent_id TEXT,
  event TEXT NOT NULL CHECK (event IN ('preview_created', 'live_execution_blocked')),
  decision TEXT NOT NULL CHECK (decision IN ('allowed', 'blocked')),
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  requested_mode TEXT NOT NULL CHECK (requested_mode IN ('simulated', 'paper', 'live')),
  agent_id TEXT,
  trigger_event_id TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_order_intent_audit_created
  ON agent_order_intent_audit_entries (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_order_intent_audit_ticker_created
  ON agent_order_intent_audit_entries (ticker, created_at DESC, id DESC);

-- DOWN ---
DROP INDEX IF EXISTS idx_agent_order_intent_audit_ticker_created;
DROP INDEX IF EXISTS idx_agent_order_intent_audit_created;
DROP TABLE IF EXISTS agent_order_intent_audit_entries;
DROP INDEX IF EXISTS idx_agent_order_intents_ticker_created;
DROP INDEX IF EXISTS idx_agent_order_intents_created;
DROP TABLE IF EXISTS agent_order_intents;
