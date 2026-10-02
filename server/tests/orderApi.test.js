const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../src/config/db');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const EVIDENCE_PATH = process.env.EVIDENCE_PATH || path.join(__dirname, '..', '..', '05_Testing', 'Test_Evidence', 'order-api-test-run.txt');

const TEST_CUSTOMER = 'test-harness';
const MISSING_TABLE_ID = 999999;
const MISSING_ORDER_ID = 999999;
const INVALID_STATUS = 'refunded';

// tc1
const PLANNED_QUANTITIES = [2, 1]; // number of items


const output = [];
const results = [];

function log(line = '') {
  output.push(line);
  console.log(line);
}

async function request(pathname, options = {}) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
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

const toCents = (value) => Math.round(Number(value) * 100);
const toMoney = (value) => (toCents(value) / 100).toFixed(2);

async function countRows(table) {
  const [rows] = await pool.execute(`SELECT COUNT(*) AS count FROM ${table}`);
  return Number(rows[0].count);
}

async function findFreeTable() {
  const [rows] = await pool.execute(
    "SELECT table_id, table_number FROM restaurant_tables WHERE status = 'free' ORDER BY table_number LIMIT 1"
  );
  return rows.length ? rows[0] : null;
}

async function findAvailableItems(count) {
  const [rows] = await pool.execute(
    'SELECT item_id, name, price FROM menu_items WHERE is_available = 1 ORDER BY item_id LIMIT ?',
    [count]
  );
  return rows;
}

let freeTable = null;
let testItems = [];
let plannedLines = [];
let createdOrderId = null;
let orderStatusBefore = null;

async function setup() {
  freeTable = await findFreeTable();
  assert.ok(freeTable, 'no free table available to run TC1 - seed the database first');

  testItems = await findAvailableItems(PLANNED_QUANTITIES.length);
  assert.equal(testItems.length, PLANNED_QUANTITIES.length, 'need at least 2 available menu items - seed the database first');

  plannedLines = testItems.map((item, index) => ({ item_id: item.item_id, quantity: PLANNED_QUANTITIES[index] }));
}

async function expectedTotalCents() {
  let total = 0;
  for (const line of plannedLines) {
    const res = await request(`/api/menu/${line.item_id}`);
    assert.equal(res.status, 200, `GET /api/menu/${line.item_id} should return 200, got ${res.status}`);
    total += toCents(res.body.data.price) * line.quantity;
  }
  return total;
}

function beginCase(id, title, input, expected) {
  log('');
  log('-'.repeat(78));
  log(`ID:      ${id}`);
  log(`Title:   ${title}`);
  log(`Input:   ${input}`);
  log(`Expected: ${expected}`);
}

function endCase(id, actual, passed) {
  log(`Actual:  ${actual}`);
  log(`Result:  ${passed ? 'PASS' : 'FAIL'}`);
  log('-'.repeat(78));
  results.push({ id, passed });
}

// tc1
async function tc1() {
  beginCase('TC1', 'Valid order (2 items, valid table)', `POST /api/orders  table_id=${freeTable.table_id}, items=[${plannedLines.map((l) => `{item_id:${l.item_id},quantity:${l.quantity}}`).join(',')}]`, 'HTTP 201, order created with total_amount = 2 x item1.price + 1 x item2.price');

  try {
    const expectedCents = await expectedTotalCents();
    const post = await request('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        table_id: freeTable.table_id,
        customer_name: TEST_CUSTOMER,
        items: plannedLines,
      }),
    });

    assert.equal(post.status, 201, `expected 201, got ${post.status} ${JSON.stringify(post.body)}`);
    const created = post.body.data;
    createdOrderId = created.order_id;
    assert.ok(createdOrderId, 'response did not include order_id');

    const get = await request(`/api/orders/${createdOrderId}`);
    assert.equal(get.status, 200, `expected 200 on GET, got ${get.status}`);
    const order = get.body.data;

    assert.equal(order.items.length, plannedLines.length, `expected ${plannedLines.length} items, got ${order.items.length}`);
    assert.equal(toCents(order.total_amount), expectedCents, `expected total ${toMoney(expectedCents)}, got ${order.total_amount}`);
    assert.equal(order.status, 'pending', `new order should be "pending", got "${order.status}"`);

    const lines = order.items.map((i) => `${i.item_name} x${i.quantity}`).join(' + ');
    endCase('TC1', `201 created, order_id=${createdOrderId}, status=pending, ${lines}, total_amount=Rs.${toMoney(order.total_amount)}`, true);
  } catch (err) {
    endCase('TC1', err.message, false);
  }
}

