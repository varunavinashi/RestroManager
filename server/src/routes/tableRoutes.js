const express = require('express');
const pool = require('../config/db');

const router = express.Router();

const TABLE_STATUSES = ['free', 'occupied'];

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

function toTable(row) {
  return {
    table_id: row.table_id,
    table_number: row.table_number,
    capacity: row.capacity,
    status: row.status,
    created_at: row.created_at,
  };
}

// GET /api/tables
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT table_id, table_number, capacity, status, created_at FROM restaurant_tables ORDER BY table_number'
    );
    return res.json({ data: rows.map(toTable) });
  } catch (err) {
    console.error('GET /api/tables failed:', err.message);
    return res.status(500).json({ error: 'Failed to fetch tables.' });
  }
});

// PUT /api/tables/:id/status
router.put('/:id/status', async (req, res) => {
  const tableId = parseId(req.params.id);
  if (tableId === null) return badRequest(res, 'Table id must be a positive integer.');

  const rawStatus = (req.body || {}).status;
  if (typeof rawStatus !== 'string' || !TABLE_STATUSES.includes(rawStatus.trim().toLowerCase())) {
    return badRequest(res, `Field "status" is required and must be one of: ${TABLE_STATUSES.join(', ')}.`);
  }
  const status = rawStatus.trim().toLowerCase();

  try {
    const [result] = await pool.execute('UPDATE restaurant_tables SET status = ? WHERE table_id = ?', [status, tableId]);

    // affectedRows can be 0 if the status is already the same, so check the row directly
    const [rows] = await pool.execute(
      'SELECT table_id, table_number, capacity, status, created_at FROM restaurant_tables WHERE table_id = ?',
      [tableId]
    );

    if (rows.length === 0) return res.status(404).json({ error: `Table ${tableId} not found.` });

    return res.json({ message: 'Table status updated.', data: toTable(rows[0]) });
  } catch (err) {
    console.error(`PUT /api/tables/${tableId}/status failed:`, err.message);
    return res.status(500).json({ error: 'Failed to update table status.' });
  }
});

module.exports = router;