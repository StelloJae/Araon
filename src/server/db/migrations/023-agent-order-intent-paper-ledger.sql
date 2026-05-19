CREATE TABLE IF NOT EXISTS agent_order_intent_paper_ledger_entries (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  market TEXT NOT NULL CHECK (market IN ('KR', 'US')),
  status TEXT NOT NULL CHECK (status = 'preview_only'),
  booked INTEGER NOT NULL CHECK (booked = 0),
  position_delta REAL,
  cash_delta_krw REAL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_order_intent_paper_ledger_created
  ON agent_order_intent_paper_ledger_entries (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_order_intent_paper_ledger_ticker_created
  ON agent_order_intent_paper_ledger_entries (ticker, created_at DESC, id DESC);

-- DOWN ---
DROP INDEX IF EXISTS idx_agent_order_intent_paper_ledger_ticker_created;
DROP INDEX IF EXISTS idx_agent_order_intent_paper_ledger_created;
DROP TABLE IF EXISTS agent_order_intent_paper_ledger_entries;
