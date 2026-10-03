# RestroManager

Restaurant & Food Service Management System — a full-stack web app for running a
restaurant's floor: browse and manage the menu, track table availability, take
orders, follow them through preparation, and check daily sales. The front end is
React with Tailwind CSS, the back end is a plain Express REST API, and all data
lives in MySQL accessed through raw parameterised SQL (no ORM). Everything runs
locally on a single machine — no Docker, no cloud services, no external APIs.

Built by team **HackA47** for two courses: a **SEPM** mid-semester project
(demonstrating one complete end-to-end feature — placing an order) and a
**DBMS** course project that reuses this same schema and code, later extended
with a normalization write-up, views, triggers, stored procedures, role-based
access control, and an AI/ML feature. See [Known limitations](#7-known-limitations)
for what does not exist yet.

---

## 2. Folder structure

```text
RestroManager/
├── README.md  
├── 05_Testing/
│   └── Test_Evidence/
│       └── order-api-test-run.txt   # captured output of the order API suite
│
├── client/                    # React 18 + Vite front end (port 5173)
│   ├── .env.example           # placeholder for VITE_API_URL
│   ├── index.html
│   ├── vite.config.js         # includes the @tailwindcss/vite plugin
│   ├── package.json
│   ├── public/                # favicon.svg, icons.svg
│   └── src/
│       ├── main.jsx           # React root + BrowserRouter
│       ├── App.jsx            # React Router routes + navigation bar
│       ├── index.css          # single line: @import "tailwindcss";
│       ├── App.css            # leftover from the Vite template, not imported
│       ├── api/               # one axios wrapper per resource
│       │   ├── client.js          # shared axios instance (baseURL)
│       │   ├── categoriesApi.js
│       │   ├── menuApi.js
│       │   ├── ordersApi.js
│       │   ├── reportsApi.js
│       │   └── tablesApi.js
│       └── pages/             # one component per route
│           ├── HomePage.jsx
│           ├── MenuPage.jsx
│           ├── TablesPage.jsx
│           ├── NewOrderPage.jsx
│           ├── OrdersPage.jsx
│           └── ReportPage.jsx
│
└── server/                    # Node.js + Express REST API (port 5000)
    ├── .env.example           # placeholder for MySQL credentials
    ├── package.json
    ├── tests/
    │   └── orderApi.test.js   # order API test suite (node:assert, no framework)
    ├── sql/
    │   ├── schema.sql         # creates the database: 7 tables, PK/FK, InnoDB
    │   └── seed.sql           # sample categories/items/tables/staff/customers
    └── src/
        ├── index.js           # Express app entry, mounts routes + error handler
        ├── config/
        │   └── db.js          # mysql2 promise pool (reads .env)
        ├── middleware/
        │   └── errorHandler.js# single place that formats error responses
        ├── routes/            # one Express router per resource
        │   ├── categoryRoutes.js
        │   ├── menuRoutes.js
        │   ├── tableRoutes.js
        │   ├── orderRoutes.js
        │   └── reportRoutes.js
        └── scripts/           # setup helpers and manual API test scripts
            ├── initDb.js          # npm run db:init
            ├── checkSchema.js     # npm run check-schema
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
CLIENT_URL=http://localhost:5173
```

Then create and seed the database:

```bash
npm run db:init
```

This connects to your MySQL server, creates the `hacka47_restaurant` database
if it does not exist, runs `sql/schema.sql` (all 7 tables) and then
`sql/seed.sql` (sample data).

> **Warning — `db:init` is destructive.** `schema.sql` begins with
> `DROP TABLE IF EXISTS` for every table, so re-running `db:init` **deletes all
> existing orders, menu items, and tables** and replaces them with the seed
> data. Only run it on a fresh setup, or when you intend to reset.

Confirm the seed worked — all 7 tables should report a non-zero row count:

```bash
npm run check-schema
```

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
in your browser. The navigation bar links to Home, Menu, Tables, Orders, New
Order, and Reports.

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

It prints a PASS/FAIL line per test case (TC1–TC5) and writes the full captured
output to `05_Testing/Test_Evidence/order-api-test-run.txt`. The suite creates
a real order and then removes it again, restoring the database to its prior
state.

---

## 6. Sample data

There is **no login screen and no user accounts** — the app has no
authentication at all (see limitation 1 below), so there are no credentials to
use. Every route is open, and the app runs against a single shared dataset.

`npm run db:init` seeds:

| Table | Seeded contents |
|---|---|
| `categories` | 4 — Appetizers, Main Courses, Desserts, Beverages |
| `menu_items` | 15 across those categories, priced ₹3.50–₹28.50, all available |
| `restaurant_tables` | 8 (table numbers 1–8, capacities 2–10), all `free` |
| `staff` | 3 — a manager, a waiter, and a chef |
| `customers` | 2 — `John Doe`, `Alice Smith` |

No orders are seeded. To see meaningful numbers on the **Reports** page, first
place an order from **New Order** (pick one of the free tables, add a couple of
items, submit). The top-3 items list is ranked across *all* orders, so it stays
empty until at least one order exists; the two stat cards correctly show `0`
rather than disappearing.

`customers` is optional per order — leaving the customer name blank on the New
Order form simply stores `NULL`.

---

## 7. Known limitations

These are deliberate, documented scope decisions rather than bugs.

1. **No authentication.** There is no login, no JWT, no session handling, and no
   role-based access control — every API endpoint and page is open to anyone
   who can reach the server. Single-tenant demo for the SEPM phase; planned for
   the DBMS submission.

2. **No stored-procedure or trigger layer.** All business logic lives in the
   Express route handlers as parameterised SQL. There are no stored procedures,
   triggers, or database views backing any feature, and no indexes beyond the
   primary and foreign keys that `schema.sql` declares. These are planned for the
   DBMS submission, which will also add the normalization write-up (the schema
   is designed to be 3NF) and an AI/ML feature such as demand prediction.

3. **No AI/ML feature** — deferred to the DBMS phase along with the above.

4. **No deployment.** The app is built to run locally only; there is no
   production build/deploy pipeline, hosting configuration, or environment
   separation.

5. **No real-time updates.** Data is fetched on page load and after actions.
   There is no WebSocket, server-sent events, or polling — placing an order on
   one page does not live-update another open tab.

6. **No automated test coverage beyond the order API.** `tests/orderApi.test.js`
   covers the five core order-placement cases; the menu, category, table, and
   report routes are exercised by the manual scripts in `server/src/scripts/`.

7. **CORS is configured for a single origin.** `CLIENT_URL` allows one frontend
   origin only, which is fine for local development but not for a deployed
   multi-client setup.