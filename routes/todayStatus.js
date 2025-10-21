const express = require("express");
const router = express.Router();
const connection = require("../controllers/database");

// ✅ Utility: Get current Philippine date/time
const getPhilippineDate = () => {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
};

// ✅ Utility: Format YYYY-MM-DD in Philippine timezone
const getPhilippineDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(date);
};

// GET /api/public/today-status - Optimized endpoint for dashboard
router.get("/", async (req, res) => {
  try {
    // ✅ Get today's start/end in Philippine time
    const today = getPhilippineDate();
    const todayDateString = getPhilippineDateString(today);

    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    console.log(`📊 Loading today's status for: ${todayDateString}`);

    // ✅ Get all active resources
    const resources = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT f_id, f_name, category FROM university_resources",
        (err, results) => {
          if (err) reject(err);
          else resolve(results || []);
        }
      );
    });

    // ✅ Query today's reservations with proper date handling - FIXED VERSION
    const todayReservationsQuery = `
      SELECT 
        r.id as reservation_id,
        r.f_id,
        ur.f_name as resource_name,
        ur.category as resource_category,
        r.purpose,
        r.date_from,
        r.date_to,
        r.status,
        u.name as requester_name,
        r.created_at as requested_date,
        DATE(rds.slot_date) as slot_date,
        rds.start_time,
        rds.end_time,
        TIME_FORMAT(rds.start_time, '%h:%i %p') as formatted_start_time,
        TIME_FORMAT(rds.end_time, '%h:%i %p') as formatted_end_time,
        CONCAT(
          TIME_FORMAT(rds.start_time, '%h:%i %p'), 
          ' - ', 
          TIME_FORMAT(rds.end_time, '%h:%i %p')
        ) as time_slot_display,
        (
          SELECT COUNT(*) 
          FROM reservation_approvals ra 
          WHERE ra.reservation_id = r.id AND ra.status = 'approved'
        ) as approved_steps,
        (
          SELECT COUNT(*) 
          FROM facility_approval_workflows fw 
          WHERE fw.f_id = r.f_id
        ) as total_steps_required,
        (
          SELECT MAX(ra.acted_at) 
          FROM reservation_approvals ra 
          WHERE ra.reservation_id = r.id AND ra.status = 'approved'
        ) as final_approval_time
      FROM reservations r
      INNER JOIN university_resources ur ON r.f_id = ur.f_id
      INNER JOIN users u ON r.requester_id = u.id
      INNER JOIN reservation_daily_slots rds ON r.id = rds.reservation_id
      WHERE r.status IN ('approved', 'pending')
        AND r.purpose IS NOT NULL 
        AND r.purpose != ''
        AND r.date_from IS NOT NULL
        AND r.date_to IS NOT NULL
        AND DATE(rds.slot_date) = ?
      ORDER BY r.status = 'approved' DESC, rds.start_time ASC
    `;

    const todayReservations = await new Promise((resolve, reject) => {
      connection.query(
        todayReservationsQuery,
        [todayDateString],
        (err, results) => {
          if (err) reject(err);
          else {
            console.log(`📊 Raw query results count: ${results?.length || 0}`);
            if (results && results.length > 0) {
              console.log('📋 Sample reservation:', {
                id: results[0].reservation_id,
                resource: results[0].resource_name,
                slot_date: results[0].slot_date,
                time_display: results[0].time_slot_display
              });
            }
            resolve(results || []);
          }
        }
      );
    });

    console.log(`📊 Found ${todayReservations.length} reservation slots for today`);

    // ✅ Initialize containers
    const availabilityStatus = {
      fully_available: [],
      partially_available: [],
      not_available: []
    };

    const dailyNews = [];
    const resourceReservations = {};
    const processedReservations = new Set(); // Track processed reservations for daily news

    // ✅ Process reservations
    for (const reservation of todayReservations) {
      const resourceId = reservation.f_id;

      if (!resourceReservations[resourceId]) {
        resourceReservations[resourceId] = [];
      }
      
      // ✅ FIXED: Convert slot_date to string for comparison
      const slotDateString = reservation.slot_date 
        ? getPhilippineDateString(new Date(reservation.slot_date))
        : null;
      
      // Store with normalized date string
      const normalizedReservation = {
        ...reservation,
        slot_date_string: slotDateString
      };
      
      resourceReservations[resourceId].push(normalizedReservation);

      // Log each reservation for debugging
      console.log(`🔍 Processing: Res#${reservation.reservation_id}, Slot Date: ${slotDateString}, Time: ${reservation.time_slot_display}`);

      // ✅ Check if this reservation is fully approved and active today
      const isFullyApproved = reservation.approved_steps === reservation.total_steps_required;
      const finalApprovalDate = reservation.final_approval_time
        ? getPhilippineDateString(new Date(reservation.final_approval_time))
        : null;
      const isApprovedToday = finalApprovalDate === todayDateString;

      // ✅ Add to daily news if fully approved AND active today
      if (isFullyApproved && reservation.status === 'approved') {
        // Only add once per reservation (not per slot)
        if (!processedReservations.has(reservation.reservation_id)) {
          processedReservations.add(reservation.reservation_id);
          
          // ✅ Collect all time slots for this reservation that are TODAY
          const todaySlots = todayReservations
            .filter(r => {
              const rSlotDateString = r.slot_date 
                ? getPhilippineDateString(new Date(r.slot_date))
                : null;
              return r.reservation_id === reservation.reservation_id && 
                     rSlotDateString === todayDateString &&
                     r.time_slot_display; // Must have a valid time slot display
            })
            .map(r => r.time_slot_display);

          // Remove duplicates and join
          const uniqueSlots = [...new Set(todaySlots)];
          
          // ✅ FIXED: Calculate multi-day event information - Query ALL slots for this reservation
          const allSlotsQuery = `
            SELECT DISTINCT DATE(slot_date) as slot_date 
            FROM reservation_daily_slots 
            WHERE reservation_id = ? 
            ORDER BY slot_date ASC
          `;

          const allSlotsForReservation = await new Promise((resolve, reject) => {
            connection.query(
              allSlotsQuery,
              [reservation.reservation_id],
              (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
              }
            );
          });

          const uniqueDates = allSlotsForReservation
            .map(slot => slot.slot_date ? getPhilippineDateString(new Date(slot.slot_date)) : null)
            .filter(Boolean)
            .sort();

          const totalDays = uniqueDates.length;
          const currentDayNumber = uniqueDates.indexOf(todayDateString) + 1;

          console.log(`📋 Reservation ${reservation.reservation_id}:`);
          console.log(`   - All dates: ${uniqueDates.join(', ')}`);
          console.log(`   - Today's slots: ${uniqueSlots.join(', ')}`);
          console.log(`   - Multi-day: Day ${currentDayNumber} of ${totalDays}`);

          dailyNews.push({
            reservation_id: reservation.reservation_id,
            resource_name: reservation.resource_name,
            resource_category: reservation.resource_category,
            purpose: reservation.purpose,
            time_slots: uniqueSlots.length > 0 ? uniqueSlots.join(' • ') : "All Day",
            requester: reservation.requester_name,
            approved_today: isApprovedToday,
            approval_steps: `${reservation.approved_steps}/${reservation.total_steps_required}`,
            day_number: currentDayNumber,
            total_days: totalDays
          });
        }
      }
    }

    // ✅ Categorize resource availability with granular time checking
    resources.forEach(resource => {
      const resourceId = resource.f_id;
      const reservations = resourceReservations[resourceId] || [];

      if (reservations.length === 0) {
        availabilityStatus.fully_available.push({
          resource_id: resourceId,
          resource_name: resource.f_name,
          category: resource.category,
          available_slots: "All day"
        });
      } else {
        // ✅ FIXED: Use normalized date string for filtering
        const fullyApprovedReservations = reservations.filter(r =>
          r.approved_steps === r.total_steps_required && 
          r.slot_date_string === todayDateString
        );
        const pendingOrPartialReservations = reservations.filter(r =>
          r.approved_steps < r.total_steps_required && 
          r.slot_date_string === todayDateString
        );

        // Check if resource is booked for the entire day
        const isFullDayBooked = fullyApprovedReservations.some(r => {
          if (!r.start_time || !r.end_time) return false;
          
          // Parse time strings (format: "HH:MM:SS")
          const [startHour, startMin] = r.start_time.split(':').map(Number);
          const [endHour, endMin] = r.end_time.split(':').map(Number);
          
          // Convert to minutes since midnight
          const startMinutes = startHour * 60 + startMin;
          const endMinutes = endHour * 60 + endMin;
          
          // Calculate duration
          const duration = endMinutes - startMinutes;
          
          // Consider "full day" if:
          // 1. Duration is 20+ hours (1200+ minutes), OR
          // 2. Starts at/before 8 AM and ends at/after 8 PM (12+ hour span covering business hours)
          const isLongDuration = duration >= 1200;
          const coversBusinessHours = (startHour <= 8 && endHour >= 20);
          
          return isLongDuration || coversBusinessHours;
        });

        if (fullyApprovedReservations.length > 0) {
          if (isFullDayBooked) {
            // Truly unavailable - booked all day
            availabilityStatus.not_available.push({
              resource_id: resourceId,
              resource_name: resource.f_name,
              category: resource.category,
              reservation_count: fullyApprovedReservations.length,
              time_slots: fullyApprovedReservations.map(r => r.time_slot_display).filter(Boolean),
              status: "Fully booked (all day)"
            });
          } else {
            // Partially available - has bookings but not all day
            availabilityStatus.partially_available.push({
              resource_id: resourceId,
              resource_name: resource.f_name,
              category: resource.category,
              reservation_count: fullyApprovedReservations.length,
              time_slots: fullyApprovedReservations.map(r => r.time_slot_display).filter(Boolean),
              status: "Partially booked (approved)"
            });
          }
        } else if (pendingOrPartialReservations.length > 0) {
          availabilityStatus.partially_available.push({
            resource_id: resourceId,
            resource_name: resource.f_name,
            category: resource.category,
            pending_count: pendingOrPartialReservations.length,
            time_slots: pendingOrPartialReservations.map(r => r.time_slot_display).filter(Boolean),
            status: "Pending approval"
          });
        }
      }
    });

    // ✅ Build response
    const response = {
      today: todayDateString,
      availability_status: availabilityStatus,
      daily_news: dailyNews,
      summary: {
        total_resources: resources.length,
        fully_available: availabilityStatus.fully_available.length,
        partially_available: availabilityStatus.partially_available.length,
        not_available: availabilityStatus.not_available.length,
        active_reservations_today: dailyNews.length,
        newly_approved_today: dailyNews.filter(n => n.approved_today).length,
        total_reservations_today: todayReservations.length
      },
      debug_info: {
        resources_found: resources.length,
        reservations_processed: todayReservations.length,
        timezone_used: "Asia/Manila (UTC+8)",
        hierarchical_system: "Reservation approved only when all workflow steps are approved"
      }
    };

    // ✅ Logs for clarity
    console.log(`✅ Today's status loaded (Hierarchical Approval):`);
    console.log(`   - Resources: ${response.summary.total_resources}`);
    console.log(`   - Fully available: ${response.summary.fully_available}`);
    console.log(`   - Partially available: ${response.summary.partially_available}`);
    console.log(`   - Not available: ${response.summary.not_available}`);
    console.log(`   - Active reservations today: ${response.summary.active_reservations_today}`);
    console.log(`   - Newly approved today: ${response.summary.newly_approved_today}`);

    res.json(response);
  } catch (error) {
    console.error("❌ Error loading today's status:", error);
    res.status(500).json({
      error: "Failed to load today's status",
      details: error.message
    });
  }
});

module.exports = router;