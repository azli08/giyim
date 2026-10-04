const express = require("express");
const pool = require("./db");

const app = express();

app.use(express.json());

app.get("/api/health", (request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/products", async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, slug, description
       FROM products
       WHERE is_active = TRUE
       ORDER BY name`
    );

    response.json(result.rows);
  } catch (error) {
    console.error("Ürün sorgusu başarısız:", error);
    response.status(500).json({ error: "Sunucu hatası" });
  }
});

app.get("/api/products/:id", async (request, response) => {
  const productId = request.params.id;

  if (!/^[1-9]\d*$/.test(productId)) {
    return response.status(400).json({
      error: "Ürün kimliği pozitif bir tam sayı olmalı.",
    });
  }

  try {
    const productResult = await pool.query(
      `SELECT id, name, slug, description
       FROM products
       WHERE id = $1 AND is_active = TRUE`,
      [productId]
    );

    if (productResult.rows.length === 0) {
      return response.status(404).json({ error: "Ürün bulunamadı." });
    }

    const variantsResult = await pool.query(
      `SELECT sku, size, color, price, stock_quantity
       FROM product_variants
       WHERE product_id = $1 AND is_active = TRUE
       ORDER BY size`,
      [productId]
    );

    response.json({
      ...productResult.rows[0],
      variants: variantsResult.rows,
    });
  } catch (error) {
    console.error("Ürün detayı sorgusu başarısız:", error);
    response.status(500).json({ error: "Sunucu hatası" });
  }
});

app.post("/api/products", async (request, response) => {
  const { name, slug, description = "", categoryId = null } =
    request.body ?? {};

  if (
    typeof name !== "string" ||
    name.trim() === "" ||
    typeof slug !== "string" ||
    slug.trim() === "" ||
    typeof description !== "string"
  ) {
    return response.status(400).json({
      error: "name ve slug gerekli; description metin olmalı.",
    });
  }

  if (
    categoryId !== null &&
    (!Number.isSafeInteger(categoryId) || categoryId < 1)
  ) {
    return response.status(400).json({
      error: "categoryId pozitif bir tam sayı olmalı.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products (category_id, name, slug, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, description, category_id`,
      [categoryId, name.trim(), slug.trim(), description.trim()]
    );

    response.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return response.status(409).json({
        error: "Bu slug zaten kullanılıyor.",
      });
    }

    if (error.code === "23503") {
      return response.status(400).json({
        error: "Belirtilen kategori bulunamadı.",
      });
    }

    console.error("Ürün ekleme başarısız:", error);
    response.status(500).json({ error: "Sunucu hatası" });
  }
});

app.post("/api/products/:id/variants", async (request, response) => {
  const productId = request.params.id;
  const { sku, size, color, price, stockQuantity = 0 } =
    request.body ?? {};

  if (!/^[1-9]\d*$/.test(productId)) {
    return response.status(400).json({
      error: "Ürün kimliği pozitif bir tam sayı olmalı.",
    });
  }

  if (
    typeof sku !== "string" ||
    sku.trim() === "" ||
    typeof size !== "string" ||
    size.trim() === "" ||
    typeof color !== "string" ||
    color.trim() === ""
  ) {
    return response.status(400).json({
      error: "sku, size ve color alanları gerekli.",
    });
  }

  if (typeof price !== "string" || !/^\d+(\.\d{1,2})?$/.test(price)) {
    return response.status(400).json({
      error: "price, en fazla iki ondalık basamaklı pozitif bir metin olmalı.",
    });
  }

  if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0) {
    return response.status(400).json({
      error: "stockQuantity sıfır veya daha büyük bir tam sayı olmalı.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO product_variants
         (product_id, sku, size, color, price, stock_quantity)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, product_id, sku, size, color, price, stock_quantity`,
      [
        productId,
        sku.trim(),
        size.trim(),
        color.trim(),
        price,
        stockQuantity,
      ]
    );

    response.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return response.status(409).json({
        error: "Bu SKU veya ürün-beden-renk kombinasyonu zaten var.",
      });
    }

    if (error.code === "23503") {
      return response.status(404).json({
        error: "Ürün bulunamadı.",
      });
    }

    console.error("Varyant ekleme başarısız:", error);
    response.status(500).json({ error: "Sunucu hatası" });
  }
});

app.get("/api/products/:id/variants", async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT sku, size, color, price, stock_quantity
       FROM product_variants
       WHERE product_id = $1 AND is_active = TRUE
       ORDER BY size`,
      [request.params.id]
    );

    response.json(result.rows);
  } catch (error) {
    console.error("Varyant sorgusu başarısız:", error);
    response.status(500).json({ error: "Sunucu hatası" });
  }
});

app.patch("/api/variants/:sku/stock", async (request, response) => {
  const { stockQuantity } = request.body ?? {};

  if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0) {
    return response.status(400).json({
      error: "stockQuantity sıfır veya daha büyük bir tam sayı olmalı.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE product_variants
       SET stock_quantity = $1
       WHERE sku = $2
       RETURNING sku, size, color, stock_quantity`,
      [stockQuantity, request.params.sku]
    );

    if (result.rows.length === 0) {
      return response.status(404).json({ error: "Varyant bulunamadı." });
    }

    response.json(result.rows[0]);
  } catch (error) {
    console.error("Stok güncelleme başarısız:", error);
    response.status(500).json({ error: "Sunucu hatası" });
  }
});

app.use((request, response) => {
  response.status(404).json({ error: "Bulunamadı" });
});

app.listen(3000, () => {
  console.log("Sunucu http://localhost:3000 adresinde çalışıyor.");
});