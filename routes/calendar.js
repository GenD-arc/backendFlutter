const express = require('express');
const router = express.Router();
const db = require('../controllers/database');

router.get('/', async (req, res) => {
  try {
    const { month } = req.query;
    
    if (!month) {
      return res.status(400).json({ error: 'Month parameter is required' });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);

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
  JOIN reservation_daily_slots rds ON r.id = rds.reservation_id
  WHERE r.status IN ('approved', 'pending')
    AND YEAR(rds.slot_date) = ? 
    AND MONTH(rds.slot_date) = ?
  GROUP BY r.id
  ORDER BY r.date_from, r.f_id
`;

    db.query(query, [year, monthNum], async (error, results) => {
      if (error) {
        return res.status(500).json({ error: 'Database query failed' });
      }

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

            return {
              ...reservation,
              daily_slots: dailySlots
            };
          } catch (error) {
            return {
              ...reservation,
              daily_slots: []
            };
          }
        })
      );

      const calendarData = {};
      
      reservationsWithSlots.forEach(reservation => {
        const start = new Date(reservation.date_from);
        const end = new Date(reservation.date_to);
        
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
            daily_slots: reservation.daily_slots
          });
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
      });

      res.json({
        success: true,
        month: month,
        calendar_data: calendarData,
        total_days_with_reservations: Object.keys(calendarData).length,
        total_reservations: results.length
      });
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to load public calendar data' });
  }
});

module.exports = router;