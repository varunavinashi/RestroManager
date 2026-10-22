// synthetic data created for testing and development purposes

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = require('../config/db');

const SEED = 47;
const CUSTOMER_COUNT = 40;
const CUSTOMER_PHONE_PREFIX = '90000';

const mulberry32 = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const rand = mulberry32(SEED);
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (items) => items[randInt(0, items.length - 1)];
const pad2 = (value) => String(value).padStart(2, '0');
const roundMoney = (value) => Math.round(value * 100) / 100;

const formatDate = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const formatDateTime = (date) =>
  `${formatDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:00`;

const insertRows = async (conn, table, columns, rows, chunkSize = 500) => {
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const placeholders = chunk
      .map(() => `(${columns.map(() => '?').join(', ')})`)
      .join(', ');
    const params = chunk.flat();

    await conn.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`,
      params
    );
  }
};

const insertOrders = async (conn, orders, chunkSize = 400) => {
  for (let start = 0; start < orders.length; start += chunkSize) {
    const chunk = orders.slice(start, start + chunkSize);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params = chunk.flatMap((order) => [
      order.table_id,
      order.customer_id,
      order.staff_id,
      order.order_time,
      order.status,
      order.total_amount,
    ]);

    const [result] = await conn.query(
      `INSERT INTO orders (table_id, customer_id, staff_id, order_time, status, total_amount)
       VALUES ${placeholders}`,
      params
    );

    chunk.forEach((order, index) => {
      order.order_id = result.insertId + index;
    });
  }
};

const loadData = async () => {
  const [menuRows] = await pool.query(
    'SELECT item_id, name, price, category_id FROM menu_items WHERE is_available = 1'
  );
  const [categoryRows] = await pool.query(
    'SELECT category_id, name FROM categories'
  );
  const [tableRows] = await pool.query(
    'SELECT table_id FROM restaurant_tables'
  );
  const [waiterRows] = await pool.query(
    "SELECT staff_id FROM staff WHERE role = 'waiter' AND is_active = 1"
  );

  if (!menuRows.length) throw new Error('No available menu items found.');
  if (!tableRows.length) throw new Error('No restaurant tables found.');
  if (!waiterRows.length) throw new Error('No active waiter staff found.');

  const categoriesById = new Map(
    categoryRows.map((category) => [category.category_id, category.name])
  );
  const menuItems = menuRows.map((item) => ({
    ...item,
    price: Number(item.price),
    category: categoriesById.get(item.category_id) || '',
  }));
  const itemsByCategory = (name) =>
    menuItems.filter(
      (item) => item.category.toLowerCase() === name.toLowerCase()
    );

  return {
    menuItems,
    itemsByCategory,
    tables: tableRows,
    waiters: waiterRows,
  };
};

const buildSignaturePairs = (menuItems, itemsByCategory) => {
  const byName = new Map(menuItems.map((item) => [item.name, item]));
  const pairs = [];
  const seen = new Set();

  const pairKey = (first, second) =>
    [first.item_id, second.item_id].sort((a, b) => a - b).join(':');

  const addPair = (first, second) => {
    if (!first || !second || first.item_id === second.item_id) return;

    const key = pairKey(first, second);
    if (seen.has(key)) return;

    seen.add(key);
    pairs.push({ first, second });
  };

  const namedPairs = [
    ['Butter Chicken', 'Masala Chai'],
    ['Hyderabadi Chicken Biryani', 'Mango Lassi'],
    ['Paneer Tikka Shashlik', 'Gulab Jamun (2 pcs)'],
  ];

  for (const [firstName, secondName] of namedPairs) {
    addPair(byName.get(firstName), byName.get(secondName));
  }

  const mains = itemsByCategory('Main Courses');
  const beverages = itemsByCategory('Beverages');
  const appetizers = itemsByCategory('Appetizers');
  const desserts = itemsByCategory('Desserts');

  const fallbackPairs = [
    [mains[0], beverages[0]],
    [mains[1] || mains[0], desserts[0] || beverages[1]],
    [appetizers[0], beverages[1] || beverages[0]],
    [mains[0], desserts[0]],
    [appetizers[0], desserts[0]],
  ];

  for (const [first, second] of fallbackPairs) {
    addPair(first, second);
  }

  if (pairs.length < 3) {
    for (let i = 0; i < menuItems.length && pairs.length < 3; i += 1) {
      for (let j = i + 1; j < menuItems.length && pairs.length < 3; j += 1) {
        addPair(menuItems[i], menuItems[j]);
      }
    }
  }

  if (pairs.length < 3) {
    throw new Error('Need at least three distinct item pairs for signature pairs.');
  }

  return pairs.slice(0, 3);
};

const buildCustomers = () => {
  const customers = [];

  for (let index = 1; index <= CUSTOMER_COUNT; index += 1) {
    customers.push({
      name: `Synthetic Guest ${String(index).padStart(2, '0')}`,
      phone: `${CUSTOMER_PHONE_PREFIX}${String(index).padStart(5, '0')}`,
    });
  }

  return customers;
};

const ensureCustomers = async (conn) => {
  const generated = buildCustomers();
  const [existingRows] = await conn.query(
    'SELECT customer_id, phone FROM customers WHERE phone LIKE ?',
    [`${CUSTOMER_PHONE_PREFIX}%`]
  );
  const existingPhones = new Set(existingRows.map((row) => row.phone));
  const missing = generated.filter((customer) => !existingPhones.has(customer.phone));

  if (missing.length) {
    await insertRows(
      conn,
      'customers',
      ['name', 'phone'],
      missing.map((customer) => [customer.name, customer.phone]),
      CUSTOMER_COUNT
    );
  }

  const [syntheticRows] = await conn.query(
    'SELECT customer_id, phone FROM customers WHERE phone LIKE ?',
    [`${CUSTOMER_PHONE_PREFIX}%`]
  );
  const customerIdByPhone = new Map(
    syntheticRows.map((row) => [row.phone, row.customer_id])
  );

  const customerIds = generated
    .map((customer) => customerIdByPhone.get(customer.phone))
    .filter((customerId) => customerId !== undefined);

  if (!customerIds.length) {
    throw new Error('No synthetic customers available.');
  }

  return customerIds;
};

const buildOrder = (date, timeMinutes, context) => {
  const {
    menuItems,
    itemsByCategory,
    tables,
    waiters,
    signaturePairs,
    customerIds,
  } = context;
  const targetCount = randInt(1, 5);
  const chosen = new Map();

  const addItem = (item) => {
    if (item && chosen.size < 5 && !chosen.has(item.item_id)) {
      chosen.set(item.item_id, item);
    }
  };

  const addRandomFrom = (categoryName) => {
    const items = itemsByCategory(categoryName);
    if (items.length) addItem(pick(items));
  };

  // will be used in future to train the model to recognize signature pairs
  if (rand() < 0.5) {
    const pair = pick(signaturePairs);
    addItem(pair.first);
    addItem(pair.second);
  }

  while (chosen.size < targetCount && chosen.size < 5) {
    addItem(pick(menuItems));
  }

  const hasCategory = (name) =>
    [...chosen.values()].some(
      (item) => item.category.toLowerCase() === name.toLowerCase()
    );

  if (hasCategory('Main Courses')) {
    if (!hasCategory('Beverages') && rand() < 0.60) {
      addRandomFrom('Beverages');
    }
    if (!hasCategory('Appetizers') && rand() < 0.35) {
      addRandomFrom('Appetizers');
    }
    if (!hasCategory('Desserts') && rand() < 0.30) {
      addRandomFrom('Desserts');
    }
  }

  const orderDate = new Date(date);
  orderDate.setHours(
    Math.floor(timeMinutes / 60),
    timeMinutes % 60,
    0,
    0
  );

  const items = [...chosen.values()].map((item) => ({
    item_id: item.item_id,
    name: item.name,
    quantity: randInt(1, 3),
    price_at_order: item.price,
  }));
  const totalAmount = roundMoney(
    items.reduce(
      (sum, item) => sum + item.quantity * item.price_at_order,
      0
    )
  );
  const customerId =
    customerIds.length && rand() < 0.4 ? pick(customerIds) : null;

  return {
    table_id: pick(tables).table_id,
    customer_id: customerId,
    staff_id: pick(waiters).staff_id,
    order_time: formatDateTime(orderDate),
    status: 'paid',
    total_amount: totalAmount,
    items,
  };
};

const buildOrders = (context) => {
  const orders = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let daysAgo = 60; daysAgo >= 1; daysAgo -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - daysAgo);

    const dayOfWeek = date.getDay();
    const isBusyDay = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
    const orderCount = isBusyDay ? randInt(31, 45) : randInt(18, 30);
    const times = [];

    for (let index = 0; index < orderCount; index += 1) {
      const isLunch = rand() < 0.45;
      const minutes = isLunch
        ? 12 * 60 + randInt(0, 180)
        : 19 * 60 + randInt(0, 210);
      times.push(minutes);
    }

    times.sort((first, second) => first - second);

    for (const minutes of times) {
      orders.push(buildOrder(date, minutes, context));
    }
  }

  return orders;
};

const printSummary = (orders) => {
  const revenue = roundMoney(
    orders.reduce((sum, order) => sum + order.total_amount, 0)
  );
  const firstDate = orders[0] ? orders[0].order_time.slice(0, 10) : 'n/a';
  const lastDate = orders.length
    ? orders[orders.length - 1].order_time.slice(0, 10)
    : 'n/a';
  const itemTotals = new Map();
  const itemNames = new Map();
  const pairTotals = new Map();

  for (const order of orders) {
    for (const item of order.items) {
      itemTotals.set(
        item.item_id,
        (itemTotals.get(item.item_id) || 0) + item.quantity
      );
      itemNames.set(item.item_id, item.name);
    }

    const itemIds = order.items
      .map((item) => item.item_id)
      .sort((first, second) => first - second);

    for (let i = 0; i < itemIds.length; i += 1) {
      for (let j = i + 1; j < itemIds.length; j += 1) {
        const key = `${itemIds[i]}:${itemIds[j]}`;
        pairTotals.set(key, (pairTotals.get(key) || 0) + 1);
      }
    }
  }

  const topItems = [...itemTotals.entries()]
    .sort((first, second) => second[1] - first[1] || first[0] - second[0])
    .slice(0, 5);
  const topPairs = [...pairTotals.entries()]
    .sort(
      (first, second) =>
        second[1] - first[1] || first[0].localeCompare(second[0])
    )
    .slice(0, 5);

  console.log('');
  console.log('Synthetic order seed summary');
  console.log(`  Orders: ${orders.length}`);
  console.log(`  Date range: ${firstDate} to ${lastDate}`);
  console.log(`  Revenue: ${revenue.toFixed(2)}`);
  console.log('  Top 5 items by quantity:');

  topItems.forEach(([itemId, quantity], index) => {
    console.log(`    ${index + 1}. ${itemNames.get(itemId)} — ${quantity}`);
  });

  console.log('  Top 5 pairs by co-occurrence:');

  topPairs.forEach(([key, count], index) => {
    const [firstId, secondId] = key.split(':').map(Number);
    console.log(
      `    ${index + 1}. ${itemNames.get(firstId)} + ${itemNames.get(secondId)} — ${count}`
    );
  });
};

const seedOrders = async () => {
  const force = process.argv.includes('--force');

  try {
    const [orderCountRows] = await pool.query(
      'SELECT COUNT(*) AS count FROM orders'
    );
    const orderCount = Number(orderCountRows[0].count);

    if (orderCount > 0 && !force) {
      console.error(
        `Refusing to seed: orders already has ${orderCount} row(s).`
      );
      console.error(
        'Re-run with --force to delete all orders, order_items, and synthetic customers.'
      );
      process.exitCode = 1;
      return;
    }

    const contextData = await loadData();
    const signaturePairs = buildSignaturePairs(
      contextData.menuItems,
      contextData.itemsByCategory
    );

    console.log('Signature pairs:');
    signaturePairs.forEach((pair, index) => {
      console.log(
        `  ${index + 1}. ${pair.first.name} + ${pair.second.name}`
      );
    });

    const conn = await pool.getConnection();
    let orders;

    try {
      await conn.beginTransaction();

      if (force) {
        await conn.query('DELETE FROM order_items');
        await conn.query('DELETE FROM orders');
        await conn.query('DELETE FROM customers WHERE phone LIKE ?', [
          `${CUSTOMER_PHONE_PREFIX}%`,
        ]);
      }

      const customerIds = await ensureCustomers(conn);
      orders = buildOrders({
        ...contextData,
        signaturePairs,
        customerIds,
      });

      await insertOrders(conn, orders);

      const orderItemRows = orders.flatMap((order) =>
        order.items.map((item) => [
          order.order_id,
          item.item_id,
          item.quantity,
          item.price_at_order,
        ])
      );

      await insertRows(
        conn,
        'order_items',
        ['order_id', 'item_id', 'quantity', 'price_at_order'],
        orderItemRows
      );
      await conn.query('UPDATE restaurant_tables SET status = ?', ['free']);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    printSummary(orders);
  } finally {
    await pool.end();
  }
};

seedOrders().catch((err) => {
  console.error('Order seeding failed:', err);
  process.exit(1);
});
