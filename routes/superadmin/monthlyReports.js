const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");
const { verifyToken } = require("../../middleware/auth");

router.get("/monthly", verifyToken, async (req, res) => {
  try {
    const { month, year } = req.query;
    const userRole = req.user.role_id;

    if (userRole !== 'R03') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Super admin only.' 
      });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    if (!monthNum || !yearNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid month or year' 
      });
    }

    const startDate = new Date(yearNum, monthNum - 1, 1);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(yearNum, monthNum, 0);
    endDate.setHours(23, 59, 59, 999);

    console.log(`📊 Generating report for ${monthNum}/${yearNum}`);
    console.log(`   Start: ${startDate.toISOString()}`);
    console.log(`   End: ${endDate.toISOString()}`);

    const testQuery = `SELECT COUNT(*) as count FROM reservations WHERE created_at >= ? AND created_at <= ?`;
    const testResult = await queryPromise(testQuery, [startDate, endDate]);
    console.log(`   Found ${testResult[0].count} reservations in this period`);

    const summaryQuery = `
      SELECT 
        COUNT(*) as total_reservations,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM reservations
      WHERE created_at >= ? AND created_at <= ?
    `;

    const summary = await queryPromise(summaryQuery, [startDate, endDate]);

    const totalProcessed = (summary[0].approved || 0) + (summary[0].rejected || 0);
    const approvalRate = totalProcessed > 0 
      ? ((summary[0].approved / totalProcessed) * 100).toFixed(1) 
      : '0.0';

    const avgApprovalTimeQuery = `
      SELECT 
        AVG(TIMESTAMPDIFF(HOUR, r.created_at, ra.acted_at)) as avg_hours
      FROM reservations r
      JOIN reservation_approvals ra ON r.id = ra.reservation_id
      WHERE r.created_at >= ? AND r.created_at <= ?
        AND ra.status = 'approved'
        AND ra.acted_at IS NOT NULL
    `;

    const avgTimeResult = await queryPromise(avgApprovalTimeQuery, [startDate, endDate]);
    const avgApprovalHours = avgTimeResult[0]?.avg_hours || 0;
    const avgApprovalDays = (avgApprovalHours / 24).toFixed(1);

    const resourceUtilizationQuery = `
      SELECT 
        ur.f_id,
        ur.f_name as resource_name,
        ur.category,
        COUNT(r.id) as booking_count,
        SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END) as approved_bookings,
        COUNT(DISTINCT DATE(rds.slot_date)) as total_days_booked,
        SUM(TIMESTAMPDIFF(HOUR, 
          CONCAT(rds.slot_date, ' ', rds.start_time),
          CONCAT(rds.slot_date, ' ', rds.end_time)
        )) as total_hours_booked
      FROM university_resources ur
      LEFT JOIN reservations r ON ur.f_id = r.f_id 
        AND r.created_at >= ? AND r.created_at <= ?
      LEFT JOIN reservation_daily_slots rds ON r.id = rds.reservation_id
      GROUP BY ur.f_id, ur.f_name, ur.category
      ORDER BY booking_count DESC
    `;

    const resourceUtilization = await queryPromise(resourceUtilizationQuery, [startDate, endDate]);

    const daysInMonth = endDate.getDate();
    const maxAvailableHours = daysInMonth * 8; 

    const resourceUtilizationWithPercentage = resourceUtilization.map(resource => {
      const totalHours = parseInt(resource.total_hours_booked) || 0;
      const utilizationPct = totalHours > 0
        ? ((totalHours / maxAvailableHours) * 100).toFixed(1)
        : '0.0';

      return {
        resource_id: resource.f_id,
        resource_name: resource.resource_name,
        category: resource.category,
        booking_count: parseInt(resource.booking_count) || 0,
        approved_bookings: parseInt(resource.approved_bookings) || 0,
        total_days_booked: parseInt(resource.total_days_booked) || 0,
        total_hours_booked: totalHours,
        utilization_percentage: parseFloat(utilizationPct)
      };
    });

    const categoryBreakdownQuery = `
      SELECT 
        ur.category,
        COUNT(r.id) as booking_count,
        SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN r.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM reservations r
      JOIN university_resources ur ON r.f_id = ur.f_id
      WHERE r.created_at >= ? AND r.created_at <= ?
      GROUP BY ur.category
      ORDER BY booking_count DESC
    `;

    const categoryBreakdown = await queryPromise(categoryBreakdownQuery, [startDate, endDate]);

    const formattedCategoryBreakdown = categoryBreakdown.map(cat => ({
      category: cat.category,
      booking_count: parseInt(cat.booking_count) || 0,
      approved: parseInt(cat.approved) || 0,
      rejected: parseInt(cat.rejected) || 0,
      pending: parseInt(cat.pending) || 0
    }));

    const dailyTrendsQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM reservations
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    const dailyTrends = await queryPromise(dailyTrendsQuery, [startDate, endDate]);

    const formattedDailyTrends = dailyTrends.map(trend => ({
      date: trend.date,
      total: parseInt(trend.total) || 0,
      approved: parseInt(trend.approved) || 0,
      rejected: parseInt(trend.rejected) || 0,
      pending: parseInt(trend.pending) || 0
    }));

    const topRequestersQuery = `
      SELECT 
        u.id,
        u.name,
        u.department,
        COUNT(r.id) as total_requests,
        SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN r.status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM users u
      JOIN reservations r ON u.id = r.requester_id
      WHERE r.created_at >= ? AND r.created_at <= ?
      GROUP BY u.id, u.name, u.department
      ORDER BY total_requests DESC
    `;

    const topRequesters = await queryPromise(topRequestersQuery, [startDate, endDate]);

    const formattedTopRequesters = topRequesters.map(req => ({
      id: req.id,
      name: req.name,
      department: req.department,
      total_requests: parseInt(req.total_requests) || 0,
      approved: parseInt(req.approved) || 0,
      rejected: parseInt(req.rejected) || 0
    }));

    const departmentBreakdownQuery = `
      SELECT 
        u.department,
        COUNT(r.id) as booking_count,
        SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN r.status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM reservations r
      JOIN users u ON r.requester_id = u.id
      WHERE r.created_at >= ? AND r.created_at <= ?
      GROUP BY u.department
      ORDER BY booking_count DESC
    `;

    const departmentBreakdown = await queryPromise(departmentBreakdownQuery, [startDate, endDate]);

    const formattedDepartmentBreakdown = departmentBreakdown.map(dept => ({
      department: dept.department,
      booking_count: parseInt(dept.booking_count) || 0,
      approved: parseInt(dept.approved) || 0,
      rejected: parseInt(dept.rejected) || 0
    }));

    const workflowPerformanceQuery = `
      SELECT 
        ra.step_order,
        u.name as approver_name,
        COUNT(ra.id) as total_approvals,
        SUM(CASE WHEN ra.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN ra.status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        AVG(TIMESTAMPDIFF(HOUR, r.created_at, ra.acted_at)) as avg_response_hours
      FROM reservation_approvals ra
      JOIN reservations r ON ra.reservation_id = r.id
      JOIN users u ON ra.approver_id = u.id
      WHERE r.created_at >= ? AND r.created_at <= ?
        AND ra.acted_at IS NOT NULL
      GROUP BY ra.step_order, u.name, ra.approver_id
      ORDER BY ra.step_order ASC, total_approvals DESC
    `;

    const workflowPerformance = await queryPromise(workflowPerformanceQuery, [startDate, endDate]);

    const formattedWorkflow = workflowPerformance.map(item => {
      const avgHours = parseFloat(item.avg_response_hours) || 0;
      return {
        step_order: parseInt(item.step_order) || 0,
        approver_name: item.approver_name,
        total_approvals: parseInt(item.total_approvals) || 0,
        approved_count: parseInt(item.approved_count) || 0,
        rejected_count: parseInt(item.rejected_count) || 0,
        avg_response_hours: parseFloat(avgHours.toFixed(1)),
        avg_response_days: parseFloat((avgHours / 24).toFixed(1))
      };
    });

    const peakBookingTimesQuery = `
      SELECT 
        DAYNAME(created_at) as day_name,
        DAYOFWEEK(created_at) as day_number,
        COUNT(*) as booking_count
      FROM reservations
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY day_name, day_number
      ORDER BY day_number ASC
    `;

    const peakBookingTimes = await queryPromise(peakBookingTimesQuery, [startDate, endDate]);

    const formattedPeakBookingTimes = peakBookingTimes.map(peak => ({
      day_name: peak.day_name,
      day_number: parseInt(peak.day_number) || 0,
      booking_count: parseInt(peak.booking_count) || 0
    }));

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];

    const response = {
      success: true,
      report: {
        period: {
          month: monthNum,
          year: yearNum,
          month_name: monthNames[monthNum - 1],
          display: `${monthNames[monthNum - 1]} ${yearNum}`,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
        },
        summary: {
          total_reservations: parseInt(summary[0].total_reservations) || 0,
          approved: parseInt(summary[0].approved) || 0,
          rejected: parseInt(summary[0].rejected) || 0,
          pending: parseInt(summary[0].pending) || 0,
          cancelled: parseInt(summary[0].cancelled) || 0,
          approval_rate_percentage: parseFloat(approvalRate),
          avg_approval_time_hours: parseFloat(avgApprovalHours.toFixed(1)),
          avg_approval_time_days: parseFloat(avgApprovalDays),
        },
        resource_utilization: resourceUtilizationWithPercentage,
        category_breakdown: formattedCategoryBreakdown,
        daily_trends: formattedDailyTrends,
        top_requesters: formattedTopRequesters,
        department_breakdown: formattedDepartmentBreakdown,
        workflow_performance: formattedWorkflow,
        peak_booking_times: formattedPeakBookingTimes,
        generated_at: new Date().toISOString(),
      }
    };

    console.log(`✅ Report generated successfully for ${response.report.period.display}`);
    console.log(`   Total reservations: ${response.report.summary.total_reservations}`);

    res.json(response);

  } catch (error) {
    console.error('❌ Error generating monthly report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message 
    });
  }
});
function queryPromise(query, params) {
  return new Promise((resolve, reject) => {
    connection.query(query, params, (err, results) => {
      if (err) {
        console.error('❌ Query error:', err.message);
        reject(err);
      } else {
        resolve(results || []);
      }
    });
  });
}

module.exports = router;