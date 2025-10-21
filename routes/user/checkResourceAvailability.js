const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");

// Helper function to format date for debugging
function formatDateForLog(date) {
  if (!date) return 'null';
  return new Date(date).toISOString().split('T')[0] + ' ' + new Date(date).toTimeString().split(' ')[0];
}

// GET /api/resources/availability/calendar/:f_id?month=2024-01 (optimized for calendar view)
router.get("/calendar/:f_id", async (req, res) => {
  const { f_id } = req.params;
  const { month } = req.query; // Format: YYYY-MM (required for calendar)

  if (!month) {
    return res.status(400).json({ error: "Month parameter is required (format: YYYY-MM)" });
  }

  try {
    console.log(`📅 Loading calendar data for resource ${f_id}, month ${month}`);
    
    // Create date range for the month in Philippines timezone
    const startOfMonth = new Date(`${month}-01T00:00:00+08:00`);
    const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59);
    
    console.log(`📅 Month range: ${formatDateForLog(startOfMonth)} to ${formatDateForLog(endOfMonth)}`);

    // Calendar-optimized query - get all reservations that overlap with the month
    const calendarQuery = `
      SELECT 
        r.id,
        COALESCE(NULLIF(TRIM(r.purpose), ''), 'No purpose specified') as purpose,
        r.date_from,
        r.date_to,
        COALESCE(r.status, 'pending') as status,
        COALESCE(NULLIF(TRIM(u.name), ''), 'Unknown User') as requester_name
      FROM reservations r
      LEFT JOIN users u ON r.requester_id = u.id
      WHERE r.f_id = ? 
        AND r.status IN ('approved', 'pending', 'cancelled', 'rejected')
        AND r.purpose IS NOT NULL 
        AND r.purpose != ''
        AND r.date_from IS NOT NULL
        AND r.date_to IS NOT NULL
        AND (
          -- Reservation starts or ends within the month
          (DATE(r.date_from) >= DATE(?) AND DATE(r.date_from) <= DATE(?)) OR
          (DATE(r.date_to) >= DATE(?) AND DATE(r.date_to) <= DATE(?)) OR
          -- Reservation spans the entire month
          (DATE(r.date_from) <= DATE(?) AND DATE(r.date_to) >= DATE(?))
        )
      ORDER BY r.date_from ASC
    `;

    const reservations = await new Promise((resolve, reject) => {
      connection.query(
        calendarQuery, 
        [
          f_id,
          startOfMonth.toISOString(), // Reservation starts in month
          endOfMonth.toISOString(),
          startOfMonth.toISOString(), // Reservation ends in month  
          endOfMonth.toISOString(),
          startOfMonth.toISOString(), // Reservation spans month
          endOfMonth.toISOString()
        ], 
        (err, results) => {
          if (err) {
            console.error('Calendar query error:', err);
            reject(err);
          } else {
            resolve(results || []);
          }
        }
      );
    });

    // Get resource details
    const resource = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT f_id, f_name, category FROM university_resources WHERE f_id = ?",
        [f_id],
        (err, results) => {
          if (err) reject(err);
          else resolve(results && results.length > 0 ? results[0] : null);
        }
      );
    });

    if (!resource) {
      return res.status(404).json({ error: "Resource not found" });
    }

    console.log(`📊 Found ${reservations.length} reservations for calendar`);

    // Process reservations for calendar display with CORRECT date logic
    const calendarData = {};
    
    reservations.forEach((reservation, index) => {
      console.log(`\n🔄 Processing calendar reservation ${reservation.id} (${index + 1}/${reservations.length}):`);
      console.log(`   - Purpose: ${reservation.purpose}`);
      console.log(`   - Raw date_from: ${reservation.date_from}`);
      console.log(`   - Raw date_to: ${reservation.date_to}`);
      
      const rawDateFrom = new Date(reservation.date_from);
      const rawDateTo = new Date(reservation.date_to);
      
      console.log(`   - Parsed date_from: ${rawDateFrom.toString()}`);
      console.log(`   - Parsed date_to: ${rawDateTo.toString()}`);
      
      // CORRECT FIX: Use UTC methods to create date-only objects
      // This ensures we get the correct date regardless of server timezone
      const startDate = new Date(Date.UTC(
        rawDateFrom.getFullYear(),
        rawDateFrom.getMonth(),
        rawDateFrom.getDate()
      ));
      
      const endDate = new Date(Date.UTC(
        rawDateTo.getFullYear(),
        rawDateTo.getMonth(),
        rawDateTo.getDate()
      ));
      
      console.log(`   - Start date (UTC): ${startDate.toISOString().split('T')[0]}`);
      console.log(`   - End date (UTC): ${endDate.toISOString().split('T')[0]}`);
      
      // Generate calendar entries for each date the reservation spans
      const currentDate = new Date(startDate);
      const generatedDates = [];
      
      while (currentDate <= endDate) {
        const dateKey = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        generatedDates.push(dateKey);
        
        if (!calendarData[dateKey]) {
          calendarData[dateKey] = [];
        }
        
        // Check if this reservation already exists for this date (avoid duplicates)
        const existingReservation = calendarData[dateKey].find(r => r.reservation_id === reservation.id);
        if (!existingReservation) {
          calendarData[dateKey].push({
            reservation_id: reservation.id,
            purpose: reservation.purpose.trim(),
            date_from: rawDateFrom.toISOString(), // Send original time to client
            date_to: rawDateTo.toISOString(),     // Send original time to client
            status: reservation.status.trim(),
            reserved_by: reservation.requester_name.trim(),
            spans_multiple_days: startDate.getTime() !== endDate.getTime()
          });
        }
        
        // Move to next date
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
      
      console.log(`   - Generated calendar dates: ${generatedDates.join(', ')}`);
    });

    console.log(`\n✅ Calendar data summary:`);
    console.log(`   - Total reservations processed: ${reservations.length}`);
    console.log(`   - Dates with reservations: ${Object.keys(calendarData).length}`);
    
    // Debug: Show which dates have reservations
    Object.keys(calendarData).sort().forEach(dateKey => {
      console.log(`   - ${dateKey}: ${calendarData[dateKey].length} reservation(s)`);
      calendarData[dateKey].forEach(res => {
        console.log(`     * ${res.status}: ${res.purpose} (ID: ${res.reservation_id})`);
      });
    });

    res.json({
      resource: {
        id: resource.f_id,
        name: resource.f_name,
        category: resource.category
      },
      month: month,
      timezone: "UTC (convert to PST on client)",
      calendar_data: calendarData,
      total_reservations: reservations.length,
      debug_info: {
        month_range: {
          start: startOfMonth.toISOString(),
          end: endOfMonth.toISOString()
        },
        reservations_found: reservations.length,
        dates_with_data: Object.keys(calendarData).length
      }
    });

  } catch (error) {
    console.error("Error fetching calendar data:", error);
    res.status(500).json({ error: "Database error" });
  }
});

