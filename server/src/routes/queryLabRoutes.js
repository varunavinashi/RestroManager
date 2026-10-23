const express = require('express');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const pool = require('../config/db');

const router = express.Router();

const QUERIES_FILE = path.resolve(__dirname, '../../sql/queries.sql');
const MAX_ROWS = 100;
const HEADER_PATTERN = /^--\s*Q(\d+):\s*(.+?)\s*\|\s*(.+?)\s*$/;

function finalizeQuery(entry) {
  const sql = entry.lines.join('\n').trim().replace(/;\s*$/, '').trim();

  if (!sql) {
    throw new Error(`Query Q${entry.id} has no SQL statement.`);
  }
  if (!/^(SELECT|WITH)\b/i.test(sql)) {
    throw new Error(`Query Q${entry.id} must start with SELECT or WITH.`);
  }

  return {
    id: entry.id,
    title: entry.title,
    concepts: entry.concepts,
    sql,
  };
}

function parseQueries(contents) {
  const lines = contents.split(/\r?\n/);
  const queries = [];
  let current = null;

  for (const line of lines) {
    const header = line.match(HEADER_PATTERN);

    if (header) {
      if (current) queries.push(finalizeQuery(current));
      current = {
        id: Number(header[1]),
        title: header[2].trim(),
        concepts: header[3].trim(),
        lines: [],
      };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) queries.push(finalizeQuery(current));

  if (queries.length === 0) {
    throw new Error('No queries found in queries.sql.');
  }

  const seen = new Set();
  for (const query of queries) {
    if (!Number.isSafeInteger(query.id) || query.id <= 0) {
      throw new Error(`Invalid query id: ${query.id}.`);
    }
    if (seen.has(query.id)) {
      throw new Error(`Duplicate query id: ${query.id}.`);
    }
    seen.add(query.id);
  }

  return queries;
}

const QUERIES = parseQueries(fs.readFileSync(QUERIES_FILE, 'utf8'));
const QUERIES_BY_ID = new Map(QUERIES.map((query) => [query.id, query]));

// Accept only a positive integer from the URL; the client never sends SQL.
function parseId(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

// GET /api/query-lab
router.get('/', (req, res) => {
  const data = QUERIES.map(({ id, title, concepts, sql }) => ({ id, title, concepts, sql }));
  res.json({ data });
});

// GET /api/query-lab/:id
router.get('/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Query id must be a positive integer.' });

  const query = QUERIES_BY_ID.get(id);
  if (!query) return res.status(404).json({ error: `Query ${id} not found.` });

  try {
    const startedAt = performance.now();
    const [rows, fields] = await pool.query(query.sql);
    const ms = Math.round(performance.now() - startedAt);

    const cappedRows = rows.slice(0, MAX_ROWS);
    const columns = fields.map((field) => field.name);

    return res.json({
      data: {
        id: query.id,
        title: query.title,
        concepts: query.concepts,
        sql: query.sql,
        columns,
        rows: cappedRows,
        rowCount: cappedRows.length,
        ms,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
