ALTER TABLE agent_order_intent_approval_challenges
  ADD COLUMN intent_hash TEXT NOT NULL DEFAULT '';

ALTER TABLE agent_order_intent_approval_challenges
  ADD COLUMN order_summary_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE agent_order_intent_approval_challenges
  ADD COLUMN kill_switch TEXT NOT NULL DEFAULT 'engaged';

-- DOWN ---
ALTER TABLE agent_order_intent_approval_challenges
  DROP COLUMN kill_switch;

ALTER TABLE agent_order_intent_approval_challenges
  DROP COLUMN order_summary_json;

ALTER TABLE agent_order_intent_approval_challenges
  DROP COLUMN intent_hash;
