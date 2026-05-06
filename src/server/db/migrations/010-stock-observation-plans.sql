-- UP ---

CREATE TABLE IF NOT EXISTS stock_observation_plans (
  ticker       TEXT PRIMARY KEY,
  thesis       TEXT NOT NULL,
  trigger      TEXT NOT NULL,
  invalidation TEXT NOT NULL,
  status       TEXT NOT NULL CHECK(status IN ('watching', 'paused', 'archived')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  FOREIGN KEY (ticker) REFERENCES stocks(ticker) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stock_observation_plans_status_updated
  ON stock_observation_plans (status, updated_at DESC);

-- DOWN ---

DROP INDEX IF EXISTS idx_stock_observation_plans_status_updated;
DROP TABLE IF EXISTS stock_observation_plans;
