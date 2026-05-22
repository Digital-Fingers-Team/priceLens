-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- pg_trgm enables fast fuzzy text search (used by matching engine)
-- vector enables pgvector for semantic embeddings
-- uuid-ossp provides uuid generation functions