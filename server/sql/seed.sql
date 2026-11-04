-- just initial temporary data

INSERT INTO categories (category_id, name) VALUES
  (1, 'Appetizers'),
  (2, 'Main Courses'),
  (3, 'Breads & Rice'),
  (4, 'Desserts'),
  (5, 'Beverages');

INSERT INTO menu_items (name, category_id, price, is_available) VALUES
  -- starters
  ('Paneer Tikka', (SELECT category_id FROM categories WHERE name = 'Appetizers'), 220.00, TRUE),
  ('Murgh Malai Tikka', (SELECT category_id FROM categories WHERE name = 'Appetizers'), 260.00, TRUE),
  ('Tandoori Prawns', (SELECT category_id FROM categories WHERE name = 'Appetizers'), 340.00, TRUE),
  ('Hara Bhara Kebab', (SELECT category_id FROM categories WHERE name = 'Appetizers'), 180.00, TRUE),
  ('Galouti Kebab', (SELECT category_id FROM categories WHERE name = 'Appetizers'), 290.00, TRUE),
  ('Samosa Chaat', (SELECT category_id FROM categories WHERE name = 'Appetizers'), 120.00, TRUE),
  ('Crispy Corn', (SELECT category_id FROM categories WHERE name = 'Appetizers'), 160.00, TRUE),

  -- main courses
  ('Butter Chicken', (SELECT category_id FROM categories WHERE name = 'Main Courses'), 340.00, TRUE),
  ('Chicken Tikka Masala', (SELECT category_id FROM categories WHERE name = 'Main Courses'), 330.00, TRUE),
  ('Lamb Rogan Josh', (SELECT category_id FROM categories WHERE name = 'Main Courses'), 420.00, TRUE),
  ('Malabar Fish Curry', (SELECT category_id FROM categories WHERE name = 'Main Courses'), 380.00, TRUE),
  ('Chicken Biryani', (SELECT category_id FROM categories WHERE name = 'Main Courses'), 320.00, TRUE),
  ('Veg Biryani', (SELECT category_id FROM categories WHERE name = 'Main Courses'), 260.00, TRUE),
  ('Dal Makhani', (SELECT category_id FROM categories WHERE name = 'Main Courses'), 240.00, TRUE),
  ('Paneer Butter Masala', (SELECT category_id FROM categories WHERE name = 'Main Courses'), 280.00, TRUE),
  ('Palak Paneer', (SELECT category_id FROM categories WHERE name = 'Main Courses'), 260.00, TRUE),

  -- breads & rice
  ('Chapati', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 30.00, TRUE),
  ('Tandoori Roti', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 40.00, TRUE),
  ('Rumali Roti', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 45.00, TRUE),
  ('Plain Naan', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 50.00, TRUE),
  ('Missi Roti', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 55.00, TRUE),
  ('Butter Naan', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 60.00, TRUE),
  ('Lachha Paratha', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 65.00, TRUE),
  ('Garlic Naan', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 70.00, TRUE),
  ('Amritsari Kulcha', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 85.00, TRUE),
  ('Cheese Naan', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 90.00, TRUE),
  ('Jeera Rice', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 130.00, TRUE),
  ('Steamed Basmati Rice', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 110.00, TRUE),
  ('Boondi Raita', (SELECT category_id FROM categories WHERE name = 'Breads & Rice'), 80.00, TRUE),

  -- desserts
  ('Gulab Jamun', (SELECT category_id FROM categories WHERE name = 'Desserts'), 110.00, TRUE),
  ('Rasmalai', (SELECT category_id FROM categories WHERE name = 'Desserts'), 140.00, TRUE),
  ('Gajar Ka Halwa', (SELECT category_id FROM categories WHERE name = 'Desserts'), 130.00, TRUE),
  ('Kulfi Falooda', (SELECT category_id FROM categories WHERE name = 'Desserts'), 150.00, TRUE),
  ('Shahi Tukda', (SELECT category_id FROM categories WHERE name = 'Desserts'), 140.00, TRUE),

  -- beverages
  ('Masala Chai', (SELECT category_id FROM categories WHERE name = 'Beverages'), 70.00, TRUE),
  ('Sweet Lassi', (SELECT category_id FROM categories WHERE name = 'Beverages'), 110.00, TRUE),
  ('Mango Lassi', (SELECT category_id FROM categories WHERE name = 'Beverages'), 130.00, TRUE),
  ('Fresh Lime Soda', (SELECT category_id FROM categories WHERE name = 'Beverages'), 90.00, TRUE),
  ('Cold Coffee', (SELECT category_id FROM categories WHERE name = 'Beverages'), 140.00, TRUE),
  ('Mineral Water', (SELECT category_id FROM categories WHERE name = 'Beverages'), 40.00, TRUE);

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
  ('Suyash Singh', 'manager'),
  ('Utkarsh Amritraj', 'waiter'),
  ('Varun Avinashi', 'chef'),
  ('Utkarsh Srivastava', 'readonly');

INSERT INTO customers (name, phone) VALUES
  ('John Doe', '+1-555-0143'),
  ('Alice Smith', NULL);
