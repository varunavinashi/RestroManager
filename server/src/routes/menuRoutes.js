const express = require('express');
const pool = require('../config/db');

const router = express.Router();

const ITEM_COLUMNS = 'm.item_id, m.name, m.category_id, c.name AS category_name, m.price, m.is_available, m.created_at';

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function parseId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parsePrice(value) {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return null;
  return Math.round(price * 100) / 100;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 0) return value === 1;
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase();
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
  }
  return null;
}

function parseName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name.length === 0 || name.length > 150) return null;
  return name;
}

// Escapes user input so % and _ are matched inside a LIKE pattern
function likePattern(value) {
  return `%${value.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_')}%`;
}

function toItem(row) {
  return {
    item_id: row.item_id,
    name: row.name,
    category_id: row.category_id,
    category_name: row.category_name,
    price: Number(row.price),
    is_available: Boolean(row.is_available),
    created_at: row.created_at,
  };
}

async function categoryExists(categoryId) {
  const [rows] = await pool.execute('SELECT category_id FROM categories WHERE category_id = ?', [categoryId]);
  return rows.length > 0;
}

// GET /api/menu
router.get('/', async (req, res, next) => {
  try {
    const clauses = [];
    const params = [];

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search) {
      clauses.push("m.name LIKE ? ESCAPE '!'");
      params.push(likePattern(search));
    }

    if (req.query.category !== undefined) {
      const categoryId = parseId(req.query.category);
      if (categoryId === null) return badRequest(res, 'Query parameter "category" must be a positive integer category_id.');
      clauses.push('m.category_id = ?');
      params.push(categoryId);
    }

    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT ${ITEM_COLUMNS} FROM menu_items m LEFT JOIN categories c ON c.category_id = m.category_id${where} ORDER BY m.category_id, m.name`;

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows.map(toItem) });
  } catch (err) {
    next(err);
  }
});

// GET /api/menu/:id
router.get('/:id', async (req, res, next) => {
  const itemId = parseId(req.params.id);
  if (itemId === null) return badRequest(res, 'Menu item id must be a positive integer.');

  try {
    const sql = `SELECT ${ITEM_COLUMNS} FROM menu_items m LEFT JOIN categories c ON c.category_id = m.category_id WHERE m.item_id = ?`;
    const [rows] = await pool.execute(sql, [itemId]);

    if (rows.length === 0) return res.status(404).json({ error: `Menu item ${itemId} not found.` });
    return res.json({ data: toItem(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// POST /api/menu
router.post('/', async (req, res, next) => {
  const body = req.body || {};

  const name = parseName(body.name);
  if (name === null) return badRequest(res, 'Field "name" is required and must be a non-empty string of at most 150 characters.');

  const categoryId = parseId(body.category_id);
  if (categoryId === null) return badRequest(res, 'Field "category_id" is required and must be a positive integer.');

  const price = parsePrice(body.price);
  if (price === null) return badRequest(res, 'Field "price" is required and must be a number greater than or equal to 0.');

  const isAvailable = body.is_available === undefined ? true : parseBoolean(body.is_available);
  if (isAvailable === null) return badRequest(res, 'Field "is_available" must be a boolean.');

  try {
    if (!(await categoryExists(categoryId))) {
      return badRequest(res, `Field "category_id" refers to category ${categoryId}, which does not exist.`);
    }

    const sql = 'INSERT INTO menu_items (name, category_id, price, is_available) VALUES (?, ?, ?, ?)';
    const [result] = await pool.execute(sql, [name, categoryId, price, isAvailable]);

    const itemId = result.insertId;
    const selectSql = `SELECT ${ITEM_COLUMNS} FROM menu_items m LEFT JOIN categories c ON c.category_id = m.category_id WHERE m.item_id = ?`;
    const [rows] = await pool.execute(selectSql, [itemId]);

    return res.status(201).json({ message: 'Menu item created.', data: toItem(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/menu/:id
router.put('/:id', async (req, res, next) => {
  const itemId = parseId(req.params.id);
  if (itemId === null) return badRequest(res, 'Menu item id must be a positive integer.');

  const body = req.body || {};
  const updates = [];
  const params = [];

  if (body.name !== undefined) {
    const name = parseName(body.name);
    if (name === null) return badRequest(res, 'Field "name" must be a non-empty string of at most 150 characters.');
    updates.push('name = ?');
    params.push(name);
  }

  if (body.price !== undefined) {
    const price = parsePrice(body.price);
    if (price === null) return badRequest(res, 'Field "price" must be a number greater than or equal to 0.');
    updates.push('price = ?');
    params.push(price);
  }

  if (body.category_id !== undefined) {
    const categoryId = parseId(body.category_id);
    if (categoryId === null) return badRequest(res, 'Field "category_id" must be a positive integer.');
    updates.push('category_id = ?');
    params.push(categoryId);
  }

  if (body.is_available !== undefined) {
    const isAvailable = parseBoolean(body.is_available);
    if (isAvailable === null) return badRequest(res, 'Field "is_available" must be a boolean.');
    updates.push('is_available = ?');
    params.push(isAvailable);
  }

  if (updates.length === 0) {
    return badRequest(res, 'Provide at least one of "name", "price", "category_id" or "is_available" to update.');
  }

  try {
    const existsSql = 'SELECT item_id FROM menu_items WHERE item_id = ?';
    const [existing] = await pool.execute(existsSql, [itemId]);
    if (existing.length === 0) return res.status(404).json({ error: `Menu item ${itemId} not found.` });

    if (body.category_id !== undefined && !(await categoryExists(parseId(body.category_id)))) {
      return badRequest(res, `Field "category_id" refers to category ${body.category_id}, which does not exist.`);
    }

    // Column names come from the fixed list above; all user values stay parameterised
    const updateSql = `UPDATE menu_items SET ${updates.join(', ')} WHERE item_id = ?`;
    await pool.execute(updateSql, [...params, itemId]);

    const selectSql = `SELECT ${ITEM_COLUMNS} FROM menu_items m LEFT JOIN categories c ON c.category_id = m.category_id WHERE m.item_id = ?`;
    const [rows] = await pool.execute(selectSql, [itemId]);

    return res.json({ message: 'Menu item updated.', data: toItem(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/menu/:id
router.delete('/:id', async (req, res, next) => {
  const itemId = parseId(req.params.id);
  if (itemId === null) return badRequest(res, 'Menu item id must be a positive integer.');

  try {
    const [result] = await pool.execute('DELETE FROM menu_items WHERE item_id = ?', [itemId]);

    if (result.affectedRows === 0) return res.status(404).json({ error: `Menu item ${itemId} not found.` });

    return res.json({ message: 'Menu item deleted.', data: { item_id: itemId } });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: `Menu item ${itemId} is referenced by an existing order and cannot be deleted.` });
    }
    next(err);
  }
});

module.exports = router;