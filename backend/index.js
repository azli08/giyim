const express = require("express");
const {
  createHash,
  randomBytes,
  scrypt: scryptCallback,
  timingSafeEqual,
} = require("node:crypto");
const { promisify } = require("node:util");
const pool = require("./db");

const app = express();
const scrypt = promisify(scryptCallback);
const sessionCookieName = "moda_session";
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;

const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGIN || "http://localhost:5500,http://127.0.0.1:5500")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const isAllowedOrigin = (origin) =>
  allowedOrigins.has(origin) ||
  (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));

app.use((request, response, next) => {
  const origin = request.get("Origin");
  if (origin && isAllowedOrigin(origin)) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Vary", "Origin");
    response.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type");
    response.set("Access-Control-Allow-Credentials", "true");
  }

  if (request.method === "OPTIONS") return response.sendStatus(204);

  const changesData = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  if (changesData && origin && !isAllowedOrigin(origin)) {
    return response.status(403).json({ error: "Bu kaynağa izin verilmiyor." });
  }

  next();
});

app.use(express.json());

const hashSessionToken = (token) =>
  createHash("sha256").update(token).digest("hex");

const readSessionToken = (request) => {
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`));

  return cookie ? cookie.slice(sessionCookieName.length + 1) : null;
};

const setSessionCookie = (response, token) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.set(
    "Set-Cookie",
    `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; ` +
      `Max-Age=${Math.floor(sessionDurationMs / 1000)}${secure}`
  );
};

const clearSessionCookie = (response) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.set(
    "Set-Cookie",
    `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
};

const hashPassword = async (password) => {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
};

const verifyPassword = async (password, storedHash) => {
  const [algorithm, saltHex, keyHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltHex || !keyHex) return false;

  const expectedKey = Buffer.from(keyHex, "hex");
  const actualKey = await scrypt(password, Buffer.from(saltHex, "hex"), expectedKey.length);
  return actualKey.length === expectedKey.length && timingSafeEqual(actualKey, expectedKey);
};

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  firstName: user.first_name,
  lastName: user.last_name,
  isAdmin: user.role === "admin",
});

