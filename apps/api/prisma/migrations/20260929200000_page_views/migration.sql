-- Site analytics for the admin dashboard (owner, 2026-09-29): one row per
-- page a visitor opened, sent by the web tracker. Anonymous: a random id kept
-- in the visitor's browser; no IP address and no account.
CREATE TABLE "page_views" (
    "id" TEXT NOT NULL,
    "visitor_id" VARCHAR(36) NOT NULL,
    "session_id" VARCHAR(36) NOT NULL,
    "path" VARCHAR(512) NOT NULL,
    "route" VARCHAR(16) NOT NULL,
    "product_slug" VARCHAR(255),
    "category_slug" VARCHAR(255),
    "search_query" VARCHAR(200),
    "search_total" INTEGER,
    "locale" VARCHAR(5) NOT NULL,
    "referrer_host" VARCHAR(255),
    "device" VARCHAR(8) NOT NULL,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "page_views_created_at_idx" ON "page_views"("created_at");
CREATE INDEX "page_views_route_created_at_idx" ON "page_views"("route", "created_at");
