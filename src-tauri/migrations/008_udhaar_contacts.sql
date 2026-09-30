ALTER TABLE udhaars ADD COLUMN contact_id TEXT REFERENCES contacts(id);
CREATE INDEX idx_udhaars_contact ON udhaars(contact_id);

-- Only link historical records when both name and phone identify one contact.
UPDATE udhaars SET contact_id = (
  SELECT c.id FROM contacts c WHERE c.archived = 0
    AND lower(trim(c.name)) = lower(trim(udhaars.borrower_name))
    AND trim(COALESCE(c.phone, '')) = trim(udhaars.phone)
) WHERE trim(COALESCE(phone, '')) <> '' AND (
  SELECT COUNT(*) FROM contacts c WHERE c.archived = 0
    AND lower(trim(c.name)) = lower(trim(udhaars.borrower_name))
    AND trim(COALESCE(c.phone, '')) = trim(udhaars.phone)
) = 1;

-- A new borrower and loan are saved together in the same SQLite statement.
CREATE TRIGGER udhaar_create_contact AFTER INSERT ON udhaars
WHEN NEW.contact_id IS NULL
BEGIN
  INSERT INTO contacts (id, name, phone, created_at, updated_at)
    VALUES (NEW.id, NEW.borrower_name, NEW.phone, NEW.created_at, NEW.updated_at);
  UPDATE udhaars SET contact_id = NEW.id WHERE id = NEW.id;
END;
