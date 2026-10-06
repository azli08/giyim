const { readFile } = require("node:fs/promises");
const path = require("node:path");
const pool = require("./db");

async function seedCatalog() {
  try {
    const seedPath = path.join(
      __dirname,
      "database",
      "init",
      "002_catalog_seed.sql"
    );
    const seedSql = await readFile(seedPath, "utf8");
    await pool.query(seedSql);
    console.log("Örnek ürün kataloğu veritabanına eklendi.");
  } catch (error) {
    console.error("Ürün kataloğu eklenemedi:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seedCatalog();
