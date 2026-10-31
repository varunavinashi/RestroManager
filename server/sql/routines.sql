-- Prevent customer from ordering unavailable menu items

DROP TRIGGER IF EXISTS trg_order_items_bi;
CREATE TRIGGER trg_order_items_bi
BEFORE INSERT ON order_items
FOR EACH ROW
BEGIN
  DECLARE v_is_available BOOLEAN;

  SELECT is_available INTO v_is_available
  FROM menu_items
  WHERE item_id = NEW.item_id;

  IF v_is_available = FALSE THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cannot order an unavailable menu item.';
  END IF;
END;


-- --- 

-- Automatically calculates the total amount of an order whenever a new item is added

DROP TRIGGER IF EXISTS trg_order_items_ai;
CREATE TRIGGER trg_order_items_ai
AFTER INSERT ON order_items
FOR EACH ROW
BEGIN
  UPDATE orders
  SET total_amount = (
    SELECT COALESCE(SUM(quantity * price_at_order), 0)
    FROM order_items
    WHERE order_id = NEW.order_id
  )
  WHERE order_id = NEW.order_id;
END;

-- ---

-- Recalculate order totals whenever an existing order item is modified

DROP TRIGGER IF EXISTS trg_order_items_au;
CREATE TRIGGER trg_order_items_au
AFTER UPDATE ON order_items
FOR EACH ROW
BEGIN
  UPDATE orders
  SET total_amount = (
    SELECT COALESCE(SUM(quantity * price_at_order), 0)
    FROM order_items
    WHERE order_id = NEW.order_id
  )
  WHERE order_id = NEW.order_id;

  IF OLD.order_id <> NEW.order_id THEN
    UPDATE orders
    SET total_amount = (
      SELECT COALESCE(SUM(quantity * price_at_order), 0)
      FROM order_items
      WHERE order_id = OLD.order_id
    )
    WHERE order_id = OLD.order_id;
  END IF;
END;

-- ---

-- Recalculate the order total whenever an item is deleted

DROP TRIGGER IF EXISTS trg_order_items_ad;
CREATE TRIGGER trg_order_items_ad
AFTER DELETE ON order_items
FOR EACH ROW
BEGIN
  UPDATE orders
  SET total_amount = (
    SELECT COALESCE(SUM(quantity * price_at_order), 0)
    FROM order_items
    WHERE order_id = OLD.order_id
  )
  WHERE order_id = OLD.order_id;
END;

-- ---

-- Maintain order status history and automatically free restaurant tables after payment when appropriate

DROP TRIGGER IF EXISTS trg_orders_au;
CREATE TRIGGER trg_orders_au
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO order_status_log (order_id, old_status, new_status)
    VALUES (NEW.order_id, OLD.status, NEW.status);
  END IF;

  IF NEW.status = 'paid' THEN
    UPDATE restaurant_tables
    SET status = 'free'
    WHERE table_id = NEW.table_id
      AND NOT EXISTS (
        SELECT 1
        FROM orders
        WHERE table_id = NEW.table_id
          AND order_id <> NEW.order_id
          AND status <> 'paid'
      );
  END IF;
END;

-- ---

-- Calculate and return the total amount of a particular order 

DROP FUNCTION IF EXISTS fn_order_total;
CREATE FUNCTION fn_order_total(p_order_id INT)
RETURNS DECIMAL(10, 2)
READS SQL DATA
BEGIN
  DECLARE v_total DECIMAL(10, 2);

  SELECT COALESCE(SUM(quantity * price_at_order), 0) INTO v_total
  FROM order_items
  WHERE order_id = p_order_id;

  RETURN v_total;
END;

-- ---

-- Close an order by marking it as paid , but only if the order is served

DROP PROCEDURE IF EXISTS sp_close_order;
CREATE PROCEDURE sp_close_order(IN p_order_id INT)
BEGIN
  DECLARE v_status VARCHAR(20);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT status INTO v_status
  FROM orders
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Order not found';
  END IF;

  IF v_status <> 'served' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Order must be served before payment';
  END IF;

  UPDATE orders
  SET status = 'paid'
  WHERE order_id = p_order_id;

  COMMIT;
END;

-- ---

-- Generate a daily sales report for a particular date

DROP PROCEDURE IF EXISTS sp_daily_sales;
CREATE PROCEDURE sp_daily_sales(IN p_date DATE)
BEGIN
  -- OVERALL SALES SUMMARY
  SELECT
    p_date AS sale_date,
    COUNT(*) AS order_count,
    COALESCE(SUM(total_amount), 0) AS revenue,
    COALESCE(ROUND(AVG(total_amount), 2), 0) AS avg_order_value
  FROM orders
  WHERE DATE(order_time) = p_date;

  -- TOP 3 SELLING ITEMS
  SELECT
    m.item_id,
    m.name AS item_name,
    SUM(oi.quantity) AS total_quantity,
    ROUND(SUM(oi.quantity * oi.price_at_order), 2) AS total_revenue
  FROM orders o
  INNER JOIN order_items oi ON oi.order_id = o.order_id
  INNER JOIN menu_items m ON m.item_id = oi.item_id
  WHERE DATE(o.order_time) = p_date
  GROUP BY m.item_id, m.name
  ORDER BY total_quantity DESC, m.name ASC
  LIMIT 3;
END;
