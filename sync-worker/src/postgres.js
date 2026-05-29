const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || "banco_a",
  user: process.env.PG_USER || "admin",
  password: process.env.PG_PASSWORD || "admin"
});

module.exports = pool;
