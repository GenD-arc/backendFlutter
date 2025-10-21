// routes/viewReservationStatus.js
const express = require("express");
const router = express.Router();
const connection = require("../controllers/database");
const { verifyToken } = require("../middleware/auth");

// View approval progress for a specific reservation
router.get("/:reservation_id", verifyToken, (req, res) => {
  const reservationId = req.params.reservation_id;

  console.log(`Fetching status for reservation: ${reservationId}`); // Debug log

  const query = `
    SELECT 
      r.id AS reservation_id,
      ur.f_name AS resource_name,
      r.f_id,
      r.purpose,
      r.date_from,
      r.date_to,
      r.status AS reservation_status,
      r.created_at,
      ra.updated_at,
      ra.step_order,
      u.name AS approver_name,
      ra.status AS approval_status,
      ra.comment,
      ra.acted_at
    FROM reservations r
    JOIN university_resources ur ON r.f_id = ur.f_id
    LEFT JOIN reservation_approvals ra ON r.id = ra.reservation_id
    LEFT JOIN users u ON ra.approver_id = u.id
    WHERE r.id = ?
    ORDER BY ra.step_order ASC
  `;

  connection.query(query, [reservationId], (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      console.log(`No reservation found with ID: ${reservationId}`); // Debug log
      return res.status(404).json({ error: "Reservation not found" });
    }

    console.log(`Found ${results.length} approval steps for reservation ${reservationId}`); // Debug log

    // Check if we have any approval data
    const hasApprovalData = results.some(row => row.step_order !== null);
    
    // Now fetch daily slots for this reservation
    const slotsQuery = `
      SELECT 
        slot_date,
        start_time,
        end_time
      FROM reservation_daily_slots
      WHERE reservation_id = ?
      ORDER BY slot_date ASC
    `;

    connection.query(slotsQuery, [reservationId], (slotsErr, slotsResults) => {
      if (slotsErr) {
        console.error("DB error fetching slots:", slotsErr);
        return res.status(500).json({ error: "Database error fetching slots" });
      }

      console.log(`Found ${slotsResults.length} daily slots for reservation ${reservationId}`); // Debug log

      const response = {
        id: results[0].reservation_id,
        reservation_id: results[0].reservation_id,
        f_id: results[0].f_id,
        f_name: results[0].resource_name,
        resource_name: results[0].resource_name,
        purpose: results[0].purpose,
        date_from: results[0].date_from,
        date_to: results[0].date_to,
        status: results[0].reservation_status,
        reservation_status: results[0].reservation_status,
        created_at: results[0].created_at,
        updated_at: results[0].updated_at,
        daily_slots: slotsResults, // Add daily slots here
        approvals: hasApprovalData ? results.map(row => ({
          step_order: row.step_order,
          approver_name: row.approver_name,
          status: row.approval_status,
          comment: row.comment,
          acted_at: row.acted_at
        })).filter(approval => approval.step_order !== null) : []
      };

      console.log("Response data:", JSON.stringify(response, null, 2)); // Debug log
      res.json(response);
    });
  });
});

module.exports = router;