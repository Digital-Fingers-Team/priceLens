-- QNB Egypt credit cards at ELARABY (stores and online): 6 or 12 months, 0% down payment,
-- 0% interest, 0% admin fees; EGP 1,000 minimum, EGP 100,000 maximum; until 2026-12-31.
-- Source: QNB Egypt campaign terms (qnbleasing.com.eg ... /document/en/enelaraby), checked 2026-10-03.
-- Idempotent. Run: podman exec -i pricelens-postgres psql -U pricelens -d pricelens -v ON_ERROR_STOP=1 < scripts/sql/seed-installments-qnb.sql
BEGIN;
DELETE FROM installment_plans WHERE source_url = 'https://www.qnbleasing.com.eg/sites/qnb/qnbegypt/document/en/enelaraby';
INSERT INTO installment_plans (id, provider, kind, months, markup_pct, admin_fee_pct, admin_fee_flat, down_payment_pct, min_amount, max_amount, platform_ids, valid_until, source_url, notes, is_active, created_at, updated_at)
SELECT gen_random_uuid()::text, 'QNB', 'BANK_CARD', m, 0, 0, 0, 0, 1000, 100000, ARRAY[(SELECT id FROM platforms WHERE slug = 'elaraby')], '2026-12-31 23:59:59', 'https://www.qnbleasing.com.eg/sites/qnb/qnbegypt/document/en/enelaraby',
       'QNB Egypt Visa (Gold, Platinum, Signature, Infinite) and Mastercard (Standard, Titanium, World Elite). Send "Elaraby" by SMS to 1177 after the purchase.', true, now(), now()
FROM (VALUES (6), (12)) AS t(m)
WHERE EXISTS (SELECT 1 FROM platforms WHERE slug = 'elaraby');
COMMIT;
