const { Pool } = require("pg");

function createPool(connectionString = process.env.DATABASE_URL) {
  return new Pool(connectionString ? { connectionString } : {});
}

const pool = createPool();
pool.createPool = createPool;

module.exports = pool;
