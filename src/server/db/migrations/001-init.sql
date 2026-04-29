-- UP ---

CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stocks (
  ticker     TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  market     TEXT NOT NULL CHECK(market IN ('KOSPI', 'KOSDAQ')),
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS sectors (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  "order" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_tags (
  ticker TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (ticker, tag_id),
  FOREIGN KEY (ticker) REFERENCES stocks(ticker) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favorites (
  ticker   TEXT PRIMARY KEY,
  tier     TEXT NOT NULL CHECK(tier IN ('realtime', 'polling')),
  added_at TEXT NOT NULL,
  FOREIGN KEY (ticker) REFERENCES stocks(ticker) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  ticker      TEXT NOT NULL,
  price       REAL NOT NULL,
  change_rate REAL NOT NULL,
  volume      INTEGER NOT NULL,
  snapshot_at TEXT NOT NULL,
  PRIMARY KEY (ticker, snapshot_at),
  FOREIGN KEY (ticker) REFERENCES stocks(ticker) ON DELETE CASCADE
);

-- DOWN ---

DROP TABLE IF EXISTS price_snapshots;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS stock_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS sectors;
DROP TABLE IF EXISTS stocks;
DROP TABLE IF EXISTS schema_version;
