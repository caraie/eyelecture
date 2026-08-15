-- Runs once, the first time the postgres volume is created.
-- The migration re-creates these with IF NOT EXISTS, so a database provisioned
-- elsewhere (Cloud SQL, Neon, Supabase) still ends up in the same state.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Vector search. Enabled from day one so adding embedding columns later is a
-- plain ALTER TABLE instead of a privileged migration on a live database.
CREATE EXTENSION IF NOT EXISTS "vector";
