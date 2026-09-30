-- just initial temporary data

INSERT INTO categories (category_id, name) VALUES
  (1, 'Appetizers'),
  (2, 'Main Courses'),
  (3, 'Desserts'),
  (4, 'Beverages');

INSERT INTO menu_items (name, category_id, price, is_available) VALUES
  -- starters
  ('Crispy Calamari', 1, 11.50, TRUE),
  ('Truffle Garlic Bruschetta', 1, 8.50, TRUE),
  ('Buffalo Chicken Wings', 1, 12.00, TRUE),
  ('Loaded Beef Nachos', 1, 10.50, TRUE),

  -- main course
  ('Grilled Ribeye Steak', 2, 28.50, TRUE),
  ('Creamy Chicken Fettuccine', 2, 17.50, TRUE),
  ('Pan-Seared Atlantic Salmon', 2, 24.00, TRUE),
  ('Classic Cheddar Bacon Burger', 2, 14.50, TRUE),
  ('Wood-Fired Margherita Pizza', 2, 15.00, TRUE),

  -- desserts
  ('Classic Italian Tiramisu', 3, 8.50, TRUE),
  ('Molten Chocolate Lava Cake', 3, 9.00, TRUE),
  ('New York Style Cheesecake', 3, 8.00, TRUE),

  -- beverages
  ('Fresh Mint Lemonade', 4, 4.50, TRUE),
  ('Iced Caramel Macchiato', 4, 5.50, TRUE),
  ('Sparkling Italian Mineral Water', 4, 3.50, TRUE);

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
