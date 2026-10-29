const express = require('express');
const pool = require('../config/db');

const router = express.Router();

// order count and total revenue for today
const TODAY_SQL =
  'SELECT COUNT(*) AS total_orders_today, COALESCE(SUM(total_amount), 0) AS total_revenue_today FROM orders WHERE DATE(order_time) = CURDATE()';

// all time top sellers
const TOP_ITEMS_SQL =
  'SELECT m.item_id, m.name AS item_name, SUM(oi.quantity) AS total_quantity FROM order_items oi JOIN menu_items m ON m.item_id = oi.item_id GROUP BY m.item_id, m.name ORDER BY total_quantity DESC, m.name ASC LIMIT 3';

// last 14 days of daily sales
const DAILY_SALES_SQL =
  "SELECT DATE_FORMAT(sale_date, '%Y-%m-%d') AS sale_date, order_count, revenue, avg_order_value FROM v_daily_sales ORDER BY sale_date DESC LIMIT 14";

function toTopItem(row) {
  return {
    item_id: row.item_id,
    item_name: row.item_name,
    total_quantity: Number(row.total_quantity),
  };
}

// GET /api/reports/summary
router.get('/summary', async (req, res, next) => {
  try {
    const [todayRows] = await pool.execute(TODAY_SQL);
    const [topItemRows] = await pool.execute(TOP_ITEMS_SQL);

    const today = todayRows[0];

    return res.json({
      data: {
        total_orders_today: Number(today.total_orders_today),
        total_revenue_today: Number(today.total_revenue_today),
        top_items: topItemRows.map(toTopItem),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/daily-sales
router.get('/daily-sales', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(DAILY_SALES_SQL);

    return res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
