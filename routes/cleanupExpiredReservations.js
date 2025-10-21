const connection = require('../controllers/database');

/**
 * ⏰ CLEANUP JOB: Auto-cancel expired pending reservations
 * Runs daily at midnight to clean up reservations where start_date has passed
 */

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
  console.log(`\n🧹 [${now.toISOString()}] Running expired reservations cleanup...`);

  try {
    // Start transaction
    await new Promise((resolve, reject) => {
      connection.query("START TRANSACTION", (err) => (err ? reject(err) : resolve()));
    });

    // Find all expired pending reservations
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
      console.log('✅ No expired pending reservations found.');
      await new Promise((resolve, reject) => {
        connection.query("COMMIT", (err) => (err ? reject(err) : resolve()));
      });
      return { success: true, cancelled_count: 0 };
    }

    console.log(`⚠️  Found ${expiredReservations.length} expired pending reservation(s):`);

    let successCount = 0;
    let failCount = 0;

    for (const reservation of expiredReservations) {
      try {
        // Update reservation status to cancelled
        await new Promise((resolve, reject) => {
          connection.query(
            "UPDATE reservations SET status = 'cancelled' WHERE id = ?",
            [reservation.id],
            (err) => (err ? reject(err) : resolve())
          );
        });

        // Update all pending approval steps
        await new Promise((resolve, reject) => {
          connection.query(
            "UPDATE reservation_approvals SET status = 'cancelled', acted_at = NOW(), comment = 'Auto-cancelled: reservation expired' WHERE reservation_id = ? AND status = 'pending'",
            [reservation.id],
            (err) => (err ? reject(err) : resolve())
          );
        });

        // Log the activity
        await logActivity(
          reservation.id,
          'cancelled',
          `Reservation auto-cancelled - start date passed (${reservation.date_from.toISOString()})`,
          'pending',
          'cancelled'
        );

        console.log(`   ✅ Cancelled reservation #${reservation.id} (Date: ${reservation.date_from.toISOString().split('T')[0]})`);
        successCount++;

      } catch (error) {
        console.error(`   ❌ Failed to cancel reservation #${reservation.id}:`, error.message);
        failCount++;
      }
    }

    // Commit transaction
    await new Promise((resolve, reject) => {
      connection.query("COMMIT", (err) => (err ? reject(err) : resolve()));
    });

    console.log(`\n📊 Cleanup Summary:`);
    console.log(`   ✅ Successfully cancelled: ${successCount}`);
    if (failCount > 0) {
      console.log(`   ❌ Failed to cancel: ${failCount}`);
    }
    console.log(`   ⏰ Next cleanup: Tomorrow at midnight\n`);

    return { success: true, cancelled_count: successCount, failed_count: failCount };

  } catch (error) {
    console.error('❌ Cleanup job failed:', error);
    
    // Rollback on error
    await new Promise((resolve, reject) => {
      connection.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
    });

    return { success: false, error: error.message };
  }
}

module.exports = cleanupExpiredReservations;