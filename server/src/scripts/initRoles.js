const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const SQL_PATH = path.resolve(__dirname, '../../sql/roles.sql');

const initRoles = async () => {
  const password = process.env.DEMO_ROLE_PASSWORD;
  if (!password) {
    throw new Error('DEMO_ROLE_PASSWORD is not set in .env.');
  }

  const readonlyPassword = process.env.DB_READONLY_PASSWORD || password;
  const dbName = process.env.DB_NAME || 'hacka47_restaurant';
  const template = fs.readFileSync(SQL_PATH, 'utf8');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: dbName,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    multipleStatements: true,
  });

  try {
    const sql = template.replace(/__DB_NAME__|__READONLY_PASSWORD__|__PASSWORD__/g, (token) => {
      if (token === '__DB_NAME__') return mysql.escapeId(dbName);
      if (token === '__READONLY_PASSWORD__') return mysql.escape(readonlyPassword);
      return mysql.escape(password);
    });

    console.log('Executing roles.sql...');
    await connection.query(sql);
    console.log('Roles and users initialized successfully.');
  } finally {
    await connection.end();
  }
};

initRoles().catch((err) => {
  const secrets = [process.env.DEMO_ROLE_PASSWORD, process.env.DB_READONLY_PASSWORD].filter(Boolean);
  const safeMessage = secrets.reduce(
    (message, secret) => message.split(secret).join('[redacted]'),
    String(err.message || err)
  );
  console.error('Error during role initialization:', safeMessage);
  process.exit(1);
});
