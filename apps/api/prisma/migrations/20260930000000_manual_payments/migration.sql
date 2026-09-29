-- Wallet / InstaPay payments confirmed by the owner (2026-09-29): the business
-- is not registered, so no card gateway. See ManualPayment in schema.prisma.
CREATE TYPE "ManualPaymentStatus" AS ENUM ('AWAITING_PAYMENT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ManualPaymentMethod" AS ENUM ('WALLET', 'INSTAPAY');

CREATE TABLE "manual_payments" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "ManualPaymentStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "method" "ManualPaymentMethod",
    "reference" VARCHAR(64),
    "payer_account" VARCHAR(64),
    "submitted_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "manual_payments_code_key" ON "manual_payments"("code");
CREATE INDEX "manual_payments_user_id_status_idx" ON "manual_payments"("user_id", "status");
CREATE INDEX "manual_payments_status_submitted_at_idx" ON "manual_payments"("status", "submitted_at");

-- One open order per user, so a double click never makes two.
CREATE UNIQUE INDEX "manual_payments_one_open_per_user" ON "manual_payments"("user_id")
    WHERE "status" IN ('AWAITING_PAYMENT', 'SUBMITTED');

-- A receipt counts once: the same transfer reference cannot be claimed by a
-- second order (someone else's screenshot, or the same one twice).
CREATE UNIQUE INDEX "manual_payments_reference_once" ON "manual_payments"("method", "reference")
    WHERE "reference" IS NOT NULL AND "status" IN ('SUBMITTED', 'APPROVED');

ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
