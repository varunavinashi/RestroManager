const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = require('../config/db');

const ITERATIONS = 200;
const OUTPUT_PATH = path.resolve(
  __dirname,
  '../../../05_Testing/Test_Evidence/index-explain-demo.txt'
);

const pad2 = (value) => String(value).padStart(2, '0');

const formatDateTime = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;

const rangeEndDate = new Date();
rangeEndDate.setHours(23, 59, 59, 0);

const rangeStartDate = new Date(rangeEndDate);
rangeStartDate.setDate(rangeStartDate.getDate() - 7);
rangeStartDate.setHours(0, 0, 0, 0);

const RANGE_START = formatDateTime(rangeStartDate);
const RANGE_END = formatDateTime(rangeEndDate);

const ALL_INDEXES = [
  {
    table: 'orders',
    indexName: 'idx_orders_order_time',
    createSql: 'CREATE INDEX idx_orders_order_time ON orders(order_time)',
  },
  {
    table: 'orders',
    indexName: 'idx_orders_status_time',
    createSql: 'CREATE INDEX idx_orders_status_time ON orders(status, order_time)',
  },
  {
    table: 'menu_items',
    indexName: 'idx_menu_items_name',
    createSql: 'CREATE INDEX idx_menu_items_name ON menu_items(name)',
  },
  {
    table: 'order_items',
    indexName: 'idx_order_items_order_item',
    createSql:
      'CREATE INDEX idx_order_items_order_item ON order_items(order_id, item_id)',
  },
];

const SCENARIOS = [
  {
    title: 'Status filter with a date range',
    table: 'orders',
    indexName: 'idx_orders_status_time',
    createSql: 'CREATE INDEX idx_orders_status_time ON orders(status, order_time)',
    sql: 'SELECT * FROM orders WHERE status = ? AND order_time BETWEEN ? AND ?',
    params: ['paid', RANGE_START, RANGE_END],
  },
  {
    title: 'Orders in a date range',
    table: 'orders',
    indexName: 'idx_orders_order_time',
    createSql: 'CREATE INDEX idx_orders_order_time ON orders(order_time)',
    sql: 'SELECT * FROM orders WHERE order_time BETWEEN ? AND ?',
    params: [RANGE_START, RANGE_END],
  },
  {
    title: 'Menu search with name LIKE',
    table: 'menu_items',
    indexName: 'idx_menu_items_name',
    createSql: 'CREATE INDEX idx_menu_items_name ON menu_items(name)',
    sql: "SELECT * FROM menu_items WHERE name LIKE 'Gar%'",
    params: [],
  },
];

const indexExists = async (table, indexName) => {
  const [rows] = await pool.query(
    'SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1',
    [table, indexName]
  );
  return rows.length > 0;
};

const ensureIndex = async ({ table, indexName, createSql }) => {
  if (!(await indexExists(table, indexName))) {
    await pool.query(createSql);
  }
};

const dropIndex = async (table, indexName) => {
  if (await indexExists(table, indexName)) {
    await pool.query(`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``);
  }
};

const explain = async (sql, params) => {
  const [rows] = await pool.query(`EXPLAIN ${sql}`, params);
  const plan = rows[0] || {};
  return {
    type: plan.type === undefined || plan.type === null ? '-' : String(plan.type),
    key: plan.key === undefined || plan.key === null ? 'NULL' : String(plan.key),
    rows: plan.rows === undefined || plan.rows === null ? '-' : String(plan.rows),
  };
};

const timeExecutions = async (sql, params) => {
  const startedAt = process.hrtime.bigint();

  for (let index = 0; index < ITERATIONS; index += 1) {
    await pool.query(sql, params);
  }

  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
  return elapsedMs / ITERATIONS;
};

const formatPlan = (plan, averageMs) =>
  `type: ${plan.type} | key: ${plan.key} | rows: ${plan.rows} | avg: ${averageMs.toFixed(4)} ms`;

const resetDemoIndexes = async () => {
  for (const scenario of SCENARIOS) {
    await dropIndex(scenario.table, scenario.indexName);
  }
};

const runScenario = async (scenario, log) => {
  await dropIndex(scenario.table, scenario.indexName);

  const beforePlan = await explain(scenario.sql, scenario.params);
  const beforeAverage = await timeExecutions(scenario.sql, scenario.params);

  await pool.query(scenario.createSql);

  const afterPlan = await explain(scenario.sql, scenario.params);
  const afterAverage = await timeExecutions(scenario.sql, scenario.params);

  log(`=== ${scenario.title} ===`);
  log(`Query: ${scenario.sql}`);
  log(`Params: ${JSON.stringify(scenario.params)}`);
  log(`Before (${scenario.indexName} dropped): ${formatPlan(beforePlan, beforeAverage)}`);
  log(`After  (${scenario.indexName} created): ${formatPlan(afterPlan, afterAverage)}`);
  log('');
};

const run = async () => {
  const lines = [];
  const log = (line = '') => {
    console.log(line);
    lines.push(line);
  };

  log('Index EXPLAIN demo');
  log(`Synthetic order data; date range: ${RANGE_START} to ${RANGE_END}`);
  log(`Executions timed per measurement: ${ITERATIONS}`);
  log('');

  try {
    log('Dropping the three demo indexes to establish a no-index baseline.');
    log('');
    await resetDemoIndexes();
    await pool.query('ANALYZE TABLE orders, menu_items');

    for (const scenario of SCENARIOS) {
      await runScenario(scenario, log);
    }
  } finally {
    for (const index of ALL_INDEXES) {
      await ensureIndex(index);
    }

    log('All indexes are present at the end of the demo.');

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, `${lines.join('\n')}\n`, 'utf8');

    await pool.end();
  }
};

run().catch((err) => {
  console.error('EXPLAIN demo failed:', err);
  process.exit(1);
});
