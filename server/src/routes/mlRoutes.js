const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_CART_ITEMS = 20;

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function parsePositiveInt(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function parseItemIds(value) {
  if (typeof value !== 'string') return null;

  const parts = value.split(',').map((part) => part.trim());
  if (parts.length < 1 || parts.length > MAX_CART_ITEMS) return null;

  const itemIds = [];
  for (const part of parts) {
    const itemId = parsePositiveInt(part);
    if (itemId === null) return null;
    if (!itemIds.includes(itemId)) itemIds.push(itemId);
  }

  return itemIds;
}

function parseLimit(value) {
  if (value === undefined) return DEFAULT_LIMIT;
  const limit = parsePositiveInt(value);
  if (limit === null || limit > MAX_LIMIT) return null;
  return limit;
}

function parseNotes(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// GET /api/ml/recommendations?item_ids=1,2,3&limit=3
router.get('/recommendations', async (req, res, next) => {
  const itemIds = parseItemIds(req.query.item_ids);
  if (itemIds === null) {
    return badRequest(
      res,
      'Query parameter "item_ids" must contain 1 to 20 comma-separated positive integers.'
    );
  }

  const limit = parseLimit(req.query.limit);
  if (limit === null) {
    return badRequest(
      res,
      `Query parameter "limit" must be an integer between 1 and ${MAX_LIMIT}.`
    );
  }

  try {
    // query() expands the array placeholders for IN (?); execute() does not.
    const [rows] = await pool.query(
      `SELECT m.item_id, m.name, m.price, c.name AS category, SUM(r.score) AS score
       FROM item_recommendations r
       JOIN menu_items m ON m.item_id = r.recommended_item_id
       JOIN categories c ON c.category_id = m.category_id
       WHERE r.item_id IN (?)
         AND r.recommended_item_id NOT IN (?)
         AND m.is_available = TRUE
       GROUP BY m.item_id, m.name, m.price, c.name
       ORDER BY score DESC, m.item_id ASC
       LIMIT ?`,
      [itemIds, itemIds, limit]
    );

    return res.json({
      data: rows.map((row) => ({
        item_id: row.item_id,
        name: row.name,
        price: Number(row.price),
        category: row.category,
        score: Number(row.score),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/ml/metrics
router.get('/metrics', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT model_name, hit_at_3, mrr_at_3,
              n_train_orders, n_val_orders, n_test_orders,
              trained_at, notes
       FROM ml_model_runs
       ORDER BY trained_at DESC, run_id DESC
       LIMIT 1`
    );

    if (rows.length === 0) return res.json({ data: null });

    const row = rows[0];
    const notes = parseNotes(row.notes);
    const notesModels = notes.models;
    const models = Array.isArray(notesModels)
      ? notesModels
      : Object.entries(
          notesModels && typeof notesModels === 'object' ? notesModels : {}
        ).map(([modelName, metrics]) => ({
          model_name: modelName,
          ...(metrics && typeof metrics === 'object' ? metrics : {}),
        }));

    return res.json({
      data: {
        model_name: row.model_name,
        hit_at_3: Number(row.hit_at_3),
        mrr_at_3: Number(row.mrr_at_3),
        n_train_orders: Number(row.n_train_orders),
        n_val_orders: Number(row.n_val_orders),
        n_test_orders: Number(row.n_test_orders),
        trained_at: row.trained_at,
        models,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/ml/top-pairs?limit=10
router.get('/top-pairs', async (req, res, next) => {
  const limit = parseLimit(req.query.limit);
  if (limit === null) {
    return badRequest(
      res,
      `Query parameter "limit" must be an integer between 1 and ${MAX_LIMIT}.`
    );
  }

  try {
    const [rows] = await pool.query(
      `SELECT r.item_id, mi.name AS item_name,
              r.recommended_item_id, mr.name AS recommended_item_name,
              r.score
       FROM item_recommendations r
       JOIN menu_items mi ON mi.item_id = r.item_id
       JOIN menu_items mr ON mr.item_id = r.recommended_item_id
       ORDER BY r.score DESC, r.item_id ASC, r.recommended_item_id ASC
       LIMIT ?`,
      [limit]
    );

    return res.json({
      data: rows.map((row) => ({
        item_id: row.item_id,
        item_name: row.item_name,
        recommended_item_id: row.recommended_item_id,
        recommended_item_name: row.recommended_item_name,
        score: Number(row.score),
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
