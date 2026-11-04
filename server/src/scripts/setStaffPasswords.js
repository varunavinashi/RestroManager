const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const SALT_ROUNDS = 10;

const STAFF_LOGINS = [
  { username: 'waiter1', role: 'waiter' },
  { username: 'chef1', role: 'chef' },
  { username: 'manager1', role: 'manager' },
  { username: 'readonly1', role: 'readonly' },
];

const run = async () => {
  const password = process.env.WEB_PASSWORD;
  if (!password) {
    throw new Error('WEB_PASSWORD is not set in .env.');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  for (const login of STAFF_LOGINS) {
    const [result] = await pool.execute(
      'UPDATE staff SET username = ?, password_hash = ?, is_active = TRUE WHERE role = ? ORDER BY staff_id LIMIT 1',
      [login.username, passwordHash, login.role]
    );

    if (result.affectedRows === 0) {
      throw new Error(`No staff row found with role "${login.role}".`);
    }

    console.log(`Set username "${login.username}" for the ${login.role} account.`);
  }

  await pool.end();
};

run().catch(async (err) => {
  const password = process.env.DEMO_ROLE_PASSWORD;
  const message = String(err.message || err);
  const safeMessage = password ? message.split(password).join('[redacted]') : message;
  console.error('Error setting staff passwords:', safeMessage);

  try {
    await pool.end();
  } catch (closeErr) {
    console.error('Error closing the database pool:', closeErr.message);
  }

  process.exit(1);
});
