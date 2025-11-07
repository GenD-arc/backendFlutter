const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");

router.get("/:approverId", async (req, res) => {
  try {
    const { approverId } = req.params;
    
    if (req.user && req.user.id !== approverId && req.user.role_id !== 'R03' && req.user.role_id !== 'R02') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only view your own approval logs.' 
      });
    }

    const query = `
      SELECT 
        ra.id as approval_id,
        ra.reservation_id,
        ra.step_order,
        ra.status as action,
        ra.acted_at as action_date,
        ra.comment,
        r.f_id as facility_id,
        r.purpose,
        r.date_from,
        r.date_to,
        r.status as reservation_status,
        r.created_at,
        ur.f_name as facility_name,
        ur.category as resource_type,
        ur.f_description as resource_location,
        u.name as requester_name,
        u.id as requester_id,
        u.department as requester_department
      FROM reservation_approvals ra
      JOIN reservations r ON ra.reservation_id = r.id
      JOIN university_resources ur ON r.f_id = ur.f_id
      JOIN users u ON r.requester_id = u.id
      WHERE ra.approver_id = ?
        AND ra.status IN ('approved', 'rejected')
      ORDER BY ra.acted_at DESC
    `;

    const logs = await new Promise((resolve, reject) => {
      connection.query(query, [approverId], (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    });

    const logsWithSlots = await Promise.all(
      logs.map(async (log) => {
        const slotsQuery = `
          SELECT slot_date, start_time, end_time 
          FROM reservation_daily_slots 
          WHERE reservation_id = ? 
          ORDER BY slot_date ASC
        `;
        
        const dailySlots = await new Promise((resolve, reject) => {
          connection.query(slotsQuery, [log.reservation_id], (err, results) => {
            if (err) reject(err);
            else resolve(results || []);
          });
        });
        
        return {
          ...log,
          daily_slots: dailySlots
        };
      })
    );
    
    const formattedLogs = logsWithSlots.map(log => ({
      approval_id: log.approval_id,
      reservation_id: log.reservation_id,
      facility_id: log.facility_id,
      facility_name: log.facility_name,
      step_order: log.step_order,
      purpose: log.purpose,
      date_from: log.date_from,
      date_to: log.date_to,
      created_at: log.created_at,
      requester_name: log.requester_name,
      requester_id: log.requester_id,
      requester_department: log.requester_department,
      resource_type: log.resource_type,
      resource_location: log.resource_location || 'Not specified',
      action: log.action,
      action_date: log.action_date,
      comment: log.comment,
      status: log.action,
      reservation_status: log.reservation_status,
      approved_at: log.action === 'approved' ? log.action_date : null,
      rejected_at: log.action === 'rejected' ? log.action_date : null,
      reservation_date: log.date_from,
      start_time: log.date_from,
      end_time: log.date_to,
      notes: log.comment,
      daily_slots: log.daily_slots
    }));

    const totalLogs = formattedLogs.length;
    const approvedCount = formattedLogs.filter(log => log.action === 'approved').length;
    const rejectedCount = formattedLogs.filter(log => log.action === 'rejected').length;

    res.json({
      success: true,
      logs: formattedLogs,
      summary: {
        total: totalLogs,
        approved: approvedCount,
        rejected: rejectedCount
      }
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message 
    });
  }
});

router.get("/stats/:approverId", async (req, res) => {
  try {
    const { approverId } = req.params;
    const { period = '30' } = req.query;
    
    if (req.user && req.user.id !== approverId && req.user.role_id !== 'R03') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied.' 
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const statsQuery = `
      SELECT 
        DATE(ra.acted_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN ra.status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN ra.status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM reservation_approvals ra
      WHERE ra.approver_id = ?
        AND ra.status IN ('approved', 'rejected')
        AND ra.acted_at >= ?
      GROUP BY DATE(ra.acted_at)
      ORDER BY date DESC
    `;

    const statsRows = await new Promise((resolve, reject) => {
      connection.query(statsQuery, [approverId, startDate], (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    });

    const totalQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN ra.status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN ra.status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM reservation_approvals ra
      WHERE ra.approver_id = ?
        AND ra.status IN ('approved', 'rejected')
        AND ra.acted_at >= ?
    `;

    const totalRows = await new Promise((resolve, reject) => {
      connection.query(totalQuery, [approverId, startDate], (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    });

    res.json({
      success: true,
      period: `${period} days`,
      daily_stats: statsRows,
      totals: totalRows[0] || { total: 0, approved: 0, rejected: 0 }
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message 
    });
  }
});

module.exports = router;