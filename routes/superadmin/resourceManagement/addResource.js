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

router.post("/", upload.single('f_image'), async (req, res) => {
  try {
    const { f_id, f_name, f_description, category } = req.body;
    const f_image = req.file ? req.file.buffer : null;

    if (!f_id || !f_name || !f_description || !category) {
      return res.status(400).json({ error: "ID, name, description, and category are required" });
    }

    if (f_image) {
      const { fileTypeFromBuffer } = require('file-type');
      const type = await fileTypeFromBuffer(f_image);

      if (!type || !['image/jpeg', 'image/png'].includes(type.mime)) {
        return res.status(400).json({ error: "Invalid image file type" });
      }
    }

    const queryAsync = (query, params) => new Promise((resolve, reject) => {
      connection.query(query, params, (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });

    const checkQuery = "SELECT * FROM university_resources WHERE f_id = ? OR f_name = ?";
    const existing = await queryAsync(checkQuery, [f_id, f_name]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "ID or name already exists" });
    }

    const insertQuery =
      "INSERT INTO university_resources (f_id, f_name, f_description, f_image, category) VALUES (?, ?, ?, ?, ?)";
    await queryAsync(insertQuery, [f_id, f_name, f_description, f_image, category]);

    return res.status(201).json({ message: "Resource registered successfully" });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.post("/", upload.single('f_image'), async (req, res) => {
  const { f_id, f_name, f_description, category } = req.body;
  const f_image = req.file ? req.file.buffer : null; 

  if (!f_id || !f_name || !f_description || !category) {
    return res.status(400).json({ error: "ID, name, description, and category are required" });
  }

  try {
    const queryAsync = (query, params) => {
      return new Promise((resolve, reject) => {
        connection.query(query, params, (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });
    };

    const checkQuery = "SELECT * FROM university_resources WHERE f_id = ? OR f_name = ?";
    const existingResources = await queryAsync(checkQuery, [f_id, f_name]);

    if (existingResources.length > 0) {
      return res.status(400).json({ error: "ID or name already exists" });
    }

    const insertQuery = 
      "INSERT INTO university_resources (f_id, f_name, f_description, f_image, category) VALUES (?, ?, ?, ?, ?)";
    await queryAsync(insertQuery, [f_id, f_name, f_description, f_image, category]);

    return res.status(201).json({ message: "Resource registered successfully" });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

module.exports = router;