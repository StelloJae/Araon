CREATE TABLE IF NOT EXISTS agent_order_intent_approval_challenges (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  requested_mode TEXT NOT NULL CHECK (requested_mode = 'live'),
  status TEXT NOT NULL CHECK (
    status IN (
      'pending_confirmation',
      'confirmed_live_locked',
      'rejected',
      'expired'
    )
  ),
  confirmation_text TEXT NOT NULL,
  live_execution_locked INTEGER NOT NULL CHECK (live_execution_locked = 1),
  operator_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  audit_ref TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_order_intent_approval_challenges_created
  ON agent_order_intent_approval_challenges (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_order_intent_approval_challenges_intent
  ON agent_order_intent_approval_challenges (intent_id, created_at DESC, id DESC);

DROP INDEX IF EXISTS idx_agent_order_intent_audit_ticker_created;
DROP INDEX IF EXISTS idx_agent_order_intent_audit_created;

ALTER TABLE agent_order_intent_audit_entries
  RENAME TO agent_order_intent_audit_entries_v17;

CREATE TABLE agent_order_intent_audit_entries (
  id TEXT PRIMARY KEY,
  intent_id TEXT,
  event TEXT NOT NULL CHECK (
    event IN (
      'preview_created',
      'live_execution_blocked',
      'confirm_challenge_created',
      'confirm_token_verified_live_locked',
      'confirm_token_rejected',
      'confirm_token_expired'
    )
  ),
  decision TEXT NOT NULL CHECK (decision IN ('allowed', 'blocked')),
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  requested_mode TEXT NOT NULL CHECK (requested_mode IN ('simulated', 'paper', 'live')),
  agent_id TEXT,
  trigger_event_id TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO agent_order_intent_audit_entries (
  id, intent_id, event, decision, ticker, side, requested_mode,
  agent_id, trigger_event_id, reason, created_at
)
SELECT
  id, intent_id, event, decision, ticker, side, requested_mode,
  agent_id, trigger_event_id, reason, created_at
FROM agent_order_intent_audit_entries_v17;

DROP TABLE agent_order_intent_audit_entries_v17;

CREATE INDEX IF NOT EXISTS idx_agent_order_intent_audit_created
  ON agent_order_intent_audit_entries (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_order_intent_audit_ticker_created
  ON agent_order_intent_audit_entries (ticker, created_at DESC, id DESC);

-- DOWN ---
DROP INDEX IF EXISTS idx_agent_order_intent_audit_ticker_created;
DROP INDEX IF EXISTS idx_agent_order_intent_audit_created;

ALTER TABLE agent_order_intent_audit_entries
  RENAME TO agent_order_intent_audit_entries_v18;

CREATE TABLE agent_order_intent_audit_entries (
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

INSERT INTO agent_order_intent_audit_entries (
  id, intent_id, event, decision, ticker, side, requested_mode,
  agent_id, trigger_event_id, reason, created_at
)
SELECT
  id, intent_id, event, decision, ticker, side, requested_mode,
  agent_id, trigger_event_id, reason, created_at
FROM agent_order_intent_audit_entries_v18
WHERE event IN ('preview_created', 'live_execution_blocked');

DROP TABLE agent_order_intent_audit_entries_v18;

CREATE INDEX IF NOT EXISTS idx_agent_order_intent_audit_created
  ON agent_order_intent_audit_entries (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_order_intent_audit_ticker_created
  ON agent_order_intent_audit_entries (ticker, created_at DESC, id DESC);

DROP INDEX IF EXISTS idx_agent_order_intent_approval_challenges_intent;
DROP INDEX IF EXISTS idx_agent_order_intent_approval_challenges_created;
DROP TABLE IF EXISTS agent_order_intent_approval_challenges;
