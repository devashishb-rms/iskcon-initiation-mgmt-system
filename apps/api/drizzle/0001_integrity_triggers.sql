-- Database-level guarantees that application code alone must not be trusted with.

-- NFR-6: the audit log is append-only.
CREATE OR REPLACE FUNCTION reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: this table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_change();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION reject_change();
--> statement-breakpoint
-- PRD: register entries are never deleted. Corrections (a spiritual name) are UPDATEs, and the audit log records them.
CREATE TRIGGER register_entries_no_delete
  BEFORE DELETE ON register_entries
  FOR EACH ROW EXECUTE FUNCTION reject_change();
--> statement-breakpoint
CREATE TRIGGER register_entries_no_truncate
  BEFORE TRUNCATE ON register_entries
  FOR EACH STATEMENT EXECUTE FUNCTION reject_change();
--> statement-breakpoint
-- A rule set version that has been published is history: its parameters can never change.
CREATE OR REPLACE FUNCTION freeze_published_rule_version() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published rule set versions are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER rule_set_versions_frozen
  BEFORE UPDATE OR DELETE ON rule_set_versions
  FOR EACH ROW EXECUTE FUNCTION freeze_published_rule_version();
--> statement-breakpoint
-- Recommendations are decisions on record: never edited, never removed.
CREATE TRIGGER recommendations_append_only
  BEFORE UPDATE OR DELETE ON recommendations
  FOR EACH ROW EXECUTE FUNCTION reject_change();
--> statement-breakpoint
CREATE TRIGGER guru_responses_append_only
  BEFORE UPDATE OR DELETE ON guru_responses
  FOR EACH ROW EXECUTE FUNCTION reject_change();
--> statement-breakpoint
-- Data minimisation (NFR-1): refuse any column that would hold identity-based attributes.
-- This is a guard for future migrations, not data: it fails the migration run if such a column appears.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ') INTO bad
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name ~* '(aadhaar|aadhar|caste|varna|ethnicity|race|marital)';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'forbidden identity columns present: %', bad;
  END IF;
END $$;
