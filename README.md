# hacka47-restaurant

Restaurant & Food Service Management System.

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Node.js + Express
- **Database**: MySQL (`mysql2` promise pool)

---

## Folder Structure

```text
hacka47-restaurant/
├── .gitignore
├── README.md
├── client/
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── assets/
│   │   │   ├── hero.png
│   │   │   ├── react.svg
│   │   │   └── vite.svg
│   │   ├── App.css
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── README.md
│   └── vite.config.js
└── server/
    ├── sql/
    │   ├── schema.sql
    │   └── seed.sql
    ├── src/
    │   ├── config/
    │   │   └── db.js
    │   ├── scripts/
    │   │   └── initDb.js
    │   └── index.js
    ├── .env.example
    └── package.json
```

---

## Quick Start

### 1. Backend (`/server`)

```bash
cd server
npm install
cp .env.example .env
# Configure your DB credentials in .env, then initialize DB:
npm run db:init
npm run dev
```

The server will start on `http://localhost:5000` with the health check available at `GET /api/health`.

### 2. Frontend (`/client`)

```bash
cd client
npm install
npm run dev
```

The frontend development server will start on `http://localhost:5173`.
