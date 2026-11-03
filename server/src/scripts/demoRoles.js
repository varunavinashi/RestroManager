const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const OUTPUT_PATH = path.resolve(
  __dirname,
  '../../../05_Testing/Test_Evidence/rbac-demo.txt'
);

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_NAME = process.env.DB_NAME || 'hacka47_restaurant';
const PASSWORD = process.env.DEMO_ROLE_PASSWORD;

const USERS = [
  { role: 'restro_waiter', user: 'restro_waiter_user' },
  { role: 'restro_chef', user: 'restro_chef_user' },
  { role: 'restro_manager', user: 'restro_manager_user' },
  { role: 'restro_readonly', user: 'restro_readonly_user' },
];

const PRIVILEGE_ERROR_CODES = new Set([1044, 1142, 1143, 1227, 1370]);

const output = [];
const results = [];

const log = (line = '') => {
  output.push(line);
  console.log(line);
};

const redact = (value) => {
  const text = String(value || '');
  return PASSWORD ? text.split(PASSWORD).join('[redacted]') : text;
};

const expectedFor = (waiter, chef, manager, readonly) => ({
  restro_waiter: waiter,
  restro_chef: chef,
  restro_manager: manager,
  restro_readonly: readonly,
});

const errorCode = (err) => Number(err.errno) || err.code || 'unknown';

const isPrivilegeError = (err) => PRIVILEGE_ERROR_CODES.has(Number(err.errno));

const connectAs = (user) =>
  mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user,
    password: PASSWORD,
    database: DB_NAME,
    multipleStatements: false,
  });

const runOperation = async (connection, operation) => {
  let inTransaction = false;
  try {
    if (operation.transactional) {
      await connection.beginTransaction();
      inTransaction = true;
    }

    await operation.run(connection);

    if (inTransaction) await connection.rollback();
    return { actual: 'ALLOWED', code: null, message: '' };
  } catch (err) {
    if (inTransaction) {
      try {
        await connection.rollback();
      } catch {
      }
    }

    return {
      actual: isPrivilegeError(err) ? 'DENIED' : 'ERROR',
      code: errorCode(err),
      message: redact(err.sqlMessage || err.message),
    };
  }
};

const buildOperations = (fixtures) => [
  {
    label: `SELECT from ${DB_NAME}.menu_items`,
    expected: expectedFor('ALLOWED', 'ALLOWED', 'ALLOWED', 'ALLOWED'),
    transactional: false,
    run: async (connection) => {
      await connection.query('SELECT item_id, name, price FROM menu_items ORDER BY item_id LIMIT 1');
    },
  },
  {
    label: `INSERT into ${DB_NAME}.orders`,
    expected: expectedFor('ALLOWED', 'DENIED', 'ALLOWED', 'DENIED'),
    transactional: true,
    run: async (connection) => {
      await connection.query(
        "INSERT INTO orders (table_id, status) VALUES (?, 'pending')",
        [fixtures.tableId]
      );
    },
  },
  {
    label: `UPDATE ${DB_NAME}.menu_items price`,
    expected: expectedFor('DENIED', 'DENIED', 'ALLOWED', 'DENIED'),
    transactional: true,
    run: async (connection) => {
      await connection.query('UPDATE menu_items SET price = price WHERE item_id = ?', [
        fixtures.itemId,
      ]);
    },
  },
  {
    label: `DELETE from ${DB_NAME}.orders`,
    expected: expectedFor('DENIED', 'DENIED', 'DENIED', 'DENIED'),
    transactional: true,
    run: async (connection) => {
      await connection.query('DELETE FROM orders WHERE order_id = ?', [fixtures.orderId]);
    },
  },
  {
    label: `SELECT ${DB_NAME}.staff.password_hash`,
    expected: expectedFor('DENIED', 'DENIED', 'DENIED', 'ALLOWED'),
    transactional: false,
    run: async (connection) => {
      await connection.query('SELECT password_hash FROM staff ORDER BY staff_id LIMIT 1');
    },
  },
  {
    label: `CALL ${DB_NAME}.sp_daily_sales`,
    expected: expectedFor('DENIED', 'DENIED', 'ALLOWED', 'ALLOWED'),
    transactional: false,
    run: async (connection) => {
      await connection.query('CALL sp_daily_sales(CURDATE())');
    },
  },
  {
    label: `DROP TABLE ${DB_NAME}.${fixtures.probeTable}`,
    expected: expectedFor('DENIED', 'DENIED', 'DENIED', 'DENIED'),
    transactional: false,
    run: async (connection) => {
      await connection.query(
        `DROP TABLE IF EXISTS ${mysql.escapeId(DB_NAME)}.${mysql.escapeId(fixtures.probeTable)}`
      );
    },
  },
];

