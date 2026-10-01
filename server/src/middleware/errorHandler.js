function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err.status) {
    console.error(`${req.method} ${req.originalUrl} failed:`, err.message);
    return res.status(err.status).json({ error: err.message || 'Server error' });
  }

  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

module.exports = errorHandler;