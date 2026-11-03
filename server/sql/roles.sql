CREATE ROLE IF NOT EXISTS 'restro_waiter', 'restro_chef', 'restro_manager', 'restro_readonly';

CREATE USER IF NOT EXISTS 'restro_waiter_user'@'localhost' IDENTIFIED BY __PASSWORD__;
ALTER USER 'restro_waiter_user'@'localhost' IDENTIFIED BY __PASSWORD__;
CREATE USER IF NOT EXISTS 'restro_chef_user'@'localhost' IDENTIFIED BY __PASSWORD__;
ALTER USER 'restro_chef_user'@'localhost' IDENTIFIED BY __PASSWORD__;
CREATE USER IF NOT EXISTS 'restro_manager_user'@'localhost' IDENTIFIED BY __PASSWORD__;
ALTER USER 'restro_manager_user'@'localhost' IDENTIFIED BY __PASSWORD__;
CREATE USER IF NOT EXISTS 'restro_readonly_user'@'localhost' IDENTIFIED BY __PASSWORD__;
ALTER USER 'restro_readonly_user'@'localhost' IDENTIFIED BY __PASSWORD__;

GRANT SELECT ON __DB_NAME__.menu_items TO 'restro_waiter';
GRANT SELECT ON __DB_NAME__.categories TO 'restro_waiter';
GRANT SELECT ON __DB_NAME__.restaurant_tables TO 'restro_waiter';
GRANT SELECT ON __DB_NAME__.customers TO 'restro_waiter';
GRANT SELECT (staff_id, name, role) ON __DB_NAME__.staff TO 'restro_waiter';
GRANT SELECT, INSERT ON __DB_NAME__.orders TO 'restro_waiter';
GRANT SELECT, INSERT ON __DB_NAME__.order_items TO 'restro_waiter';
GRANT INSERT ON __DB_NAME__.customers TO 'restro_waiter';
GRANT UPDATE (status) ON __DB_NAME__.restaurant_tables TO 'restro_waiter';
GRANT UPDATE (status) ON __DB_NAME__.orders TO 'restro_waiter';

GRANT SELECT ON __DB_NAME__.orders TO 'restro_chef';
GRANT SELECT ON __DB_NAME__.order_items TO 'restro_chef';
GRANT SELECT ON __DB_NAME__.menu_items TO 'restro_chef';
GRANT SELECT ON __DB_NAME__.restaurant_tables TO 'restro_chef';
GRANT UPDATE (status) ON __DB_NAME__.orders TO 'restro_chef';

GRANT SELECT ON __DB_NAME__.menu_items TO 'restro_manager';
GRANT SELECT ON __DB_NAME__.categories TO 'restro_manager';
GRANT SELECT ON __DB_NAME__.restaurant_tables TO 'restro_manager';
GRANT SELECT ON __DB_NAME__.customers TO 'restro_manager';
GRANT SELECT (staff_id, name, role) ON __DB_NAME__.staff TO 'restro_manager';
GRANT SELECT, INSERT ON __DB_NAME__.orders TO 'restro_manager';
GRANT SELECT, INSERT ON __DB_NAME__.order_items TO 'restro_manager';
GRANT INSERT ON __DB_NAME__.customers TO 'restro_manager';
GRANT UPDATE (status) ON __DB_NAME__.restaurant_tables TO 'restro_manager';
GRANT UPDATE (status) ON __DB_NAME__.orders TO 'restro_manager';
GRANT INSERT, UPDATE, DELETE ON __DB_NAME__.menu_items TO 'restro_manager';
GRANT INSERT, UPDATE, DELETE ON __DB_NAME__.categories TO 'restro_manager';
GRANT SELECT ON __DB_NAME__.v_order_summary TO 'restro_manager';
GRANT SELECT ON __DB_NAME__.v_daily_sales TO 'restro_manager';
GRANT SELECT ON __DB_NAME__.v_item_sales TO 'restro_manager';
GRANT SELECT ON __DB_NAME__.v_table_status TO 'restro_manager';
GRANT EXECUTE ON PROCEDURE __DB_NAME__.sp_close_order TO 'restro_manager';
GRANT EXECUTE ON PROCEDURE __DB_NAME__.sp_daily_sales TO 'restro_manager';

GRANT SELECT ON __DB_NAME__.categories TO 'restro_readonly';
GRANT SELECT ON __DB_NAME__.menu_items TO 'restro_readonly';
GRANT SELECT ON __DB_NAME__.restaurant_tables TO 'restro_readonly';
GRANT SELECT ON __DB_NAME__.customers TO 'restro_readonly';
GRANT SELECT ON __DB_NAME__.staff TO 'restro_readonly';
GRANT SELECT ON __DB_NAME__.orders TO 'restro_readonly';
GRANT SELECT ON __DB_NAME__.order_items TO 'restro_readonly';
GRANT SELECT ON __DB_NAME__.order_status_log TO 'restro_readonly';
GRANT SELECT ON __DB_NAME__.v_order_summary TO 'restro_readonly';
GRANT SELECT ON __DB_NAME__.v_daily_sales TO 'restro_readonly';
GRANT SELECT ON __DB_NAME__.v_item_sales TO 'restro_readonly';
GRANT SELECT ON __DB_NAME__.v_table_status TO 'restro_readonly';
GRANT EXECUTE ON PROCEDURE __DB_NAME__.sp_daily_sales TO 'restro_readonly';

GRANT 'restro_waiter' TO 'restro_waiter_user'@'localhost';
GRANT 'restro_chef' TO 'restro_chef_user'@'localhost';
GRANT 'restro_manager' TO 'restro_manager_user'@'localhost';
GRANT 'restro_readonly' TO 'restro_readonly_user'@'localhost';

SET DEFAULT ROLE 'restro_waiter' TO 'restro_waiter_user'@'localhost';
SET DEFAULT ROLE 'restro_chef' TO 'restro_chef_user'@'localhost';
SET DEFAULT ROLE 'restro_manager' TO 'restro_manager_user'@'localhost';
SET DEFAULT ROLE 'restro_readonly' TO 'restro_readonly_user'@'localhost';
