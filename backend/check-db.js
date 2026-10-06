const pool = require("./db");

async function checkDatabase() {
  try {
    const result = await pool.query("SELECT NOW() AS database_time");
    console.log("PostgreSQL bağlantısı çalışıyor:", result.rows[0]);
  } catch (error) {
    console.error("Bağlantı kurulamadı:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkDatabase();