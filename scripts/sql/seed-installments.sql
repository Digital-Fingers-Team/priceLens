-- Bank-card installments published by Noon Egypt (helpegypt.noon.com "Easy installments",
-- checked 2026-10-03): NBE and ALEXBANK offer 6-month plans with no interest on orders of
-- 500 EGP or more. Bank processing fees are not published there, so none are entered.
-- CIB is left out on purpose: Noon says "interest starts at 8.6%" for 6-36 months while CIB's
-- own offers page speaks of 0% with admin fees, so the terms need the bank's schedule.
-- Idempotent. Run: podman exec -i pricelens-postgres psql -U pricelens -d pricelens -v ON_ERROR_STOP=1 < scripts/sql/seed-installments.sql
BEGIN;
DELETE FROM installment_plans WHERE source_url = 'https://helpegypt.noon.com/portal/en/kb/articles/easy-installments-everything-you-need-to-know-6-3-2024';
INSERT INTO installment_plans (id, provider, kind, months, markup_pct, admin_fee_pct, admin_fee_flat, down_payment_pct, min_amount, platform_ids, source_url, notes, is_active, created_at, updated_at)
SELECT gen_random_uuid()::text, bank, 'BANK_CARD', 6, 0, 0, 0, 0, 500, ARRAY[(SELECT id FROM platforms WHERE slug = 'noon')],
       'https://helpegypt.noon.com/portal/en/kb/articles/easy-installments-everything-you-need-to-know-6-3-2024',
       'At Noon, 6 months, no interest, orders of 500 EGP or more. Bank fees and your credit limit apply.', true, now(), now()
FROM (VALUES ('NBE'), ('ALEXBANK')) AS banks(bank)
WHERE EXISTS (SELECT 1 FROM platforms WHERE slug = 'noon');
COMMIT;
