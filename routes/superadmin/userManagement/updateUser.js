const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const connection = require('../../../controllers/database');

// Update user by ID
router.put("/:id", async (req, res) => {
  const userId = req.params.id;
  const { name, department, username, email, password, role_id } = req.body;

  if (!name || !department || !username || !email || !role_id) {
    return res.status(400).json({ error: "Name, department, username, email, and role_id are required" });
  }

  try {
    // First, check if the user exists
    const checkUserQuery = "SELECT * FROM users WHERE id = ?";
    connection.query(checkUserQuery, [userId], async (err, userResults) => {
      if (err) {
        console.error("Error checking user existence:", err);
        return res.status(500).json({ error: "Database error during user check" });
      }

      if (userResults.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if email or username already exists for other users (not the current user)
      const checkDuplicateQuery = `
        SELECT a.user_id, a.email, a.username 
        FROM accounts a 
        WHERE (a.email = ? OR a.username = ?) AND a.user_id != ?
      `;
      
      connection.query(checkDuplicateQuery, [email, username, userId], async (duplicateErr, duplicateResults) => {
        if (duplicateErr) {
          console.error("Error checking duplicates:", duplicateErr);
          return res.status(500).json({ error: "Database error during duplicate check" });
        }

        if (duplicateResults.length > 0) {
          const duplicate = duplicateResults[0];
          if (duplicate.email === email) {
            return res.status(400).json({ error: "Email already exists for another user" });
          }
          if (duplicate.username === username) {
            return res.status(400).json({ error: "Username already exists for another user" });
          }
        }

        // Start transaction for updating both tables
        connection.beginTransaction(async (transactionErr) => {
          if (transactionErr) {
            console.error("Error starting transaction:", transactionErr);
            return res.status(500).json({ error: "Database transaction error" });
          }

          try {
            // Update users table
            const updateUserQuery = `
              UPDATE users 
              SET name = ?, department = ?, role_id = ? 
              WHERE id = ?
            `;
            
            connection.query(updateUserQuery, [name, department, role_id, userId], (userUpdateErr) => {
              if (userUpdateErr) {
                console.error("Error updating users table:", userUpdateErr);
                return connection.rollback(() => {
                  res.status(500).json({ error: "Error updating user information" });
                });
              }

              // Prepare account update query and parameters
              let updateAccountQuery;
              let accountParams;

              if (password && password.trim() !== '') {
                // If password is provided, hash it and update
                bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
                  if (hashErr) {
                    console.error("Error hashing password:", hashErr);
                    return connection.rollback(() => {
                      res.status(500).json({ error: "Error processing password" });
                    });
                  }

                  updateAccountQuery = `
                    UPDATE accounts 
                    SET username = ?, email = ?, password = ? 
                    WHERE user_id = ?
                  `;
                  accountParams = [username, email, hashedPassword, userId];

                  // Execute account update with password
                  connection.query(updateAccountQuery, accountParams, (accountUpdateErr) => {
                    if (accountUpdateErr) {
                      console.error("Error updating accounts table:", accountUpdateErr);
                      return connection.rollback(() => {
                        res.status(500).json({ error: "Error updating account information" });
                      });
                    }

                    // Commit transaction
                    connection.commit((commitErr) => {
                      if (commitErr) {
                        console.error("Error committing transaction:", commitErr);
                        return connection.rollback(() => {
                          res.status(500).json({ error: "Error saving changes" });
                        });
                      }

                      console.log(`User ${userId} updated successfully with password change.`);
                      res.status(200).json({ 
                        message: "User updated successfully", 
                        userId: userId 
                      });
                    });
                  });
                });
              } else {
                // If no password provided, update without password
                updateAccountQuery = `
                  UPDATE accounts 
                  SET username = ?, email = ? 
                  WHERE user_id = ?
                `;
                accountParams = [username, email, userId];

                connection.query(updateAccountQuery, accountParams, (accountUpdateErr) => {
                  if (accountUpdateErr) {
                    console.error("Error updating accounts table:", accountUpdateErr);
                    return connection.rollback(() => {
                      res.status(500).json({ error: "Error updating account information" });
                    });
                  }

                  // Commit transaction
                  connection.commit((commitErr) => {
                    if (commitErr) {
                      console.error("Error committing transaction:", commitErr);
                      return connection.rollback(() => {
                        res.status(500).json({ error: "Error saving changes" });
                      });
                    }

                    console.log(`User ${userId} updated successfully.`);
                    res.status(200).json({ 
                      message: "User updated successfully", 
                      userId: userId 
                    });
                  });
                });
              }
            });
          } catch (transactionError) {
            console.error("Unexpected error during transaction:", transactionError);
            connection.rollback(() => {
              res.status(500).json({ error: "Unexpected error during update" });
            });
          }
        });
      });
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "Unexpected server error" });
  }
});

// Get user details by ID (for edit form population)
router.get("/:id", (req, res) => {
  const userId = req.params.id;

  const getUserQuery = `
    SELECT 
      u.id, 
      u.name, 
      u.department, 
      u.role_id,
      a.username,
      a.email,
      r.role_type
    FROM users u 
    LEFT JOIN accounts a ON u.id = a.user_id
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.id = ?
  `;

  connection.query(getUserQuery, [userId], (err, results) => {
    if (err) {
      console.error("Error fetching user details:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = results[0];
    // Don't send password in response for security
    res.status(200).json({
      id: user.id,
      name: user.name,
      department: user.department,
      role_id: user.role_id,
      username: user.username,
      email: user.email,
      role_type: user.role_type
    });
  });
});

module.exports = router;