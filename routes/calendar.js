const express = require('express');
const router = express.Router();
const db = require('../controllers/database');

// GET /api/public/calendar?month=2025-10
router.get('/', async (req, res) => {
  try {
    const { month } = req.query;
    
    if (!month) {
      return res.status(400).json({ error: 'Month parameter is required' });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);

    console.log(`📅 Public calendar request for ${month}, date range: ${startDate} to ${endDate}`);

    const query = `
      SELECT 
        r.id as reservation_id,
        r.f_id,
        ur.f_name as resource_name,
        ur.category as resource_category,
        r.purpose,
        r.date_from,
        r.date_to,
        r.status,
        u.name as reserved_by,
        r.created_at
      FROM reservations r
      JOIN university_resources ur ON r.f_id = ur.f_id
      JOIN users u ON r.requester_id = u.id
      WHERE r.date_from <= ? AND r.date_to >= ?
        AND r.status IN ('approved', 'pending')
      ORDER BY r.date_from, r.f_id
    `;

    db.query(query, [endDate, startDate], async (error, results) => {
      if (error) {
        console.error('Database error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }

      console.log(`📊 Found ${results.length} reservations for public calendar`);

      // 👇 FETCH DAILY SLOTS FOR EACH RESERVATION
      const reservationsWithSlots = await Promise.all(
        results.map(async (reservation) => {
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
              db.query(slotsQuery, [reservation.reservation_id], (err, slots) => {
                if (err) reject(err);
                else resolve(slots || []);
              });
            });

            console.log(`🔍 Reservation ${reservation.reservation_id}: ${dailySlots.length} daily slots`);

            return {
              ...reservation,
              daily_slots: dailySlots
            };
          } catch (error) {
            console.error(`❌ Error fetching slots for reservation ${reservation.reservation_id}:`, error);
            return {
              ...reservation,
              daily_slots: []
            };
          }
        })
      );

      // Group by date
      const calendarData = {};
      
      reservationsWithSlots.forEach(reservation => {
        const start = new Date(reservation.date_from);
        const end = new Date(reservation.date_to);
        
        console.log(`🔄 Processing reservation ${reservation.reservation_id} from ${start} to ${end}`);
        
        let currentDate = new Date(start);
        while (currentDate <= end) {
          const dateKey = currentDate.toISOString().split('T')[0];
          
          if (!calendarData[dateKey]) {
            calendarData[dateKey] = [];
          }
          
          calendarData[dateKey].push({
            reservation_id: reservation.reservation_id,
            f_id: reservation.f_id,
            resource_name: reservation.resource_name,
            resource_category: reservation.resource_category,
            purpose: reservation.purpose,
            date_from: reservation.date_from.toISOString(),
            date_to: reservation.date_to.toISOString(),
            status: reservation.status,
            reserved_by: reservation.reserved_by,
            daily_slots: reservation.daily_slots  // 👈 ADD THIS
          });
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
      });

      console.log(`✅ Processed public calendar data for ${Object.keys(calendarData).length} dates`);

      res.json({
        success: true,
        month: month,
        calendar_data: calendarData,
        total_days_with_reservations: Object.keys(calendarData).length,
        total_reservations: results.length
      });
    });

  } catch (error) {
    console.error('Public calendar error:', error);
    res.status(500).json({ error: 'Failed to load public calendar data' });
  }
});

module.exports = router;