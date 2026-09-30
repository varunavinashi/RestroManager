const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

async function initDb() {
  const dbName = process.env.DB_NAME || 'hacka47_restaurant';

  console.log(`Connecting to MySQL server to ensure database '${dbName}' exists...`);
  const adminConnection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  });

  await adminConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await adminConnection.end();

  const pool = require('../config/db');

  const schemaPath = path.resolve(__dirname, '../../sql/schema.sql');
  const seedPath = path.resolve(__dirname, '../../sql/seed.sql');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  console.log('Executing schema.sql...');
  await pool.query(schemaSql);
  console.log('Schema created successfully.');

  console.log('Executing seed.sql...');
  await pool.query(seedSql);
  console.log('Seed data inserted successfully.');

  await pool.end();
  console.log('Database initialization completed successfully.');
}

initDb().catch((err) => {
  console.error('Error during database initialization:', err);
  process.exit(1);
});
