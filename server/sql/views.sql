CREATE OR REPLACE VIEW v_order_summary AS
SELECT
  o.order_id,
  o.order_time,
  t.table_number,
  s.name AS staff_name,
  c.name AS customer_name,
  o.status,
  o.total_amount,
  COUNT(oi.order_item_id) AS item_count
FROM orders o
INNER JOIN restaurant_tables t ON t.table_id = o.table_id
LEFT JOIN staff s ON s.staff_id = o.staff_id
LEFT JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN order_items oi ON oi.order_id = o.order_id
GROUP BY
  o.order_id,
  o.order_time,
  t.table_number,
  s.name,
  c.name,
  o.status,
  o.total_amount;

CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
  DATE(o.order_time) AS sale_date,
  COUNT(*) AS order_count,
  COALESCE(SUM(o.total_amount), 0) AS revenue,
  COALESCE(ROUND(AVG(o.total_amount), 2), 0) AS avg_order_value
FROM orders o
GROUP BY DATE(o.order_time);

CREATE OR REPLACE VIEW v_item_sales AS
SELECT
  m.item_id,
  m.name AS item_name,
  c.name AS category_name,
  SUM(oi.quantity) AS total_quantity,
  ROUND(SUM(oi.quantity * oi.price_at_order), 2) AS total_revenue
FROM order_items oi
INNER JOIN menu_items m ON m.item_id = oi.item_id
INNER JOIN categories c ON c.category_id = m.category_id
GROUP BY m.item_id, m.name, c.name;

CREATE OR REPLACE VIEW v_table_status AS
SELECT
  t.table_id,
  t.table_number,
  t.capacity,
  t.status,
  COUNT(o.order_id) AS open_orders,
  COALESCE(SUM(o.total_amount), 0) AS open_amount
FROM restaurant_tables t
LEFT JOIN orders o
  ON o.table_id = t.table_id
 AND o.status <> 'paid'
GROUP BY t.table_id, t.table_number, t.capacity, t.status;
