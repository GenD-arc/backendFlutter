const express = require("express");
const router = express.Router();
const connection = require('../../../controllers/database');
const multer = require('multer');
const path = require('path');
const { fileTypeFromBuffer } = require('file-type');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.put("/:id", upload.single('f_image'), async (req, res) => {
  try {
    const resourceId = req.params.id;
    const { f_name, f_description, category } = req.body;
    const f_image = req.file ? req.file.buffer : null;

    if (!f_name && !f_description && !category && !f_image) {
      return res.status(400).json({ error: "At least one field must be provided for update" });
    }

    if (f_image) {
      const type = await fileTypeFromBuffer(f_image);
      if (!type || !['image/jpeg', 'image/png'].includes(type.mime)) {
        return res.status(400).json({ error: "Invalid image file type" });
      }
    }

    const queryAsync = (query, params) => {
      return new Promise((resolve, reject) => {
        connection.query(query, params, (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });
    };

    const checkQuery = "SELECT * FROM university_resources WHERE f_id = ?";
    const existingResource = await queryAsync(checkQuery, [resourceId]);

    if (existingResource.length === 0) {
      return res.status(404).json({ error: "Resource not found" });
    }

    if (f_name) {
      const nameCheckQuery = "SELECT * FROM university_resources WHERE f_name = ? AND f_id != ?";
      const nameConflict = await queryAsync(nameCheckQuery, [f_name, resourceId]);
      
      if (nameConflict.length > 0) {
        return res.status(400).json({ error: "Resource name already exists" });
      }
    }

    let updateFields = [];
    let updateValues = [];

    if (f_name) {
      updateFields.push("f_name = ?");
      updateValues.push(f_name);
    }
    if (f_description) {
      updateFields.push("f_description = ?");
      updateValues.push(f_description);
    }
    if (category) {
      updateFields.push("category = ?");
      updateValues.push(category);
    }
    if (f_image) {
      updateFields.push("f_image = ?");
      updateValues.push(f_image);
    }

    updateValues.push(resourceId);

    const updateQuery = `UPDATE university_resources SET ${updateFields.join(", ")} WHERE f_id = ?`;
    const result = await queryAsync(updateQuery, updateValues);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Resource not found or no changes made" });
    }
    return res.status(200).json({ message: "Resource updated successfully" });

  } catch (error) {
    console.error("Error updating resource:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.patch("/:id", upload.single('f_image'), async (req, res) => {
  try {
    const resourceId = req.params.id;
    const { f_name, f_description, category } = req.body;
    const f_image = req.file ? req.file.buffer : null;

    if (!f_name && !f_description && !category && !f_image) {
      return res.status(400).json({ error: "At least one field must be provided for update" });
    }

    if (f_image) {
      const type = await fileTypeFromBuffer(f_image);
      if (!type || !['image/jpeg', 'image/png'].includes(type.mime)) {
        return res.status(400).json({ error: "Invalid image file type" });
      }
    }

    const queryAsync = (query, params) => {
      return new Promise((resolve, reject) => {
        connection.query(query, params, (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });
    };
    
    const checkQuery = "SELECT * FROM university_resources WHERE f_id = ?";
    const existingResource = await queryAsync(checkQuery, [resourceId]);

    if (existingResource.length === 0) {
      return res.status(404).json({ error: "Resource not found" });
    }

    if (f_name) {
      const nameCheckQuery = "SELECT * FROM university_resources WHERE f_name = ? AND f_id != ?";
      const nameConflict = await queryAsync(nameCheckQuery, [f_name, resourceId]);
      
      if (nameConflict.length > 0) {
        return res.status(400).json({ error: "Resource name already exists" });
      }
    }

    let updateFields = [];
    let updateValues = [];

    if (f_name !== undefined) {
      updateFields.push("f_name = ?");
      updateValues.push(f_name);
    }
    if (f_description !== undefined) {
      updateFields.push("f_description = ?");
      updateValues.push(f_description);
    }
    if (category !== undefined) {
      updateFields.push("category = ?");
      updateValues.push(category);
    }
    if (f_image !== null) {
      updateFields.push("f_image = ?");
      updateValues.push(f_image);
    }

    updateValues.push(resourceId);

    const updateQuery = `UPDATE university_resources SET ${updateFields.join(", ")} WHERE f_id = ?`;
    await queryAsync(updateQuery, updateValues);

    console.log(`Patched resource ${resourceId}`);
    return res.status(200).json({ message: "Resource updated successfully" });

  } catch (error) {
    console.error("Error patching resource:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

module.exports = router;