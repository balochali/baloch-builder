-- Explicit rebuild reset: retain identity, session infrastructure and migration history only.
DROP TABLE IF EXISTS project_workbook_rows, project_status_history, project_buildings,
 project_assignments, attachments, saved_views, voucher_lines, vouchers, voucher_series,
 cost_heads, accounts, fiscal_periods, settings, projects CASCADE;
DELETE FROM sessions;
ALTER TABLE audit_log DISABLE TRIGGER audit_immutable;
TRUNCATE TABLE audit_log;
ALTER TABLE audit_log ENABLE TRIGGER audit_immutable;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('accounting_lock','financial_actor','guard_account','guard_account_cost_head','guard_attachment','guard_building','guard_correction','guard_cost_head','guard_line','guard_line_cost_head','guard_period','guard_posting_cost_heads','guard_project_assignment','guard_project_profile','guard_voucher','guard_voucher_project_archive','guard_workbook_row','open_period','record_project_status') LOOP
 EXECUTE format('DROP FUNCTION %s CASCADE', f.signature);
 END LOOP;
END $$;
