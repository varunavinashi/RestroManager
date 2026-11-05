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

const VIEW_LIST_SQL = `
  SELECT TABLE_NAME AS name
  FROM INFORMATION_SCHEMA.VIEWS
  WHERE TABLE_SCHEMA = DATABASE()
  ORDER BY TABLE_NAME
`;

const VIEW_COLUMNS_SQL = `
  SELECT
    c.TABLE_NAME AS view_name,
    c.COLUMN_NAME AS name,
    c.COLUMN_TYPE AS type,
    c.IS_NULLABLE AS is_nullable
  FROM INFORMATION_SCHEMA.COLUMNS c
  JOIN INFORMATION_SCHEMA.VIEWS v
    ON v.TABLE_SCHEMA = c.TABLE_SCHEMA AND v.TABLE_NAME = c.TABLE_NAME
  WHERE c.TABLE_SCHEMA = DATABASE()
  ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
`;

const TRIGGER_LIST_SQL = `
  SELECT
    TRIGGER_NAME AS name,
    ACTION_TIMING AS timing,
    EVENT_MANIPULATION AS event,
    EVENT_OBJECT_TABLE AS table_name
  FROM INFORMATION_SCHEMA.TRIGGERS
  WHERE TRIGGER_SCHEMA = DATABASE()
  ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME
`;

const AUDIT_LOG_SQL = `
  SELECT order_id, old_status, new_status, changed_at
  FROM order_status_log
  ORDER BY changed_at DESC, log_id DESC
  LIMIT 10
`;

const ROUTINE_LIST_SQL = `
  SELECT
    ROUTINE_NAME AS name,
    ROUTINE_TYPE AS type
  FROM INFORMATION_SCHEMA.ROUTINES
  WHERE ROUTINE_SCHEMA = DATABASE()
  ORDER BY ROUTINE_TYPE, ROUTINE_NAME
`;

const ROUTINE_PARAMS_SQL = `
  SELECT
    SPECIFIC_NAME AS routine_name,
    PARAMETER_MODE AS mode,
    PARAMETER_NAME AS name,
    DTD_IDENTIFIER AS type,
    ORDINAL_POSITION AS position
  FROM INFORMATION_SCHEMA.PARAMETERS
  WHERE SPECIFIC_SCHEMA = DATABASE()
    AND PARAMETER_NAME IS NOT NULL
  ORDER BY SPECIFIC_NAME, ORDINAL_POSITION
`;

const INDEXES_DETAIL_SQL = `
  SELECT
    TABLE_NAME AS table_name,
    INDEX_NAME AS index_name,
    NON_UNIQUE AS non_unique,
    COLUMN_NAME AS column_name,
    INDEX_TYPE AS index_type
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND INDEX_NAME <> 'PRIMARY'
  ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
`;

const SHOW_CREATE_ROUTINE_SQL = {
  FUNCTION: 'SHOW CREATE FUNCTION ??',
  PROCEDURE: 'SHOW CREATE PROCEDURE ??',
};

const getDatabaseName = async () => {
  const [rows] = await pool.execute('SELECT DATABASE() AS db_name');
  return rows[0] ? rows[0].db_name : null;
};

const quoteIdentifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;

const isPositiveInteger = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return false;

  const number = Number(text);
  return Number.isInteger(number) && number > 0 && number <= 2147483647;
};

