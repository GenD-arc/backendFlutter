const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");
const { verifyToken } = require("../../middleware/auth");

/*
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

*/


// In your cancellation route - add activity logging
router.patch("/:reservation_id/cancel", verifyToken, async (req, res) => {
  const reservationId = req.params.reservation_id;
  const userId = req.user.user_id;
  const { comment } = req.body; // Add comment support

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

    // Get user details for logging
    const userDetails = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT name FROM users WHERE id = ?",
        [userId],
        (err, results) => (err ? reject(err) : resolve(results))
      );
    });

    const userName = userDetails && userDetails.length > 0 ? userDetails[0].name : 'Unknown User';

    // Update reservation status
    await new Promise((resolve, reject) => {
      connection.query(
        "UPDATE reservations SET status = 'cancelled' WHERE id = ?",
        [reservationId],
        (err) => (err ? reject(err) : resolve())
      );
    });

    // Update approval steps
    await new Promise((resolve, reject) => {
      connection.query(
        "UPDATE reservation_approvals SET status = 'cancelled', acted_at = NOW() WHERE reservation_id = ? AND status = 'pending'",
        [reservationId],
        (err) => (err ? reject(err) : resolve())
      );
    });

    // ✅ FIX: Log the cancellation activity
    const activityDescription = `Cancelled reservation${comment ? ` - ${comment}` : ''}`;
    
    await new Promise((resolve, reject) => {
      connection.query(
        `INSERT INTO reservation_activity_logs 
         (reservation_id, user_id, action_type, description, old_status, new_status, comment, metadata) 
         VALUES (?, ?, 'cancelled', ?, ?, 'cancelled', ?, ?)`,
        [
          reservationId,
          userId,
          activityDescription,
          reservation.status, // old status
          comment || null,
          JSON.stringify({
            cancelled_by: userId,
            cancelled_by_name: userName,
            cancelled_at: new Date().toISOString(),
            previous_status: reservation.status
          })
        ],
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
