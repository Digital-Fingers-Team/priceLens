-- Phase 04 (S-05): marks sessions revoked by refresh-token rotation.
ALTER TABLE "sessions" ADD COLUMN "rotated_at" TIMESTAMP(3);
