-- Reconciliation merges become reversible, and the AI judge's answers are kept
-- so each pair of titles is asked once.

CREATE TABLE "product_merges" (
    "id" TEXT NOT NULL,
    "kept_product_id" TEXT NOT NULL,
    "merged_product_id" TEXT NOT NULL,
    "kept_title" TEXT NOT NULL,
    "merged_title" TEXT NOT NULL,
    "merged_snapshot" JSONB NOT NULL,
    "moved_listing_ids" TEXT[],
    "moved_alert_ids" TEXT[],
    "moved_review_item_ids" TEXT[],
    "moved_watchlist_item_ids" TEXT[],
    "dropped_watcher_user_ids" TEXT[],
    "decided_by" VARCHAR(16) NOT NULL,
    "ai_verdict" BOOLEAN,
    "reviewed_at" TIMESTAMP(3),
    "undone_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_merges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_merges_ai_verdict_undone_at_created_at_idx" ON "product_merges"("ai_verdict", "undone_at", "created_at");
CREATE INDEX "product_merges_kept_product_id_idx" ON "product_merges"("kept_product_id");

CREATE TABLE "match_judgements" (
    "id" TEXT NOT NULL,
    "pair_key" VARCHAR(64) NOT NULL,
    "title_a" TEXT NOT NULL,
    "title_b" TEXT NOT NULL,
    "same" BOOLEAN NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_judgements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "match_judgements_pair_key_key" ON "match_judgements"("pair_key");
