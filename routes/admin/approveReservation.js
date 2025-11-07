const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");

const logActivity = async (reservationId, userId, actionType, description, oldStatus = null, newStatus = null, stepOrder = null, comment = null, metadata = null) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO reservation_activity_logs 
      (reservation_id, user_id, action_type, description, old_status, new_status, step_order, comment, metadata) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    connection.query(query, [reservationId, userId, actionType, description, oldStatus, newStatus, stepOrder, comment, metadata], (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

router.post("/", async (req, res) => {
  const { approval_id, approver_id, action, comment } = req.body;

  if (!approval_id || !approver_id || !["approved", "rejected"].includes(action)) {
    return res.status(400).json({ error: "Invalid input" });
  }

  try {
    await new Promise((resolve, reject) => {
      connection.query("START TRANSACTION", (err) => (err ? reject(err) : resolve()));
    });

    const approval = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT reservation_id, step_order FROM reservation_approvals WHERE id = ? AND approver_id = ? AND status = 'pending'",
        [approval_id, approver_id],
        (err, results) => {
          if (err) reject(err);
          else resolve(results && results.length > 0 ? results[0] : null);
        }
      );
    });

    if (!approval) {
      await new Promise((resolve, reject) => {
        connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
      });
      return res.status(404).json({ error: "Approval not found or not pending" });
    }

    const { reservation_id, step_order } = approval;

    const reservationDetails = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT status, purpose, f_id, date_from, date_to FROM reservations WHERE id = ?",
        [reservation_id],
        (err, results) => {
          if (err) reject(err);
          else resolve(results && results.length > 0 ? results[0] : null);
        }
      );
    });

    if (!reservationDetails) {
      await new Promise((resolve, reject) => {
        connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
      });
      return res.status(404).json({ error: "Reservation not found" });
    }

    const now = new Date();
    const reservationStart = new Date(reservationDetails.date_from);

    if (reservationStart < now) {
      await new Promise((resolve, reject) => {
        connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
      });
      
      await new Promise((resolve, reject) => {
        connection.query(
          "UPDATE reservations SET status = 'cancelled' WHERE id = ?",
          [reservation_id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await logActivity(
        reservation_id,
        'SYSTEM',
        'cancelled',
        'Reservation auto-cancelled - start date has passed',
        reservationDetails.status,
        'cancelled',
        step_order,
        'System: Start date has already passed'
      );

      return res.status(400).json({ 
        error: "Cannot approve expired reservation",
        message: "This reservation's start date has already passed and has been automatically cancelled.",
        reservation_id: reservation_id,
        start_date: reservationStart.toISOString(),
        current_date: now.toISOString(),
        auto_cancelled: true
      });
    }

    const currentStatus = reservationDetails.status;
    const purpose = reservationDetails.purpose;
    const facilityId = reservationDetails.f_id;

    const previousSteps = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT status FROM reservation_approvals WHERE reservation_id = ? AND step_order < ?",
        [reservation_id, step_order],
        (err, results) => {
          if (err) reject(err);
          else resolve(results || []);
        }
      );
    });

    if (previousSteps.length > 0 && previousSteps.some(step => step.status !== "approved")) {
      await new Promise((resolve, reject) => {
        connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
      });
      return res.status(403).json({ error: "Previous approval steps not completed" });
    }

    await new Promise((resolve, reject) => {
      connection.query(
        "UPDATE reservation_approvals SET status = ?, acted_at = NOW(), comment = ? WHERE id = ? AND approver_id = ?",
        [action, comment || null, approval_id, approver_id],
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

    const actionDescription = action === 'approved' 
      ? `Approved step ${step_order} of reservation workflow` 
      : `Rejected step ${step_order} of reservation workflow`;

    await logActivity(
      reservation_id, 
      approver_id, 
      action, 
      actionDescription, 
      'pending', 
      action, 
      step_order, 
      comment
    );

    if (action === "rejected") {
      await new Promise((resolve, reject) => {
        connection.query(
          "UPDATE reservations SET status = 'rejected' WHERE id = ?",
          [reservation_id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await logActivity(
        reservation_id, 
        approver_id, 
        'rejected', 
        `Reservation rejected at step ${step_order}`, 
        currentStatus, 
        'rejected',
        step_order,
        comment
      );

      await new Promise((resolve, reject) => {
        connection.query("COMMIT", (err) => (err ? reject(err) : resolve()));
      });
      return res.json({ message: "Reservation rejected", reservation_id, step_order });
    }

    const pendingSteps = await new Promise((resolve, reject) => {
      connection.query(
        "SELECT COUNT(*) AS cnt FROM reservation_approvals WHERE reservation_id = ? AND status = 'pending'",
        [reservation_id],
        (err, results) => {
          if (err) reject(err);
          else resolve(results && results.length > 0 ? results[0] : { cnt: 0 });
        }
      );
    });

    if (pendingSteps.cnt === 0) {
      await new Promise((resolve, reject) => {
        connection.query(
          "UPDATE reservations SET status = 'approved' WHERE id = ?",
          [reservation_id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await logActivity(
        reservation_id, 
        approver_id, 
        'approved', 
        'Reservation fully approved - all workflow steps completed', 
        currentStatus, 
        'approved'
      );
    } else {
      const nextStep = step_order + 1;
      
      const nextApprover = await new Promise((resolve, reject) => {
        connection.query(
          "SELECT approver_id FROM reservation_approvals WHERE reservation_id = ? AND step_order = ?",
          [reservation_id, nextStep],
          (err, results) => {
            if (err) reject(err);
            else resolve(results && results.length > 0 ? results[0] : null);
          }
        );
      });

      if (nextApprover) {
        const resource = await new Promise((resolve, reject) => {
          connection.query(
            "SELECT f_name FROM university_resources WHERE f_id = ?",
            [facilityId],
            (err, results) => {
              if (err) reject(err);
              else resolve(results && results.length > 0 ? results[0] : null);
            }
          );
        });

        const requesterDetails = await new Promise((resolve, reject) => {
          connection.query(
            "SELECT u.name FROM reservations r JOIN users u ON r.requester_id = u.id WHERE r.id = ?",
            [reservation_id],
            (err, results) => {
              if (err) reject(err);
              else resolve(results && results.length > 0 ? results[0] : null);
            }
          );
        });

        const notification = {
          type: 'RESERVATION_READY_FOR_APPROVAL',
          reservation_id: reservation_id,
          facility_id: facilityId,
          facility_name: resource.f_name,
          purpose: purpose,
          requester_name: requesterDetails.name,
          step_order: nextStep,
          previous_approver: approver_id,
          timestamp: new Date().toISOString()
        };

        const notificationServer = req.app.locals.notificationServer;
        if (notificationServer) {
          notificationServer.sendToUser(nextApprover.approver_id, notification);
        }
      }
    }

    await new Promise((resolve, reject) => {
      connection.query("COMMIT", (err) => (err ? reject(err) : resolve()));
    });
    
    return res.json({ 
      message: "Step approved successfully", 
      reservation_id, 
      step_order,
      fully_approved: pendingSteps.cnt === 0
    });

  } catch (error) {
    await new Promise((resolve, reject) => {
      connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
    });
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

module.exports = router;