-- Runs once, when the dev Postgres volume is first created (docker-compose.yml).
--
-- pg_trgm enables fast fuzzy text search (used by matching engine)
-- vector enables pgvector for semantic embeddings
-- uuid-ossp provides uuid generation functions

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Separate database for the API test suites. Tests refuse to run against any
-- database whose name does not end in "_test" (apps/api/test/setup).
CREATE DATABASE pricelens_test;
\connect pricelens_test
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
