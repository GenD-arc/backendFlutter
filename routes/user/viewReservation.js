const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");
const { verifyToken } = require("../../middleware/auth");

router.get("/:requester_id", verifyToken, (req, res) => {
  const requesterId = req.params.requester_id;

  if (req.user.user_id !== requesterId) {
    return res.status(403).json({ error: "Access denied" });
  }
 
  const query = `
    SELECT r.id, r.f_id, f.f_name, r.purpose, r.date_from, r.date_to, r.status, r.created_at
    FROM reservations r
    JOIN university_resources f ON r.f_id = f.f_id
    WHERE r.requester_id = ?
    ORDER BY r.created_at DESC
  `;

  connection.query(query, [requesterId], (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.json([]);
    }

    const reservationIds = results.map(r => r.id);
    
    const slotsQuery = `
      SELECT 
        reservation_id,
        slot_date,
        start_time,
        end_time
      FROM reservation_daily_slots
      WHERE reservation_id IN (?)
      ORDER BY reservation_id, slot_date ASC
    `;

    connection.query(slotsQuery, [reservationIds], (slotsErr, slotsResults) => {
      if (slotsErr) {
        console.error("DB error fetching slots:", slotsErr);
        return res.status(500).json({ error: "Database error fetching slots" });
      }

      const slotsByReservation = {};
      slotsResults.forEach(slot => {
        if (!slotsByReservation[slot.reservation_id]) {
          slotsByReservation[slot.reservation_id] = [];
        }
        slotsByReservation[slot.reservation_id].push({
          slot_date: slot.slot_date,
          start_time: slot.start_time,
          end_time: slot.end_time
        });
      });

      const reservationsWithSlots = results.map(reservation => ({
        ...reservation,
        daily_slots: slotsByReservation[reservation.id] || []
      }));

      res.json(reservationsWithSlots);
    });
  });
});

module.exports = router;