ALTER TABLE users ADD COLUMN username text UNIQUE CHECK (username = lower(username) AND username ~ '^[a-z0-9_.-]{3,64}$');
ALTER TABLE sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
