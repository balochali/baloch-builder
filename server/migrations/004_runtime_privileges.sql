-- Run as baloch_owner. Trigger functions remain SECURITY INVOKER.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO baloch_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, baloch_app;
GRANT SELECT, INSERT, UPDATE ON users, sessions, projects, project_assignments,
  accounts, fiscal_periods, settings, voucher_series, vouchers, voucher_lines, saved_views TO baloch_app;
GRANT SELECT, INSERT ON attachments, audit_log TO baloch_app;
GRANT SELECT ON schema_migrations TO baloch_app;
GRANT DELETE ON sessions TO baloch_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO baloch_app;
-- Future business tables use these defaults. Restricted tables must REVOKE UPDATE
-- in the same migration transaction, as audit_log and attachments do above.
ALTER DEFAULT PRIVILEGES FOR ROLE baloch_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO baloch_app;
ALTER DEFAULT PRIVILEGES FOR ROLE baloch_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE baloch_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO baloch_app;

