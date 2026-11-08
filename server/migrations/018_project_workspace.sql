CREATE SEQUENCE project_number_seq;
GRANT USAGE ON SEQUENCE project_number_seq TO baloch_app;
CREATE FUNCTION next_project_code() RETURNS text LANGUAGE sql VOLATILE AS $$
 SELECT 'P-' || repeat('0', greatest(0, 3-length(n))) || n
 FROM (SELECT nextval('project_number_seq')::text AS n) number;
$$;
GRANT EXECUTE ON FUNCTION next_project_code() TO baloch_app;
ALTER TABLE projects ADD COLUMN code text UNIQUE NOT NULL DEFAULT next_project_code(),
 ADD COLUMN details jsonb NOT NULL DEFAULT '{}',
 ADD COLUMN draft boolean NOT NULL DEFAULT true;
CREATE TABLE project_code_reservations (
 code text PRIMARY KEY DEFAULT next_project_code(),
 owner_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 used boolean NOT NULL DEFAULT false
);
CREATE TABLE project_purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES projects(id),
 details jsonb NOT NULL
);
CREATE TABLE project_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES projects(id),
 purchase_id uuid REFERENCES project_purchases(id),
 name text NOT NULL,
 content text NOT NULL
);
