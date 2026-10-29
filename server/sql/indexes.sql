CREATE INDEX idx_orders_order_time ON orders(order_time);

CREATE INDEX idx_orders_status_time ON orders(status, order_time);

CREATE INDEX idx_menu_items_name ON menu_items(name);

CREATE INDEX idx_order_items_order_item ON order_items(order_id, item_id);
