const pool = require('../config/db');

const tables = [
  "categories",
  "menu_items",
  "restaurant_tables",
  "customers",
  "staff",
  "orders",
  "order_items",
];

async function checkSchema() {
  for (const table of tables) {
    try {
      const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM ${table}`);
      console.log(`${table}: ${rows[0].count} rows`);
    } catch (error) {
      console.error(`${table}: ERROR - ${error.message}`);
    }
  }

  await pool.end();
}

checkSchema().catch((error) => {
  console.error("Schema check failed:", error);
  process.exit(1);
});