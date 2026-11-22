-- First-run identity metadata. No changes to accounting tables or migrations 001-024.
CREATE TABLE desktop_profile (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 singleton boolean NOT NULL UNIQUE DEFAULT true CHECK(singleton),
 company_name text NOT NULL CHECK(length(btrim(company_name)) BETWEEN 1 AND 150),
 administrator_name text NOT NULL CHECK(length(btrim(administrator_name)) BETWEEN 1 AND 150),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER desktop_profile_audit AFTER INSERT ON desktop_profile FOR EACH ROW EXECUTE FUNCTION audit_change();
REVOKE ALL ON desktop_profile FROM PUBLIC, baloch_app;
GRANT SELECT, INSERT ON desktop_profile TO baloch_app;
