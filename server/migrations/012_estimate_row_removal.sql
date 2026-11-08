-- Keep removed estimates for audit history; ledger and other registers are unchanged.
ALTER TABLE project_workbook_rows ADD COLUMN removed boolean NOT NULL DEFAULT false;
ALTER TABLE project_workbook_rows ADD CONSTRAINT workbook_estimate_removal CHECK (NOT removed OR sheet='estimate');
