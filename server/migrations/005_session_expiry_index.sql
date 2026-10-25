-- Keep startup/login cleanup bounded by the expired subset.
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
