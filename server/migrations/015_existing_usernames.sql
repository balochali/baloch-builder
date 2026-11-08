-- Preserve existing identities and assign a unique login name to older accounts.
DO $$
DECLARE account record; candidate text;
BEGIN
  FOR account IN SELECT id,email FROM users WHERE username IS NULL ORDER BY created_at,id LOOP
    candidate := split_part(account.email, '@', 1);
    IF candidate !~ '^[a-z0-9_.-]{3,64}$' OR EXISTS (SELECT 1 FROM users WHERE username=candidate) THEN
      candidate := 'user-' || account.id::text;
    END IF;
    PERFORM set_config('app.actor_id', account.id::text, true);
    UPDATE users SET username=candidate WHERE id=account.id;
  END LOOP;
END $$;
