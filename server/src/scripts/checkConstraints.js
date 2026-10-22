const pool = require('../config/db');

const uniqueName = (prefix) =>
  `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

const getNextTableNumber = async (conn) => {
  const [rows] = await conn.query(
    'SELECT COALESCE(MIN(table_number), 0) - 1 AS table_number FROM restaurant_tables'
  );
  return rows[0].table_number;
};

const createCategory = async (conn) => {
  const [result] = await conn.query(
    'INSERT INTO categories (name) VALUES (?)',
    [uniqueName('check_constraints_category')]
  );
  return result.insertId;
};

const createMenuItem = async (conn, price) => {
  const categoryId = await createCategory(conn);
  const [result] = await conn.query(
    'INSERT INTO menu_items (name, category_id, price) VALUES (?, ?, ?)',
    [uniqueName('check_constraints_item'), categoryId, price]
  );
  return result.insertId;
};

const createTable = async (conn) => {
  const tableNumber = await getNextTableNumber(conn);
  const [result] = await conn.query(
    'INSERT INTO restaurant_tables (table_number, capacity) VALUES (?, ?)',
    [tableNumber, 1]
  );
  return result.insertId;
};

const checks = [
  {
    name: 'chk_menu_price',
    invalidInsert: async (conn) => {
      const categoryId = await createCategory(conn);
      await conn.query(
        'INSERT INTO menu_items (name, category_id, price) VALUES (?, ?, ?)',
        ['Invalid menu price', categoryId, -1]
      );
    },
  },
  {
    name: 'chk_table_capacity',
    invalidInsert: async (conn) => {
      const tableNumber = await getNextTableNumber(conn);
      await conn.query(
        'INSERT INTO restaurant_tables (table_number, capacity) VALUES (?, ?)',
        [tableNumber, 0]
      );
    },
  },
  {
    name: 'chk_item_quantity',
    invalidInsert: async (conn) => {
      const tableId = await createTable(conn);
      const itemId = await createMenuItem(conn, 10);
      const [order] = await conn.query(
        'INSERT INTO orders (table_id) VALUES (?)',
        [tableId]
      );
      await conn.query(
        'INSERT INTO order_items (order_id, item_id, quantity, price_at_order) VALUES (?, ?, ?, ?)',
        [order.insertId, itemId, 0, 10]
      );
    },
  },
  {
    name: 'chk_item_price',
    invalidInsert: async (conn) => {
      const tableId = await createTable(conn);
      const itemId = await createMenuItem(conn, 10);
      const [order] = await conn.query(
        'INSERT INTO orders (table_id) VALUES (?)',
        [tableId]
      );
      await conn.query(
        'INSERT INTO order_items (order_id, item_id, quantity, price_at_order) VALUES (?, ?, ?, ?)',
        [order.insertId, itemId, 1, -1]
      );
    },
  },
  {
    name: 'chk_order_total',
    invalidInsert: async (conn) => {
      const tableId = await createTable(conn);
      await conn.query(
        'INSERT INTO orders (table_id, total_amount) VALUES (?, ?)',
        [tableId, -1]
      );
    },
  },
];

const runCheck = async (conn, check) => {
  await conn.beginTransaction();

  try {
    await check.invalidInsert(conn);
    await conn.rollback();
    console.log(`FAIL ${check.name}: invalid INSERT succeeded (expected error 3819).`);
  } catch (err) {
    await conn.rollback();

    if (err.errno === 3819) {
      console.log(`PASS ${check.name}`);
    } else {
      console.log(`FAIL ${check.name}: expected error 3819, got ${err.errno || err.code}: ${err.message}`);
    }
  }
};

const checkConstraints = async () => {
  const conn = await pool.getConnection();

  try {
    for (const check of checks) {
      await runCheck(conn, check);
    }
  } finally {
    conn.release();
    await pool.end();
  }
};

checkConstraints().catch((err) => {
  console.error('Constraint check failed:', err);
  process.exit(1);
});