const isValidDate = (value) => {
  if (typeof value !== 'string') return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const getCreateView = async (name) => {
  const [rows] = await pool.query('SHOW CREATE VIEW ??', [name]);
  return rows[0] ? rows[0]['Create View'] : null;
};

const getCreateTrigger = async (name) => {
  const [rows] = await pool.query('SHOW CREATE TRIGGER ??', [name]);
  return rows[0] ? rows[0]['SQL Original Statement'] : null;
};

const getCreateRoutine = async (type, name) => {
  const sql = SHOW_CREATE_ROUTINE_SQL[type];
  if (!sql) return null;

  const [rows] = await pool.query(sql, [name]);
  if (!rows[0]) return null;

  return type === 'FUNCTION' ? rows[0]['Create Function'] : rows[0]['Create Procedure'];
};

const resultSetsFromCall = (result, fields) => {
  const sets = Array.isArray(result) ? result.filter(Array.isArray) : [];

  return sets.map((rows, index) => {
    const fieldList = Array.isArray(fields) ? fields[index] : null;
    const columns =
      Array.isArray(fieldList) && fieldList.length > 0
        ? fieldList.map((field) => field.name)
        : rows[0]
          ? Object.keys(rows[0])
          : [];

    return { columns, rows };
  });
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

// GET /api/schema/views
router.get('/views', async (req, res, next) => {
  try {
    const [[viewRows], [columnRows]] = await Promise.all([
      pool.execute(VIEW_LIST_SQL),
      pool.execute(VIEW_COLUMNS_SQL),
    ]);

    const columnsByView = new Map();
    for (const row of columnRows) {
      if (!columnsByView.has(row.view_name)) columnsByView.set(row.view_name, []);
      columnsByView.get(row.view_name).push({
        name: row.name,
        type: row.type,
        nullable: row.is_nullable === 'YES',
      });
    }

    const views = await Promise.all(
      viewRows.map(async (row) => ({
        name: row.name,
        definition: await getCreateView(row.name),
        columns: columnsByView.get(row.name) || [],
      }))
    );

    return res.json({ data: views });
  } catch (err) {
    return next(err);
  }
});

// GET /api/schema/views/:name/rows
router.get('/views/:name/rows', async (req, res, next) => {
  try {
    const { name } = req.params;

    const [viewRows] = await pool.execute(
      `SELECT TABLE_NAME AS name
       FROM INFORMATION_SCHEMA.VIEWS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [name]
    );

    if (viewRows.length === 0) {
      return res.status(404).json({ error: 'View not found' });
    }

    const viewName = viewRows[0].name;
    const [rows, fields] = await pool.query('SELECT * FROM ?? LIMIT 10', [viewName]);
    const columns = Array.isArray(fields) ? fields.map((field) => field.name) : [];

    return res.json({ data: { name: viewName, columns, rows } });
  } catch (err) {
    return next(err);
  }
});

// GET /api/schema/triggers
router.get('/triggers', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(TRIGGER_LIST_SQL);

    const triggers = await Promise.all(
      rows.map(async (row) => ({
        name: row.name,
        timing: row.timing,
        event: row.event,
        table: row.table_name,
        definition: await getCreateTrigger(row.name),
      }))
    );

    return res.json({ data: triggers });
  } catch (err) {
    return next(err);
  }
});

// GET /api/schema/audit-log
router.get('/audit-log', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(AUDIT_LOG_SQL);

    return res.json({
      data: rows.map((row) => ({
        order_id: row.order_id,
        old_status: row.old_status,
        new_status: row.new_status,
        changed_at: row.changed_at,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/schema/routines
router.get('/routines', async (req, res, next) => {
  try {
    const [[routineRows], [paramRows]] = await Promise.all([
      pool.execute(ROUTINE_LIST_SQL),
      pool.execute(ROUTINE_PARAMS_SQL),
    ]);

    const paramsByRoutine = new Map();
    for (const row of paramRows) {
      if (!paramsByRoutine.has(row.routine_name)) paramsByRoutine.set(row.routine_name, []);
      paramsByRoutine.get(row.routine_name).push({
        name: row.name,
        mode: row.mode || 'IN',
        type: row.type,
      });
    }

    const routines = await Promise.all(
      routineRows.map(async (row) => ({
        name: row.name,
        type: row.type,
        params: paramsByRoutine.get(row.name) || [],
        definition: await getCreateRoutine(row.type, row.name),
      }))
    );

    return res.json({ data: routines });
  } catch (err) {
    return next(err);
  }
});

// POST /api/schema/routines/try
router.post('/routines/try', async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name : '';
    const args = Array.isArray(body.args) ? body.args : null;

    if (name !== 'fn_order_total' && name !== 'sp_daily_sales') {
      return res.status(400).json({
        error: 'Only fn_order_total and sp_daily_sales can be run here',
      });
    }

    if (!args || args.length !== 1) {
      return res.status(400).json({ error: 'Provide exactly one argument' });
    }

    if (name === 'fn_order_total') {
      const orderId = args[0];

      if (!isPositiveInteger(orderId)) {
        return res.status(400).json({ error: 'Order id must be a positive integer' });
      }

      const [rows] = await pool.execute('SELECT fn_order_total(?) AS result', [
        Number(String(orderId).trim()),
      ]);

      return res.json({
        data: {
          name,
          type: 'FUNCTION',
          resultSets: [{ columns: ['result'], rows }],
        },
      });
    }

    const date = args[0];

    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'Date must be a valid YYYY-MM-DD value' });
    }

    const [result, fields] = await pool.query('CALL sp_daily_sales(?)', [date.trim()]);

    return res.json({
      data: {
        name,
        type: 'PROCEDURE',
        resultSets: resultSetsFromCall(result, fields),
      },
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/schema/indexes
router.get('/indexes', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(INDEXES_DETAIL_SQL);

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
          type: row.index_type,
          createStatement: '',
        };
        byName.set(key, index);
        indexes.push(index);
      }

      index.columns.push(row.column_name);
    }

    for (const index of indexes) {
      index.createStatement = `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quoteIdentifier(
        index.name
      )} ON ${quoteIdentifier(index.table)} (${index.columns
        .map(quoteIdentifier)
        .join(', ')})`;
    }

    return res.json({ data: indexes });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
