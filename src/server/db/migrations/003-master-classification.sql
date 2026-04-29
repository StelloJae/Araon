-- B1a: classification fields parsed from KIS mst rear payload.
--
-- security_group_code  — "ST" = stock, "BC"/"EF"/etc = fund/REIT (used to
--                         filter non-stock instruments from the dashboard).
-- market_cap_size      — KIS numeric size code as string (1=대형, 2=중형, 3=소형 etc).
-- index_industry_large — 4-digit raw KIS index industry code (대분류).
-- index_industry_middle, index_industry_small — middle / small classification.
-- krx_sector_flags     — JSON object of KRX sector index memberships
--                         (krxAuto / krxSemiconductor / krxBio / krxBank /
--                          krxEnergyChem / krxSteel / krxMediaTel /
--                          krxConstruction / krxSecurities / krxShip /
--                          krxInsurance / krxTransport).
-- listed_at            — Listing date as YYYYMMDD.

ALTER TABLE master_stocks ADD COLUMN security_group_code  TEXT;
ALTER TABLE master_stocks ADD COLUMN market_cap_size      TEXT;
ALTER TABLE master_stocks ADD COLUMN index_industry_large TEXT;
ALTER TABLE master_stocks ADD COLUMN index_industry_middle TEXT;
ALTER TABLE master_stocks ADD COLUMN index_industry_small TEXT;
ALTER TABLE master_stocks ADD COLUMN krx_sector_flags     TEXT;
ALTER TABLE master_stocks ADD COLUMN listed_at            TEXT;

-- DOWN ---

ALTER TABLE master_stocks DROP COLUMN security_group_code;
ALTER TABLE master_stocks DROP COLUMN market_cap_size;
ALTER TABLE master_stocks DROP COLUMN index_industry_large;
ALTER TABLE master_stocks DROP COLUMN index_industry_middle;
ALTER TABLE master_stocks DROP COLUMN index_industry_small;
ALTER TABLE master_stocks DROP COLUMN krx_sector_flags;
ALTER TABLE master_stocks DROP COLUMN listed_at;
