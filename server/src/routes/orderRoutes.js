const express = require('express');
const pool = require('../config/db');

const router = express.Router();

const ORDER_STATUSES = ['pending', 'preparing', 'served', 'paid'];

// Every order row carries its table, customer and staff context through these joins
const ORDER_COLUMNS = 'o.order_id, o.table_id, t.table_number, o.customer_id, c.name AS customer_name, o.staff_id, s.name AS staff_name, o.order_time, o.status, o.total_amount';
const ORDER_FROM = 'FROM orders o JOIN restaurant_tables t ON t.table_id = o.table_id LEFT JOIN customers c ON c.customer_id = o.customer_id LEFT JOIN staff s ON s.staff_id = o.staff_id';

const ORDER_ITEM_COLUMNS = 'oi.order_item_id, oi.order_id, oi.item_id, m.name AS item_name, oi.quantity, oi.price_at_order, (oi.quantity * oi.price_at_order) AS line_total';

// Validation failures thrown from inside a transaction are rolled back and answered with 400
class RequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RequestError';
  }
}

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

// validate the id (can be of number or string type)
function parseId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null; // check if the string has only digits
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}


function parseCustomerName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name.length === 0 || name.length > 100) return null;
  return name;
}

function parseQuantity(value) {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const quantity = Number(raw);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}

// Returns the requested lines in input order(consisting of item_id and quantity), or null when inputs are invalid
function parseItems(value) {
  if (!Array.isArray(value) || value.length === 0) return null;

  const lines = [];
  for (let i = 0; i < value.length; i += 1) {
    const entry = value[i];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;

    const itemId = parseId(entry.item_id);
    if (itemId === null) return null;

    const quantity = entry.quantity === undefined ? 1 : parseQuantity(entry.quantity);
    if (quantity === null) return null;

    lines.push({ item_id: itemId, quantity });
  }
  return lines;
}

// Converts the db row into json structure as required by API
function toOrder(row, items) {
  const order = {
    order_id: row.order_id,
    table_id: row.table_id,
    table_number: row.table_number,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    staff_id: row.staff_id,
    staff_name: row.staff_name,
    order_time: row.order_time,
    status: row.status,
    total_amount: Number(row.total_amount),
  };
  if (items !== undefined) order.items = items;
  return order;
}

// converts one particular item into object as required by API
function toOrderItem(row) {
  return {
    order_item_id: row.order_item_id,
    order_id: row.order_id,
    item_id: row.item_id,
    item_name: row.item_name,
    quantity: row.quantity,
    price_at_order: Number(row.price_at_order),
    line_total: Number(row.line_total),
  };
}

async function selectOrder(executor, orderId) {
  const [rows] = await executor.execute(`SELECT ${ORDER_COLUMNS} ${ORDER_FROM} WHERE o.order_id = ?`, [orderId]);
  return rows.length ? rows[0] : null;
}

async function selectOrderItems(executor, orderId) {
  const sql = `SELECT ${ORDER_ITEM_COLUMNS} FROM order_items oi JOIN menu_items m ON m.item_id = oi.item_id WHERE oi.order_id = ? ORDER BY oi.order_item_id`;
  const [rows] = await executor.execute(sql, [orderId]);
  return rows.map(toOrderItem);
}

// Gives customer_id for the customer_name, if not available in db, create the new customer
async function resolveCustomerId(connection, customerName) {
  const [existing] = await connection.execute('SELECT customer_id FROM customers WHERE name = ? LIMIT 1', [customerName]);
  if (existing.length > 0) return existing[0].customer_id;

  const [created] = await connection.execute('INSERT INTO customers (name) VALUES (?)', [customerName]);
  return created.insertId;
}

// overall, we validate everything, then we insert them into required tables
// we also calculate the total price of an order
async function insertOrder(connection, { tableId, customerName, staffId, lines }) {
  // get the table details
  const [tableRows] = await connection.execute(
    'SELECT table_id, table_number FROM restaurant_tables WHERE table_id = ? FOR UPDATE',
    [tableId]
  );
  if (tableRows.length === 0) {
    throw new RequestError(`Field "table_id" refers to table ${tableId}, which does not exist.`);
  }

  // get the staff details
  if (staffId !== null) {
    const [staffRows] = await connection.execute('SELECT staff_id FROM staff WHERE staff_id = ?', [staffId]);
    if (staffRows.length === 0) {
      throw new RequestError(`Field "staff_id" refers to staff member ${staffId}, who does not exist.`);
    }
  }

  const customerId = customerName === null ? null : await resolveCustomerId(connection, customerName);

  // line = [{item_id, quantity}]
  // get all the unique items id (set is used to remove duplicates)
  const itemIds = [...new Set(lines.map((line) => line.item_id))];
  const placeholders = itemIds.map(() => '?').join(', ');
  // get details of items
  const [menuRows] = await connection.execute(
    `SELECT item_id, name, price FROM menu_items WHERE item_id IN (${placeholders}) FOR SHARE`,
    itemIds
  );

  // restructute items so we can get them by their id
  const menuById = new Map(menuRows.map((row) => [row.item_id, row]));
  // reject the items not in db
  const missing = itemIds.filter((itemId) => !menuById.has(itemId));
  if (missing.length > 0) {
    throw new RequestError(`Field "items" refers to menu item(s) ${missing.join(', ')}, which do not exist.`);
  }

  // insert the order now after all the validation
  const [orderResult] = await connection.execute(
    'INSERT INTO orders (table_id, customer_id, staff_id, status) VALUES (?, ?, ?, ?)',
    [tableId, customerId, staffId, 'pending']
  );
  const orderId = orderResult.insertId;

  // insert the individual order item
  // calualte total prices
  const values = [];
  const params = [];
  let totalCents = 0;
  for (const line of lines) {
    const price = Number(menuById.get(line.item_id).price);
    values.push('(?, ?, ?, ?)');
    params.push(orderId, line.item_id, line.quantity, price);
    totalCents += Math.round(price * 100) * line.quantity;
  }
  await connection.execute(
    `INSERT INTO order_items (order_id, item_id, quantity, price_at_order) VALUES ${values.join(', ')}`,
    params
  );

  const totalAmount = totalCents / 100;
  await connection.execute('UPDATE orders SET total_amount = ? WHERE order_id = ?', [totalAmount, orderId]);
  await connection.execute("UPDATE restaurant_tables SET status = 'occupied' WHERE table_id = ?", [tableId]);

  const orderRow = await selectOrder(connection, orderId);
  return toOrder(orderRow, await selectOrderItems(connection, orderId));
}

