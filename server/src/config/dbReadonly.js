require('dotenv').config();
const mysql = require('mysql2/promise');

const isConfigured = Boolean(process.env.DB_READONLY_USER && process.env.DB_READONLY_PASSWORD);

const pool = isConfigured
  ? mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_READONLY_USER,
      password: process.env.DB_READONLY_PASSWORD,
      database: process.env.DB_NAME || 'hacka47_restaurant',
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      multipleStatements: false,
    })
  : null;

module.exports = pool;