// tc2 - unknown table id check
async function tc2() {
  beginCase('TC2', 'Invalid table_id (does not exist)', `POST /api/orders  table_id=${MISSING_TABLE_ID}, items=[{item_id:${testItems[0].item_id},quantity:1}]`, 'HTTP 400 or 404, and no new row in orders or order_items');

  try {
    const ordersBefore = await countRows('orders');
    const linesBefore = await countRows('order_items');

    const post = await request('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ table_id: MISSING_TABLE_ID, items: [{ item_id: testItems[0].item_id, quantity: 1 }] }),
    });

    assert.ok(post.status === 400 || post.status === 404, `expected 400 or 404, got ${post.status}`);
    assert.ok(post.body.error, 'error response did not include an "error" field');

    const ordersAfter = await countRows('orders');
    const linesAfter = await countRows('order_items');
    assert.equal(ordersAfter, ordersBefore, `orders went ${ordersBefore} -> ${ordersAfter}, expected no insert`);
    assert.equal(linesAfter, linesBefore, `order_items went ${linesBefore} -> ${linesAfter}, expected no insert`);

    endCase('TC2', `${post.status} "${post.body.error}", orders stayed at ${ordersAfter}, order_items stayed at ${linesAfter}`, true);
  } catch (err) {
    endCase('TC2', err.message, false);
  }
}

// tc3 - empty order
async function tc3() {
  beginCase('TC3', 'Empty items array', `POST /api/orders  table_id=${freeTable.table_id}, items=[]`, 'HTTP 400, and no new row in orders or order_items');

  try {
    const ordersBefore = await countRows('orders');
    const linesBefore = await countRows('order_items');

    const tablesBefore = await request('/api/tables');
    const tableBefore = tablesBefore.body.data.find((t) => Number(t.table_id) === Number(freeTable.table_id));
    const statusBefore = tableBefore.status;

    const post = await request('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ table_id: freeTable.table_id, customer_name: TEST_CUSTOMER, items: [] }),
    });

    assert.equal(post.status, 400, `expected 400, got ${post.status} ${JSON.stringify(post.body)}`);
    assert.ok(post.body.error, 'error response did not include an "error" field');

    const ordersAfter = await countRows('orders');
    const linesAfter = await countRows('order_items');
    assert.equal(ordersAfter, ordersBefore, `orders went ${ordersBefore} -> ${ordersAfter}, expected no insert`);
    assert.equal(linesAfter, linesBefore, `order_items went ${linesBefore} -> ${linesAfter}, expected no insert`);

    const tablesAfter = await request('/api/tables');
    const tableAfter = tablesAfter.body.data.find((t) => Number(t.table_id) === Number(freeTable.table_id));
    assert.equal(tableAfter.status, statusBefore, `table ${freeTable.table_id} was flipped from "${statusBefore}" to "${tableAfter.status}" by a rejected order`);

    endCase('TC3', `400 "${post.body.error}", orders stayed at ${ordersAfter}, order_items stayed at ${linesAfter}, table ${freeTable.table_id} unchanged ("${tableAfter.status}")`, true);
  } catch (err) {
    endCase('TC3', err.message, false);
  }
}

