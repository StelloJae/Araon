ALTER TABLE stock_news_items ADD COLUMN description TEXT;

CREATE TABLE IF NOT EXISTS dart_corp_codes (
  ticker TEXT PRIMARY KEY,
  corp_code TEXT NOT NULL,
  corp_name TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dart_corp_codes_corp_code
  ON dart_corp_codes (corp_code);

-- DOWN ---
DROP INDEX IF EXISTS idx_dart_corp_codes_corp_code;
DROP TABLE IF EXISTS dart_corp_codes;
