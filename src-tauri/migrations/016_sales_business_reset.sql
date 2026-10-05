DROP TRIGGER IF EXISTS reset_business_data;
CREATE TRIGGER reset_business_data AFTER INSERT ON business_reset_requests
BEGIN
  DELETE FROM udhaar_payments;
  DELETE FROM udhaars;
  DELETE FROM transactions;
  DELETE FROM personal_expenses;
  DELETE FROM partnerships;
  DELETE FROM partners;
  DELETE FROM project_sales;
  DELETE FROM land;
  DELETE FROM project_estimates;
  DELETE FROM project_building_details;
  DELETE FROM project_milestones;
  DELETE FROM projects;
  DELETE FROM contacts;
  DELETE FROM documents;
  DELETE FROM notes;
  DELETE FROM custom_field_defs;
  DELETE FROM audit_log;
  DELETE FROM business_reset_requests WHERE id = NEW.id;
END;
