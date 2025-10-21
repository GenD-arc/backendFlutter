const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");

router.get("/:approver_id", async (req, res) => {
  const approverId = req.params.approver_id;
  
  console.log(`🔍 Fetching pending reservations for approver: ${approverId}`);

  try {
    // Updated query to include daily_slots
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
        ra.step_order
      FROM reservation_approvals ra
      JOIN reservations r ON ra.reservation_id = r.id
      JOIN university_resources f ON r.f_id = f.f_id
      JOIN users u ON r.requester_id = u.id
      WHERE ra.approver_id = ? 
        AND ra.status = 'pending'
        AND r.status = 'pending'
      ORDER BY r.created_at ASC
    `;

    const allPending = await new Promise((resolve, reject) => {
      connection.query(allPendingQuery, [approverId], (err, results) => {
        if (err) {
          console.error('❌ Database query error:', err);
          reject(err);
        } else {
          console.log(`✅ Found ${results.length} pending approvals (before workflow check)`);
          resolve(results || []);
        }
      });
    });

    // Filter based on workflow step order and fetch daily slots
    const validApprovals = [];
    
    for (const approval of allPending) {
      console.log(`🔍 Checking approval ${approval.approval_id} (step ${approval.step_order}) for reservation ${approval.reservation_id}`);
      
      // Check if there are any previous steps that are not approved
      const previousSteps = await new Promise((resolve, reject) => {
        connection.query(
          "SELECT status FROM reservation_approvals WHERE reservation_id = ? AND step_order < ?",
          [approval.reservation_id, approval.step_order],
          (err, results) => {
            if (err) reject(err);
            else resolve(results || []);
          }
        );
      });
      
      console.log(`   Previous steps:`, previousSteps.map(s => s.status));
      
      // If no previous steps exist, OR all previous steps are approved, include this approval
      const allPreviousApproved = previousSteps.length === 0 || previousSteps.every(step => step.status === 'approved');
      
      if (allPreviousApproved) {
        console.log(`   ✅ Including approval ${approval.approval_id}`);
        
        // ✅ Fetch daily slots for this reservation
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
        
        console.log(`   📅 Found ${dailySlots.length} daily slots for reservation ${approval.reservation_id}`);
        
        validApprovals.push({
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
          daily_slots: dailySlots  // ✅ Added daily slots array
        });
      } else {
        console.log(`   ❌ Skipping approval ${approval.approval_id} - previous steps not approved`);
      }
    }

    console.log(`📊 Final result: ${validApprovals.length} valid approvals`);
    console.log(`📋 Sample data:`, JSON.stringify(validApprovals[0], null, 2));
    
    res.json(validApprovals);

  } catch (error) {
    console.error("❌ Error fetching pending approvals:", error);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;