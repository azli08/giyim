const { readFile } = require("node:fs/promises");
const path = require("node:path");
const pool = require("./db");

async function migrateAuthSessions() {
  try {
    const migrationPath = path.join(
      __dirname,
      "database",
      "init",
      "003_auth_sessions.sql"
    );
    const migrationSql = await readFile(migrationPath, "utf8");
    await pool.query(migrationSql);
    console.log("Oturum tablosu hazır.");
  } catch (error) {
    console.error("Oturum tablosu hazırlanamadı:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrateAuthSessions();
