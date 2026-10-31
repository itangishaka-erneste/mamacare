// Mama Care Rwanda: PostgreSQL connection (reads DB_* values from server/.env)
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

const q = (text, params) => pool.query(text, params);

// Shows in the terminal as soon as the server starts
pool
  .query('SELECT current_database() AS db')
  .then((r) => console.log(`Database connected: ${r.rows[0].db}`))
  .catch((e) => console.error(`Database connection FAILED: ${e.message}`));

module.exports = { pool, q };