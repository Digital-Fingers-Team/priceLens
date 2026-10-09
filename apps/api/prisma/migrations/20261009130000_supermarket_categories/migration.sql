-- Supermarket department (seed/datasets/categoryTree.ts), 2026-10-09, for the
-- grocery chains now that the price floor is 0. Wave 4 (live). Idempotent.
INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
VALUES (gen_random_uuid()::text, 'groceries', 'Supermarket', 'سوبر ماركت', NULL, 0, ARRAY[]::text[], 0)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'milk-dairy', 'Milk & Yogurt', 'حليب وزبادي', p."id", 1, ARRAY['milk', 'long life milk', 'yogurt', 'حليب', 'لبن', 'زبادي'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'cheese-butter', 'Cheese & Butter', 'جبن وزبدة', p."id", 1, ARRAY['cheese', 'butter', 'cream cheese', 'جبنة', 'زبدة'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'coffee', 'Instant & Ground Coffee', 'قهوة', p."id", 1, ARRAY['instant coffee', 'ground coffee', 'coffee beans', 'نسكافيه', 'قهوة', 'بن'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'tea', 'Tea', 'شاي', p."id", 1, ARRAY['tea bags', 'loose tea', 'green tea', 'شاي'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'cooking-oil', 'Cooking Oil', 'زيت طعام', p."id", 1, ARRAY['sunflower oil', 'olive oil', 'corn oil', 'زيت عباد الشمس', 'زيت زيتون'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'rice-pasta', 'Rice & Pasta', 'أرز ومكرونة', p."id", 1, ARRAY['rice', 'pasta', 'spaghetti', 'أرز', 'رز', 'مكرونة'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'sugar-flour', 'Sugar & Flour', 'سكر ودقيق', p."id", 1, ARRAY['sugar', 'flour', 'brown sugar', 'سكر', 'دقيق'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'canned-food', 'Canned Food', 'معلبات', p."id", 1, ARRAY['canned tuna', 'canned beans', 'tomato paste', 'تونة', 'فول معلب', 'صلصة'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'snacks-chocolate', 'Chocolate & Snacks', 'شوكولاتة وسناكس', p."id", 1, ARRAY['chocolate', 'potato chips', 'biscuits', 'شوكولاتة', 'شيبسي', 'بسكويت'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'soft-drinks-juice', 'Soft Drinks & Juice', 'مشروبات وعصائر', p."id", 1, ARRAY['soft drink', 'cola', 'fruit juice', 'عصير', 'مياه غازية', 'بيبسي'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'bottled-water', 'Bottled Water', 'مياه معدنية', p."id", 1, ARRAY['mineral water', 'bottled water', 'sparkling water', 'مياه معدنية'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'laundry-cleaning', 'Laundry & Cleaning', 'منظفات', p."id", 1, ARRAY['laundry detergent', 'dishwashing liquid', 'fabric softener', 'مسحوق غسيل', 'منظف', 'سائل غسيل أطباق'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'toiletries', 'Shampoo, Soap & Toothpaste', 'شامبو وصابون ومعجون أسنان', p."id", 1, ARRAY['shampoo', 'toothpaste', 'deodorant', 'شامبو', 'صابون', 'معجون أسنان'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'tissues-paper', 'Tissues & Toilet Paper', 'مناديل', p."id", 1, ARRAY['tissues', 'toilet paper', 'kitchen towels', 'مناديل', 'مناديل حمام'], 4
FROM "categories" p WHERE p."slug" = 'groceries'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave")
SELECT gen_random_uuid()::text, 'diapers-formula', 'Diapers & Baby Formula', 'حفاضات ولبن أطفال', p."id", 1, ARRAY['baby diapers', 'baby formula', 'baby wipes', 'حفاضات', 'بامبرز', 'لبن أطفال'], 4
FROM "categories" p WHERE p."slug" = 'baby'
ON CONFLICT ("slug") DO NOTHING;
