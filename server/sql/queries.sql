-- Q1: Order line items with table and menu context | INNER JOIN
SELECT
  o.order_id,
  t.table_number,
  m.name AS item_name,
  oi.quantity,
  oi.price_at_order,
  ROUND(oi.quantity * oi.price_at_order, 2) AS line_total
FROM order_items oi
INNER JOIN orders o ON o.order_id = oi.order_id
INNER JOIN restaurant_tables t ON t.table_id = o.table_id
INNER JOIN menu_items m ON m.item_id = oi.item_id
ORDER BY o.order_id DESC, oi.order_item_id
LIMIT 100;

-- Q2: Orders with optional customer and staff | LEFT JOIN
SELECT
  o.order_id,
  t.table_number,
  c.name AS customer_name,
  s.name AS staff_name,
  o.status,
  o.total_amount
FROM orders o
INNER JOIN restaurant_tables t ON t.table_id = o.table_id
LEFT JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN staff s ON s.staff_id = o.staff_id
ORDER BY o.order_time DESC
LIMIT 100;

-- Q3: Similarly priced items in the same category | Self-join
SELECT
  c.name AS category,
  a.name AS item_a,
  b.name AS item_b,
  a.price AS price_a,
  b.price AS price_b
FROM menu_items a
INNER JOIN menu_items b
  ON b.category_id = a.category_id
 AND b.item_id > a.item_id
 AND ABS(a.price - b.price) <= 50
INNER JOIN categories c ON c.category_id = a.category_id
ORDER BY c.name, a.name, b.name;

-- Q4: Revenue per category | GROUP BY, SUM, COUNT
SELECT
  c.name AS category,
  COUNT(DISTINCT oi.order_id) AS order_count,
  ROUND(SUM(oi.quantity * oi.price_at_order), 2) AS revenue
FROM categories c
INNER JOIN menu_items m ON m.category_id = c.category_id
INNER JOIN order_items oi ON oi.item_id = m.item_id
GROUP BY c.category_id, c.name
ORDER BY revenue DESC;

-- Q5: High-revenue categories | HAVING
SELECT
  c.name AS category,
  ROUND(SUM(oi.quantity * oi.price_at_order), 2) AS revenue
FROM categories c
INNER JOIN menu_items m ON m.category_id = c.category_id
INNER JOIN order_items oi ON oi.item_id = m.item_id
GROUP BY c.category_id, c.name
HAVING SUM(oi.quantity * oi.price_at_order) > 1000
ORDER BY revenue DESC;

-- Q6: Items priced above the overall average | Subquery in WHERE
SELECT item_id, name, price
FROM menu_items
WHERE price > (SELECT AVG(price) FROM menu_items)
ORDER BY price DESC;

-- Q7: Average daily revenue | Subquery in FROM (derived table)
SELECT ROUND(AVG(daily_revenue), 2) AS avg_daily_revenue
FROM (
  SELECT
    DATE(o.order_time) AS revenue_date,
    SUM(oi.quantity * oi.price_at_order) AS daily_revenue
  FROM orders o
  INNER JOIN order_items oi ON oi.order_id = o.order_id
  GROUP BY DATE(o.order_time)
) AS daily_revenue_by_date;

-- Q8: Items priced above their category average | Correlated subquery
SELECT
  m.item_id,
  m.name,
  c.name AS category,
  m.price
FROM menu_items m
INNER JOIN categories c ON c.category_id = m.category_id
WHERE m.price > (
  SELECT AVG(m2.price)
  FROM menu_items m2
  WHERE m2.category_id = m.category_id
)
ORDER BY c.name, m.price DESC;

-- Q9: Menu items never ordered | NOT EXISTS
SELECT
  m.item_id,
  m.name,
  c.name AS category,
  m.price
FROM menu_items m
INNER JOIN categories c ON c.category_id = m.category_id
WHERE NOT EXISTS (
  SELECT 1
  FROM order_items oi
  WHERE oi.item_id = m.item_id
)
ORDER BY c.name, m.name;

-- Q10: Customers who ordered a dessert | EXISTS
SELECT c.customer_id, c.name
FROM customers c
WHERE EXISTS (
  SELECT 1
  FROM orders o
  INNER JOIN order_items oi ON oi.order_id = o.order_id
  INNER JOIN menu_items m ON m.item_id = oi.item_id
  INNER JOIN categories cat ON cat.category_id = m.category_id
  WHERE o.customer_id = c.customer_id
    AND LOWER(cat.name) LIKE '%dessert%'
)
ORDER BY c.name;

-- Q11: Best and worst sellers | UNION
SELECT
  combined.item_id,
  combined.item_name,
  combined.total_quantity,
  combined.seller_group
FROM (
  SELECT
    best.item_id,
    best.item_name,
    best.total_quantity,
    'best' AS seller_group
  FROM (
    SELECT
      m.item_id,
      m.name AS item_name,
      SUM(oi.quantity) AS total_quantity
    FROM order_items oi
    INNER JOIN menu_items m ON m.item_id = oi.item_id
    GROUP BY m.item_id, m.name
    ORDER BY total_quantity DESC
    LIMIT 3
  ) AS best
  UNION
  SELECT
    worst.item_id,
    worst.item_name,
    worst.total_quantity,
    'worst' AS seller_group
  FROM (
    SELECT
      m.item_id,
      m.name AS item_name,
      SUM(oi.quantity) AS total_quantity
    FROM order_items oi
    INNER JOIN menu_items m ON m.item_id = oi.item_id
    GROUP BY m.item_id, m.name
    ORDER BY total_quantity ASC
    LIMIT 3
  ) AS worst
) AS combined
ORDER BY combined.seller_group, combined.total_quantity DESC;

-- Q12: Item revenue rank within each category | Window function, RANK
SELECT
  c.name AS category,
  m.name AS item_name,
  ROUND(SUM(oi.quantity * oi.price_at_order), 2) AS revenue,
  RANK() OVER (
    PARTITION BY c.category_id
    ORDER BY SUM(oi.quantity * oi.price_at_order) DESC
  ) AS revenue_rank
FROM categories c
INNER JOIN menu_items m ON m.category_id = c.category_id
INNER JOIN order_items oi ON oi.item_id = m.item_id
GROUP BY c.category_id, c.name, m.item_id, m.name
ORDER BY c.name, revenue_rank;

-- Q13: Revenue by weekday and meal period | CASE, date functions
SELECT
  DAYNAME(o.order_time) AS weekday,
  CASE
    WHEN HOUR(o.order_time) < 12 THEN 'Breakfast'
    WHEN HOUR(o.order_time) < 17 THEN 'Lunch'
    ELSE 'Dinner'
  END AS meal_period,
  ROUND(SUM(oi.quantity * oi.price_at_order), 2) AS revenue
FROM orders o
INNER JOIN order_items oi ON oi.order_id = o.order_id
GROUP BY WEEKDAY(o.order_time), DAYNAME(o.order_time), meal_period
ORDER BY WEEKDAY(o.order_time), meal_period;

-- Q14: Top 5 tables by revenue | Aggregate, ORDER BY, LIMIT
SELECT
  t.table_number,
  COUNT(DISTINCT o.order_id) AS order_count,
  ROUND(SUM(oi.quantity * oi.price_at_order), 2) AS revenue
FROM restaurant_tables t
INNER JOIN orders o ON o.table_id = t.table_id
INNER JOIN order_items oi ON oi.order_id = o.order_id
GROUP BY t.table_id, t.table_number
ORDER BY revenue DESC
LIMIT 5;
