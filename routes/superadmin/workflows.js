const express = require("express");
const router = express.Router();
const connection = require("../../controllers/database");

// Utility: promisify queries
const queryAsync = (query, params) => {
  return new Promise((resolve, reject) => {
    connection.query(query, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
};

/**
 * POST /api/superadmin/workflows
 * Create or update workflow steps for a facility
 * Body: { f_id, steps: [{ user_id, step_order }, ...] }
 */
router.post("/", async (req, res) => {
  try {
    const { f_id, steps } = req.body;

    if (!f_id || !steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: "Facility ID and steps are required" });
    }

    // Check facility exists
    const facility = await queryAsync("SELECT * FROM university_resources WHERE f_id = ?", [f_id]);
    if (facility.length === 0) {
      return res.status(404).json({ error: "Facility not found" });
    }

    // Clear existing workflow for this facility (resetting order)
    await queryAsync("DELETE FROM facility_approval_workflows WHERE f_id = ?", [f_id]);

    // Insert new steps
    for (const step of steps) {
      if (!step.user_id || !step.step_order) continue;
      await queryAsync(
        "INSERT INTO facility_approval_workflows (f_id, user_id, step_order) VALUES (?, ?, ?)",
        [f_id, step.user_id, step.step_order]
      );
    }

    return res.status(201).json({ message: "Workflow set successfully" });
  } catch (error) {
    console.error("Error setting workflow:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * GET /api/superadmin/workflows/:f_id
 * View workflow steps for a facility
 */
router.get("/:f_id", async (req, res) => {
  try {
    const { f_id } = req.params;
    const query = `
      SELECT w.id, w.step_order, u.id AS user_id, u.name, u.department, r.role_type
      FROM facility_approval_workflows w
      JOIN users u ON w.user_id = u.id
      JOIN roles r ON u.role_id = r.id
      WHERE w.f_id = ?
      ORDER BY w.step_order ASC
    `;
    const steps = await queryAsync(query, [f_id]);

    if (steps.length === 0) {
      return res.status(404).json({ error: "No workflow defined for this facility" });
    }

    res.status(200).json(steps);
  } catch (error) {
    console.error("Error fetching workflow:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * DELETE /api/superadmin/workflows/:f_id
 * Remove workflow for a facility
 */
router.delete("/:f_id", async (req, res) => {
  try {
    const { f_id } = req.params;
    await queryAsync("DELETE FROM facility_approval_workflows WHERE f_id = ?", [f_id]);
    res.status(200).json({ message: "Workflow removed successfully" });
  } catch (error) {
    console.error("Error deleting workflow:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

module.exports = router;