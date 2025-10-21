const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");
const { verifyToken } = require("../../middleware/auth");

// Get full history for a reservation
router.get("/:reservation_id", verifyToken, async (req, res) => {
  const reservationId = req.params.reservation_id;
  const userId = req.user.user_id;
  const userRole = req.user.role_id;

  try {
    // Check if user has permission to view this reservation's history
    const permissionCheck = await new Promise((resolve, reject) => {
      connection.query(`
        SELECT 
          r.requester_id,
          COUNT(ra.id) as is_approver,
          COUNT(CASE WHEN u.role_id IN ('R02', 'R03') THEN 1 END) as is_admin
        FROM reservations r
        LEFT JOIN reservation_approvals ra ON r.id = ra.reservation_id AND ra.approver_id = ?
        LEFT JOIN users u ON u.id = ? AND u.role_id IN ('R02', 'R03')
        WHERE r.id = ?
        GROUP BY r.requester_id
      `, [userId, userId, reservationId], (err, results) => {
        if (err) reject(err);
        else resolve(results && results.length > 0 ? results[0] : null);
      });
    });

    if (!permissionCheck) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    const isRequester = permissionCheck.requester_id === userId;
    const isApprover = permissionCheck.is_approver > 0;
    const isAdmin = permissionCheck.is_admin > 0;

    if (!isRequester && !isApprover && !isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get complete history using the view
    const history = await new Promise((resolve, reject) => {
      connection.query(`
        SELECT * FROM reservation_history_view 
        WHERE reservation_id = ?
        ORDER BY action_at ASC
      `, [reservationId], (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    });

    if (history.length === 0) {
      return res.status(404).json({ error: "No history found" });
    }

    // Group the data
    const reservationInfo = {
      reservation_id: history[0].reservation_id,
      f_id: history[0].f_id,
      resource_name: history[0].resource_name,
      requester_id: history[0].requester_id,
      requester_name: history[0].requester_name,
      purpose: history[0].purpose,
      date_from: history[0].date_from,
      date_to: history[0].date_to,
      current_status: history[0].current_status,
      requested_at: history[0].requested_at
    };

    const activities = history
      .filter(item => item.log_id !== null)
      .map(item => ({
        log_id: item.log_id,
        action_type: item.action_type,
        description: item.action_description,
        old_status: item.old_status,
        new_status: item.new_status,
        step_order: item.step_order,
        comment: item.comment,
        action_by_id: item.action_by_id,
        action_by_name: item.action_by_name,
        action_by_role: item.action_by_role,
        action_at: item.action_at
      }));

    res.json({
      reservation: reservationInfo,
      activities: activities
    });

  } catch (error) {
    console.error("Error fetching reservation history:", error);
    res.status(500).json({ error: "Database error" });
  }
});

// Get activity summary for admins/super admins
router.get("/admin/summary", verifyToken, async (req, res) => {
  const userRole = req.user.role_id;
  const { startDate, endDate, status, actionType } = req.query;

  // Only admins and super admins can access this
  if (!['R02', 'R03'].includes(userRole)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    let query = `
      SELECT 
        reservation_id,
        resource_name,
        requester_name,
        current_status,
        action_type,
        action_description,
        action_by_name,
        action_by_role,
        action_at,
        comment
      FROM reservation_history_view
      WHERE 1=1
    `;
    
    const params = [];

    if (startDate) {
      query += ` AND DATE(action_at) >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND DATE(action_at) <= ?`;
      params.push(endDate);
    }

    if (status) {
      query += ` AND current_status = ?`;
      params.push(status);
    }

    if (actionType) {
      query += ` AND action_type = ?`;
      params.push(actionType);
    }

    query += ` ORDER BY action_at DESC LIMIT 1000`; // Limit for performance

    const activities = await new Promise((resolve, reject) => {
      connection.query(query, params, (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    });

    res.json(activities);

  } catch (error) {
    console.error("Error fetching activity summary:", error);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;