// GET /api/orders
router.get('/', async (req, res, next) => {
  try {
    const sql = `SELECT ${ORDER_COLUMNS}, COUNT(oi.order_item_id) AS item_count ${ORDER_FROM} LEFT JOIN order_items oi ON oi.order_id = o.order_id GROUP BY o.order_id, o.table_id, t.table_number, o.customer_id, c.name, o.staff_id, s.name, o.order_time, o.status, o.total_amount ORDER BY o.order_time DESC, o.order_id DESC`;

    const [rows] = await pool.execute(sql);
    const data = rows.map((row) => ({ ...toOrder(row), item_count: Number(row.item_count) }));
    return res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res, next) => {
  const orderId = parseId(req.params.id);
  if (orderId === null) return badRequest(res, 'Order id must be a positive integer.');

  try {
    const orderRow = await selectOrder(pool, orderId);
    if (orderRow === null) return res.status(404).json({ error: `Order ${orderId} not found.` });

    return res.json({ data: toOrder(orderRow, await selectOrderItems(pool, orderId)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders
// Receive the order request -> validate the input -> get a DB connection
// -> start transaction -> create order -> commit -> send response.
router.post('/', async (req, res, next) => {
  const body = req.body || {};

  const tableId = parseId(body.table_id);
  if (tableId === null) return badRequest(res, 'Field "table_id" is required and must be a positive integer.');

  const customerName =
    body.customer_name === undefined || body.customer_name === null ? null : parseCustomerName(body.customer_name);
  if (customerName === null && body.customer_name !== undefined && body.customer_name !== null) {
    return badRequest(res, 'Field "customer_name" must be a non-empty string of at most 100 characters.');
  }

  const staffId = body.staff_id === undefined || body.staff_id === null ? null : parseId(body.staff_id);
  if (staffId === null && body.staff_id !== undefined && body.staff_id !== null) {
    return badRequest(res, 'Field "staff_id" must be a positive integer.');
  }

  const lines = parseItems(body.items);
  if (lines === null) {
    return badRequest(res, 'Field "items" is required and must be a non-empty array of { item_id, quantity } objects, where quantity is a positive integer.');
  }

  let created;
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      created = await insertOrder(connection, { tableId, customerName, staffId, lines });
      await connection.commit();
    } catch (err) {
      try {
        // if it fails, undo the changes
        await connection.rollback();
      } catch (rollbackErr) {
        console.error('POST /api/orders rollback failed:', rollbackErr.message);
      }
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    if (err instanceof RequestError) return badRequest(res, err.message);
    if (err.sqlState === '45000') return badRequest(res, err.sqlMessage || err.message);
    next(err);
  }

  return res.status(201).json({ message: 'Order placed.', data: created });
});

// PUT /api/orders/:id/status
// Take an order ID and a new status -> validate both -> update the order -> fetch the updated order -> return it
router.put('/:id/status', async (req, res, next) => {
  const orderId = parseId(req.params.id);
  if (orderId === null) return badRequest(res, 'Order id must be a positive integer.');

  const rawStatus = (req.body || {}).status;
  if (typeof rawStatus !== 'string' || !ORDER_STATUSES.includes(rawStatus.trim().toLowerCase())) {
    return badRequest(res, `Field "status" is required and must be one of: ${ORDER_STATUSES.join(', ')}.`);
  }
  const status = rawStatus.trim().toLowerCase();

  try {
    await pool.execute('UPDATE orders SET status = ? WHERE order_id = ?', [status, orderId]);

    // affectedRows can be 0 if the status is already the same, so check the row directly
    const orderRow = await selectOrder(pool, orderId);
    if (orderRow === null) return res.status(404).json({ error: `Order ${orderId} not found.` });

    return res.json({ message: 'Order status updated.', data: toOrder(orderRow, await selectOrderItems(pool, orderId)) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/orders/:id/pay
// Close a served order through the stored procedure , SQLSTATE 45000 is a conflict

router.put('/:id/pay', async (req, res, next) => {
  const orderId = parseId(req.params.id);
  if (orderId === null) return badRequest(res, 'Order id must be a positive integer.');

  try {
    await pool.execute('CALL sp_close_order(?)', [orderId]);

    const orderRow = await selectOrder(pool, orderId);
    if (orderRow === null) return res.status(404).json({ error: `Order ${orderId} not found.` });

    return res.json({ message: 'Order paid.', data: toOrder(orderRow, await selectOrderItems(pool, orderId)) });
  } catch (err) {
    if (err.sqlState === '45000') {
      return res.status(409).json({ error: err.sqlMessage || err.message });
    }
    next(err);
  }
});

module.exports = router;
