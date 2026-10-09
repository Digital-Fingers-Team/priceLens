-- Data: stores added 2026-10-09. Idempotent.
INSERT INTO "platforms" ("id", "slug", "name", "base_url", "connector_type", "is_active", "rate_limit", "kind", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'seoudi', 'Seoudi', 'https://seoudisupermarket.com', 'HTTP_API', true, 60, 'GROCERY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "kind" = 'GROCERY';
