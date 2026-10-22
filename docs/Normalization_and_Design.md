# RestroManager — Normalization and Design

Source of truth: `server/sql/schema.sql`.

This document describes the seven tables declared in that file. 

All seven tables are declared with `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`.

---

## 1. Entities and Attributes

### 1.1 `categories`

| Column | SQL type | Constraint / note |
|---|---|---|
| `category_id` | `INT` | `PRIMARY KEY`, `AUTO_INCREMENT` |
| `name` | `VARCHAR(100)` | `NOT NULL`, `UNIQUE` |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` |

### 1.2 `menu_items`

| Column | SQL type | Constraint / note |
|---|---|---|
| `item_id` | `INT` | `PRIMARY KEY`, `AUTO_INCREMENT` |
| `name` | `VARCHAR(150)` | `NOT NULL` |
| `category_id` | `INT` | `NOT NULL`, FK → `categories.category_id` |
| `price` | `DECIMAL(8,2)` | `NOT NULL`, `CHECK chk_menu_price (price >= 0)` |
| `is_available` | `BOOLEAN` | `NOT NULL`, `DEFAULT TRUE` |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` |

### 1.3 `restaurant_tables`

| Column | SQL type | Constraint / note |
|---|---|---|
| `table_id` | `INT` | `PRIMARY KEY`, `AUTO_INCREMENT` |
| `table_number` | `INT` | `NOT NULL`, `UNIQUE` |
| `capacity` | `INT` | `NOT NULL`, `CHECK chk_table_capacity (capacity > 0)` |
| `status` | `ENUM('free', 'occupied')` | `NOT NULL`, `DEFAULT 'free'` |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` |

### 1.4 `customers`

| Column | SQL type | Constraint / note |
|---|---|---|
| `customer_id` | `INT` | `PRIMARY KEY`, `AUTO_INCREMENT` |
| `name` | `VARCHAR(100)` | `NOT NULL` |
| `phone` | `VARCHAR(20)` | `NULL`, `UNIQUE` |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` |

### 1.5 `staff`

