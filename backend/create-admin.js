const { randomBytes, scrypt: scryptCallback } = require("node:crypto");
const { promisify } = require("node:util");
const pool = require("./db");

const scrypt = promisify(scryptCallback);

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(".env içinde geçerli bir ADMIN_EMAIL tanımlayın.");
  }
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error("ADMIN_PASSWORD en az 12, en fazla 128 karakter olmalı.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT id FROM users WHERE email = $1 FOR UPDATE",
      [email]
    );

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE users
         SET role = 'admin', password_hash = $1
         WHERE id = $2`,
        [await hashPassword(password), existing.rows[0].id]
      );
      console.log(`Mevcut hesap yönetici yapıldı ve .env şifresi ayarlandı: ${email}`);
    } else {
      await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, 'MODA', 'Yönetici', 'admin')`,
        [email, await hashPassword(password)]
      );
      console.log(`Yönetici hesabı oluşturuldu: ${email}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createAdmin().catch(async (error) => {
  console.error("Yönetici hesabı hazırlanamadı:", error.stack || error.message || error);
  process.exitCode = 1;
  await pool.end();
});