const createUserSession = async (database, userId) => {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + sessionDurationMs);

  await database.query(
    `INSERT INTO user_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash, userId, expiresAt]
  );

  return token;
};

const requireAuth = async (request, response, next) => {
  const token = readSessionToken(request);
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
    return response.status(401).json({ error: "Oturum açmalısınız." });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, s.token_hash
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [hashSessionToken(token)]
    );

    if (result.rows.length === 0) {
      clearSessionCookie(response);
      return response.status(401).json({ error: "Oturum süresi dolmuş. Tekrar giriş yapın." });
    }

    request.auth = {
      user: result.rows[0],
      sessionHash: result.rows[0].token_hash,
    };
    next();
  } catch (error) {
    console.error("Oturum doğrulama başarısız:", error);
    response.status(500).json({ error: "Sunucu hatası" });
  }
};

const requireAdmin = (request, response, next) => {
  requireAuth(request, response, (error) => {
    if (error) return next(error);
    if (request.auth.user.role !== "admin") {
      return response.status(403).json({ error: "Bu işlem için yönetici yetkisi gerekli." });
    }
    next();
  });
};

const getOrCreateCartId = async (database, userId) => {
  await database.query(
    `INSERT INTO carts (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  const result = await database.query(
    "SELECT id FROM carts WHERE user_id = $1",
    [userId]
  );
  return result.rows[0].id;
};

const readCart = async (database, cartId) => {
  const [itemsResult, totalResult] = await Promise.all([
    database.query(
      `SELECT ci.id, v.id AS variant_id, v.sku, v.size, v.color,
              p.name, ci.quantity, v.price AS unit_price,
              v.stock_quantity,
              (v.price * ci.quantity)::numeric AS line_total
       FROM cart_items ci
       JOIN product_variants v ON v.id = ci.variant_id
       JOIN products p ON p.id = v.product_id
       WHERE ci.cart_id = $1
       ORDER BY ci.created_at, ci.id`,
      [cartId]
    ),
    database.query(
      `SELECT COALESCE(SUM(v.price * ci.quantity), 0)::numeric AS total,
              COALESCE(SUM(ci.quantity), 0)::integer AS item_count
       FROM cart_items ci
       JOIN product_variants v ON v.id = ci.variant_id
       WHERE ci.cart_id = $1`,
      [cartId]
    ),
  ]);

  return {
    items: itemsResult.rows.map((item) => ({
      id: item.id,
      variantId: item.variant_id,
      sku: item.sku,
      name: item.name,
      size: item.size,
      color: item.color,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      stockQuantity: item.stock_quantity,
      lineTotal: item.line_total,
    })),
    itemCount: totalResult.rows[0].item_count,
    total: totalResult.rows[0].total,
  };
};

const readFavorites = async (database, userId) => {
  const result = await database.query(
    `SELECT p.slug AS product_slug,
            p.name,
            COALESCE((
              SELECT pi.image_url
              FROM product_images pi
              WHERE pi.product_id = p.id
              ORDER BY pi.sort_order, pi.id
              LIMIT 1
            ), '') AS image,
            COALESCE((
              SELECT pi.alt_text
              FROM product_images pi
              WHERE pi.product_id = p.id
              ORDER BY pi.sort_order, pi.id
              LIMIT 1
            ), '') AS image_alt,
            COALESCE((
              SELECT MIN(v.price)
              FROM product_variants v
              WHERE v.product_id = p.id AND v.is_active = TRUE
            ), 0) AS price
     FROM user_favorites uf
     JOIN products p ON p.id = uf.product_id
     WHERE uf.user_id = $1 AND p.is_active = TRUE
     ORDER BY uf.created_at DESC, p.id`,
    [userId]
  );

  return result.rows.map((favorite) => ({
    productSlug: favorite.product_slug,
    name: favorite.name,
    image: favorite.image,
    imageAlt: favorite.image_alt,
    price: favorite.price,
  }));
};

app.post("/api/auth/register", async (request, response) => {
  const { email, password, firstName, lastName } = request.body ?? {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedFirstName = typeof firstName === "string" ? firstName.trim() : "";
  const normalizedLastName = typeof lastName === "string" ? lastName.trim() : "";

  if (
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128 ||
    !normalizedFirstName ||
    normalizedFirstName.length > 80 ||
    !normalizedLastName ||
    normalizedLastName.length > 80
  ) {
    return response.status(400).json({
      error: "Geçerli e-posta, 8-128 karakterli parola, ad ve soyad gerekli.",
    });
  }

  let client;
  try {
    const passwordHash = await hashPassword(password);
    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, first_name, last_name`,
      [normalizedEmail, passwordHash, normalizedFirstName, normalizedLastName]
    );
    const user = result.rows[0];
    await getOrCreateCartId(client, user.id);
    const token = await createUserSession(client, user.id);
    await client.query("DELETE FROM user_sessions WHERE expires_at <= NOW()");
    await client.query("COMMIT");

    setSessionCookie(response, token);
    response.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") {
      return response.status(409).json({ error: "Bu e-posta adresi zaten kayıtlı." });
    }

    console.error("Kullanıcı kaydı başarısız:", error);
    response.status(500).json({ error: "Sunucu hatası" });
  } finally {
    client?.release();
  }
});

app.post("/api/auth/login", async (request, response) => {
  const { email, password } = request.body ?? {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (
    !normalizedEmail ||
    normalizedEmail.length > 254 ||
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > 128
  ) {
    return response.status(400).json({ error: "E-posta ve parola gerekli." });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, password_hash, first_name, last_name, role
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );
    const user = result.rows[0];

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return response.status(401).json({ error: "E-posta veya parola hatalı." });
    }

    await getOrCreateCartId(pool, user.id);
    const token = await createUserSession(pool, user.id);
    await pool.query("DELETE FROM user_sessions WHERE expires_at <= NOW()");
    setSessionCookie(response, token);
    response.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Giriş başarısız:", error);
    response.status(500).json({ error: "Sunucu hatası" });
  }
});

app.get("/api/auth/me", requireAuth, (request, response) => {
  response.json({ user: publicUser(request.auth.user) });
});

app.post("/api/auth/logout", async (request, response) => {
  const token = readSessionToken(request);
  if (token && /^[A-Za-z0-9_-]{40,50}$/.test(token)) {
    try {
      await pool.query("DELETE FROM user_sessions WHERE token_hash = $1", [
        hashSessionToken(token),
      ]);
    } catch (error) {
      console.error("Oturum kapatılamadı:", error);
      return response.status(500).json({ error: "Sunucu hatası" });
    }
  }

  clearSessionCookie(response);
  response.json({ message: "Oturum kapatıldı." });
});

app.get("/api/health", (request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/admin/me", requireAdmin, (request, response) => {
  response.json({ user: publicUser(request.auth.user) });
});

app.get("/api/admin/categories", requireAdmin, async (request, response) => {
  try {
    const result = await pool.query(
      "SELECT id, name, slug FROM categories ORDER BY name"
    );
    response.json({ categories: result.rows });
  } catch (error) {
    console.error("Yönetim kategorileri yüklenemedi:", error);
    response.status(500).json({ error: "Kategoriler yüklenemedi." });
  }
});

app.get("/api/admin/products", requireAdmin, async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.slug, p.description, p.is_active,
              p.category_id, c.name AS category,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', v.id, 'sku', v.sku, 'size', v.size,
                  'color', v.color, 'price', v.price,
                  'stockQuantity', v.stock_quantity
                ) ORDER BY v.size, v.color)
                FROM product_variants v
                WHERE v.product_id = p.id AND v.is_active = TRUE
              ), '[]'::jsonb) AS variants,
              COALESCE((
                SELECT jsonb_build_object('url', pi.image_url, 'alt', pi.alt_text)
                FROM product_images pi
                WHERE pi.product_id = p.id
                ORDER BY pi.sort_order, pi.id
                LIMIT 1
              ), jsonb_build_object('url', NULL, 'alt', '')) AS image
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.created_at DESC, p.id DESC`
    );
    response.json({ products: result.rows });
  } catch (error) {
    console.error("Yönetim ürünleri yüklenemedi:", error);
    response.status(500).json({ error: "Ürünler yüklenemedi." });
  }
});

app.post("/api/admin/products", requireAdmin, async (request, response) => {
  const {
    name,
    slug,
    description = "",
    categoryId = null,
    imageUrl = "",
    imageAlt = "",
    isActive = true,
    variants,
  } = request.body ?? {};
  const normalizedSlug = typeof slug === "string" ? slug.trim() : "";
  const normalizedImageUrl = typeof imageUrl === "string" ? imageUrl.trim() : "";
  const validImageUrl =
    !normalizedImageUrl ||
    /^https?:\/\//i.test(normalizedImageUrl) ||
    (/^\/(?!\/)/.test(normalizedImageUrl) && !normalizedImageUrl.includes("\\"));
  const validVariants = Array.isArray(variants) && variants.length > 0 && variants.length <= 30 &&
    variants.every((variant) =>
      variant &&
      typeof variant.sku === "string" && /^[A-Za-z0-9._-]{2,80}$/.test(variant.sku.trim()) &&
      typeof variant.size === "string" && variant.size.trim().length > 0 && variant.size.trim().length <= 40 &&
      typeof variant.color === "string" && variant.color.trim().length > 0 && variant.color.trim().length <= 80 &&
      typeof variant.price === "string" && /^\d{1,10}(\.\d{1,2})?$/.test(variant.price) &&
      Number.isSafeInteger(variant.stockQuantity) && variant.stockQuantity >= 0 && variant.stockQuantity <= 2147483647
    );

  if (
    typeof name !== "string" || !name.trim() || name.trim().length > 160 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug) ||
    typeof description !== "string" || description.length > 5000 ||
    (categoryId !== null && (!Number.isSafeInteger(categoryId) || categoryId < 1)) ||
    !validImageUrl || typeof imageAlt !== "string" || imageAlt.length > 300 ||
    typeof isActive !== "boolean" ||
    !validVariants
  ) {
    return response.status(400).json({ error: "Ürün ve ilk varyant alanlarını kontrol edin." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const productResult = await client.query(
      `INSERT INTO products (category_id, name, slug, description, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, slug, description, category_id`,
      [categoryId, name.trim(), normalizedSlug, description.trim(), isActive]
    );
    const product = productResult.rows[0];

    const createdVariants = [];
    for (const variant of variants) {
      const variantResult = await client.query(
        `INSERT INTO product_variants
           (product_id, sku, size, color, price, stock_quantity)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, sku, size, color, price, stock_quantity`,
        [product.id, variant.sku.trim(), variant.size.trim(), variant.color.trim(), variant.price, variant.stockQuantity]
      );
      createdVariants.push(variantResult.rows[0]);
    }

    if (normalizedImageUrl) {
      await client.query(
        `INSERT INTO product_images (product_id, image_url, alt_text)
         VALUES ($1, $2, $3)`,
        [product.id, normalizedImageUrl, imageAlt.trim()]
      );
    }

    await client.query("COMMIT");
    response.status(201).json({ product, variants: createdVariants });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") {
      return response.status(409).json({ error: "Ürün slug veya SKU zaten kullanılıyor." });
    }
    if (error.code === "23503") {
      return response.status(400).json({ error: "Seçilen kategori bulunamadı." });
    }
    console.error("Yönetim ürünü oluşturulamadı:", error);
    response.status(500).json({ error: "Ürün oluşturulamadı." });
  } finally {
    client.release();
  }
});

app.put("/api/admin/products/:productId", requireAdmin, async (request, response) => {
  const productId = request.params.productId;
  const {
    name,
    slug,
    description = "",
    categoryId = null,
    imageUrl = "",
    imageAlt = "",
    isActive = true,
    variants,
  } = request.body ?? {};
  const normalizedSlug = typeof slug === "string" ? slug.trim() : "";
  const normalizedImageUrl = typeof imageUrl === "string" ? imageUrl.trim() : "";
  const validImageUrl =
    !normalizedImageUrl ||
    /^https?:\/\//i.test(normalizedImageUrl) ||
    (/^\/(?!\/)/.test(normalizedImageUrl) && !normalizedImageUrl.includes("\\"));
  const validVariants = Array.isArray(variants) && variants.length > 0 && variants.length <= 30 &&
    variants.every((variant) =>
      variant &&
      (variant.id === undefined || (Number.isSafeInteger(variant.id) && variant.id > 0)) &&
      typeof variant.sku === "string" && /^[A-Za-z0-9._-]{2,80}$/.test(variant.sku.trim()) &&
      typeof variant.size === "string" && variant.size.trim().length > 0 && variant.size.trim().length <= 40 &&
      typeof variant.color === "string" && variant.color.trim().length > 0 && variant.color.trim().length <= 80 &&
      typeof variant.price === "string" && /^\d{1,10}(\.\d{1,2})?$/.test(variant.price) &&
      Number.isSafeInteger(variant.stockQuantity) && variant.stockQuantity >= 0 && variant.stockQuantity <= 2147483647
    );

  if (
    !/^[1-9]\d*$/.test(productId) ||
    typeof name !== "string" || !name.trim() || name.trim().length > 160 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug) ||
    typeof description !== "string" || description.length > 5000 ||
    (categoryId !== null && (!Number.isSafeInteger(categoryId) || categoryId < 1)) ||
    !validImageUrl || typeof imageAlt !== "string" || imageAlt.length > 300 ||
    typeof isActive !== "boolean" || !validVariants
  ) {
    return response.status(400).json({ error: "Ürün ve varyant alanlarını kontrol edin." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updatedProduct = await client.query(
      `UPDATE products
       SET category_id = $1, name = $2, slug = $3, description = $4,
           is_active = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING id`,
      [categoryId, name.trim(), normalizedSlug, description.trim(), isActive, productId]
    );
    if (updatedProduct.rowCount === 0) {
      await client.query("ROLLBACK");
      return response.status(404).json({ error: "Ürün bulunamadı." });
    }

    await client.query(
      "UPDATE product_variants SET is_active = FALSE WHERE product_id = $1 AND is_active = TRUE",
      [productId]
    );
    for (const variant of variants) {
      if (variant.id) {
        const updatedVariant = await client.query(
          `UPDATE product_variants
           SET sku = $1, size = $2, color = $3, price = $4,
               stock_quantity = $5, is_active = TRUE
           WHERE id = $6 AND product_id = $7
           RETURNING id`,
          [variant.sku.trim(), variant.size.trim(), variant.color.trim(), variant.price,
            variant.stockQuantity, variant.id, productId]
        );
        if (updatedVariant.rowCount === 0) {
          const error = new Error("Ürün varyantlarından biri artık mevcut değil.");
          error.code = "ADMIN_VARIANT_NOT_FOUND";
          throw error;
        }
      } else {
        await client.query(
          `INSERT INTO product_variants
             (product_id, sku, size, color, price, stock_quantity)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [productId, variant.sku.trim(), variant.size.trim(), variant.color.trim(),
            variant.price, variant.stockQuantity]
        );
      }
    }

    await client.query("DELETE FROM product_images WHERE product_id = $1", [productId]);
    if (normalizedImageUrl) {
      await client.query(
        `INSERT INTO product_images (product_id, image_url, alt_text)
         VALUES ($1, $2, $3)`,
        [productId, normalizedImageUrl, imageAlt.trim()]
      );
    }
    await client.query("COMMIT");
    response.json({ message: "Ürün güncellendi." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") {
      return response.status(409).json({ error: "Ürün slug veya SKU zaten kullanılıyor." });
    }
    if (error.code === "23503") {
      return response.status(400).json({ error: "Seçilen kategori bulunamadı." });
    }
    if (error.code === "ADMIN_VARIANT_NOT_FOUND") {
      return response.status(409).json({ error: error.message });
    }
    console.error("Yönetim ürünü güncellenemedi:", error);
    response.status(500).json({ error: "Ürün güncellenemedi." });
  } finally {
    client.release();
  }
});

app.delete("/api/admin/products/:productId", requireAdmin, async (request, response) => {
  if (!/^[1-9]\d*$/.test(request.params.productId)) {
    return response.status(400).json({ error: "Geçerli bir ürün kimliği gerekli." });
  }
  try {
    const result = await pool.query(
      "DELETE FROM products WHERE id = $1 RETURNING id",
      [request.params.productId]
    );
    if (result.rowCount === 0) {
      return response.status(404).json({ error: "Ürün bulunamadı." });
    }
    response.json({ message: "Ürün ve ona bağlı varyantlar silindi." });
  } catch (error) {
    console.error("Yönetim ürünü silinemedi:", error);
    response.status(500).json({ error: "Ürün silinemedi." });
  }
});

app.patch("/api/admin/variants/:sku/stock", requireAdmin, async (request, response) => {
  const { stockQuantity } = request.body ?? {};
  if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0) {
    return response.status(400).json({ error: "Stok sıfır veya daha büyük bir tam sayı olmalı." });
  }

  try {
    const result = await pool.query(
      `UPDATE product_variants
       SET stock_quantity = $1
       WHERE sku = $2
       RETURNING sku, stock_quantity`,
      [stockQuantity, request.params.sku]
    );
    if (result.rows.length === 0) {
      return response.status(404).json({ error: "Varyant bulunamadı." });
    }
    response.json(result.rows[0]);
  } catch (error) {
    console.error("Yönetim stok güncellemesi başarısız:", error);
    response.status(500).json({ error: "Stok güncellenemedi." });
  }
});

app.get("/api/cart", requireAuth, async (request, response) => {
  try {
    const cartId = await getOrCreateCartId(pool, request.auth.user.id);
    response.json(await readCart(pool, cartId));
  } catch (error) {
    console.error("Sepet okunamadı:", error);
    response.status(500).json({ error: "Sepet yüklenemedi." });
  }
});

app.get("/api/favorites", requireAuth, async (request, response) => {
  try {
    response.json({ favorites: await readFavorites(pool, request.auth.user.id) });
  } catch (error) {
    console.error("Favoriler yüklenemedi:", error);
    response.status(500).json({ error: "Favoriler yüklenemedi." });
  }
});

app.post("/api/favorites", requireAuth, async (request, response) => {
  const productSlug = request.body?.productSlug;
  if (typeof productSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productSlug)) {
    return response.status(400).json({ error: "Geçerli bir ürün slug değeri gerekli." });
  }

  try {
    const product = await pool.query(
      "SELECT id FROM products WHERE slug = $1 AND is_active = TRUE",
      [productSlug]
    );
    if (product.rows.length === 0) {
      return response.status(404).json({ error: "Ürün bulunamadı." });
    }

    await pool.query(
      `INSERT INTO user_favorites (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [request.auth.user.id, product.rows[0].id]
    );

    response.status(201).json({ favorites: await readFavorites(pool, request.auth.user.id) });
  } catch (error) {
    console.error("Favori kaydedilemedi:", error);
    response.status(500).json({ error: "Favori kaydedilemedi." });
  }
});

app.delete("/api/favorites/:productSlug", requireAuth, async (request, response) => {
  const { productSlug } = request.params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productSlug)) {
    return response.status(400).json({ error: "Geçerli bir ürün slug değeri gerekli." });
  }

  try {
    await pool.query(
      `DELETE FROM user_favorites uf
       USING products p
       WHERE uf.user_id = $1 AND uf.product_id = p.id AND p.slug = $2`,
      [request.auth.user.id, productSlug]
    );
    response.json({ favorites: await readFavorites(pool, request.auth.user.id) });
  } catch (error) {
    console.error("Favori silinemedi:", error);
    response.status(500).json({ error: "Favori silinemedi." });
  }
});

app.post("/api/cart/items", requireAuth, async (request, response) => {
  const { variantId, quantity = 1 } = request.body ?? {};
  const normalizedVariantId = String(variantId ?? "");

  if (
    !/^[1-9]\d*$/.test(normalizedVariantId) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 99
  ) {
    return response.status(400).json({
      error: "Geçerli bir variantId ve 1-99 arasında quantity gerekli.",
    });
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const cartId = await getOrCreateCartId(client, request.auth.user.id);

    // Varyant satırını kilitleyerek eşzamanlı eklemelerde stok kontrolünü tutarlı yap.
    const variantResult = await client.query(
      `SELECT v.id, v.stock_quantity
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       WHERE v.id = $1 AND v.is_active = TRUE AND p.is_active = TRUE
       FOR UPDATE OF v`,
      [normalizedVariantId]
    );
    if (variantResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return response.status(404).json({ error: "Ürün varyantı bulunamadı." });
    }

    const stockQuantity = variantResult.rows[0].stock_quantity;
    const existingResult = await client.query(
      `SELECT quantity FROM cart_items
       WHERE cart_id = $1 AND variant_id = $2`,
      [cartId, normalizedVariantId]
    );
    const existingQuantity = existingResult.rows[0]?.quantity ?? 0;
    const nextQuantity = existingQuantity + quantity;

    if (nextQuantity > 99) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return response.status(400).json({ error: "Bir üründen en fazla 99 adet eklenebilir." });
    }
    if (nextQuantity > stockQuantity) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return response.status(409).json({
        error: "İstenen miktar stokta yok.",
        availableQuantity: Math.max(0, stockQuantity - existingQuantity),
      });
    }

    await client.query(
      `INSERT INTO cart_items (cart_id, variant_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (cart_id, variant_id)
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
      [cartId, normalizedVariantId, quantity]
    );
    await client.query("UPDATE carts SET updated_at = NOW() WHERE id = $1", [cartId]);
    await client.query("COMMIT");
    transactionStarted = false;

    const cart = await readCart(pool, cartId);
    response.status(existingQuantity === 0 ? 201 : 200).json(cart);
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    console.error("Sepete ürün eklenemedi:", error);
    response.status(500).json({ error: "Sepete ürün eklenemedi." });
  } finally {
    client.release();
  }
});

app.patch("/api/cart/items/:itemId", requireAuth, async (request, response) => {
  const itemId = request.params.itemId;
  const { quantity } = request.body ?? {};

  if (!/^[1-9]\d*$/.test(itemId) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    return response.status(400).json({
      error: "Geçerli bir itemId ve 1-99 arasında quantity gerekli.",
    });
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const itemResult = await client.query(
      `SELECT ci.id, ci.cart_id, v.stock_quantity
       FROM cart_items ci
       JOIN carts c ON c.id = ci.cart_id
       JOIN product_variants v ON v.id = ci.variant_id
       WHERE ci.id = $1 AND c.user_id = $2
       FOR UPDATE OF ci, v`,
      [itemId, request.auth.user.id]
    );
    if (itemResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return response.status(404).json({ error: "Sepet ürünü bulunamadı." });
    }

    const item = itemResult.rows[0];
    if (quantity > item.stock_quantity) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return response.status(409).json({
        error: "İstenen miktar stokta yok.",
        availableQuantity: item.stock_quantity,
      });
    }

    await client.query("UPDATE cart_items SET quantity = $1 WHERE id = $2", [quantity, itemId]);
    await client.query("UPDATE carts SET updated_at = NOW() WHERE id = $1", [item.cart_id]);
    await client.query("COMMIT");
    transactionStarted = false;

    response.json(await readCart(pool, item.cart_id));
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    console.error("Sepet miktarı güncellenemedi:", error);
    response.status(500).json({ error: "Sepet güncellenemedi." });
  } finally {
    client.release();
  }
});

app.delete("/api/cart/items/:itemId", requireAuth, async (request, response) => {
  const itemId = request.params.itemId;
  if (!/^[1-9]\d*$/.test(itemId)) {
    return response.status(400).json({ error: "Geçerli bir sepet ürünü kimliği gerekli." });
  }

  try {
    const deleted = await pool.query(
      `DELETE FROM cart_items ci
       USING carts c
       WHERE ci.cart_id = c.id AND ci.id = $1 AND c.user_id = $2
       RETURNING c.id AS cart_id`,
      [itemId, request.auth.user.id]
    );
    if (deleted.rows.length === 0) {
      return response.status(404).json({ error: "Sepet ürünü bulunamadı." });
    }

    const cartId = deleted.rows[0].cart_id;
    await pool.query("UPDATE carts SET updated_at = NOW() WHERE id = $1", [cartId]);
    response.json(await readCart(pool, cartId));
  } catch (error) {
    console.error("Sepet ürünü silinemedi:", error);
    response.status(500).json({ error: "Sepet ürünü silinemedi." });
  }
});

app.get("/api/products", async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.slug, p.description,
              c.name AS category, c.slug AS category_slug,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', v.id, 'sku', v.sku, 'size', v.size,
                  'color', v.color, 'price', v.price,
                  'stockQuantity', v.stock_quantity
                ) ORDER BY v.size)
                FROM product_variants v
                WHERE v.product_id = p.id AND v.is_active = TRUE
              ), '[]'::jsonb) AS variants,
              COALESCE((
                SELECT jsonb_build_object('url', pi.image_url, 'alt', pi.alt_text)
                FROM product_images pi
                WHERE pi.product_id = p.id
                ORDER BY pi.sort_order, pi.id
                LIMIT 1
              ), jsonb_build_object('url', NULL, 'alt', '')) AS image
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.is_active = TRUE
         AND ($1::text IS NULL OR c.slug = $1)
       ORDER BY p.name`,
      [typeof request.query.category === "string" ? request.query.category : null]
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

app.post("/api/products", requireAdmin, async (request, response) => {
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

app.post("/api/products/:id/variants", requireAdmin, async (request, response) => {
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

app.patch("/api/variants/:sku/stock", requireAdmin, async (request, response) => {
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
