const express = require('express');
const router = express.Router();
const connection = require('../../../controllers/database');

router.get('/', (req, res) => {
    const roleId = req.query.role_id?.split(",") || [];
    const status = req.query.status; // "active", "archived", or "all"
    const placeholders = roleId.map(() => "?").join(",");

    let query = `
        SELECT 
            u.id, 
            u.name, 
            u.department, 
            u.role_id,
            u.active,
            r.role_type,
            CASE 
                WHEN u.id LIKE 'ORG-%' THEN 'Organization'
                WHEN u.id LIKE 'ADV-%' THEN 'Adviser' 
                WHEN u.id LIKE 'STF-%' THEN 'Staff'
                ELSE r.role_type
            END AS computed_role_type
        FROM users u 
        JOIN roles r ON u.role_id = r.id 
        WHERE 1=1
    `;

    if (status === "active") {
    query += " AND u.active = 1";
  } else if (status === "archived") {
    query += " AND u.active = 0";
  } // else "all" → no filter

    if (roleId.length > 0) {
        query += ` AND u.role_id IN (${placeholders})`;
    }

    connection.query(query, roleId, (error, results) => {
        if (error) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

router.get('/counts', (req, res) => {
  const query = `
    SELECT 
      SUM(u.active = 1) AS activeCount,
      SUM(u.active = 0) AS archivedCount,
      COUNT(*) AS totalCount
    FROM users u
  `;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results[0]);
  });
});


module.exports = router;