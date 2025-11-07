const express = require("express");
const router = express.Router();
const connection = require('../../../controllers/database');

router.delete("/:id", async (req, res) => {
  try {
    const resourceId = req.params.id;

    if (!resourceId) {
      return res.status(400).json({ error: "Resource ID is required" });
    }

    const queryAsync = (query, params) => {
      return new Promise((resolve, reject) => {
        connection.query(query, params, (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });
    };

    const checkQuery = "SELECT f_id, f_name FROM university_resources WHERE f_id = ?";
    const existingResource = await queryAsync(checkQuery, [resourceId]);

    if (existingResource.length === 0) {
      return res.status(404).json({ error: "Resource not found" });
    }

    const deleteQuery = "DELETE FROM university_resources WHERE f_id = ?";
    const result = await queryAsync(deleteQuery, [resourceId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Resource not found or already deleted" });
    }

    return res.status(200).json({ 
      message: "Resource deleted successfully",
      deletedResource: {
        f_id: existingResource[0].f_id,
        f_name: existingResource[0].f_name
      }
    });

  } catch (error) {
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.delete("/", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Array of resource IDs is required" });
    }

    if (ids.some(id => !id)) {
      return res.status(400).json({ error: "All resource IDs must be valid" });
    }

    const queryAsync = (query, params) => {
      return new Promise((resolve, reject) => {
        connection.query(query, params, (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });
    };

    const placeholders = ids.map(() => "?").join(",");
    const checkQuery = `SELECT f_id, f_name FROM university_resources WHERE f_id IN (${placeholders})`;
    const existingResources = await queryAsync(checkQuery, ids);

    if (existingResources.length === 0) {
      return res.status(404).json({ error: "No resources found with provided IDs" });
    }

    const deleteQuery = `DELETE FROM university_resources WHERE f_id IN (${placeholders})`;
    const result = await queryAsync(deleteQuery, ids);

    const deletedCount = result.affectedRows;
    const notFoundIds = ids.filter(id => !existingResources.some(resource => resource.f_id === id));

    return res.status(200).json({
      message: `Successfully deleted ${deletedCount} resource(s)`,
      deletedCount,
      deletedResources: existingResources,
      notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined
    });

  } catch (error) {
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.patch("/:id/soft-delete", async (req, res) => {
  try {
    const resourceId = req.params.id;

    if (!resourceId) {
      return res.status(400).json({ error: "Resource ID is required" });
    }

    const queryAsync = (query, params) => {
      return new Promise((resolve, reject) => {
        connection.query(query, params, (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });
    };

    const checkQuery = "SELECT f_id, f_name FROM university_resources WHERE f_id = ?";
    const existingResource = await queryAsync(checkQuery, [resourceId]);

    if (existingResource.length === 0) {
      return res.status(404).json({ error: "Resource not found" });
    }

    const softDeleteQuery = "UPDATE university_resources SET deleted_at = NOW() WHERE f_id = ? AND deleted_at IS NULL";
    const result = await queryAsync(softDeleteQuery, [resourceId]);

    if (result.affectedRows === 0) {
      return res.status(400).json({ error: "Resource is already deleted or not found" });
    }

    return res.status(200).json({ 
      message: "Resource soft deleted successfully",
      softDeletedResource: {
        f_id: existingResource[0].f_id,
        f_name: existingResource[0].f_name
      }
    });

  } catch (error) {
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.patch("/:id/restore", async (req, res) => {
  try {
    const resourceId = req.params.id;

    if (!resourceId) {
      return res.status(400).json({ error: "Resource ID is required" });
    }

    const queryAsync = (query, params) => {
      return new Promise((resolve, reject) => {
        connection.query(query, params, (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });
    };

    const checkQuery = "SELECT f_id, f_name FROM university_resources WHERE f_id = ? AND deleted_at IS NOT NULL";
    const existingResource = await queryAsync(checkQuery, [resourceId]);

    if (existingResource.length === 0) {
      return res.status(404).json({ error: "Deleted resource not found" });
    }

    const restoreQuery = "UPDATE university_resources SET deleted_at = NULL WHERE f_id = ?";
    const result = await queryAsync(restoreQuery, [resourceId]);

    if (result.affectedRows === 0) {
      return res.status(400).json({ error: "Resource could not be restored" });
    }

    return res.status(200).json({ 
      message: "Resource restored successfully",
      restoredResource: {
        f_id: existingResource[0].f_id,
        f_name: existingResource[0].f_name
      }
    });

  } catch (error) {
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

module.exports = router;