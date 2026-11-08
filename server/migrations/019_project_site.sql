CREATE TABLE parties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 type text NOT NULL CHECK (type IN ('seller','client','supplier','contractor','other')),
 phone text NOT NULL DEFAULT '',
 address text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT ''
);
