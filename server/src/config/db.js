require('dotenv').config();
const mysql = require('mysql2/promise');
const { recordQuery } = require('../lib/queryLog');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hacka47_restaurant',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
});

const WRAPPED = Symbol('queryLogWrapped');

function elapsedMs(start) {
  return Math.round((Number(process.hrtime.bigint() - start) / 1e6) * 100) / 100;
}

function countRows(result) {
  if (Array.isArray(result)) {
    // Stored procedure / multi-statement calls resolve to an array of result sets
    if (
      result.length > 0 &&
      result.every((set) => Array.isArray(set) && (set.length === 0 || typeof set[0] === 'object'))
    ) {
      return result.reduce((total, rows) => total + rows.length, 0);
    }
    return result.length;
  }

  if (result && typeof result.affectedRows === 'number') return result.affectedRows;
  return null;
}

const sqlFromArgs = (args) => (typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0]));
const paramsFromArgs = (args) => (typeof args[1] === 'function' ? [] : args[1]);

function instrument(original, getSql, getParams, getRowCount = countRows) {
  return function (...args) {
    const start = process.hrtime.bigint();
    let result;

    try {
      result = original.apply(this, args);
    } catch (err) {
      recordQuery({ sql: getSql(args), params: getParams(args), rowCount: getRowCount(null), ms: elapsedMs(start) });
      throw err;
    }

    if (!result || typeof result.then !== 'function') {
      recordQuery({ sql: getSql(args), params: getParams(args), rowCount: getRowCount(result), ms: elapsedMs(start) });
      return result;
    }

    return result.then(
      (value) => {
        // mysql2 promise methods resolve to [result, fields]
        const payload = Array.isArray(value) ? value[0] : value;
        recordQuery({ sql: getSql(args), params: getParams(args), rowCount: getRowCount(payload), ms: elapsedMs(start) });
        return value;
      },
      (err) => {
        recordQuery({ sql: getSql(args), params: getParams(args), rowCount: getRowCount(null), ms: elapsedMs(start) });
        throw err;
      }
    );
  };
}

function instrumentTransaction(original, text) {
  return instrument(original, () => text, () => [], () => null);
}

function wrapConnection(connection) {
  if (!connection || connection[WRAPPED]) return connection;

  connection.query = instrument(connection.query, sqlFromArgs, paramsFromArgs);
  connection.execute = instrument(connection.execute, sqlFromArgs, paramsFromArgs);
  connection.beginTransaction = instrumentTransaction(connection.beginTransaction, 'START TRANSACTION');
  connection.commit = instrumentTransaction(connection.commit, 'COMMIT');
  connection.rollback = instrumentTransaction(connection.rollback, 'ROLLBACK');

  Object.defineProperty(connection, WRAPPED, { value: true });
  return connection;
}

// Wrap the promise pool without changing its public behaviour
pool.query = instrument(pool.query, sqlFromArgs, paramsFromArgs);
pool.execute = instrument(pool.execute, sqlFromArgs, paramsFromArgs);

const originalGetConnection = pool.getConnection;
pool.getConnection = function (...args) {
  const result = originalGetConnection.apply(this, args);
  if (!result || typeof result.then !== 'function') return result;
  return result.then((connection) => wrapConnection(connection));
};

module.exports = pool;
