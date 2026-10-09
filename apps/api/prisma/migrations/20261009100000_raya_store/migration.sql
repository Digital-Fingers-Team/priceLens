-- Data: Raya Shop (Magento GraphQL on its API host, plain HTTP). A chain with
-- branches, like B.TECH and 2B. Idempotent.
INSERT INTO "platforms" ("id", "slug", "name", "base_url", "connector_type", "is_active", "rate_limit", "kind", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'raya', 'Raya Shop', 'https://www.rayashop.com', 'HTTP_API', true, 60, 'OFFLINE_CHAIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "kind" = 'OFFLINE_CHAIN';
