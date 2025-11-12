const express = require("express");
const router = express.Router();
const connection = require("../controllers/database");

// Helper to get Philippine time date object
const getPhilippineDate = () => {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
};

// Helper to get YYYY-MM-DD string in Philippine timezone
const getPhilippineDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(date);
};

// CRITICAL: Compare dates properly in Philippine timezone
const isSameDatePhilippine = (dateString1, dateString2) => {
  // Both should already be in YYYY-MM-DD format
  return dateString1 === dateString2;
};

router.get("/", async (req, res) => {
  try {
    const today = getPhilippineDate();
    const todayDateString = getPhilippineDateString(today);

    console.log("🇵🇭 Current Philippine Time:", today.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    console.log("📅 Today's Date (Philippine):", todayDateString);

    // Get all resources
    const resources = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT f_id, f_name, category FROM university_resources",
        (err, results) => {
          if (err) reject(err);
          else resolve(results || []);
        }
      );
    });

    // Get reservations with slots for today ONLY (using Philippine timezone conversion)
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
        rds.slot_date,
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
        AND DATE(CONVERT_TZ(rds.slot_date, '+00:00', '+08:00')) = ?
      ORDER BY r.status = 'approved' DESC, rds.start_time ASC
    `;

    const todayReservations = await new Promise((resolve, reject) => {
      connection.query(
        todayReservationsQuery,
        [todayDateString],
        (err, results) => {
          if (err) reject(err);
          else resolve(results || []);
        }
      );
    });

    console.log(`📊 Found ${todayReservations.length} reservations for today (${todayDateString})`);

    const availabilityStatus = {
      fully_available: [],
      partially_available: [],
      not_available: []
    };

    const dailyNews = [];
    const resourceReservations = {};
    const processedReservations = new Set();

    // Process reservations
    for (const reservation of todayReservations) {
      const resourceId = reservation.f_id;

      if (!resourceReservations[resourceId]) {
        resourceReservations[resourceId] = [];
      }
      
      // Convert slot_date to Philippine timezone string
      const slotDateString = reservation.slot_date 
        ? getPhilippineDateString(new Date(reservation.slot_date))
        : null;
      
      console.log(`  🔍 Reservation ${reservation.reservation_id}: slot_date=${reservation.slot_date}, converted=${slotDateString}, today=${todayDateString}, match=${slotDateString === todayDateString}`);
      
      // CRITICAL: Only process if slot date matches today
      if (slotDateString !== todayDateString) {
        console.log(`  ⏭️ Skipping reservation ${reservation.reservation_id} - not for today`);
        continue;
      }
      
      const normalizedReservation = {
        ...reservation,
        slot_date_string: slotDateString
      };
      
      resourceReservations[resourceId].push(normalizedReservation);

      const isFullyApproved = reservation.approved_steps === reservation.total_steps_required;
      const finalApprovalDate = reservation.final_approval_time
        ? getPhilippineDateString(new Date(reservation.final_approval_time))
        : null;
      const isApprovedToday = isSameDatePhilippine(finalApprovalDate, todayDateString);

      // Only add to daily news if fully approved
      if (isFullyApproved && reservation.status === 'approved') {
        if (!processedReservations.has(reservation.reservation_id)) {
          processedReservations.add(reservation.reservation_id);
          
          // Get all time slots for this reservation TODAY ONLY
          const todaySlots = todayReservations
            .filter(r => {
              const rSlotDateString = r.slot_date 
                ? getPhilippineDateString(new Date(r.slot_date))
                : null;
              return r.reservation_id === reservation.reservation_id && 
                     rSlotDateString === todayDateString &&
                     r.time_slot_display;
            })
            .map(r => r.time_slot_display);

          const uniqueSlots = [...new Set(todaySlots)];
          
          // Get total days for this reservation
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

          console.log(`  ✅ Adding to daily news: ${reservation.resource_name} - Day ${currentDayNumber}/${totalDays}`);

          dailyNews.push({
            reservation_id: reservation.reservation_id,
            resource_name: reservation.resource_name,
            resource_category: reservation.resource_category,
            purpose: reservation.purpose,
            time_slots: uniqueSlots.length > 0 ? uniqueSlots.join(' • ') : "All Day",
            requester: reservation.requester_name,
            approved_today: isApprovedToday,
            approval_steps: `${reservation.approved_steps}/${reservation.total_steps_required}`,
            day_number: currentDayNumber > 0 ? currentDayNumber : 1,
            total_days: totalDays
          });
        }
      }
    }

    // Process availability status
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
        const fullyApprovedReservations = reservations.filter(r =>
          r.approved_steps === r.total_steps_required && 
          r.slot_date_string === todayDateString
        );
        const pendingOrPartialReservations = reservations.filter(r =>
          r.approved_steps < r.total_steps_required && 
          r.slot_date_string === todayDateString
        );

        const isFullDayBooked = fullyApprovedReservations.some(r => {
          if (!r.start_time || !r.end_time) return false;
          
          const [startHour, startMin] = r.start_time.split(':').map(Number);
          const [endHour, endMin] = r.end_time.split(':').map(Number);
          
          const startMinutes = startHour * 60 + startMin;
          const endMinutes = endHour * 60 + endMin;
          
          const duration = endMinutes - startMinutes;
          
          const isLongDuration = duration >= 1200;
          const coversBusinessHours = (startHour <= 8 && endHour >= 20);
          
          return isLongDuration || coversBusinessHours;
        });

        if (fullyApprovedReservations.length > 0) {
          if (isFullDayBooked) {
            availabilityStatus.not_available.push({
              resource_id: resourceId,
              resource_name: resource.f_name,
              category: resource.category,
              reservation_count: fullyApprovedReservations.length,
              time_slots: fullyApprovedReservations.map(r => r.time_slot_display).filter(Boolean),
              status: "Fully booked (all day)"
            });
          } else {
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
        current_philippine_time: today.toLocaleString("en-US", { timeZone: "Asia/Manila" }),
        today_date_string: todayDateString,
        resources_found: resources.length,
        reservations_queried: todayReservations.length,
        reservations_for_today: dailyNews.length,
        timezone_used: "Asia/Manila (UTC+8)",
        note: "Only showing reservations with slots dated for TODAY in Philippine timezone"
      }
    };

    console.log("✅ Response summary:", {
      today: todayDateString,
      total_news_items: dailyNews.length,
      total_reservations_processed: todayReservations.length
    });

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