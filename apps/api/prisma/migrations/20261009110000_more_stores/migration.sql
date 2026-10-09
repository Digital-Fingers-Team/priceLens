-- Data: stores added 2026-10-09. Idempotent.
INSERT INTO "platforms" ("id", "slug", "name", "base_url", "connector_type", "is_active", "rate_limit", "kind", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'sigma', 'Sigma Computer', 'https://www.sigma-computer.com', 'HTTP_API', true, 60, 'OFFLINE_CHAIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "kind" = 'OFFLINE_CHAIN';
INSERT INTO "platforms" ("id", "slug", "name", "base_url", "connector_type", "is_active", "rate_limit", "kind", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'homzmart', 'Homzmart', 'https://homzmart.com', 'HTTP_API', true, 60, 'ONLINE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "kind" = 'ONLINE';
INSERT INTO "platforms" ("id", "slug", "name", "base_url", "connector_type", "is_active", "rate_limit", "kind", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'fresh', 'Fresh', 'https://fresh.com.eg', 'HTTP_API', true, 60, 'OFFLINE_CHAIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "kind" = 'OFFLINE_CHAIN';
INSERT INTO "platforms" ("id", "slug", "name", "base_url", "connector_type", "is_active", "rate_limit", "kind", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'samsung', 'Samsung Egypt', 'https://www.samsung.com', 'HTTP_API', true, 60, 'ONLINE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "kind" = 'ONLINE';
