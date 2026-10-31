// db.js: PostgreSQL connection used by server.js
// Works with DATABASE_URL (Render, Neon, Supabase) or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.
require('dotenv').config();
const { Pool } = require('pg');

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || process.env.DB_HOST || 'localhost');
const ssl = process.env.DB_SSL === 'false' || local ? false : { rejectUnauthorized: false };

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl,
      }
);

pool.on('error', (e) => console.error('Database pool error:', e.message));

exports.pool = pool;
exports.q = (text, params) => pool.query(text, params);