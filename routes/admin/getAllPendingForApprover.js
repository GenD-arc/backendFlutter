const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");

router.get("/:approver_id", async (req, res) => {
  const approverId = req.params.approver_id;
  

  try {
    const allPendingQuery = `
      SELECT 
        ra.id AS approval_id, 
        r.id AS reservation_id, 
        r.f_id AS facility_id,
        f.f_name AS facility_name,
        r.purpose, 
        r.date_from, 
        r.date_to, 
        r.created_at,
        ra.status AS approval_status,
        r.status AS reservation_status, 
        r.requester_id,
        u.name AS requester_name,
        ra.step_order,
        ra.acted_at
      FROM reservation_approvals ra
      JOIN reservations r ON ra.reservation_id = r.id
      JOIN university_resources f ON r.f_id = f.f_id
      JOIN users u ON r.requester_id = u.id
      WHERE ra.approver_id = ? 
        AND ra.status = 'pending'
        AND r.status = 'pending'
      ORDER BY r.created_at DESC
    `;

    const allPending = await new Promise((resolve, reject) => {
      connection.query(allPendingQuery, [approverId], (err, results) => {
        if (err) {
          console.error('❌ Database query error:', err);
          reject(err);
        } else {
          resolve(results || []);
        }
      });
    });

    const approvalsWithSlots = [];
    
    for (const approval of allPending) {
      const dailySlots = await new Promise((resolve, reject) => {
        connection.query(
          `SELECT slot_date, start_time, end_time 
           FROM reservation_daily_slots 
           WHERE reservation_id = ? 
           ORDER BY slot_date ASC`,
          [approval.reservation_id],
          (err, results) => {
            if (err) reject(err);
            else resolve(results || []);
          }
        );
      });
      
      
      approvalsWithSlots.push({
        approval_id: approval.approval_id,
        reservation_id: approval.reservation_id,
        facility_id: approval.facility_id,
        facility_name: approval.facility_name,
        purpose: approval.purpose,
        date_from: approval.date_from,
        date_to: approval.date_to,
        created_at: approval.created_at,
        status: approval.approval_status,
        requester_id: approval.requester_id,
        requester_name: approval.requester_name,
        step_order: approval.step_order,
        daily_slots: dailySlots
      });
    }
    
    res.json(approvalsWithSlots);

  } catch (error) {
    console.error("❌ Error fetching ALL pending approvals:", error);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;