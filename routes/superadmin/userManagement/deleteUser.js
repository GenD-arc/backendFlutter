const express = require("express");
const router = express.Router();
const connection = require('../../../controllers/database');

// Delete user by ID
router.delete("/:id", (req, res) => {
  const userId = req.params.id;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    // First, check if the user exists
    const checkUserQuery = "SELECT * FROM users WHERE id = ?";
    connection.query(checkUserQuery, [userId], (err, userResults) => {
      if (err) {
        console.error("Error checking user existence:", err);
        return res.status(500).json({ error: "Database error during user check" });
      }

      if (userResults.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = userResults[0];

      // Start transaction for deleting from both tables
      connection.beginTransaction((transactionErr) => {
        if (transactionErr) {
          console.error("Error starting transaction:", transactionErr);
          return res.status(500).json({ error: "Database transaction error" });
        }

        // Delete from accounts table first (child table)
        const deleteAccountQuery = "DELETE FROM accounts WHERE user_id = ?";
        connection.query(deleteAccountQuery, [userId], (accountErr) => {
          if (accountErr) {
            console.error("Error deleting from accounts table:", accountErr);
            return connection.rollback(() => {
              res.status(500).json({ error: "Error deleting user account" });
            });
          }

          // Delete from users table (parent table)
          const deleteUserQuery = "DELETE FROM users WHERE id = ?";
          connection.query(deleteUserQuery, [userId], (userErr) => {
            if (userErr) {
              console.error("Error deleting from users table:", userErr);
              return connection.rollback(() => {
                res.status(500).json({ error: "Error deleting user" });
              });
            }

            // Commit transaction
            connection.commit((commitErr) => {
              if (commitErr) {
                console.error("Error committing transaction:", commitErr);
                return connection.rollback(() => {
                  res.status(500).json({ error: "Error completing deletion" });
                });
              }

              console.log(`User ${userId} (${user.name}) deleted successfully.`);
              res.status(200).json({ 
                message: "User deleted successfully", 
                deletedUser: {
                  id: userId,
                  name: user.name
                }
              });
            });
          });
        });
      });
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "Unexpected server error" });
  }
});

// Soft delete user (alternative approach - marks as inactive instead of permanent deletion)
router.patch("/:id/deactivate", (req, res) => {
  const userId = req.params.id;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    // Check if users table has an 'active' or 'status' column
    // If not, you'll need to add one: ALTER TABLE users ADD COLUMN active BOOLEAN DEFAULT TRUE;
    const deactivateQuery = "UPDATE users SET active = FALSE WHERE id = ?";
    
    connection.query(deactivateQuery, [userId], (err, results) => {
      if (err) {
        console.error("Error deactivating user:", err);
        return res.status(500).json({ error: "Database error during deactivation" });
      }

      if (results.affectedRows === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      console.log(`User ${userId} deactivated successfully.`);
      res.status(200).json({ 
        message: "User deactivated successfully", 
        userId: userId 
      });
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "Unexpected server error" });
  }
});

// Restore user (reactivate)
router.patch("/:id/restore", (req, res) => {
  const userId = req.params.id;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const restoreQuery = "UPDATE users SET active = TRUE WHERE id = ?";
    
    connection.query(restoreQuery, [userId], (err, results) => {
      if (err) {
        console.error("Error restoring user:", err);
        return res.status(500).json({ error: "Database error during restoration" });
      }

      if (results.affectedRows === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      console.log(`User ${userId} restored successfully.`);
      res.status(200).json({ 
        message: "User restored successfully", 
        userId: userId 
      });
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "Unexpected server error" });
  }
});


// Bulk delete users
router.post("/bulk", (req, res) => {
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: "User IDs array is required" });
  }

  try {
    const placeholders = userIds.map(() => "?").join(",");
    
    // Start transaction
    connection.beginTransaction((transactionErr) => {
      if (transactionErr) {
        console.error("Error starting transaction:", transactionErr);
        return res.status(500).json({ error: "Database transaction error" });
      }

      // Delete from accounts table first
      const deleteAccountsQuery = `DELETE FROM accounts WHERE user_id IN (${placeholders})`;
      connection.query(deleteAccountsQuery, userIds, (accountErr, accountResults) => {
        if (accountErr) {
          console.error("Error deleting accounts:", accountErr);
          return connection.rollback(() => {
            res.status(500).json({ error: "Error deleting user accounts" });
          });
        }

        // Delete from users table
        const deleteUsersQuery = `DELETE FROM users WHERE id IN (${placeholders})`;
        connection.query(deleteUsersQuery, userIds, (userErr, userResults) => {
          if (userErr) {
            console.error("Error deleting users:", userErr);
            return connection.rollback(() => {
              res.status(500).json({ error: "Error deleting users" });
            });
          }

          // Commit transaction
          connection.commit((commitErr) => {
            if (commitErr) {
              console.error("Error committing transaction:", commitErr);
              return connection.rollback(() => {
                res.status(500).json({ error: "Error completing bulk deletion" });
              });
            }

            console.log(`${userResults.affectedRows} users deleted successfully.`);
            res.status(200).json({ 
              message: `${userResults.affectedRows} users deleted successfully`,
              deletedCount: userResults.affectedRows
            });
          });
        });
      });
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "Unexpected server error" });
  }
});

module.exports = router;