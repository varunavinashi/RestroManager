-- just initial temporary data

INSERT INTO categories (category_id, name) VALUES
  (1, 'Appetizers'),
  (2, 'Main Courses'),
  (3, 'Desserts'),
  (4, 'Beverages');

INSERT INTO menu_items (name, category_id, price, is_available) VALUES
  -- starters
  ('Samosa with Tamarind Chutney', 1, 90.00, TRUE),
  ('Paneer Tikka Shashlik', 1, 260.00, TRUE),
  ('Chicken Tikka', 1, 320.00, TRUE),
  ('Onion Pakora', 1, 140.00, TRUE),

  -- main course
  ('Butter Chicken', 2, 380.00, TRUE),
  ('Paneer Butter Masala', 2, 320.00, TRUE),
  ('Dal Makhani', 2, 280.00, TRUE),
  ('Chana Masala', 2, 240.00, TRUE),
  ('Hyderabadi Chicken Biryani', 2, 420.00, TRUE),

  -- desserts
  ('Gulab Jamun (2 pcs)', 3, 120.00, TRUE),
  ('Rasmalai', 3, 140.00, TRUE),
  ('Gajar Ka Halwa', 3, 160.00, TRUE),

  -- beverages
  ('Masala Chai', 4, 60.00, TRUE),
  ('Fresh Lime Soda', 4, 90.00, TRUE),
  ('Mango Lassi', 4, 110.00, TRUE);

INSERT INTO restaurant_tables (table_number, capacity, status) VALUES
  (1, 2, 'free'),
  (2, 2, 'free'),
  (3, 4, 'free'),
  (4, 4, 'free'),
  (5, 6, 'free'),
  (6, 6, 'free'),
  (7, 8, 'free'),
  (8, 10, 'free');

INSERT INTO staff (name, role) VALUES
  ('Carlos Mendez', 'manager'),
  ('Emily Watson', 'waiter'),
  ('Marco Rossi', 'chef');

INSERT INTO customers (name, phone) VALUES
  ('John Doe', '+1-555-0143'),
  ('Alice Smith', NULL);
