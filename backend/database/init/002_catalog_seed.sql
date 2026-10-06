-- Starter catalog matching the products shown by the static frontend.
INSERT INTO categories (name, slug)
VALUES
  ('Yeni Gelenler', 'yeni-gelenler'),
  ('Kız Çocuk', 'kiz-cocuk'),
  ('Erkek Çocuk', 'erkek-cocuk'),
  ('İndirim', 'indirim')
ON CONFLICT (slug) DO NOTHING;

WITH catalog(category_slug, slug, name, description, image_url, alt_text, price) AS (
  VALUES
    ('yeni-gelenler', 'yeni-gunluk-rahat-kombin', 'Günlük Rahat Kombin', 'Yeni sezon günlük çocuk kombini.', './images/kids-color-pop.jpg', 'Sarı fonda spor kıyafetli çocuk', 649.90::numeric),
    ('yeni-gelenler', 'yeni-minik-kasif-takimi', 'Minik Kaşif Takımı', 'Yeni sezon rahat takım.', './images/kids-matching-outfits.jpg', 'Uyumlu renklerde eşofman giyen iki çocuk', 579.90::numeric),
    ('yeni-gelenler', 'yeni-neseli-hafta-sonu', 'Neşeli Hafta Sonu', 'Hafta sonu için rahat çocuk kombini.', './images/kids-neutral-style.jpg', 'Bej tonlarında rahat kıyafet giyen çocuk', 599.90::numeric),
    ('kiz-cocuk', 'kiz-gunluk-rahat-kombin', 'Günlük Rahat Kombin', 'Kız çocuk günlük kombini.', './images/kids-party-dress.jpg', 'Pembe özel gün elbisesi giyen kız çocuğu', 649.90::numeric),
    ('kiz-cocuk', 'kiz-renkli-sonbahar-stili', 'Renkli Sonbahar Stili', 'Kız çocuk denim kombini.', './images/kids-denim-look.jpg', 'Açık havada denim ceket ve pantolon giyen kız çocuğu', 529.90::numeric),
    ('kiz-cocuk', 'kiz-hafta-sonu-rahatligi', 'Hafta Sonu Rahatlığı', 'Kız çocuk hafta sonu kombini.', './images/pexels-pixabay-301977.jpg', 'Renkli kıyafetlerle açık havada oturan çocuklar', 489.90::numeric),
    ('erkek-cocuk', 'erkek-minik-kasif-takimi', 'Minik Kaşif Takımı', 'Erkek çocuk açık hava kombini.', './images/kids-fashion-boy.jpg', 'Açık havada açık renkli kıyafet giyen erkek çocuk', 579.90::numeric),
    ('erkek-cocuk', 'erkek-doga-kasifi-kombini', 'Doğa Kaşifi Kombini', 'Erkek çocuk sırt çantalı kombini.', './images/kids-backpack.jpg', 'Mavi kazak ve sırt çantasıyla yürüyen çocuk', 549.90::numeric),
    ('erkek-cocuk', 'erkek-rahat-oyun-saati', 'Rahat Oyun Saati', 'Erkek çocuk rahat oyun kombini.', './images/kids-neutral-style.jpg', 'Bej tonlarında rahat kıyafet giyen erkek çocuk', 499.90::numeric),
    ('indirim', 'indirim-neseli-hafta-sonu', 'Neşeli Hafta Sonu', 'İndirimli hafta sonu kombini.', './images/pexels-tanya-gorelova-2199357-3878425.jpg', 'Açık havada oturan çocuk', 599.90::numeric),
    ('indirim', 'indirim-renkli-gunler-kombini', 'Renkli Günler Kombini', 'İndirimli renkli çocuk kombini.', './images/pexels-pixabay-301977.jpg', 'Açık havada renkli kıyafetlerle çocuklar', 479.90::numeric),
    ('indirim', 'indirim-sonbahar-rahatligi', 'Sonbahar Rahatlığı', 'İndirimli sonbahar kombini.', './images/pexels-vika-glitter-392079-1619693.jpg', 'Sonbahar kıyafetleri giyen çocuklar', 449.90::numeric)
), inserted_products AS (
  INSERT INTO products (category_id, name, slug, description)
  SELECT c.id, catalog.name, catalog.slug, catalog.description
  FROM catalog
  JOIN categories c ON c.slug = catalog.category_slug
  ON CONFLICT (slug) DO NOTHING
  RETURNING id, slug
)
INSERT INTO product_images (product_id, image_url, alt_text)
SELECT p.id, catalog.image_url, catalog.alt_text
FROM catalog
JOIN products p ON p.slug = catalog.slug
WHERE NOT EXISTS (
  SELECT 1 FROM product_images pi WHERE pi.product_id = p.id
);

WITH catalog(category_slug, slug, price) AS (
  VALUES
    ('yeni-gelenler', 'yeni-gunluk-rahat-kombin', 649.90::numeric),
    ('yeni-gelenler', 'yeni-minik-kasif-takimi', 579.90::numeric),
    ('yeni-gelenler', 'yeni-neseli-hafta-sonu', 599.90::numeric),
    ('kiz-cocuk', 'kiz-gunluk-rahat-kombin', 649.90::numeric),
    ('kiz-cocuk', 'kiz-renkli-sonbahar-stili', 529.90::numeric),
    ('kiz-cocuk', 'kiz-hafta-sonu-rahatligi', 489.90::numeric),
    ('erkek-cocuk', 'erkek-minik-kasif-takimi', 579.90::numeric),
    ('erkek-cocuk', 'erkek-doga-kasifi-kombini', 549.90::numeric),
    ('erkek-cocuk', 'erkek-rahat-oyun-saati', 499.90::numeric),
    ('indirim', 'indirim-neseli-hafta-sonu', 599.90::numeric),
    ('indirim', 'indirim-renkli-gunler-kombini', 479.90::numeric),
    ('indirim', 'indirim-sonbahar-rahatligi', 449.90::numeric)
), sizes(size) AS (
  VALUES ('2-3'), ('4-5'), ('6-7'), ('8-9')
)
INSERT INTO product_variants (product_id, sku, size, color, price, stock_quantity)
SELECT p.id,
       p.slug || '-' || replace(sizes.size, '-', ''),
       sizes.size,
       'Çok renkli',
       catalog.price,
       10
FROM catalog
JOIN products p ON p.slug = catalog.slug
CROSS JOIN sizes
ON CONFLICT (sku) DO NOTHING;
