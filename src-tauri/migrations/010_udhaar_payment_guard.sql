CREATE TRIGGER udhaar_payment_balance_guard BEFORE INSERT ON udhaar_payments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM udhaars u WHERE u.id = NEW.udhaar_id AND u.archived = 0
      AND NEW.paid_date >= u.given_date
      AND NEW.amount <= u.amount - COALESCE((
        SELECT SUM(p.amount) FROM udhaar_payments p WHERE p.udhaar_id = u.id AND p.archived = 0
      ), 0)
  ) THEN RAISE(ABORT, 'Loan balance changed or repayment date is invalid. Refresh and try again.') END;
END;
