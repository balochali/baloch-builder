-- Sales estimate rows remain separate from the ledger and are retained when removed.
ALTER TABLE project_workbook_rows DROP CONSTRAINT project_workbook_rows_sheet_check;
ALTER TABLE project_workbook_rows ADD CONSTRAINT project_workbook_rows_sheet_check
  CHECK (sheet IN ('partners','construction','estimate','flats','sales_estimate'));
ALTER TABLE project_workbook_rows DROP CONSTRAINT workbook_estimate_removal;
ALTER TABLE project_workbook_rows ADD CONSTRAINT workbook_estimate_removal
  CHECK (NOT removed OR sheet IN ('estimate','sales_estimate'));
