ALTER TABLE products
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC(12, 2)
    CHECK (compare_at_price IS NULL OR compare_at_price >= price);

UPDATE products p
SET gender = CASE
  WHEN c.slug = 'kiz-cocuk' OR p.slug LIKE 'kiz-%' THEN 'girl'
  WHEN c.slug = 'erkek-cocuk' OR p.slug LIKE 'erkek-%' THEN 'boy'
  WHEN p.slug LIKE '%renkli-gunler%' OR p.slug LIKE '%sonbahar-rahatligi%' THEN 'girl'
  ELSE 'boy'
END,
is_new = (c.slug = 'yeni-gelenler')
FROM categories c
WHERE c.id = p.category_id AND (p.gender IS NULL OR c.slug IN ('yeni-gelenler', 'indirim'));

UPDATE product_variants v
SET compare_at_price = round(v.price * 1.20, 2)
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE v.product_id = p.id AND c.slug = 'indirim'
  AND v.compare_at_price IS NULL;

-- Demo sizes deliberately include unavailable variants so the storefront can
-- exercise sold-out display and prevent adding zero-stock items to the cart.
UPDATE product_variants v
SET stock_quantity = CASE
  WHEN v.size = '2-3' THEN 0
  ELSE 8
END
FROM products p
WHERE v.product_id = p.id AND p.slug IN (
  'erkek-minik-kasif-takimi',
  'erkek-doga-kasifi-kombini',
  'erkek-rahat-oyun-saati'
) AND v.stock_quantity = 10;

ALTER TABLE addresses ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'TR';
