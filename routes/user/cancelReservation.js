const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");
const { verifyToken } = require("../../middleware/auth");

router.patch("/:reservation_id/cancel", verifyToken, async (req, res) => {
  const reservationId = req.params.reservation_id;
  const userId = req.user.user_id;

  try {
    await new Promise((resolve, reject) => {
      connection.query("START TRANSACTION", (err) => (err ? reject(err) : resolve()));
    });

    const reservationCheck = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT id, requester_id, status, f_id, purpose, date_from, date_to FROM reservations WHERE id = ?",
        [reservationId],
        (err, results) => (err ? reject(err) : resolve(results))
      );
    });

    if (!reservationCheck || reservationCheck.length === 0) {
      await new Promise((resolve, reject) => {
        connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
      });
      return res.status(404).json({ error: "Reservation not found" });
    }

    const reservation = reservationCheck[0];

    if (reservation.requester_id !== userId) {
      await new Promise((resolve, reject) => {
        connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
      });
      return res.status(403).json({ error: "You can only cancel your own reservations" });
    }

    if (reservation.status === 'cancelled') {
      await new Promise((resolve, reject) => {
        connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
      });
      return res.status(400).json({ error: "Reservation is already cancelled" });
    }

    if (reservation.status === 'rejected') {
      await new Promise((resolve, reject) => {
        connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
      });
      return res.status(400).json({ error: "Cannot cancel a rejected reservation" });
    }

    const now = new Date();
    const reservationStart = new Date(reservation.date_from);
    
    if (reservationStart <= now) {
      await new Promise((resolve, reject) => {
        connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
      });
      return res.status(400).json({ 
        error: "Cannot cancel a reservation that has already started or is in progress" 
      });
    }

    await new Promise((resolve, reject) => {
      connection.query(
        "UPDATE reservations SET status = 'cancelled' WHERE id = ?",
        [reservationId],
        (err) => (err ? reject(err) : resolve())
      );
    });

    await new Promise((resolve, reject) => {
      connection.query(
        "UPDATE reservation_approvals SET status = 'cancelled', acted_at = NOW() WHERE reservation_id = ? AND status = 'pending'",
        [reservationId],
        (err) => (err ? reject(err) : resolve())
      );
    });

    await new Promise((resolve, reject) => {
      connection.query("COMMIT", (err) => (err ? reject(err) : resolve()));
    });

    return res.status(200).json({ 
      success: true, 
      message: "Reservation cancelled successfully",
      reservationId: reservationId
    });

  } catch (error) {
    console.error("Error cancelling reservation:", error);
    await new Promise((resolve, reject) => {
      connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
    });
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

module.exports = router;