| Column | SQL type | Constraint / note |
|---|---|---|
| `staff_id` | `INT` | `PRIMARY KEY`, `AUTO_INCREMENT` |
| `name` | `VARCHAR(100)` | `NOT NULL` |
| `role` | `ENUM('waiter', 'manager', 'chef')` | `NOT NULL` |
| `username` | `VARCHAR(50)` | `NULL`, `UNIQUE` |
| `password_hash` | `VARCHAR(255)` | `NULL` |
| `is_active` | `BOOLEAN` | `NOT NULL`, `DEFAULT TRUE` |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` |

### 1.6 `orders`

| Column | SQL type | Constraint / note |
|---|---|---|
| `order_id` | `INT` | `PRIMARY KEY`, `AUTO_INCREMENT` |
| `table_id` | `INT` | `NOT NULL`, FK → `restaurant_tables.table_id` |
| `customer_id` | `INT` | `NULL`, FK → `customers.customer_id` |
| `staff_id` | `INT` | `NULL`, FK → `staff.staff_id` |
| `order_time` | `DATETIME` | `NOT NULL`, `DEFAULT CURRENT_TIMESTAMP` |
| `status` | `ENUM('pending', 'preparing', 'served', 'paid')` | `NOT NULL`, `DEFAULT 'pending'` |
| `total_amount` | `DECIMAL(10,2)` | `NOT NULL`, `DEFAULT 0.00`, `CHECK chk_order_total (total_amount >= 0)` |

### 1.7 `order_items`

| Column | SQL type | Constraint / note |
|---|---|---|
| `order_item_id` | `INT` | `PRIMARY KEY`, `AUTO_INCREMENT` |
| `order_id` | `INT` | `NOT NULL`, FK → `orders.order_id` |
| `item_id` | `INT` | `NOT NULL`, FK → `menu_items.item_id` |
| `quantity` | `INT` | `NOT NULL`, `DEFAULT 1`, `CHECK chk_item_quantity (quantity > 0)` |
| `price_at_order` | `DECIMAL(8,2)` | `NOT NULL`, `CHECK chk_item_price (price_at_order >= 0)` |

---

## 2. Relationships and Cardinality

| Relationship | Cardinality | Participation | Relational implementation |
|---|---|---|---|
| `categories` → `menu_items` | `1` to `0..N` | `menu_items` total on the category side; `categories` partial | `menu_items.category_id` is `NOT NULL` FK |
| `restaurant_tables` → `orders` | `1` to `0..N` | `orders` total; `restaurant_tables` partial | `orders.table_id` is `NOT NULL` FK |
| `customers` → `orders` | `0..1` to `0..N` | `orders` optional; `customers` partial | `orders.customer_id` is a nullable FK |
| `staff` → `orders` | `0..1` to `0..N` | `orders` optional; `staff` partial | `orders.staff_id` is a nullable FK |
| `orders` → `order_items` | `1` to `0..N` | `order_items` total; `orders` partial in the declared schema | `order_items.order_id` is a `NOT NULL` FK |
| `menu_items` → `order_items` | `1` to `0..N` | `order_items` total; `menu_items` partial | `order_items.item_id` is a `NOT NULL` FK |
| `orders` ↔ `menu_items` | `M` to `N` | Resolved by `order_items` | `order_items` is the associative entity linking one order to one menu item |

Notes:

- Each `order_items` row belongs to exactly one `orders` row and exactly one `menu_items` row.
- `order_items` is the associative entity that resolves the many-to-many relationship between orders and menu items. It carries the relationship attributes `quantity` and `price_at_order`.
- The intended order-to-items relationship is one order to many order items. Because `order_items.order_id` is `NOT NULL`, every order item has exactly one order. However, `schema.sql` does not enforce that every order has at least one order item, so the physical minimum on the order side is zero.
- `schema.sql` does not declare `UNIQUE (order_id, item_id)` on `order_items`, so it does not prevent two lines for the same menu item in the same order.

---

## 3. Business Rules

| ID | Business rule | Enforced by |
|---|---|---|
| BR1 | A category name must be unique. | `UNIQUE (categories.name)` |
| BR2 | A menu item price cannot be negative. | `CHECK chk_menu_price (price >= 0)` |
| BR3 | Every menu item must reference an existing category, and a category with menu items cannot be deleted. | FK `menu_items.category_id` → `categories.category_id`, `ON DELETE RESTRICT`, `ON UPDATE CASCADE` |
| BR4 | A restaurant table number must be unique. | `UNIQUE (restaurant_tables.table_number)` |
| BR5 | A restaurant table capacity must be greater than zero. | `CHECK chk_table_capacity (capacity > 0)` |
| BR6 | A restaurant table status must be `free` or `occupied`. | `ENUM('free', 'occupied')`, `NOT NULL`, `DEFAULT 'free'` |
| BR7 | A customer phone number must be unique when it is provided. | `UNIQUE (customers.phone)`; `phone` is nullable |
| BR8 | A staff role must be `waiter`, `manager`, or `chef`. | `ENUM('waiter', 'manager', 'chef')`, `NOT NULL` |
| BR9 | A staff username must be unique when it is provided. | `UNIQUE (staff.username)`; `username` is nullable |
| BR10 | Every order must reference an existing restaurant table, and a table with orders cannot be deleted. | FK `orders.table_id` → `restaurant_tables.table_id`, `ON DELETE RESTRICT`, `ON UPDATE CASCADE` |
| BR11 | An order may have at most one customer; deleting that customer sets `orders.customer_id` to `NULL`. | FK `orders.customer_id` → `customers.customer_id`, `ON DELETE SET NULL`, `ON UPDATE CASCADE`; column is nullable |
| BR12 | An order may have at most one staff member; deleting that staff member sets `orders.staff_id` to `NULL`. | FK `orders.staff_id` → `staff.staff_id`, `ON DELETE SET NULL`, `ON UPDATE CASCADE`; column is nullable |
| BR13 | An order total cannot be negative. | `CHECK chk_order_total (total_amount >= 0)` |
| BR14 | An order status must be `pending`, `preparing`, `served`, or `paid`. | `ENUM('pending', 'preparing', 'served', 'paid')`, `NOT NULL`, `DEFAULT 'pending'` |
| BR15 | An order item quantity must be greater than zero. | `CHECK chk_item_quantity (quantity > 0)` |
| BR16 | An order item price snapshot cannot be negative. | `CHECK chk_item_price (price_at_order >= 0)` |
| BR17 | Every order item must reference an existing order; deleting an order deletes its order items. | FK `order_items.order_id` → `orders.order_id`, `ON DELETE CASCADE`, `ON UPDATE CASCADE` |
| BR18 | Every order item must reference an existing menu item; a menu item referenced by order items cannot be deleted. | FK `order_items.item_id` → `menu_items.item_id`, `ON DELETE RESTRICT`, `ON UPDATE CASCADE` |
| BR19 | `orders.total_amount` should equal `SUM(order_items.quantity * order_items.price_at_order)` for the order. | **planned trigger**; not present in `schema.sql` |
| BR20 | `order_items.price_at_order` records the menu item's price at the time the order item is written, not a live reference to the current `menu_items.price`. | Application/order-write path; no trigger or FK in `schema.sql` enforces equality with the current menu price |
| BR21 | An order may exist without a customer or without a staff member. | `orders.customer_id` and `orders.staff_id` are nullable; neither is `NOT NULL` |

---

## 4. Keys per Table

| Table | Primary key | Candidate keys | Foreign keys and actions |
|---|---|---|---|
| `categories` | `category_id` | `category_id`; `name` (`NOT NULL UNIQUE`) | None |
| `menu_items` | `item_id` | `item_id` only; `name` is not unique | `category_id` → `categories.category_id`; `ON DELETE RESTRICT`, `ON UPDATE CASCADE` |
| `restaurant_tables` | `table_id` | `table_id`; `table_number` (`NOT NULL UNIQUE`) | None |
| `customers` | `customer_id` | `customer_id`; `phone` has a `UNIQUE` constraint but is nullable, so it is an alternate unique key for non-NULL phones rather than a strict non-null candidate key | None |
| `staff` | `staff_id` | `staff_id`; `username` has a `UNIQUE` constraint but is nullable, so it is an alternate unique key for non-NULL usernames rather than a strict non-null candidate key | None |
| `orders` | `order_id` | `order_id` only | `table_id` → `restaurant_tables.table_id` (`ON DELETE RESTRICT`, `ON UPDATE CASCADE`); `customer_id` → `customers.customer_id` (`ON DELETE SET NULL`, `ON UPDATE CASCADE`); `staff_id` → `staff.staff_id` (`ON DELETE SET NULL`, `ON UPDATE CASCADE`) |
| `order_items` | `order_item_id` | `order_item_id` only; `(order_id, item_id)` is not declared `UNIQUE`, so it is not a candidate key in the current schema | `order_id` → `orders.order_id` (`ON DELETE CASCADE`, `ON UPDATE CASCADE`); `item_id` → `menu_items.item_id` (`ON DELETE RESTRICT`, `ON UPDATE CASCADE`) |

---

## 5. Functional Dependencies

### `categories`

```text
category_id -> name, created_at
name        -> category_id, created_at
```

### `menu_items`

```text
item_id -> name, category_id, price, is_available, created_at
```

`name` is not unique in `schema.sql`, so `name` does not determine `item_id` or the other attributes.

### `restaurant_tables`

```text
table_id     -> table_number, capacity, status, created_at
table_number -> table_id, capacity, status, created_at
```

### `customers`

```text
customer_id -> name, phone, created_at
phone       -> customer_id, name, created_at    (for non-NULL phone values)
```

`phone` is nullable and has a `UNIQUE` constraint; it is a unique alternate key for non-NULL phone values.

### `staff`

```text
staff_id -> name, role, username, password_hash, is_active, created_at
username -> staff_id, name, role, password_hash, is_active, created_at    (for non-NULL username values)
```

`username` is nullable and has a `UNIQUE` constraint; it is a unique alternate key for non-NULL username values.

### `orders`

```text
order_id -> table_id, customer_id, staff_id, order_time, status, total_amount
```

`total_amount` is also derivable from `order_items` by aggregation, but that is a deliberate cross-table redundancy, not a functional dependency from another `orders` attribute.

### `order_items`

```text
order_item_id -> order_id, item_id, quantity, price_at_order
```

`schema.sql` does not declare `UNIQUE (order_id, item_id)`, so no functional dependency from `(order_id, item_id)` to `quantity` or `price_at_order` is guaranteed.

---

## 6. Normalization

| Table | 1NF | 2NF | 3NF | BCNF | Justification based on the FDs |
|---|---|---|---|---|---|
| `categories` | Yes | Yes | Yes | Yes | All attributes are atomic; the only determinants are the candidate keys `category_id` and `name`, so there is no partial or transitive dependency and every determinant is a superkey. |
| `menu_items` | Yes | Yes | Yes | Yes | All attributes are atomic; `item_id` is the only declared determinant and is the primary key, so no partial or transitive dependency exists. |
| `restaurant_tables` | Yes | Yes | Yes | Yes | All attributes are atomic; `table_id` and `table_number` are the only determinants and both are candidate keys, so every determinant is a superkey. |
| `customers` | Yes | Yes | Yes | Yes | All attributes are atomic; `customer_id` is the primary key and `phone` is a nullable `UNIQUE` alternate key, so for non-NULL phones every determinant is a key and no non-key determinant remains. |
| `staff` | Yes | Yes | Yes | Yes | All attributes are atomic; `staff_id` is the primary key and `username` is a nullable `UNIQUE` alternate key, so for non-NULL usernames every determinant is a key and no non-key determinant remains. |
| `orders` | Yes | Yes | Yes | Yes | All attributes are atomic; `order_id` is the only determinant in the declared `orders` FDs and is the primary key, while `total_amount`'s cross-table derivability is deliberate redundancy rather than an intra-table transitive dependency. |
| `order_items` | Yes | Yes | Yes | Yes | All attributes are atomic; `order_item_id` is the only declared determinant and is the primary key, and `price_at_order` is a historical snapshot rather than a transitive dependency on `item_id`. |

---

## 7. Deliberate Redundancy

- **`orders.total_amount`** is derivable from `order_items` as:

  ```text
  SUM(order_items.quantity * order_items.price_at_order)
  ```

  grouped by `order_items.order_id`. It is stored on `orders` for fast reads. A trigger to keep `orders.total_amount` consistent with `order_items` is **planned**; no such trigger is present in `schema.sql`. The existing `chk_order_total` check only enforces that the stored value is non-negative; it does not verify the arithmetic.
- **`order_items.price_at_order`** is a historical snapshot of the menu item's price at the time the order item was written. It is not a transitive dependency on the current `menu_items.price`: the menu price may change later, while the historical order line must retain the price that applied when the order was placed.

---

## 8. ER to Relational Mapping Notes

- Each of the seven entities maps directly to one table. Every table uses an `INT AUTO_INCREMENT` surrogate primary key: `category_id`, `item_id`, `table_id`, `customer_id`, `staff_id`, `order_id`, and `order_item_id`.
- The one-to-many relationship from `categories` to `menu_items` is mapped by placing `category_id` as a `NOT NULL` foreign key on the many side, `menu_items`.
- The one-to-many relationship from `restaurant_tables` to `orders` is mapped by placing `table_id` as a `NOT NULL` foreign key on the many side, `orders`.
- The optional one-to-many relationship from `customers` to `orders` is mapped by placing nullable `customer_id` on `orders`. The `ON DELETE SET NULL` action preserves orders when a customer is deleted.
- The optional one-to-many relationship from `staff` to `orders` is mapped by placing nullable `staff_id` on `orders`. The `ON DELETE SET NULL` action preserves orders when a staff member is deleted.
- The many-to-many relationship between `orders` and `menu_items` is resolved by the associative table `order_items`. Its `order_id` and `item_id` foreign keys point to the two parent tables, and its `quantity` and `price_at_order` columns hold relationship attributes.
- `order_items` uses its own surrogate primary key, `order_item_id`, rather than a composite primary key over `(order_id, item_id)`. No unique constraint on `(order_id, item_id)` is declared.
- Participation is total on the child side of every `NOT NULL` foreign key: every `menu_items` row must have a category, every `orders` row must have a table, and every `order_items` row must have both an order and a menu item. Participation is optional where the foreign key is nullable: `orders.customer_id` and `orders.staff_id`.
- Delete behavior follows the declared foreign keys: `RESTRICT` for referenced categories, restaurant tables, and menu items; `CASCADE` for deleting an order's `order_items`; and `SET NULL` for deleting a referenced customer or staff member.
- `schema.sql` does not enforce a minimum of one `order_items` row per order and does not enforce uniqueness of `(order_id, item_id)` within `order_items`. These are schema limitations, not additional rules.
