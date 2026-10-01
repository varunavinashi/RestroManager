function errorHandler(err, req, res, next) {
  console.error(`${req.method} ${req.originalUrl} failed:`, err.message);

  const status = err.status || 500;

  if (res.headersSent) {
    return next(err);
  }

  return res.status(status).json({ error: err.message || 'Server error' });
}

module.exports = errorHandler;