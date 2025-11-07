const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const util = require("util");
const connection = require("../controllers/database");

const query = util.promisify(connection.query).bind(connection);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-for-development';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h';

router.post("/", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const sql = `
      SELECT a.username, a.email, a.password, r.id AS role_id, u.name, u.id as user_id, u.active
      FROM accounts a
      JOIN users u ON a.user_id = u.id
      JOIN roles r ON u.role_id = r.id
      WHERE (BINARY a.email = ? OR BINARY a.username = ?)
      LIMIT 1
    `;

    const results = await query(sql, [identifier, identifier]);

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = results[0];

    if (user.active === 0) {
      return res.status(403).json({ message: "Account deactivated. Contact administrator." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const tokenPayload = { 
      username: user.username, 
      role_id: user.role_id,
      user_id: user.user_id 
    };
    
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    return res.json({
      token,
      role_id: user.role_id,
      name: user.name,
      username: user.username,
      user_id: user.user_id 
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ 
      error: "Server error", 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

module.exports = router;