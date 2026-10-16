const { readFile } = require("node:fs/promises");
const path = require("node:path");
const pool = require("./db");

const requiredColumns = [
  "name",
  "slug",
  "category",
  "description",
  "variants",
  "image_url",
  "image_alt",
];

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;
  const text = csvText.replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === "," && !insideQuotes) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (insideQuotes) throw new Error("CSV içinde kapatılmamış tırnak bulundu.");
  if (field || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== "")) rows.push(row);
  }

  if (rows.length < 2) throw new Error("CSV dosyasında ürün satırı bulunamadı.");
  const headers = rows[0].map((header) => header.trim());
  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`CSV sütunları eksik: ${missingColumns.join(", ")}`);
  }

  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV satır ${index + 2}: sütun sayısı başlıklarla eşleşmiyor.`);
    }
    return Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex]]));
  });
}

function validateProducts(rows) {
  const seenSlugs = new Set();
  const seenSkus = new Set();

  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const slug = row.slug?.trim();
    if (!row.name?.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "")) {
      throw new Error(`CSV satır ${rowNumber}: ürün adı veya slug geçersiz.`);
    }
    if (!row.category?.trim() || !row.description?.trim()) {
      throw new Error(`CSV satır ${rowNumber}: kategori ve açıklama gerekli.`);
    }
    if (seenSlugs.has(slug)) throw new Error(`CSV içinde tekrar eden ürün slug değeri: ${slug}`);
    seenSlugs.add(slug);

    let variants;
    try {
      variants = JSON.parse(row.variants);
    } catch {
      throw new Error(`CSV satır ${rowNumber}: variants alanındaki JSON geçersiz.`);
    }
    if (!Array.isArray(variants) || variants.length === 0 || variants.length > 30) {
      throw new Error(`CSV satır ${rowNumber}: bir ile 30 arasında varyant gerekli.`);
    }

    for (const variant of variants) {
      const price = Number(variant.price);
      if (
        typeof variant.sku !== "string" ||
        !/^[A-Za-z0-9._-]{2,80}$/.test(variant.sku.trim()) ||
        typeof variant.size !== "string" || !variant.size.trim() ||
        typeof variant.color !== "string" || !variant.color.trim() ||
        !Number.isFinite(price) || price < 0 || Math.abs(price * 100 - Math.round(price * 100)) > 1e-7 ||
        !Number.isSafeInteger(variant.stock) || variant.stock < 0 || variant.stock > 2147483647
      ) {
        throw new Error(`CSV satır ${rowNumber}: varyant alanlarını kontrol edin.`);
      }
      if (seenSkus.has(variant.sku)) throw new Error(`CSV içinde tekrar eden SKU değeri: ${variant.sku}`);
      seenSkus.add(variant.sku);
    }

    const imageUrl = row.image_url?.trim() || "";
    if (imageUrl && !/^https?:\/\//i.test(imageUrl) && !/^(?:\/(?!\/)|\.\/)/.test(imageUrl)) {
      throw new Error(`CSV satır ${rowNumber}: görsel bağlantısı http(s) veya site içi yol olmalı.`);
    }

    return {
      name: row.name.trim(),
      slug,
      category: row.category.trim(),
      description: row.description.trim(),
      variants,
      imageUrl,
      imageAlt: row.image_alt?.trim() || "",
    };
  });
}

async function importProducts() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    throw new Error('CSV dosyasının yolunu verin: npm run db:import -- "dosya.csv"');
  }

  const resolvedCsvPath = path.resolve(csvPath);
  const rows = parseCsv(await readFile(resolvedCsvPath, "utf8"));
  const products = validateProducts(rows);
  if (process.argv.includes("--dry-run")) {
    console.log(`CSV kontrolü başarılı: ${products.length} ürün, ${products.reduce((count, product) => count + product.variants.length, 0)} varyant.`);
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const categoryNames = [...new Set(products.map((product) => product.category))];
    const categoryResult = await client.query(
      "SELECT id, name FROM categories WHERE name = ANY($1::text[])",
      [categoryNames]
    );
    const categoryIds = new Map(categoryResult.rows.map((category) => [category.name, category.id]));
    const missingCategories = categoryNames.filter((name) => !categoryIds.has(name));
    if (missingCategories.length > 0) {
      throw new Error(`Veritabanında kategori bulunamadı: ${missingCategories.join(", ")}`);
    }

    let importedCount = 0;
    let skippedCount = 0;
    for (const product of products) {
      const result = await client.query(
        `INSERT INTO products (category_id, name, slug, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO NOTHING
         RETURNING id`,
        [categoryIds.get(product.category), product.name, product.slug, product.description]
      );
      if (result.rows.length === 0) {
        skippedCount += 1;
        continue;
      }

      const productId = result.rows[0].id;
      for (const variant of product.variants) {
        await client.query(
          `INSERT INTO product_variants
             (product_id, sku, size, color, price, stock_quantity)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [productId, variant.sku.trim(), variant.size.trim(), variant.color.trim(), String(variant.price), variant.stock]
        );
      }

      if (product.imageUrl) {
        await client.query(
          `INSERT INTO product_images (product_id, image_url, alt_text)
           VALUES ($1, $2, $3)`,
          [productId, product.imageUrl, product.imageAlt]
        );
      }
      importedCount += 1;
    }

    await client.query("COMMIT");
    console.log(`CSV aktarımı tamamlandı: ${importedCount} ürün eklendi, ${skippedCount} mevcut slug atlandı.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

importProducts().catch(async (error) => {
  console.error("CSV ürün aktarımı başarısız:", error.stack || error.message || error);
  process.exitCode = 1;
  await pool.end();
});
