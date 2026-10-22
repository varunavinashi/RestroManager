const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sqlDir = path.resolve(__dirname, '../../sql');
const sqlFiles = [
  'schema.sql',
  'indexes.sql',
  'ml_tables.sql',
  'seed.sql',
  'views.sql',
  'routines.sql',
];

const hasStatements = (sql) => {
  const withoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
  return withoutComments.trim().length > 0;
};

const splitRoutineChunks = (sql) =>
  sql
    .split(/^[ \t]*-- ---[ \t]*$/m)
    .filter((chunk) => hasStatements(chunk));

const initDb = async () => {
  const dbName = process.env.DB_NAME || 'hacka47_restaurant';

  console.log(`Connecting to MySQL server to ensure database '${dbName}' exists...`);
  const adminConnection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  });

  await adminConnection.query(`CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(dbName)} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await adminConnection.end();

  const pool = require('../config/db');

  for (const file of sqlFiles) {
    const filePath = path.join(sqlDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    if (file === 'routines.sql') {
      const chunks = splitRoutineChunks(sql);
      if (!chunks.length) {
        console.log(`Skipping ${file} (no statements).`);
        continue;
      }

      console.log(`Executing ${file} (${chunks.length} chunk(s))...`);
      for (const chunk of chunks) {
        await pool.query(chunk);
      }
    } else {
      if (!hasStatements(sql)) {
        console.log(`Skipping ${file} (no statements).`);
        continue;
      }

      console.log(`Executing ${file}...`);
      await pool.query(sql);
    }

    console.log(`${file} executed successfully.`);
  }

  await pool.end();
  console.log('Database initialization completed successfully.');
};

initDb().catch((err) => {
  console.error('Error during database initialization:', err);
  process.exit(1);
});
