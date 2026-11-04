const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

const TABLES_SQL = `
  SELECT TABLE_NAME AS name
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
  ORDER BY TABLE_NAME
`;

const COLUMNS_SQL = `
  SELECT
    c.TABLE_NAME AS table_name,
    c.COLUMN_NAME AS column_name,
    c.COLUMN_TYPE AS column_type,
    c.IS_NULLABLE AS is_nullable,
    c.COLUMN_KEY AS column_key,
    c.COLUMN_DEFAULT AS column_default,
    c.EXTRA AS extra
  FROM INFORMATION_SCHEMA.COLUMNS c
  JOIN INFORMATION_SCHEMA.TABLES t
    ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
  WHERE c.TABLE_SCHEMA = ? AND t.TABLE_TYPE = 'BASE TABLE'
  ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
`;

const FOREIGN_KEYS_SQL = `
  SELECT
    kcu.TABLE_NAME AS table_name,
    kcu.COLUMN_NAME AS column_name,
    kcu.REFERENCED_TABLE_NAME AS referenced_table,
    kcu.REFERENCED_COLUMN_NAME AS referenced_column,
    rc.DELETE_RULE AS delete_rule,
    rc.UPDATE_RULE AS update_rule
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
  JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
    ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
   AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
   AND rc.TABLE_NAME = kcu.TABLE_NAME
  WHERE kcu.TABLE_SCHEMA = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
  ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
`;

const INDEXES_SQL = `
  SELECT
    TABLE_NAME AS table_name,
    INDEX_NAME AS index_name,
    NON_UNIQUE AS non_unique,
    COLUMN_NAME AS column_name
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = ?
  ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
`;

const VIEWS_SQL = `
  SELECT TABLE_NAME AS name
  FROM INFORMATION_SCHEMA.VIEWS
  WHERE TABLE_SCHEMA = ?
  ORDER BY TABLE_NAME
`;

const TRIGGERS_SQL = `
  SELECT
    TRIGGER_NAME AS name,
    EVENT_MANIPULATION AS event,
    ACTION_TIMING AS timing,
    EVENT_OBJECT_TABLE AS table_name
  FROM INFORMATION_SCHEMA.TRIGGERS
  WHERE TRIGGER_SCHEMA = ?
  ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME
`;

const ROUTINES_SQL = `
  SELECT
    ROUTINE_NAME AS name,
    ROUTINE_TYPE AS type
  FROM INFORMATION_SCHEMA.ROUTINES
  WHERE ROUTINE_SCHEMA = ?
  ORDER BY ROUTINE_TYPE, ROUTINE_NAME
`;

const getDatabaseName = async () => {
  const [rows] = await pool.execute('SELECT DATABASE() AS db_name');
  return rows[0] ? rows[0].db_name : null;
};

const groupIndexes = (rows) => {
  const indexes = [];
  const byName = new Map();

  for (const row of rows) {
    const key = `${row.table_name}.${row.index_name}`;
    let index = byName.get(key);

    if (!index) {
      index = {
        table: row.table_name,
        name: row.index_name,
        columns: [],
        unique: Number(row.non_unique) === 0,
      };
      byName.set(key, index);
      indexes.push(index);
    }

    index.columns.push(row.column_name);
  }

  return indexes;
};

// GET /api/schema
router.get('/', async (req, res, next) => {
  try {
    const database = (await getDatabaseName()) || process.env.DB_NAME;

    if (!database) {
      return res.status(500).json({ error: 'Could not determine the current database' });
    }

    const results = await Promise.all([
      pool.execute(TABLES_SQL, [database]),
      pool.execute(COLUMNS_SQL, [database]),
      pool.execute(FOREIGN_KEYS_SQL, [database]),
      pool.execute(INDEXES_SQL, [database]),
      pool.execute(VIEWS_SQL, [database]),
      pool.execute(TRIGGERS_SQL, [database]),
      pool.execute(ROUTINES_SQL, [database]),
    ]);

    const [tableRows, columnRows, foreignKeyRows, indexRows, viewRows, triggerRows, routineRows] =
      results.map((result) => result[0]);

    const tables = tableRows.map((row) => ({ name: row.name, columns: [] }));
    const tablesByName = new Map(tables.map((table) => [table.name, table]));

    for (const row of columnRows) {
      const table = tablesByName.get(row.table_name);
      if (!table) continue;

      table.columns.push({
        name: row.column_name,
        type: row.column_type,
        nullable: row.is_nullable === 'YES',
        key: row.column_key,
        default: row.column_default,
        extra: row.extra,
      });
    }

    const foreignKeys = foreignKeyRows.map((row) => ({
      table: row.table_name,
      column: row.column_name,
      referenced_table: row.referenced_table,
      referenced_column: row.referenced_column,
      delete_rule: row.delete_rule,
      update_rule: row.update_rule,
    }));

    const views = viewRows.map((row) => ({ name: row.name }));

    const triggers = triggerRows.map((row) => ({
      name: row.name,
      event: row.event,
      timing: row.timing,
      table: row.table_name,
    }));

    const routines = routineRows.map((row) => ({
      name: row.name,
      type: row.type,
    }));

    return res.json({
      data: {
        tables,
        foreignKeys,
        indexes: groupIndexes(indexRows),
        views,
        triggers,
        routines,
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
