const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");

router.get("/calendar/:f_id", async (req, res) => {
  const { f_id } = req.params;
  const { month } = req.query;

  if (!month) {
    return res.status(400).json({ error: "Month parameter is required (format: YYYY-MM)" });
  }

  try {
    const startOfMonth = new Date(`${month}-01T00:00:00+08:00`);
    const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59);

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
          (DATE(r.date_from) >= DATE(?) AND DATE(r.date_from) <= DATE(?)) OR
          (DATE(r.date_to) >= DATE(?) AND DATE(r.date_to) <= DATE(?)) OR
          (DATE(r.date_from) <= DATE(?) AND DATE(r.date_to) >= DATE(?))
        )
      ORDER BY r.date_from ASC
    `;

    const reservations = await new Promise((resolve, reject) => {
      connection.query(
        calendarQuery, 
        [
          f_id,
          startOfMonth.toISOString(),
          endOfMonth.toISOString(),
          startOfMonth.toISOString(),
          endOfMonth.toISOString(),
          startOfMonth.toISOString(),
          endOfMonth.toISOString()
        ], 
        (err, results) => {
          if (err) reject(err);
          else resolve(results || []);
        }
      );
    });

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

    const calendarData = {};
    
    reservations.forEach((reservation) => {
      const rawDateFrom = new Date(reservation.date_from);
      const rawDateTo = new Date(reservation.date_to);
      
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
      
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dateKey = currentDate.toISOString().split('T')[0];
        
        if (!calendarData[dateKey]) {
          calendarData[dateKey] = [];
        }
        
        const existingReservation = calendarData[dateKey].find(r => r.reservation_id === reservation.id);
        if (!existingReservation) {
          calendarData[dateKey].push({
            reservation_id: reservation.id,
            purpose: reservation.purpose.trim(),
            date_from: rawDateFrom.toISOString(),
            date_to: rawDateTo.toISOString(),
            status: reservation.status.trim(),
            reserved_by: reservation.requester_name.trim(),
            spans_multiple_days: startDate.getTime() !== endDate.getTime()
          });
        }
        
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
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
      total_reservations: reservations.length
    });

  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/:f_id", async (req, res) => {
  const { f_id } = req.params;
  const { date_from, date_to } = req.query;

  if (!f_id || !date_from || !date_to) {
    return res.status(400).json({ error: "Resource ID, date_from, and date_to are required" });
  }

  try {
    const requestStart = new Date(date_from);
    const requestEnd = new Date(date_to);

    if (requestStart >= requestEnd) {
      return res.status(400).json({ error: "End date must be after start date" });
    }

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
          r.date_from < ? AND r.date_to > ?
        )
      ORDER BY r.date_from ASC
    `;

    const conflicts = await new Promise((resolve, reject) => {
      connection.query(
        conflictQuery,
        [
          f_id,
          requestEnd.toISOString(),
          requestStart.toISOString()
        ],
        (err, results) => {
          if (err) reject(err);
          else resolve(results || []);
        }
      );
    });

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
    
    const conflictDetails = conflicts.map(conflict => ({
      reservation_id: conflict.id,
      purpose: conflict.purpose.trim(),
      reserved_from: new Date(conflict.date_from).toISOString(),
      reserved_to: new Date(conflict.date_to).toISOString(),
      status: conflict.status.trim(),
      reserved_by: conflict.requester_name.trim()
    }));

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
        : `Resource is not available due to ${conflictDetails.length} conflicting reservation(s)`
    });

  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

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

    const scheduleWithSlots = await Promise.all(
      schedule.map(async (item) => {
        try {
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

    const validReservations = scheduleWithSlots.map(item => ({
      reservation_id: item.id,
      purpose: item.purpose.trim(),
      date_from: new Date(item.date_from).toISOString(),
      date_to: new Date(item.date_to).toISOString(),
      status: item.status.trim(),
      reserved_by: item.requester_name.trim(),
      f_id: item.f_id,
      resource_name: item.resource_name,
      resource_category: item.resource_category,
      daily_slots: item.daily_slots || []
    }));

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
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;