// tc4 - wrong status value
async function tc4() {
  beginCase('TC4', 'Invalid status value on PUT /status', `PUT /api/orders/${createdOrderId}/status  status="${INVALID_STATUS}"`, 'HTTP 400, and the stored order status is unchanged');

  try {
    assert.ok(createdOrderId, 'TC1 did not create an order to test against');

    const before = await request(`/api/orders/${createdOrderId}`);
    assert.equal(before.status, 200, `expected 200 reading the order, got ${before.status}`);
    orderStatusBefore = before.body.data.status;

    const put = await request(`/api/orders/${createdOrderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: INVALID_STATUS }),
    });

    assert.equal(put.status, 400, `expected 400, got ${put.status} ${JSON.stringify(put.body)}`);
    assert.ok(put.body.error, 'error response did not include an "error" field');

    const after = await request(`/api/orders/${createdOrderId}`);
    assert.equal(after.body.data.status, orderStatusBefore, `status changed to "${after.body.data.status}", expected "${orderStatusBefore}"`);

    endCase('TC4', `400 "${put.body.error}", stored status still "${after.body.data.status}"`, true);
  } catch (err) {
    endCase('TC4', err.message, false);
  }
}

// tc5 - unknown order check
async function tc5() {
  beginCase('TC5', 'GET /api/orders/:id for a non-existent id', `GET /api/orders/${MISSING_ORDER_ID}`, 'HTTP 404 with an "error" field');

  try {
    const get = await request(`/api/orders/${MISSING_ORDER_ID}`);

    assert.equal(get.status, 404, `expected 404, got ${get.status} ${JSON.stringify(get.body)}`);
    assert.ok(get.body.error, 'error response did not include an "error" field');

    endCase('TC5', `404 "${get.body.error}"`, true);
  } catch (err) {
    endCase('TC5', err.message, false);
  }
}

async function cleanup() {
  if (createdOrderId !== null) {
    await pool.execute('DELETE FROM orders WHERE order_id = ?', [createdOrderId]);
  }
  await pool.execute('DELETE FROM customers WHERE name = ?', [TEST_CUSTOMER]);
  if (freeTable !== null) {
    await pool.execute("UPDATE restaurant_tables SET status = 'free' WHERE table_id = ?", [freeTable.table_id]);
  }
}

async function run() {
  log('='.repeat(78));
  log('HackA47 RestroManager - Order API Test Suite');
  log('='.repeat(78));
  log(`Base URL:      ${BASE_URL}`);
  log(`Runner:        node:test-free (node:assert + global fetch), no test framework installed`);
  log(`Evidence file: ${EVIDENCE_PATH}`);

  const health = await request('/api/health').catch(() => null);
  if (!health || health.status !== 200) {
    log('');
    log(`PRE-FLIGHT FAILED: no API responding at ${BASE_URL}.`);
    log(`Start the server first:  cd server && npm run dev`);
    fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, `${output.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  log(`Pre-flight:    GET /api/health -> ${health.status} ${JSON.stringify(health.body)}`);

  await setup();
  log(`Fixtures:      table_id=${freeTable.table_id} (table_number ${freeTable.table_number}, status "free")`);
  for (const line of plannedLines) {
    const item = testItems.find((i) => i.item_id === line.item_id);
    log(`               item_id=${line.item_id} "${item.name}" Rs.${toMoney(item.price)} x${line.quantity}`);
  }

  const cases = [tc1, tc2, tc3, tc4, tc5];
  for (const testCase of cases) {
    await testCase();
  }

  log('');
  try {
    await cleanup();
    log(`Cleanup:       removed test order ${createdOrderId}, test customer "${TEST_CUSTOMER}", reset table ${freeTable.table_id} to "free"`);
  } catch (err) {
    log(`Cleanup:       FAILED - ${err.message}`);
    results.push({ id: 'CLEANUP', passed: false });
  }

  await pool.end();

  const failed = results.filter((r) => !r.passed);
  log('');
  log('='.repeat(78));
  log(`SUMMARY: ${results.length - failed.length}/${results.length} passed`);
  for (const result of results) {
    log(`  ${result.passed ? 'PASS' : 'FAIL'}  ${result.id}`);
  }
  log('='.repeat(78));

  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, `${output.join('\n')}\n`);
  console.log(`\nEvidence saved to ${EVIDENCE_PATH}`);

  if (failed.length > 0) process.exitCode = 1;
}

run().catch(async (err) => {
  log('');
  log(`SUITE ERROR: ${err.message}`);
  try {
    await pool.end();
  } catch {
    // kuch nahi karna
  }
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, `${output.join('\n')}\n`);
  process.exitCode = 1;
});
