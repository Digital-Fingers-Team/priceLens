-- Bank-card installments with a published tenor, fee and (where stated) end date. Checked 2026-10-03.
--  * CIB credit cards at noon.com: 0% interest, one-time admin fee 6/11/17/22/33% for 6/12/18/24/36 months,
--    minimum EGP 500, valid until 2026-12-31 (CIB offers page).
--  * Banque Misr credit cards at Amazon.eg: 0% interest, one-time processing fee 7/10/13/16/27/36% for
--    3/6/9/12/24/36 months with minimums of EGP 1,000 / 2,000 / 2,000 / 2,000 / 3,000 / 4,000
--    (Amazon.eg "Bank Installments" help page; no end date is stated, so none is set).
-- Idempotent. Run: podman exec -i pricelens-postgres psql -U pricelens -d pricelens -v ON_ERROR_STOP=1 < scripts/sql/seed-installments-banks.sql
BEGIN;
DELETE FROM installment_plans WHERE source_url IN ('https://www.cibeg.com/en/personal/cib-offers', 'https://www.amazon.eg/-/en/gp/help/customer/display.html?nodeId=202054460');

INSERT INTO installment_plans (id, provider, kind, months, markup_pct, admin_fee_pct, admin_fee_flat, down_payment_pct, min_amount, platform_ids, valid_until, source_url, notes, is_active, created_at, updated_at)
SELECT gen_random_uuid()::text, 'CIB', 'BANK_CARD', t.m, 0, t.fee, 0, 0, 500, ARRAY[(SELECT id FROM platforms WHERE slug = 'noon')], '2026-12-31 23:59:59',
       'https://www.cibeg.com/en/personal/cib-offers', 'CIB credit cards at noon.com, 0% interest, one-time admin fee. The card needs the full purchase value available.', true, now(), now()
FROM (VALUES (6, 6), (12, 11), (18, 17), (24, 22), (36, 33)) AS t(m, fee)
WHERE EXISTS (SELECT 1 FROM platforms WHERE slug = 'noon');

INSERT INTO installment_plans (id, provider, kind, months, markup_pct, admin_fee_pct, admin_fee_flat, down_payment_pct, min_amount, platform_ids, valid_until, source_url, notes, is_active, created_at, updated_at)
SELECT gen_random_uuid()::text, 'Banque Misr', 'BANK_CARD', t.m, 0, t.fee, 0, 0, t.minimum, ARRAY[(SELECT id FROM platforms WHERE slug = 'amazon')], NULL,
       'https://www.amazon.eg/-/en/gp/help/customer/display.html?nodeId=202054460', 'Banque Misr credit cards at Amazon.eg, 0% interest, one-time processing fee.', true, now(), now()
FROM (VALUES (3, 7, 1000), (6, 10, 2000), (9, 13, 2000), (12, 16, 2000), (24, 27, 3000), (36, 36, 4000)) AS t(m, fee, minimum)
WHERE EXISTS (SELECT 1 FROM platforms WHERE slug = 'amazon');
COMMIT;
