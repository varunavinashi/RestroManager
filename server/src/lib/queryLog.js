const { AsyncLocalStorage } = require('async_hooks');

const MAX_QUERIES = 15;
const MAX_SQL_LENGTH = 2000;

// One store per request: { queries: [...] }
const storage = new AsyncLocalStorage();

// Params can contain Date, Buffer or unexpected values; keep the response JSON-safe
function toPlainParams(params) {
  if (params === undefined || params === null) return [];

  const values = Array.isArray(params) ? params : [params];
  return values.map((value) => {
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (typeof value === 'bigint') return value.toString();
    if (value !== null && typeof value === 'object') {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (err) {
        return String(value);
      }
    }
    return value;
  });
}

function recordQuery({ sql, params, rowCount, ms }) {
  const store = storage.getStore();
  if (!store) return;

  store.queries.push({
    sql: String(sql).slice(0, MAX_SQL_LENGTH),
    params: toPlainParams(params),
    rowCount: rowCount === undefined ? null : rowCount,
    ms,
  });

  // Keep only the most recent entries
  if (store.queries.length > MAX_QUERIES) {
    store.queries.shift();
  }
}

function sqlContextMiddleware(req, res, next) {
  // /api/health is a bare liveness probe with no { data } envelope
  if (req.path === '/api/health') return next();

  storage.run({ queries: [] }, () => {
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      const isObject =
        body !== null &&
        typeof body === 'object' &&
        !Array.isArray(body);
      const hasData = isObject && Object.prototype.hasOwnProperty.call(body, 'data');
      const isError = isObject && Object.prototype.hasOwnProperty.call(body, 'error');

      if (process.env.SHOW_SQL === 'true' && (hasData || isError)) {
        const store = storage.getStore();
        const queries = store ? store.queries : [];
        // Errors only carry SQL when a statement actually ran, so pre-validation
        // failures stay a plain { error } object.
        if (hasData || queries.length > 0) {
          return originalJson({
            ...body,
            meta: { queries },
          });
        }
      }

      return originalJson(body);
    };

    next();
  });
}

module.exports = {
  storage,
  recordQuery,
  sqlContextMiddleware,
  MAX_QUERIES,
  MAX_SQL_LENGTH,
};
