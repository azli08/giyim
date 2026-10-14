const { readFile } = require("node:fs/promises");
const path = require("node:path");
const pool = require("./db");

async function migrateDatabase() {
  try {
    const migrationFiles = [
      "002_catalog_seed.sql",
      "003_auth_sessions.sql",
      "004_user_favorites.sql",
      "005_user_roles.sql",
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
  }
}

migrateDatabase();
