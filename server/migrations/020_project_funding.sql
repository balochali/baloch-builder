CREATE TABLE accounts (
 code text PRIMARY KEY, name text NOT NULL, class text NOT NULL,
 is_system boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true
);
INSERT INTO accounts(code,name,class,is_system) VALUES
('1000','Cash on Hand','Asset',true),('1010','Bank','Asset',true),('1100','Trade Receivables','Asset',true),
('1200','Construction Materials Inventory','Asset',true),('1300','Prepaid Expenses','Asset',true),
('1400','Land & Property Under Development','Asset',true),('1500','Equipment Net','Asset',true),
('2000','Trade Payables','Liability',true),('2010','Land Payable','Liability',true),('2100','Accrued Expenses','Liability',true),
('2200','Client Advances','Liability',true),('2300','Loans Payable','Liability',true),
('3000','Owner / Partners'' Capital','Equity',true),('3100','Owner Drawings / Distributions','Equity',true),
('4000','Construction Revenue','Revenue',true),('5000','Materials Consumed','Cost of Sales',true),('5100','Site Labour','Cost of Sales',true),
('5200','Subcontractors','Cost of Sales',true),('5300','Site Overheads','Cost of Sales',true),
('6000','Office Administration','Expense',true),('6100','Depreciation Expense','Expense',true),('6200','Finance Cost / Loan Markup','Expense',true);
REVOKE INSERT,UPDATE ON accounts FROM baloch_app;
ALTER TABLE parties DROP CONSTRAINT parties_type_check;
ALTER TABLE parties ADD CONSTRAINT parties_type_check CHECK (type IN ('seller','client','supplier','contractor','lender','other'));
CREATE TABLE partners (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, role text NOT NULL CHECK(role IN ('Owner','Partner')),
 profile jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Exited')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX partner_name_unique ON partners(lower(btrim(name)));
CREATE UNIQUE INDEX one_owner ON partners(role) WHERE role='Owner';
INSERT INTO partners(name,role) VALUES('Owner','Owner');
CREATE TABLE partner_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES partners(id), name text NOT NULL, content text NOT NULL
);
INSERT INTO partners(name,role)
SELECT DISTINCT ON (lower(btrim(p->>'name'))) btrim(p->>'name'),'Partner'
FROM projects CROSS JOIN LATERAL jsonb_array_elements(coalesce(details->'feasibility'->'partners','[]'::jsonb)) p
WHERE btrim(p->>'name')<>'' AND lower(btrim(p->>'name'))<>'owner'
ORDER BY lower(btrim(p->>'name')), btrim(p->>'name')
ON CONFLICT DO NOTHING;
WITH mapped AS (
 SELECT j.id, jsonb_agg(CASE WHEN p.id IS NULL THEN f.value ELSE f.value || jsonb_build_object('partnerId',p.id) END ORDER BY f.ordinality) AS rows
 FROM projects j CROSS JOIN LATERAL jsonb_array_elements(coalesce(j.details->'feasibility'->'partners','[]'::jsonb)) WITH ORDINALITY f
 LEFT JOIN partners p ON lower(btrim(f.value->>'name'))=lower(p.name) GROUP BY j.id
)
UPDATE projects j SET details=jsonb_set(j.details,'{feasibility,partners}',mapped.rows)
FROM mapped WHERE mapped.id=j.id;
CREATE SEQUENCE journal_voucher_number;
GRANT USAGE ON SEQUENCE journal_voucher_number TO baloch_app;
CREATE TABLE journal_vouchers (
 id text PRIMARY KEY, date date NOT NULL, project_id uuid REFERENCES projects(id), narration text NOT NULL,
 type text NOT NULL CHECK(type IN ('regular','adjustment','reversal')), status text NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')),
 source jsonb NOT NULL, reversal_of text UNIQUE REFERENCES journal_vouchers(id), created_at timestamptz NOT NULL DEFAULT now(), voided_at timestamptz
);
CREATE TABLE journal_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id text NOT NULL REFERENCES journal_vouchers(id), account_code text NOT NULL REFERENCES accounts(code),
 debit bigint NOT NULL, credit bigint NOT NULL, party_id uuid REFERENCES parties(id), partner_id uuid REFERENCES partners(id),
 project_id uuid REFERENCES projects(id), memo text NOT NULL DEFAULT '', CHECK ((debit>0 AND credit=0) OR (credit>0 AND debit=0))
);
REVOKE UPDATE ON journal_lines FROM baloch_app;
CREATE INDEX journal_lines_project ON journal_lines(project_id);
CREATE INDEX journal_lines_partner ON journal_lines(partner_id);
CREATE INDEX journal_lines_voucher ON journal_lines(voucher_id);
CREATE TABLE project_partner_links (project_id uuid REFERENCES projects(id), partner_id uuid REFERENCES partners(id), PRIMARY KEY(project_id,partner_id));
CREATE TABLE project_money_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id),
 direction text NOT NULL CHECK(direction IN ('in','out')), data jsonb NOT NULL,
 voucher_id text NOT NULL UNIQUE REFERENCES journal_vouchers(id), status text NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')),
 attachment_id uuid REFERENCES project_files(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_money_entries_project ON project_money_entries(project_id);
