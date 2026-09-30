-- Keep clearing loans and their repayment history atomic.
CREATE TRIGGER udhaar_delete_payments BEFORE DELETE ON udhaars
BEGIN
  DELETE FROM udhaar_payments WHERE udhaar_id = OLD.id;
END;
