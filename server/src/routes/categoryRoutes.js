const express = require('express');
const pool = require('../config/db');

const router = express.Router();

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function parseName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name.length === 0 || name.length > 100) return null;
  return name;
}

function toCategory(row) {
  return {
    category_id: row.category_id,
    name: row.name,
    created_at: row.created_at,
  };
}

// GET /api/categories
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT category_id, name, created_at FROM categories ORDER BY name');
    return res.json({ data: rows.map(toCategory) });
  } catch (err) {
    next(err);
  }
});

// POST /api/categories
router.post('/', async (req, res, next) => {
  const name = parseName((req.body || {}).name);
  if (name === null) return badRequest(res, 'Field "name" is required and must be a non-empty string of at most 100 characters.');

  try {
    const [result] = await pool.execute('INSERT INTO categories (name) VALUES (?)', [name]);

    const [rows] = await pool.execute('SELECT category_id, name, created_at FROM categories WHERE category_id = ?', [result.insertId]);

    return res.status(201).json({ message: 'Category created.', data: toCategory(rows[0]) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Category "${name}" already exists.` });
    }
    next(err);
  }
});

module.exports = router;