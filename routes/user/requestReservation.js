const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");

const logActivity = async (reservationId, userId, actionType, description, oldStatus = null, newStatus = null, stepOrder = null, comment = null, metadata = null) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO reservation_activity_logs 
      (reservation_id, user_id, action_type, description, old_status, new_status, step_order, comment, metadata) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    connection.query(query, [reservationId, userId, actionType, description, oldStatus, newStatus, stepOrder, comment, metadata], (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

// Simple function to get current date in YYYY-MM-DD format in Philippine time
function getCurrentPhDateString() {
  const now = new Date();
  // Convert to Philippine time (UTC+8)
  const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return phTime.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

// Simple function to compare date strings (YYYY-MM-DD)
function isDateInPast(selectedDateString) {
  const currentDateString = getCurrentPhDateString();
  console.log('🔍 Simple Date Comparison:');
  console.log('📅 Current Date (PH):', currentDateString);
  console.log('📅 Selected Date:', selectedDateString);
  console.log('📅 Is in past?', selectedDateString < currentDateString);
  
  return selectedDateString < currentDateString;
}

// Check if time is in the future for today's reservations
function isTimeInFuture(timeString) {
  const now = new Date();
  const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); // Current PH time
  
  const [hours, minutes] = timeString.split(':');
  const slotTime = new Date(phTime);
  slotTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  
  return slotTime > phTime;
}

router.post("/", async (req, res) => {
  const { f_id, requester_id, purpose, daily_slots } = req.body;

  if (!f_id || !requester_id || !purpose || !daily_slots || !Array.isArray(daily_slots) || daily_slots.length === 0) {
    return res.status(400).json({ error: "Missing required fields. Expected: f_id, requester_id, purpose, and daily_slots array" });
  }

  for (const slot of daily_slots) {
    if (!slot.date || !slot.start_time || !slot.end_time) {
      return res.status(400).json({ error: "Each daily slot must have date, start_time, and end_time" });
    }
  }

  try {
    const sortedSlots = daily_slots.sort((a, b) => new Date(a.date) - new Date(b.date));
    const startDateString = sortedSlots[0].date; // This is already YYYY-MM-DD
    const endDateString = sortedSlots[sortedSlots.length - 1].date;

    // Convert to Date objects for comparison (these will be in local time, but we only care about the date part)
    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);

    if (startDate >= endDate && sortedSlots.length > 1) {
      return res.status(400).json({ error: "End date must be after start date" });
    }

    // SIMPLE FIX: Compare date strings directly
    if (isDateInPast(startDateString)) {
      return res.status(400).json({ 
        error: "Start date cannot be in the past",
        current_date: getCurrentPhDateString(),
        selected_date: startDateString
      });
    }

    // Additional validation for today's reservations
    const currentDateString = getCurrentPhDateString();
    if (startDateString === currentDateString) {
      console.log('📅 Today reservation detected, validating time slots...');
      
      // Check if end time is in the future for today's slots
      const todaySlots = sortedSlots.filter(slot => slot.date === currentDateString);
      console.log(`📅 Found ${todaySlots.length} slot(s) for today`);

      for (const slot of todaySlots) {
        console.log('⏰ Time Validation for slot:', slot.end_time);
        console.log('⏰ Is end time in future?', isTimeInFuture(slot.end_time));
        
        if (!isTimeInFuture(slot.end_time)) {
          return res.status(400).json({ 
            error: "For today's reservations, end time must be in the future",
            current_time: new Date(new Date().getTime() + (8 * 60 * 60 * 1000)).toISOString(),
            selected_end_time: slot.end_time,
            message: `Your selected end time (${slot.end_time}) has already passed. Please choose a later time.`
          });
        }
      }
    }

    const conflicts = [];
    
    for (const slot of sortedSlots) {
      const slotDate = slot.date; // Use the date string directly
      
      const conflictQuery = `
        SELECT 
          r.id, 
          r.purpose,
          rds.slot_date,
          rds.start_time,
          rds.end_time,
          r.status,
          u.name as requester_name
        FROM reservations r
        INNER JOIN reservation_daily_slots rds ON r.id = rds.reservation_id
        LEFT JOIN users u ON r.requester_id = u.id
        WHERE r.f_id = ? 
          AND r.status IN ('approved', 'pending')
          AND rds.slot_date = ?
          AND (
            (rds.start_time < ? AND rds.end_time > ?) OR
            (rds.start_time < ? AND rds.end_time > ?) OR
            (rds.start_time >= ? AND rds.end_time <= ?)
          )
        ORDER BY rds.start_time ASC
      `;

      const dayConflicts = await new Promise((resolve, reject) => {
        connection.query(
          conflictQuery,
          [
            f_id,
            slotDate,
            slot.end_time, slot.start_time,
            slot.end_time, slot.end_time,
            slot.start_time, slot.end_time
          ],
          (err, results) => (err ? reject(err) : resolve(results || []))
        );
      });

      if (dayConflicts.length > 0) {
        conflicts.push(...dayConflicts.map(c => ({
          ...c,
          requested_date: slotDate,
          requested_start_time: slot.start_time,
          requested_end_time: slot.end_time
        })));
      }
    }

    if (conflicts.length > 0) {
      const conflictDetails = conflicts.map(conflict => ({
        reservation_id: conflict.id,
        purpose: conflict.purpose,
        conflict_date: conflict.slot_date,
        conflict_start_time: conflict.start_time,
        conflict_end_time: conflict.end_time,
        status: conflict.status,
        reserved_by: conflict.requester_name || 'Unknown User',
        your_requested_date: conflict.requested_date,
        your_requested_start: conflict.requested_start_time,
        your_requested_end: conflict.requested_end_time
      }));

      return res.status(409).json({
        error: "Time slot conflicts detected",
        message: `Cannot create reservation due to ${conflicts.length} conflicting time slot(s)`,
        conflicts: conflictDetails,
        suggestion: "Please adjust your time slots to avoid conflicts"
      });
    }

    await new Promise((resolve, reject) => {
      connection.query("START TRANSACTION", (err) => (err ? reject(err) : resolve()));
    });

    const reservationResult = await new Promise((resolve, reject) => {
      connection.query(
        "INSERT INTO reservations (f_id, requester_id, purpose, date_from, date_to) VALUES (?, ?, ?, ?, ?)",
        [f_id, requester_id, purpose, startDate, endDate],
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

    const reservationId = reservationResult.insertId;

    for (const slot of sortedSlots) {
      await new Promise((resolve, reject) => {
        connection.query(
          "INSERT INTO reservation_daily_slots (reservation_id, slot_date, start_time, end_time) VALUES (?, ?, ?, ?)",
          [reservationId, slot.date, slot.start_time, slot.end_time],
          (err, result) => (err ? reject(err) : resolve(result))
        );
      });
    }

    const workflow = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT user_id, step_order FROM facility_approval_workflows WHERE f_id = ? ORDER BY step_order",
        [f_id],
        (err, results) => (err ? reject(err) : resolve(results || []))
      );
    });

    if (workflow.length === 0) {
      await new Promise((resolve, reject) => {
        connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
      });
      return res.status(400).json({ error: "No approval workflow configured for this resource" });
    }

    const resource = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT f_name FROM university_resources WHERE f_id = ?",
        [f_id],
        (err, results) => (err ? reject(err) : resolve(results[0]))
      );
    });

    const requesterDetails = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT name FROM users WHERE id = ?",
        [requester_id],
        (err, results) => (err ? reject(err) : resolve(results[0]))
      );
    });

    // Insert approval steps
    for (const step of workflow) {
      await new Promise((resolve, reject) => {
        connection.query(
          "INSERT INTO reservation_approvals (reservation_id, step_order, approver_id) VALUES (?, ?, ?)",
          [reservationId, step.step_order, step.user_id],
          (err, result) => (err ? reject(err) : resolve(result))
        );
      });
    }

    // 🔔 REAL-TIME NOTIFICATION: Only notify the FIRST approver
    const firstApprover = workflow[0]; // Step 1 approver
    
    const notification = {
      type: 'NEW_RESERVATION',
      reservation_id: reservationId,
      facility_id: f_id,
      facility_name: resource.f_name,
      purpose: purpose,
      requester_name: requesterDetails.name,
      step_order: firstApprover.step_order,
      total_steps: workflow.length,
      timestamp: new Date().toISOString()
    };

    // Get the notification server from app locals
    const notificationServer = req.app.locals.notificationServer;
    if (notificationServer) {
      const sent = notificationServer.sendToUser(firstApprover.user_id, notification);
      console.log(`🔔 Real-time notification ${sent ? 'sent' : 'failed'} to first approver: ${firstApprover.user_id}`);
    }

    const metadata = JSON.stringify({
      f_id,
      f_name: resource.f_name,
      date_from: startDate,
      date_to: endDate,
      daily_slots: sortedSlots,
      workflow_steps: workflow.length
    });

    await logActivity(
      reservationId,
      requester_id,
      'created',
      `Created reservation request for ${resource.f_name} with ${sortedSlots.length} daily time slot(s)`,
      null,
      'pending',
      null,
      null,
      metadata
    );

    await new Promise((resolve, reject) => {
      connection.query("COMMIT", (err) => (err ? reject(err) : resolve()));
    });

    res.status(201).json({ 
      message: "Reservation submitted successfully", 
      reservation_id: reservationId,
      workflow_steps: workflow.length,
      daily_slots_count: sortedSlots.length
    });

  } catch (error) {
    console.error("Error:", error);
    await new Promise((resolve, reject) => {
      connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/check-availability", async (req, res) => {
  const { f_id, daily_slots } = req.body;

  if (!f_id || !daily_slots || !Array.isArray(daily_slots) || daily_slots.length === 0) {
    return res.status(400).json({ error: "Resource ID and daily_slots array are required" });
  }

  try {
    const conflicts = [];

    for (const slot of daily_slots) {
      if (!slot.date || !slot.start_time || !slot.end_time) {
        continue;
      }

      const slotDate = slot.date; // Use the date string directly

      const conflictQuery = `
        SELECT 
          r.id, 
          r.purpose,
          rds.slot_date,
          rds.start_time,
          rds.end_time,
          r.status,
          u.name as requester_name
        FROM reservations r
        INNER JOIN reservation_daily_slots rds ON r.id = rds.reservation_id
        LEFT JOIN users u ON r.requester_id = u.id
        WHERE r.f_id = ? 
          AND r.status IN ('approved', 'pending')
          AND rds.slot_date = ?
          AND (
            (rds.start_time < ? AND rds.end_time > ?) OR
            (rds.start_time < ? AND rds.end_time > ?) OR
            (rds.start_time >= ? AND rds.end_time <= ?)
          )
      `;

      const dayConflicts = await new Promise((resolve, reject) => {
        connection.query(
          conflictQuery,
          [
            f_id,
            slotDate,
            slot.end_time, slot.start_time,
            slot.end_time, slot.end_time,
            slot.start_time, slot.end_time
          ],
          (err, results) => (err ? reject(err) : resolve(results || []))
        );
      });

      if (dayConflicts.length > 0) {
        conflicts.push({
          date: slotDate,
          requested_start: slot.start_time,
          requested_end: slot.end_time,
          conflicts: dayConflicts.map(c => ({
            reservation_id: c.id,
            purpose: c.purpose,
            start_time: c.start_time,
            end_time: c.end_time,
            status: c.status,
            reserved_by: c.requester_name || 'Unknown User'
          }))
        });
      }
    }

    const isAvailable = conflicts.length === 0;
    
    res.json({
      available: isAvailable,
      conflicts: conflicts,
      message: isAvailable 
        ? "All time slots are available" 
        : `${conflicts.length} day(s) have conflicting time slots`
    });

  } catch (error) {
    console.error("Error checking availability:", error);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;