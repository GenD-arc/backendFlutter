const express = require("express");
const router = express.Router();
const connection = require("../controllers/database");
const { verifyToken } = require("../middleware/auth");

router.get("/:reservation_id/daily-slots", verifyToken, (req, res) => {
  const reservationId = req.params.reservation_id;

  const query = `
    SELECT 
      rds.id,
      rds.slot_date,
      rds.start_time,
      rds.end_time,
      rds.created_at
    FROM reservation_daily_slots rds
    WHERE rds.reservation_id = ?
    ORDER BY rds.slot_date ASC, rds.start_time ASC
  `;

  connection.query(query, [reservationId], (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "No daily slots found" });
    }

    const dailySlots = results.map(row => ({
      id: row.id,
      slot_date: row.slot_date,
      start_time: row.start_time,
      end_time: row.end_time,
      created_at: row.created_at
    }));

    res.json({
      reservation_id: reservationId,
      daily_slots: dailySlots,
      total_slots: dailySlots.length
    });
  });
});

module.exports = router;