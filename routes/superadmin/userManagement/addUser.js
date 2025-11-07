const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const connection = require('../../../controllers/database');

router.post("/", async (req, res) => {
  const { id, name, department, username, email, password, role_id } = req.body;

  if (!id || !name || !department || !username || !email || !password || !role_id) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const checkQuery = "SELECT * FROM accounts WHERE email = ? OR user_id = ?";
    connection.query(checkQuery, [email, id], async (err, results) => {
      if (err) {
        console.error("Error checking email/ID:", err);
        return res.status(500).json({ error: "Database error during check" });
      }

      if (results.length > 0) {
        return res.status(400).json({ error: "Email or ID already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const userQuery =
        "INSERT INTO users (id, name, department, role_id) VALUES (?, ?, ?, ?)";
      connection.query(userQuery, [id, name, department, role_id], (userErr) => {
        if (userErr) {
          console.error("Error inserting into users:", userErr);
          return res
            .status(500)
            .json({ error: "Internal server error while inserting user" });
        }

        const accQuery =
          "INSERT INTO accounts (username, email, password, user_id) VALUES (?, ?, ?, ?)";
        connection.query(
          accQuery,
          [username, email, hashedPassword, id],
          (accErr) => {
            if (accErr) {
              console.error("Error inserting into accounts:", accErr);
              return res
                .status(500)
                .json({ error: "Internal server error while inserting account" });
            }

            console.log("User registered successfully.");
            return res
              .status(201)
              .json({ message: "User registered successfully", userId: id });
          }
        );
      });
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "Unexpected server error" });
  }
});

module.exports = router;