// Enhanced availability check endpoint with FIXED overlap logic
router.get("/:f_id", async (req, res) => {
  const { f_id } = req.params;
  const { date_from, date_to } = req.query;

  if (!f_id || !date_from || !date_to) {
    return res.status(400).json({ error: "Resource ID, date_from, and date_to are required" });
  }

  try {
    console.log(`\n🔍 Checking availability for resource ${f_id}`);
    console.log(`   - Requested from: ${date_from}`);
    console.log(`   - Requested to: ${date_to}`);
    
    // Parse dates
    const requestStart = new Date(date_from);
    const requestEnd = new Date(date_to);

    console.log(`   - Parsed start: ${formatDateForLog(requestStart)}`);
    console.log(`   - Parsed end: ${formatDateForLog(requestEnd)}`);

    // Validate date range
    if (requestStart >= requestEnd) {
      return res.status(400).json({ error: "End date must be after start date" });
    }

    // FIXED: Correct overlap detection logic
    // Two date ranges overlap if: start1 < end2 AND start2 < end1
    const conflictQuery = `
      SELECT 
        r.id, 
        COALESCE(NULLIF(TRIM(r.purpose), ''), 'No purpose specified') as purpose,
        r.date_from, 
        r.date_to,
        COALESCE(r.status, 'pending') as status,
        COALESCE(NULLIF(TRIM(u.name), ''), 'Unknown User') as requester_name
      FROM reservations r
      LEFT JOIN users u ON r.requester_id = u.id
      WHERE r.f_id = ? 
        AND r.status IN ('approved', 'pending')
        AND r.purpose IS NOT NULL 
        AND r.purpose != ''
        AND r.date_from IS NOT NULL
        AND r.date_to IS NOT NULL
        AND (
          -- Correct overlap logic: reservation overlaps with requested period
          r.date_from < ? AND r.date_to > ?
        )
      ORDER BY r.date_from ASC
    `;

    console.log(`   - Conflict query parameters: [${f_id}, ${requestEnd.toISOString()}, ${requestStart.toISOString()}]`);

    const conflicts = await new Promise((resolve, reject) => {
      connection.query(
        conflictQuery,
        [
          f_id,
          requestEnd.toISOString(),    // r.date_from < requestEnd
          requestStart.toISOString()   // r.date_to > requestStart
        ],
        (err, results) => {
          if (err) {
            console.error('Conflict query error:', err);
            reject(err);
          } else {
            resolve(results || []);
          }
        }
      );
    });

    console.log(`   - Found ${conflicts.length} conflicts:`);
    conflicts.forEach((conflict, index) => {
      console.log(`     ${index + 1}. ID: ${conflict.id}, ${conflict.status}: ${conflict.purpose}`);
      console.log(`        From: ${formatDateForLog(conflict.date_from)}`);
      console.log(`        To: ${formatDateForLog(conflict.date_to)}`);
      
      // Verify overlap logic manually
      const conflictStart = new Date(conflict.date_from);
      const conflictEnd = new Date(conflict.date_to);
      const overlaps = conflictStart < requestEnd && conflictEnd > requestStart;
      console.log(`        Overlaps with request: ${overlaps}`);
    });

    // Also get cancelled/rejected reservations for information
    const infoQuery = `
      SELECT 
        r.id, 
        COALESCE(NULLIF(TRIM(r.purpose), ''), 'No purpose specified') as purpose,
        r.date_from, 
        r.date_to,
        COALESCE(r.status, 'pending') as status,
        COALESCE(NULLIF(TRIM(u.name), ''), 'Unknown User') as requester_name
      FROM reservations r
      LEFT JOIN users u ON r.requester_id = u.id
      WHERE r.f_id = ? 
        AND r.status IN ('cancelled', 'rejected')
        AND r.purpose IS NOT NULL 
        AND r.purpose != ''
        AND r.date_from IS NOT NULL
        AND r.date_to IS NOT NULL
        AND (
          r.date_from < ? AND r.date_to > ?
        )
      ORDER BY r.date_from ASC
    `;

    const inactiveReservations = await new Promise((resolve, reject) => {
      connection.query(
        infoQuery,
        [
          f_id,
          requestEnd.toISOString(),
          requestStart.toISOString()
        ],
        (err, results) => (err ? reject(err) : resolve(results || []))
      );
    });

    // Get resource details
    const resource = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT f_id, f_name, category FROM university_resources WHERE f_id = ?",
        [f_id],
        (err, results) => {
          if (err) reject(err);
          else resolve(results && results.length > 0 ? results[0] : null);
        }
      );
    });

    if (!resource) {
      return res.status(404).json({ error: "Resource not found" });
    }

    const isAvailable = conflicts.length === 0;
    
    console.log(`✅ Availability result: ${isAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
    console.log(`   - Active conflicts: ${conflicts.length}`);
    console.log(`   - Inactive reservations: ${inactiveReservations.length}`);
    
    // Process conflict details
    const conflictDetails = conflicts.map(conflict => ({
      reservation_id: conflict.id,
      purpose: conflict.purpose.trim(),
      reserved_from: new Date(conflict.date_from).toISOString(),
      reserved_to: new Date(conflict.date_to).toISOString(),
      status: conflict.status.trim(),
      reserved_by: conflict.requester_name.trim()
    }));

    // Process inactive reservations for information
    const inactiveDetails = inactiveReservations.map(reservation => ({
      reservation_id: reservation.id,
      purpose: reservation.purpose.trim(),
      reserved_from: new Date(reservation.date_from).toISOString(),
      reserved_to: new Date(reservation.date_to).toISOString(),
      status: reservation.status.trim(),
      reserved_by: reservation.requester_name.trim()
    }));

    res.json({
      resource: {
        id: resource.f_id,
        name: resource.f_name,
        category: resource.category
      },
      requested_period: {
        date_from: requestStart.toISOString(),
        date_to: requestEnd.toISOString()
      },
      timezone: "UTC (convert to PST on client)",
      is_available: isAvailable,
      conflicts: conflictDetails,
      inactive_reservations: inactiveDetails,
      message: isAvailable 
        ? "Resource is available for the requested time period"
        : `Resource is not available due to ${conflictDetails.length} conflicting reservation(s)`,
      additional_info: inactiveDetails.length > 0 
        ? `Note: ${inactiveDetails.length} cancelled/rejected reservations also exist in this period`
        : null,
      debug_info: {
        overlap_logic: "reservation.start < request.end AND reservation.end > request.start",
        conflicts_found: conflicts.length,
        inactive_found: inactiveReservations.length
      }
    });

  } catch (error) {
    console.error("Error checking availability:", error);
    res.status(500).json({ error: "Database error" });
  }
});

// GET /api/resources/availability/schedule/:f_id (general schedule endpoint) - UPDATED WITH DAILY SLOTS (COMPATIBLE)
router.get("/schedule/:f_id", async (req, res) => {
  const { f_id } = req.params;
  const { month } = req.query;

  try {
    let dateFilter = "";
    let queryParams = [f_id];

    if (month) {
      const startOfMonth = new Date(`${month}-01T00:00:00+08:00`);
      const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59);
      
      dateFilter = `AND (
        (DATE(r.date_from) >= DATE(?) AND DATE(r.date_from) <= DATE(?)) OR
        (DATE(r.date_to) >= DATE(?) AND DATE(r.date_to) <= DATE(?)) OR
        (DATE(r.date_from) <= DATE(?) AND DATE(r.date_to) >= DATE(?))
      )`;
      queryParams.push(
        startOfMonth.toISOString(),
        endOfMonth.toISOString(),
        startOfMonth.toISOString(),
        endOfMonth.toISOString(),
        startOfMonth.toISOString(),
        endOfMonth.toISOString()
      );
    }

    // UPDATED: Compatible query without JSON_ARRAYAGG
    const scheduleQuery = `
      SELECT 
        r.id,
        COALESCE(NULLIF(TRIM(r.purpose), ''), 'No purpose specified') as purpose,
        r.date_from,
        r.date_to,
        COALESCE(r.status, 'pending') as status,
        COALESCE(NULLIF(TRIM(u.name), ''), 'Unknown User') as requester_name,
        r.f_id,
        ur.f_name as resource_name,
        ur.category as resource_category
      FROM reservations r
      LEFT JOIN users u ON r.requester_id = u.id
      LEFT JOIN university_resources ur ON r.f_id = ur.f_id
      WHERE r.f_id = ? 
        AND r.status IN ('approved', 'pending', 'cancelled', 'rejected')
        AND r.purpose IS NOT NULL 
        AND r.purpose != ''
        AND r.date_from IS NOT NULL
        AND r.date_to IS NOT NULL
        ${dateFilter}
      ORDER BY r.date_from ASC
    `;

    const schedule = await new Promise((resolve, reject) => {
      connection.query(scheduleQuery, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    });

    // NEW: Get daily slots for each reservation
    const scheduleWithSlots = await Promise.all(
      schedule.map(async (item) => {
        try {
          // Query daily slots for this reservation
          const slotsQuery = `
            SELECT 
              slot_date,
              TIME_FORMAT(start_time, '%H:%i:%s') as start_time,
              TIME_FORMAT(end_time, '%H:%i:%s') as end_time
            FROM reservation_daily_slots 
            WHERE reservation_id = ?
            ORDER BY slot_date, start_time
          `;
          
          const dailySlots = await new Promise((resolve, reject) => {
            connection.query(slotsQuery, [item.id], (err, results) => {
              if (err) reject(err);
              else resolve(results || []);
            });
          });

          return {
            ...item,
            daily_slots: dailySlots
          };
        } catch (error) {
          console.error(`Error fetching slots for reservation ${item.id}:`, error);
          return {
            ...item,
            daily_slots: []
          };
        }
      })
    );

    const resource = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT f_id, f_name, category FROM university_resources WHERE f_id = ?",
        [f_id],
        (err, results) => {
          if (err) reject(err);
          else resolve(results && results.length > 0 ? results[0] : null);
        }
      );
    });

    if (!resource) {
      return res.status(404).json({ error: "Resource not found" });
    }

    // Process reservations with daily slots
    const validReservations = scheduleWithSlots.map(item => {
      const reservationData = {
        reservation_id: item.id,
        purpose: item.purpose.trim(),
        date_from: new Date(item.date_from).toISOString(),
        date_to: new Date(item.date_to).toISOString(),
        status: item.status.trim(),
        reserved_by: item.requester_name.trim(),
        f_id: item.f_id,
        resource_name: item.resource_name,
        resource_category: item.resource_category,
        daily_slots: item.daily_slots || [] // Add daily slots
      };

      return reservationData;
    });

    console.log(`📊 Schedule response with ${validReservations.length} reservations`);
    validReservations.forEach(res => {
      console.log(`   - Reservation ${res.reservation_id}: ${res.daily_slots.length} daily slot(s)`);
      if (res.daily_slots.length > 0) {
        console.log(`     Slots: ${JSON.stringify(res.daily_slots)}`);
      }
    });
    

    res.json({
      resource: {
        id: resource.f_id,
        name: resource.f_name,
        category: resource.category
      },
      period: month || "All reservations",
      timezone: "UTC (convert to PST on client)",
      reservations: validReservations
    });

  } catch (error) {
    console.error("Error fetching schedule:", error);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;