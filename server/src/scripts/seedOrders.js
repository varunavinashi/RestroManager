// synthetic data created for testing and development purposes

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = require('../config/db');

const SEED = 47;
const CUSTOMER_COUNT = 40;
const CUSTOMER_PHONE_PREFIX = '90000';

// Signature pairs are defined by menu item name; 
const SIGNATURE_PAIRS = [
  { first: 'Butter Chicken', partner: 'Butter Naan' },
  { first: 'Chicken Biryani', partner: 'Boondi Raita' },
  { first: 'Dal Makhani', partner: 'Jeera Rice' },
];
const SIGNATURE_PARTNER_CHANCE = 0.55;

// Anchor mains come from the Main Courses category, and these favourites are wice as likely to anchor an order.
const ANCHOR_WEIGHT_BOOST_NAMES = new Set([
  'Butter Chicken',
  'Chicken Biryani',
  'Dal Makhani',
]);
const ANCHOR_WEIGHT_BOOST = 2;

// Breads & Rice add-ons that follow an anchor main.
const BREAD_CHANCE = 0.65;
const SECOND_BREAD_CHANCE = 0.15;
const RICE_CHANCE = 0.25;
const BREAD_WEIGHTS = new Map([
  ['Butter Naan', 3],
  ['Garlic Naan', 3],
  ['Tandoori Roti', 2],
]);
const BREAD_KEYWORDS = ['naan', 'roti', 'paratha', 'kulcha', 'chapati'];

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

const weightedPick = (items, weightOf) => {
  if (!items.length) return undefined;

  const totalWeight = items.reduce((sum, item) => sum + weightOf(item), 0);
  if (totalWeight <= 0) return pick(items);

  let threshold = rand() * totalWeight;
  for (const item of items) {
    threshold -= weightOf(item);
    if (threshold < 0) return item;
  }

  return items[items.length - 1];
};

const isBreadsAndRice = (item) =>
  item.category.toLowerCase() === 'breads & rice';
const isBread = (item) =>
  isBreadsAndRice(item) &&
  BREAD_KEYWORDS.some((keyword) => item.name.toLowerCase().includes(keyword));
const isRice = (item) =>
  isBreadsAndRice(item) && item.name.toLowerCase().includes('rice');

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

const resolveSignaturePairs = (menuItems) => {
  const byName = new Map(menuItems.map((item) => [item.name, item]));
  const pairs = [];

  for (const { first, partner } of SIGNATURE_PAIRS) {
    const firstItem = byName.get(first);
    const partnerItem = byName.get(partner);

    if (!firstItem || !partnerItem) {
      const missing = !firstItem ? first : partner;
      console.warn(
        `Skipping signature pair "${first}" -> "${partner}": "${missing}" is not on the available menu.`
      );
      continue;
    }

    if (firstItem.item_id === partnerItem.item_id) {
      console.warn(
        `Skipping signature pair "${first}" -> "${partner}": both names resolve to the same item.`
      );
      continue;
    }

    pairs.push({ first: firstItem, partner: partnerItem });
  }

  return pairs;
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

  // Anchor mains always come from the Main Courses category; the favourites in
  // ANCHOR_WEIGHT_BOOST_NAMES are twice as likely to be picked.
  const mains = itemsByCategory('Main Courses');
  const anchor = weightedPick(mains, (item) =>
    ANCHOR_WEIGHT_BOOST_NAMES.has(item.name) ? ANCHOR_WEIGHT_BOOST : 1
  );
  addItem(anchor);

  // Breads and rice are add-ons that follow the anchor main.
  const breads = itemsByCategory('Breads & Rice').filter(isBread);
  const rices = itemsByCategory('Breads & Rice').filter(isRice);

  const addBread = () => {
    const availableBreads = breads.filter((item) => !chosen.has(item.item_id));
    addItem(
      weightedPick(availableBreads, (item) => BREAD_WEIGHTS.get(item.name) || 1)
    );
  };

  if (anchor) {
    if (rand() < BREAD_CHANCE) {
      addBread();
      if (rand() < SECOND_BREAD_CHANCE) addBread();
    }
    if (rices.length && rand() < RICE_CHANCE) {
      addItem(pick(rices));
    }
  }

  // Signature pairs are name based. The partner is only considered once its
  // first item is already present, so the two are never inserted together.
  const chosenNames = new Set([...chosen.values()].map((item) => item.name));
  for (const pair of signaturePairs) {
    if (!chosenNames.has(pair.first.name)) continue;
    if (chosen.has(pair.partner.item_id)) continue;

    if (rand() < SIGNATURE_PARTNER_CHANCE) {
      addItem(pair.partner);
      chosenNames.add(pair.partner.name);
    }
  }

  // Fill the rest of the order with sides; mains come only from the anchor
  // selection above.
  while (chosen.size < targetCount && chosen.size < 5) {
    const remaining = menuItems.filter(
      (item) =>
        item.category.toLowerCase() !== 'main courses' &&
        !chosen.has(item.item_id)
    );
    if (!remaining.length) break;
    addItem(pick(remaining));
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

const printSignaturePairStats = (orders, signaturePairs) => {
  console.log('');
  console.log('Signature pair probabilities P(partner | first item):');

  for (const { first, partner } of signaturePairs) {
    let firstCount = 0;
    let partnerCount = 0;

    for (const order of orders) {
      const itemIds = new Set(order.items.map((item) => item.item_id));
      if (!itemIds.has(first.item_id)) continue;

      firstCount += 1;
      if (itemIds.has(partner.item_id)) partnerCount += 1;
    }

    const probability = firstCount ? partnerCount / firstCount : 0;
    console.log(
      `  ${first.name} -> ${partner.name}: ${probability.toFixed(3)} (${partnerCount}/${firstCount})`
    );
  }
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
    const signaturePairs = resolveSignaturePairs(contextData.menuItems);

    console.log('Signature pairs:');
    signaturePairs.forEach((pair, index) => {
      console.log(
        `  ${index + 1}. ${pair.first.name} -> ${pair.partner.name}`
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
    printSignaturePairStats(orders, signaturePairs);
  } finally {
    await pool.end();
  }
};

seedOrders().catch((err) => {
  console.error('Order seeding failed:', err);
  process.exit(1);
});
