const { readFile } = require("node:fs/promises");
const path = require("node:path");
const defaultPool = require("./db");

function getMigrationPool() {
  const directUrl = process.env.DATABASE_URL_UNPOOLED;
  const appUrl = process.env.DATABASE_URL;

  if (directUrl) return defaultPool.createPool(directUrl);
  if (appUrl) {
    let host;
    try {
      host = new URL(appUrl).hostname;
    } catch {
      throw new Error("DATABASE_URL geçerli bir PostgreSQL bağlantı adresi değil.");
    }
    if (host.includes("-pooler")) {
      throw new Error(
        "Migration için Neon'un doğrudan (pooled olmayan) bağlantısı gerekli. " +
        "Bunu backend/.env dosyasına DATABASE_URL_UNPOOLED olarak ekleyin."
      );
    }
  }
  return defaultPool;
}

const pool = getMigrationPool();

async function migrateDatabase() {
  try {
    const hasProductsTable = await pool.query("SELECT to_regclass('public.products') AS table_name");
    const migrationFiles = [
      ...(hasProductsTable.rows[0].table_name ? [] : ["001_initial_schema.sql"]),
      "002_catalog_seed.sql",
      "003_auth_sessions.sql",
      "004_user_favorites.sql",
      "005_user_roles.sql",
      "006_password_reset_tokens.sql",
      "007_email_verification.sql",
    ];

    for (const fileName of migrationFiles) {
      const migrationPath = path.join(__dirname, "database", "init", fileName);
      const migrationSql = await readFile(migrationPath, "utf8");
      await pool.query(migrationSql);
    }

    console.log("Veritabanı tabloları hazır.");
  } catch (error) {
    console.error("Veritabanı migration işlemi başarısız:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
    if (pool !== defaultPool) await defaultPool.end();
  }
}

migrateDatabase();
