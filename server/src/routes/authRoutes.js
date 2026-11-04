const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const router = express.Router();

const TOKEN_EXPIRY = '8h';

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  const body = req.body || {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    return res.status(400).json({ error: 'Fields "username" and "password" are required.' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT staff_id, name, role, password_hash FROM staff WHERE username = ? AND is_active = TRUE',
      [username]
    );

    if (rows.length === 0 || !rows[0].password_hash) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const staff = rows[0];
    const matches = await bcrypt.compare(password, staff.password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      { staff_id: staff.staff_id, name: staff.name, role: staff.role },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    return res.json({
      data: {
        token,
        user: {
          name: staff.name,
          role: staff.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
