-- A rule set has at most one draft at a time; editing continues the same draft.
CREATE UNIQUE INDEX IF NOT EXISTS rule_set_versions_one_draft_uq
  ON rule_set_versions (rule_set_id) WHERE status = 'DRAFT';
