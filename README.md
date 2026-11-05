# RestroManager

Restaurant & Food Service Management System — a full-stack web app for running a
restaurant's floor: browse and manage the menu, track table availability, take
orders, follow them through preparation, and check daily sales. The front end is
React with Tailwind CSS, the back end is a plain Express REST API, and all data
lives in MySQL accessed through raw parameterised SQL (no ORM). Everything runs
locally on a single machine — no Docker, no cloud services, no external APIs.

Built by team **HackA47** : A
**DBMS** course project that reuses this same schema and code, extended with a
normalization write-up, views, triggers, stored procedures, role-based access
control, and an AI/ML recommender. Login, application RBAC, and the ML feature
are implemented; see [Known limitations](#7-known-limitations) for what is still
out of scope.

---

## 2. Folder structure

```text
RestroManager/
├── README.md
├── 05_Testing/
│   └── Test_Evidence/       # order/ML/trigger/RBAC/concurrency evidence files
│
├── client/                    # React 18 + Vite front end (port 5173)
│   ├── .env.example           # placeholder for VITE_API_URL
│   ├── index.html
│   ├── vite.config.js         # includes the @tailwindcss/vite plugin
│   ├── package.json
│   ├── public/                # favicon.svg, icons.svg, optional er-diagram.png
│   └── src/
│       ├── main.jsx           # React root + BrowserRouter
│       ├── App.jsx            # routes, nav filtering, role guards
│       ├── index.css          # single line: @import "tailwindcss";
│       ├── App.css            # leftover from the Vite template, not imported
│       ├── api/               # one axios wrapper per resource
│       │   ├── client.js          # shared axios instance + Bearer interceptor
│       │   ├── authApi.js
│       │   ├── categoriesApi.js
│       │   ├── menuApi.js
│       │   ├── ordersApi.js
│       │   ├── reportsApi.js
│       │   ├── tablesApi.js
│       │   ├── queryLabApi.js
│       │   ├── schemaApi.js
│       │   └── mlApi.js
│       └── pages/             # one component per route
│           ├── LoginPage.jsx
│           ├── HomePage.jsx
│           ├── MenuPage.jsx
│           ├── TablesPage.jsx
│           ├── NewOrderPage.jsx
│           ├── OrdersPage.jsx
│           ├── ReportPage.jsx
│           ├── InsightsPage.jsx
│           ├── QueryLabPage.jsx
│           └── SchemaPage.jsx
│
└── server/                    # Node.js + Express REST API (port 5000)
    ├── .env.example           # placeholders for MySQL, JWT, and RBAC secrets
    ├── package.json
    ├── tests/
    │   ├── orderApi.test.js   # order API test suite (logs in as manager1)
    │   └── mlApi.test.js      # ML API test suite (logs in as manager1)
    ├── sql/
    │   ├── schema.sql         # core tables, PK/FK/CHECK, staff.role enum
    │   ├── indexes.sql        # four secondary indexes
    │   ├── ml_tables.sql      # item_recommendations, ml_model_runs
    │   ├── seed.sql           # sample categories/items/tables/staff/customers
    │   ├── views.sql          # four reporting views
    │   ├── routines.sql       # triggers, function, stored procedures
    │   ├── queries.sql        # 14 read-only Query Lab SELECT statements
    │   └── roles.sql          # DB roles/users template (run by db:roles)
    └── src/
        ├── index.js           # Express app entry, mounts routes + error handler
        ├── config/
        │   ├── db.js          # mysql2 promise pool (reads .env)
        │   └── dbReadonly.js  # read-only pool used by Query Lab
        ├── middleware/
        │   ├── auth.js        # JWT authenticate + requireRole
        │   └── errorHandler.js# single place that formats error responses
        ├── routes/            # one Express router per resource
        │   ├── authRoutes.js
        │   ├── categoryRoutes.js
        │   ├── menuRoutes.js
        │   ├── tableRoutes.js
        │   ├── orderRoutes.js
        │   ├── reportRoutes.js
        │   ├── queryLabRoutes.js
        │   ├── schemaRoutes.js
        │   └── mlRoutes.js
        └── scripts/           # setup helpers, demos, and manual test scripts
            ├── initDb.js          # npm run db:init
            ├── initRoles.js       # npm run db:roles
            ├── demoRoles.js       # npm run demo:roles
            ├── setStaffPasswords.js # demo logins
            ├── seedOrders.js      # synthetic order seeder
            ├── checkSchema.js     # npm run check-schema
            ├── explainDemo.js
            ├── concurrencyDemo.js
            ├── testTriggers.js
            ├── testMenuApi.js
            ├── testTableApi.js
            └── testOrderApi.js
```

The SQL lives in `server/sql/` — it is read and executed by `npm run db:init`
rather than being applied by hand.

---

## 3. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 20.19+ | Vite 8 requires `^20.19.0 \|\| >=22.12.0`. Node 22.12+ or 24 recommended. Verified on v24.12.0. |
| **npm** | 10+ | Ships with Node 20+. |
| **MySQL** | 8.0 (5.7+ works) | Must be **running locally** before you run `npm run db:init`. |
| **Git** | any recent | Only needed to clone. |

No other tooling is required — no Docker, no global npm installs, no ORM or
migration framework.

---

## 4. Setup

```bash
git clone <your-repository-url>
cd RestroManager
```

### 4.1 Backend (`server/`)

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env` and put your **real** MySQL values in. Copy this template —
the values below are placeholders, not working credentials:

```ini
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=hacka47_restaurant
DEMO_ROLE_PASSWORD=choose_a_demo_password
DB_READONLY_USER=restro_readonly_user
DB_READONLY_PASSWORD=choose_a_readonly_password
CLIENT_URL=http://localhost:5173
JWT_SECRET=choose_a_long_random_string
SHOW_SQL=true
WEB_PASSWORD=choose_a_demo_web_password
```

`DEMO_ROLE_PASSWORD` is used for the four demo staff logins and the three
role users; `DB_READONLY_PASSWORD` is applied to `restro_readonly_user` and is
also what the Query Lab pool uses. `JWT_SECRET` signs the login tokens — use a
long random value and never commit it. `SHOW_SQL=true` makes the API return the
SQL it ran so the UI's SQL panel can display it.

Then create and seed the database:

```bash
npm run db:init
```

This connects to your MySQL server, creates the `hacka47_restaurant` database
if it does not exist, and runs `schema.sql`, `indexes.sql`, `ml_tables.sql`,
`seed.sql`, `views.sql`, and `routines.sql`.

> **Warning — `db:init` is destructive.** `schema.sql` begins with
> `DROP TABLE IF EXISTS` for every table, so re-running `db:init` **deletes all
> existing orders, menu items, staff credentials, and ML rows** and replaces
> them with the seed data. Only run it on a fresh setup, or when you intend to
> reset.

Create the database roles/users, the demo logins, and (optionally) synthetic
orders and ML recommendations:

```bash
npm run db:roles                     # DB roles + restro_*_user accounts
node src/scripts/setStaffPasswords.js # waiter1 / chef1 / manager1 / readonly1
npm run db:seed-orders               # optional: synthetic orders
npm run ml:train                     # optional: train + populate ML tables
```

Confirm the seed worked — all tables should report a non-zero row count:

```bash
npm run check-schema
```

The seeded staff count is **4** (manager, waiter, chef, readonly).

### 4.2 Frontend (`client/`)

```bash
cd client
npm install
cp .env.example .env
```

Edit `client/.env` and set the API base URL — **this step is required and the
shipped `.env.example` leaves it blank**:

```ini
VITE_API_URL=http://localhost:5000/api
```

The value must include the trailing `/api`, because every page requests
relative paths such as `/orders`. If you leave it empty, the UI loads but every
request fails with an unknown base URL.

> Restart the dev server after editing any `.env` file — Vite only reads
> environment variables at startup.

---

## 5. How to run
```bash
# Using concurrently script
npm run hacka47
```
**OR ALTERNATIVELY**

Two processes, two terminals. Start the **server first**.

```bash
# Terminal 1 — API on http://localhost:5000
cd server
npm run dev
```

```bash
# Terminal 2 — UI on http://localhost:5173
cd client
npm run dev
```

Vite prints the exact local URL (normally `http://localhost:5173`) — open that
in your browser. You are sent to `/login` first; sign in with one of the demo
accounts below. The navigation bar then shows the links that role can use
(Menu, Tables, Orders, New Order, Reports, Insights, Query Lab, Schema).

Verify the backend is reachable at any time:

```bash
curl http://localhost:5000/api/health
# {"status":"ok"}
```

### 5.1 Running the order API tests

The suite talks to a **running server**, so leave `npm run dev` going in
terminal 1, then:

```bash
cd server
npm run test:orders
```

It prints a PASS/FAIL line per test case (TC1–TC6) and writes the full captured
output to `05_Testing/Test_Evidence/order-api-test-run.txt`. The suite logs in
as `manager1` first, creates a real order, and then removes it again, restoring
the database to its prior state. Run `node tests/mlApi.test.js` the same way for
the ML API checks (also TC1–TC6).

---

## 6. Sample data and demo logins

Every page requires a login. All four demo accounts use the same password,
`DEMO_ROLE_PASSWORD` from `server/.env`:

| Username | Role | What it can do |
|---|---|---|
| `waiter1` | waiter | Read pages, create orders, toggle tables, update/pay orders |
| `chef1` | chef | Read pages, update/pay orders (no order creation, no table toggle, no menu writes) |
| `manager1` | manager | Everything, including menu/category writes and Reports |
| `readonly1` | readonly | View every read page (including Reports, Insights, Query Lab, Schema); all writes return 403 |

`npm run db:init` seeds:

| Table | Seeded contents |
|---|---|
| `categories` | 5 |
| `menu_items` | 40 across those categories |
| `restaurant_tables` | 8 (table numbers 1–8, capacities 2–10), all `free` |
| `staff` | 4 — a manager, a waiter, a chef, and a read-only viewer |
| `customers` | 42 |

`npm run db:seed-orders` then adds synthetic historical orders, and
`npm run ml:train` populates `item_recommendations` and `ml_model_runs`.
`db:init`/`db:reset` do **not** set staff passwords or train the ML model, so
re-run `node src/scripts/setStaffPasswords.js` and `npm run ml:train` after a
reset.

To see meaningful numbers on the **Reports** page, either seed orders or place
one from **New Order**. The top-3 items list is ranked across *all* orders, so
it stays empty until at least one order exists; the two stat cards correctly
show `0` rather than disappearing.

`customers` is optional per order — leaving the customer name blank on the New
Order form simply stores `NULL`.

---

## 7. Known limitations

These are deliberate, documented scope decisions rather than bugs.

1. **Single-tenant, local demo.** There is no production deployment, hosting
   configuration, or environment separation; the app is built to run locally on
   one machine.

2. **No user management UI.** Staff accounts and passwords are provisioned by
   `node src/scripts/setStaffPasswords.js`; there is no page for creating users,
   resetting passwords, or changing roles. Roles are enforced from the login
   token, but the demo uses one shared password for all four accounts.

3. **No real-time updates.** Data is fetched on page load and after actions.
   There is no WebSocket, server-sent events, or polling — placing an order on
   one page does not live-update another open tab.

4. **No automated test coverage beyond the order, ML, trigger, and RBAC
   suites.** `tests/orderApi.test.js` and `tests/mlApi.test.js` cover the order
   and ML APIs; `testTriggers.js` covers triggers/routines and `demo:roles`
   covers the DB-role matrix. Menu, category, table, and report routes are
   exercised by the manual scripts in `server/src/scripts/`.

5. **CORS is configured for a single origin.** `CLIENT_URL` allows one frontend
   origin only, which is fine for local development but not for a deployed
   multi-client setup.

6. **Recommender quality is a demo baseline.** The ML feature is an offline
   co-occurrence/cosine recommender trained on synthetic orders; it is not a
   real-time production recommendation service.