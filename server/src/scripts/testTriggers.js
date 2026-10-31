const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = require('../config/db');

const OUTPUT_PATH = path.resolve(
  __dirname,
  '../../../05_Testing/Test_Evidence/trigger-test-run.txt'
);

const output = [];
const results = [];

const log = (line = '') => {
  output.push(line);
  console.log(line);
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const toMoney = (value) => Number(value).toFixed(2);

const readOrderTotal = async (conn, orderId) => {
  const [[row]] = await conn.query(
    'SELECT total_amount FROM orders WHERE order_id = ?',
    [orderId]
  );
  return Number(row.total_amount);
};

const findIsolatedTable = async (conn) => {
  const [rows] = await conn.query(
    `SELECT t.table_id, t.table_number, t.status
     FROM restaurant_tables t
     WHERE NOT EXISTS (
       SELECT 1 FROM orders o
       WHERE o.table_id = t.table_id AND o.status <> 'paid'
     )
     ORDER BY t.table_id
     LIMIT 1`
  );
  if (!rows.length) {
    throw new Error('no table without unpaid orders is available');
  }
  return rows[0];
};

const findAvailableItems = async (conn, count) => {
  const [rows] = await conn.query(
    'SELECT item_id, name, price FROM menu_items WHERE is_available = 1 ORDER BY item_id LIMIT ?',
    [count]
  );
  if (rows.length < count) {
    throw new Error(`need ${count} available menu items, found ${rows.length}`);
  }
  return rows;
};

const insertOrder = async (conn, tableId, status = 'pending') => {
  const [result] = await conn.query(
    'INSERT INTO orders (table_id, status) VALUES (?, ?)',
    [tableId, status]
  );
  return result.insertId;
};

const insertItem = async (conn, orderId, itemId, quantity, price) => {
  const [result] = await conn.query(
    'INSERT INTO order_items (order_id, item_id, quantity, price_at_order) VALUES (?, ?, ?, ?)',
    [orderId, itemId, quantity, price]
  );
  return result.insertId;
};

const runTransactionalCheck = async (conn, id, title, expected, fn) => {
  log('');
  log(`ID:       ${id}`);
  log(`Title:    ${title}`);
  log(`Expected: ${expected}`);

  await conn.beginTransaction();
  try {
    const actual = await fn();
    await conn.rollback();
    log(`Actual:   ${actual}`);
    log('Result:   PASS');
    results.push({ id, passed: true });
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    log(`Actual:   ${err.message}`);
    log('Result:   FAIL');
    results.push({ id, passed: false });
  }
};

const check1 = async (conn) => {
  const table = await findIsolatedTable(conn);
  const items = await findAvailableItems(conn, 2);
  const orderId = await insertOrder(conn, table.table_id);

  await insertItem(conn, orderId, items[0].item_id, 2, items[0].price);
  await insertItem(conn, orderId, items[1].item_id, 1, items[1].price);

  const total = await readOrderTotal(conn, orderId);
  const expected = Number(items[0].price) * 2 + Number(items[1].price);
  assert(
    Math.abs(total - expected) < 0.005,
    `expected total_amount ${toMoney(expected)}, got ${toMoney(total)}`
  );

  return `order ${orderId} total_amount=${toMoney(total)} from trigger only`;
};

const check2 = async (conn) => {
  const table = await findIsolatedTable(conn);
  const items = await findAvailableItems(conn, 2);
  const orderId = await insertOrder(conn, table.table_id);

  const firstItemId = await insertItem(conn, orderId, items[0].item_id, 2, items[0].price);
  const secondItemId = await insertItem(conn, orderId, items[1].item_id, 1, items[1].price);

  const before = await readOrderTotal(conn, orderId);
  await conn.query('UPDATE order_items SET quantity = 3 WHERE order_item_id = ?', [firstItemId]);
  const afterUpdate = await readOrderTotal(conn, orderId);
  const expectedAfterUpdate = before + Number(items[0].price);
  assert(
    Math.abs(afterUpdate - expectedAfterUpdate) < 0.005,
    `quantity update expected ${toMoney(expectedAfterUpdate)}, got ${toMoney(afterUpdate)}`
  );

  await conn.query('DELETE FROM order_items WHERE order_item_id = ?', [secondItemId]);
  const afterDelete = await readOrderTotal(conn, orderId);
  const expectedAfterDelete = afterUpdate - Number(items[1].price);
  assert(
    Math.abs(afterDelete - expectedAfterDelete) < 0.005,
    `item delete expected ${toMoney(expectedAfterDelete)}, got ${toMoney(afterDelete)}`
  );

  return `total ${toMoney(before)} -> ${toMoney(afterUpdate)} after update -> ${toMoney(afterDelete)} after delete`;
};

const check3 = async (conn) => {
  const table = await findIsolatedTable(conn);
  const [item] = await findAvailableItems(conn, 1);
  const orderId = await insertOrder(conn, table.table_id);

  await conn.query('UPDATE menu_items SET is_available = FALSE WHERE item_id = ?', [item.item_id]);

  let rejected = null;
  try {
    await insertItem(conn, orderId, item.item_id, 1, item.price);
  } catch (err) {
    rejected = err;
  }

  assert(rejected !== null, 'unavailable item insert was not rejected');
  assert(rejected.sqlState === '45000', `expected SQLSTATE 45000, got ${rejected.sqlState}`);
  assert(
    /unavailable/i.test(rejected.sqlMessage || ''),
    `expected an unavailable-item message, got "${rejected.sqlMessage}"`
  );

  return `rejected with SQLSTATE ${rejected.sqlState}: "${rejected.sqlMessage}"`;
};

const check4 = async (conn) => {
  const table = await findIsolatedTable(conn);
  const orderId = await insertOrder(conn, table.table_id, 'pending');

  await conn.query("UPDATE orders SET status = 'preparing' WHERE order_id = ?", [orderId]);

  const [rows] = await conn.query(
    'SELECT old_status, new_status FROM order_status_log WHERE order_id = ?',
    [orderId]
  );
  assert(rows.length === 1, `expected 1 log row, got ${rows.length}`);
  assert(rows[0].old_status === 'pending', `expected old_status pending, got ${rows[0].old_status}`);
  assert(rows[0].new_status === 'preparing', `expected new_status preparing, got ${rows[0].new_status}`);

  return `1 log row (${rows[0].old_status} -> ${rows[0].new_status})`;
};

const check5 = async (conn) => {
  const table = await findIsolatedTable(conn);

  await conn.query("UPDATE restaurant_tables SET status = 'occupied' WHERE table_id = ?", [table.table_id]);

  const firstOrderId = await insertOrder(conn, table.table_id, 'pending');
  await conn.query("UPDATE orders SET status = 'paid' WHERE order_id = ?", [firstOrderId]);

  const [[afterFirst]] = await conn.query(
    'SELECT status FROM restaurant_tables WHERE table_id = ?',
    [table.table_id]
  );
  assert(afterFirst.status === 'free', `only open order paid: expected free, got ${afterFirst.status}`);

  await conn.query("UPDATE restaurant_tables SET status = 'occupied' WHERE table_id = ?", [table.table_id]);

  await insertOrder(conn, table.table_id, 'pending');
  const secondOrderId = await insertOrder(conn, table.table_id, 'pending');
  await conn.query("UPDATE orders SET status = 'paid' WHERE order_id = ?", [secondOrderId]);

  const [[afterSecond]] = await conn.query(
    'SELECT status FROM restaurant_tables WHERE table_id = ?',
    [table.table_id]
  );
  assert(afterSecond.status === 'occupied', `second unpaid order: expected occupied, got ${afterSecond.status}`);

  return `table ${table.table_number}: free with one order, occupied with another unpaid order`;
};

const check6 = async (conn) => {
  const id = 'TC6';
  const title = 'sp_close_order rejects pending, closes served, rejects missing';
  const expected = 'pending -> error; served -> paid; missing -> error';

  log('');
  log(`ID:       ${id}`);
  log(`Title:    ${title}`);
  log(`Expected: ${expected}`);

  const table = await findIsolatedTable(conn);
  const originalStatus = table.status;
  const [[missingRow]] = await conn.query('SELECT COALESCE(MAX(order_id), 0) + 1000000 AS missing_id FROM orders');
  const missingId = Number(missingRow.missing_id);

  let pendingId = null;
  let servedId = null;
  let passed = false;
  let actual = '';

  await conn.beginTransaction();
  try {
    pendingId = await insertOrder(conn, table.table_id, 'pending');
    servedId = await insertOrder(conn, table.table_id, 'served');

    let pendingError = null;
    try {
      await conn.query('CALL sp_close_order(?)', [pendingId]);
    } catch (err) {
      pendingError = err;
    }
    assert(pendingError !== null, 'pending order was not rejected');
    assert(pendingError.sqlState === '45000', `pending order expected SQLSTATE 45000, got ${pendingError.sqlState}`);
    assert(
      pendingError.sqlMessage === 'Order must be served before payment',
      `pending order message was "${pendingError.sqlMessage}"`
    );

    await conn.query('CALL sp_close_order(?)', [servedId]);
    const [[servedRow]] = await conn.query('SELECT status FROM orders WHERE order_id = ?', [servedId]);
    assert(servedRow.status === 'paid', `served order expected paid, got ${servedRow.status}`);

    let missingError = null;
    try {
      await conn.query('CALL sp_close_order(?)', [missingId]);
    } catch (err) {
      missingError = err;
    }
    assert(missingError !== null, 'missing order was not rejected');
    assert(missingError.sqlState === '45000', `missing order expected SQLSTATE 45000, got ${missingError.sqlState}`);
    assert(
      missingError.sqlMessage === 'Order not found',
      `missing order message was "${missingError.sqlMessage}"`
    );

    actual = `pending: 45000 "${pendingError.sqlMessage}"; served: ${servedRow.status}; missing: 45000 "${missingError.sqlMessage}"`;
    passed = true;
  } catch (err) {
    actual = err.message;
  } finally {
    try {
      await conn.rollback();
    } catch {}

    try {
      if (pendingId !== null) {
        await conn.query('DELETE FROM orders WHERE order_id = ?', [pendingId]);
      }
      if (servedId !== null) {
        await conn.query('DELETE FROM orders WHERE order_id = ?', [servedId]);
      }
      await conn.query('UPDATE restaurant_tables SET status = ? WHERE table_id = ?', [
        originalStatus,
        table.table_id,
      ]);
    } catch (err) {
      actual = `${actual} (cleanup failed: ${err.message})`;
      passed = false;
    }

    log(`Actual:   ${actual}`);
    log(`Result:   ${passed ? 'PASS' : 'FAIL'}`);
    results.push({ id, passed });
  }
};

const check7 = async (conn) => {
  const [orders] = await conn.query(
    'SELECT order_id, total_amount FROM orders ORDER BY RAND() LIMIT 5'
  );
  assert(orders.length === 5, `expected 5 random orders, found ${orders.length}`);

  const mismatches = [];
  for (const order of orders) {
    const [[row]] = await conn.query('SELECT fn_order_total(?) AS total', [order.order_id]);
    if (Math.abs(Number(row.total) - Number(order.total_amount)) >= 0.005) {
      mismatches.push(`${order.order_id}: fn=${toMoney(row.total)} stored=${toMoney(order.total_amount)}`);
    }
  }

  assert(mismatches.length === 0, `mismatches: ${mismatches.join(', ')}`);
  return `5/5 orders matched (${orders.map((order) => order.order_id).join(', ')})`;
};

const check8 = async (conn) => {
  const [[dateRow]] = await conn.query(
    "SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d') AS d"
  );
  const yesterday = dateRow.d;

  const [viewRows] = await conn.query(
    'SELECT order_count, revenue, avg_order_value FROM v_daily_sales WHERE sale_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)'
  );
  const view = viewRows[0] || { order_count: 0, revenue: 0, avg_order_value: 0 };

  const [resultSets] = await conn.query('CALL sp_daily_sales(?)', [yesterday]);
  const summary = (resultSets[0] && resultSets[0][0]) || {
    order_count: 0,
    revenue: 0,
    avg_order_value: 0,
  };

  assert(
    Number(view.order_count) === Number(summary.order_count),
    `order_count view=${view.order_count} procedure=${summary.order_count}`
  );
  assert(
    Math.abs(Number(view.revenue) - Number(summary.revenue)) < 0.005,
    `revenue view=${view.revenue} procedure=${summary.revenue}`
  );
  assert(
    Math.abs(Number(view.avg_order_value) - Number(summary.avg_order_value)) < 0.005,
    `avg_order_value view=${view.avg_order_value} procedure=${summary.avg_order_value}`
  );

  return `${yesterday}: count=${summary.order_count}, revenue=${toMoney(summary.revenue)}, avg=${toMoney(summary.avg_order_value)}`;
};

const run = async () => {
  log('='.repeat(78));
  log('HackA47 RestroManager - Trigger and Routine Test Suite');
  log('='.repeat(78));
  log(`Evidence file: ${OUTPUT_PATH}`);
  log('');

  const conn = await pool.getConnection();

  try {
    await runTransactionalCheck(
      conn,
      'TC1',
      'Insert order with two items; trigger sets total_amount',
      'orders.total_amount equals the two line totals',
      () => check1(conn)
    );

    await runTransactionalCheck(
      conn,
      'TC2',
      'Update item quantity then delete an item',
      'total_amount changes correctly both times',
      () => check2(conn)
    );

    await runTransactionalCheck(
      conn,
      'TC3',
      'Insert order_item for an unavailable item',
      'rejected with SQLSTATE 45000 and a clear message',
      () => check3(conn)
    );

    await runTransactionalCheck(
      conn,
      'TC4',
      'Change order status pending -> preparing',
      'exactly one order_status_log row appears',
      () => check4(conn)
    );

    await runTransactionalCheck(
      conn,
      'TC5',
      'Pay orders on a table with one and with two open orders',
      'table free with one open order; occupied while another is unpaid',
      () => check5(conn)
    );

    await check6(conn);

    await runTransactionalCheck(
      conn,
      'TC7',
      'Compare fn_order_total with orders.total_amount',
      'all 5 random orders match',
      () => check7(conn)
    );

    await runTransactionalCheck(
      conn,
      'TC8',
      'Compare sp_daily_sales with v_daily_sales for yesterday',
      'order count, revenue and average match',
      () => check8(conn)
    );
  } finally {
    conn.release();
    await pool.end();
  }

  const failed = results.filter((result) => !result.passed);

  log('');
  log('='.repeat(78));
  log(`SUMMARY: ${results.length - failed.length}/${results.length} passed`);
  for (const result of results) {
    log(`  ${result.passed ? 'PASS' : 'FAIL'}  ${result.id}`);
  }
  log('='.repeat(78));

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${output.join('\n')}\n`, 'utf8');
  console.log(`\nEvidence saved to ${OUTPUT_PATH}`);

  if (failed.length > 0) process.exitCode = 1;
};

run().catch((err) => {
  log('');
  log(`SUITE ERROR: ${err.message}`);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${output.join('\n')}\n`, 'utf8');
  process.exitCode = 1;
});
