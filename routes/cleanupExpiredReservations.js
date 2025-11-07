const connection = require('../controllers/database');

const logActivity = async (reservationId, actionType, description, oldStatus = null, newStatus = null) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO reservation_activity_logs 
      (reservation_id, user_id, action_type, description, old_status, new_status, comment) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    connection.query(
      query, 
      [reservationId, 'SYSTEM', actionType, description, oldStatus, newStatus, 'Auto-cancelled by system cleanup job'],
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
  });
};

async function cleanupExpiredReservations() {
  const now = new Date();

  try {
    await new Promise((resolve, reject) => {
      connection.query("START TRANSACTION", (err) => (err ? reject(err) : resolve()));
    });

    const expiredReservations = await new Promise((resolve, reject) => {
      connection.query(
        `SELECT id, f_id, requester_id, purpose, date_from, date_to, status 
         FROM reservations 
         WHERE status = 'pending' 
         AND date_from < NOW()
         ORDER BY date_from ASC`,
        (err, results) => (err ? reject(err) : resolve(results || []))
      );
    });

    if (expiredReservations.length === 0) {
      await new Promise((resolve, reject) => {
        connection.query("COMMIT", (err) => (err ? reject(err) : resolve()));
      });
      return { success: true, cancelled_count: 0 };
    }

    let successCount = 0;
    let failCount = 0;

    for (const reservation of expiredReservations) {
      try {
        await new Promise((resolve, reject) => {
          connection.query(
            "UPDATE reservations SET status = 'cancelled' WHERE id = ?",
            [reservation.id],
            (err) => (err ? reject(err) : resolve())
          );
        });

        await new Promise((resolve, reject) => {
          connection.query(
            "UPDATE reservation_approvals SET status = 'cancelled', acted_at = NOW(), comment = 'Auto-cancelled: reservation expired' WHERE reservation_id = ? AND status = 'pending'",
            [reservation.id],
            (err) => (err ? reject(err) : resolve())
          );
        });

        await logActivity(
          reservation.id,
          'cancelled',
          `Reservation auto-cancelled - start date passed (${reservation.date_from.toISOString()})`,
          'pending',
          'cancelled'
        );

        successCount++;

      } catch (error) {
        failCount++;
      }
    }

    await new Promise((resolve, reject) => {
      connection.query("COMMIT", (err) => (err ? reject(err) : resolve()));
    });

    return { success: true, cancelled_count: successCount, failed_count: failCount };

  } catch (error) {
    await new Promise((resolve, reject) => {
      connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
    });

    return { success: false, error: error.message };
  }
}

module.exports = cleanupExpiredReservations;