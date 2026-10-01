const pool = require('../config/db');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

const TABLE_ID = 2;
const BROKEN_TABLE_ID = 5; 
const MISSING_ITEM_ID = 999999;

// items for verification
const ITEMS = [
  { item_id: 1, quantity: 2 },
  { item_id: 5, quantity: 1 }, 
  { item_id: 6, quantity: 3 },
];

const results = [];
let createdOrderId = null;

function record(check, passed, detail) {
  results.push({ check, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  check ${check}  ${detail}`);
}

// attaches the content type, makes http request, parses json and return {status, body}
async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

function money(centsValue) {
  return (centsValue / 100).toFixed(2);
}

// post request
function placeOrder(body) {
  return request('/api/orders', { method: 'POST', body: JSON.stringify(body) });
}

async function countOrders() {
  const [rows] = await pool.execute('SELECT COUNT(*) AS count FROM orders');
  return Number(rows[0].count);
}

// check1 -> a valid order must have the right total and the right no of items
async function check1() {
  // place a order
  const post = await placeOrder({ table_id: TABLE_ID, customer_name: 'tester', items: ITEMS });

  if (post.status !== 201) {
    const reason = post.body && post.body.error ? ` - ${post.body.error}` : '';
    return record(1, false, `POST /api/orders expected 201, got ${post.status}${reason}`);
  }

  const created = post.body.data;
  createdOrderId = created.order_id;

  // get order details
  const get = await request(`/api/orders/${createdOrderId}`);
  if (get.status !== 200) {
    return record(1, false, `GET /api/orders/${createdOrderId} expected 200, got ${get.status}`);
  }
  const order = get.body.data;

  // calualte current total price
  const breakdown = [];
  let expectedCents = 0;
  for (const line of ITEMS) {
    const menu = await request(`/api/menu/${line.item_id}`);
    const price = Number(menu.body.data.price);
    expectedCents += cents(price) * line.quantity;
    breakdown.push(`${line.item_id}@${price.toFixed(2)}x${line.quantity}`);
  }

  // verifies all checks
  const returnedItems = Array.isArray(order.items) ? order.items : null;
  if (returnedItems === null) {
    return record(1, false, `GET /api/orders/${createdOrderId} did not return an items array`);
  }
  if (returnedItems.length !== ITEMS.length) {
    return record(1, false, `sent ${ITEMS.length} items but the order came back with ${returnedItems.length}`);
  }
  if (cents(order.total_amount) !== expectedCents) {
    return record(1, false, `total_amount should be ${money(expectedCents)} for ${breakdown.join(' + ')}, got ${order.total_amount}`);
  }

  return record(1, true, `order ${order.order_id} on table ${order.table_number} has ${returnedItems.length}/${ITEMS.length} items and total_amount ${money(cents(order.total_amount))} (${breakdown.join(' + ')} = ${money(expectedCents)})`);
}

// check2 -> the order_items rows must be in the database
async function check2() {
  if (createdOrderId === null) {
    return record(2, false, 'check 1 did not create an order, so there is nothing to query');
  }

  const [rows] = await pool.execute('SELECT * FROM order_items WHERE order_id = ?', [createdOrderId]);

  if (rows.length !== ITEMS.length) {
    return record(2, false, `SELECT * FROM order_items WHERE order_id = ${createdOrderId} returned ${rows.length} rows, expected ${ITEMS.length}`);
  }

  const lines = rows.map((r) => `item_id=${r.item_id} qty=${r.quantity} price_at_order=${Number(r.price_at_order).toFixed(2)}`).join(', ');
  return record(2, true, `order_items holds ${rows.length}/${ITEMS.length} rows for order ${createdOrderId} -> ${lines}`);
}

// check3 -> a broken order must not to do anything in database
async function check3() {
  const before = await countOrders();

  const broken = await placeOrder({
    table_id: BROKEN_TABLE_ID,
    items: [
      { item_id: 1, quantity: 1 },
      { item_id: MISSING_ITEM_ID, quantity: 1 },
    ],
  });

  if (broken.status !== 400) {
    return record(3, false, `an order with item_id ${MISSING_ITEM_ID} should be rejected with 400, got ${broken.status}`);
  }

  // check for success of rollback
  const after = await countOrders();
  if (after !== before) {
    return record(3, false, `orders went from ${before} to ${after} after the rejected request - the ROLLBACK did not happen`);
  }

  // the table which was supposed to be used for missing item must be free still
  const tables = await request('/api/tables');
  const brokenTable = tables.body.data.find((t) => Number(t.table_id) === BROKEN_TABLE_ID);

  return record(3, true, `item_id ${MISSING_ITEM_ID} rejected with 400 and orders stayed at ${before} rows; table ${BROKEN_TABLE_ID} is still "${brokenTable.status}"`);
}

// check4 -> order placement must make the table occupied
async function check4() {
  const { status, body } = await request('/api/tables');
  if (status !== 200) return record(4, false, `GET /api/tables expected 200, got ${status}`);

  const table = body.data.find((t) => Number(t.table_id) === TABLE_ID);
  if (!table) return record(4, false, `table ${TABLE_ID} is missing from GET /api/tables`);
  if (table.status !== 'occupied') {
    return record(4, false, `table ${TABLE_ID} should be "occupied" after an order was placed on it, got "${table.status}"`);
  }

  return record(4, true, `table ${TABLE_ID} (table_number ${table.table_number}) is "${table.status}"`);
}

// placed order is removed
async function cleanup() {
  if (createdOrderId !== null) {
    await pool.execute('DELETE FROM orders WHERE order_id = ?', [createdOrderId]);
  }
  await pool.execute("DELETE FROM customers WHERE name = 'Section 11 Tester'");
  await pool.execute("UPDATE restaurant_tables SET status = 'free' WHERE table_id IN (?, ?)", [TABLE_ID, BROKEN_TABLE_ID]);
}

// runs all checks sequentially and manages cleanup
async function run() {
  console.log(`Testing Place Order API at ${BASE_URL}`);
  console.log(`Seeded table ${TABLE_ID}, ${ITEMS.length} menu items: ${ITEMS.map((i) => `item_id ${i.item_id} x${i.quantity}`).join(', ')}\n`);

  for (const check of [check1, check2, check3, check4]) {
    try {
      await check();
    } catch (err) {
      record(Number(check.name.replace('check', '')), false, `threw ${err.message} - is the server running on port ${new URL(BASE_URL).port}?`);
    }
  }

  try {
    await cleanup();
    console.log('\ncleanup: removed the test order and reset the test tables to "free"');
  } catch (err) {
    console.error(`\ncleanup failed: ${err.message}`);
  }

  await pool.end();

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log('Failed checks: ' + failed.map((r) => r.check).join(', '));
    process.exitCode = 1;
  }
}

run();
