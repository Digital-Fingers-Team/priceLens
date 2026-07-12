-- title_embedding was never populated (dimension 1536, sized for OpenAI embeddings).
-- Switching to nomic-embed-text (768 dims) for local, no-API-key embedding generation.
ALTER TABLE "canonical_products" ALTER COLUMN "title_embedding" TYPE vector(768);