const loadFixtures = async (admin) => {
  const [[tableRow]] = await admin.query(
    'SELECT table_id FROM restaurant_tables ORDER BY table_id LIMIT 1'
  );
  const [[itemRow]] = await admin.query('SELECT item_id FROM menu_items ORDER BY item_id LIMIT 1');
  const [[orderRow]] = await admin.query('SELECT order_id FROM orders ORDER BY order_id LIMIT 1');

  if (!tableRow || !itemRow) {
    throw new Error('demo requires at least one restaurant table and one menu item');
  }

  const probeTable = `rbac_probe_${Date.now()}`;
  const [[probeRow]] = await admin.query(
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    [DB_NAME, probeTable]
  );
  if (Number(probeRow.count) !== 0) {
    throw new Error('could not find an unused probe table name');
  }

  return {
    tableId: tableRow.table_id,
    itemId: itemRow.item_id,
    orderId: orderRow ? orderRow.order_id : 0,
    probeTable,
  };
};

const run = async () => {
  log('='.repeat(78));
  log('HackA47 RestroManager - RBAC Demo');
  log('='.repeat(78));
  log(`Database: ${DB_NAME}`);
  log(`Host:     ${DB_HOST}:${DB_PORT}`);
  log('Passwords are read from DEMO_ROLE_PASSWORD and are never printed.');

  if (!PASSWORD) {
    throw new Error('DEMO_ROLE_PASSWORD is not set in .env.');
  }

  const admin = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: DB_NAME,
    multipleStatements: false,
  });

  try {
    const fixtures = await loadFixtures(admin);
    log(`Fixtures: table_id=${fixtures.tableId}, item_id=${fixtures.itemId}, order_id=${fixtures.orderId}, probe=${fixtures.probeTable}`);

    const operations = buildOperations(fixtures);

    for (const entry of USERS) {
      log('');
      log('='.repeat(78));
      log(`ROLE: ${entry.role}   USER: ${entry.user}@localhost`);
      log('='.repeat(78));

      let connection;
      try {
        connection = await connectAs(entry.user);
        log('Connection: OK');
      } catch (err) {
        log(`Connection: FAILED (MySQL ${errorCode(err)}: ${redact(err.message)})`);
        results.push({ id: `${entry.role}:connection`, passed: false });
      }

      if (connection) {
        for (const operation of operations) {
          const expected = operation.expected[entry.role];
          const result = await runOperation(connection, operation);
          const passed = expected === result.actual;
          const suffix =
            result.actual === 'ALLOWED'
              ? ''
              : ` (MySQL ${result.code}${result.message ? `: ${result.message}` : ''})`;

          log(`${operation.label}`);
          log(`  expected ${expected} | actual ${result.actual}${suffix} | ${passed ? 'PASS' : 'FAIL'}`);
          results.push({ id: `${entry.role}:${operation.label}`, passed });
        }

        await connection.end();
      }
    }

    log('');
    log('='.repeat(78));
    log('SHOW GRANTS');
    log('='.repeat(78));

    for (const entry of USERS) {
      log('');
      log(`SHOW GRANTS FOR '${entry.user}'@'localhost' USING '${entry.role}'`);
      try {
        const [rows] = await admin.query(
          `SHOW GRANTS FOR '${entry.user}'@'localhost' USING '${entry.role}'`
        );
        for (const row of rows) {
          log(`  ${Object.values(row)[0]}`);
        }
      } catch (err) {
        log(`  ERROR (MySQL ${errorCode(err)}: ${redact(err.message)})`);
      }
    }
  } finally {
    await admin.end();
  }

  const failed = results.filter((result) => !result.passed);

  log('');
  log('='.repeat(78));
  log(`SUMMARY: ${results.length - failed.length}/${results.length} checks matched expectations`);
  for (const result of failed) {
    log(`  FAIL  ${result.id}`);
  }
  log('='.repeat(78));

  if (failed.length > 0) process.exitCode = 1;
};

run()
  .catch((err) => {
    log('');
    log(`DEMO ERROR: ${redact(err.message)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, `${output.join('\n')}\n`, 'utf8');
    console.log(`\nEvidence saved to ${OUTPUT_PATH}`);
  });
