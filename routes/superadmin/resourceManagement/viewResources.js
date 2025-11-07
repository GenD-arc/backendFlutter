const express = require("express");
const router = express.Router();
const connection = require('../../../controllers/database');

router.get("/", (req, res) => {
  const categories = req.query.categories ? req.query.categories.split(',') : null;
  let query = "SELECT f_id, f_name, f_description, category, f_image FROM university_resources";
  let queryParams = [];

  if (categories && categories.length > 0) {
    query += " WHERE category IN (" + categories.map(() => "?").join(",") + ")";
    queryParams = categories;
  }

  connection.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("Error fetching resources:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const resources = results.map(resource => {
      let imageUrl = null;
      if (resource.f_image && Buffer.isBuffer(resource.f_image)) {
        try {
          imageUrl = `data:image/jpeg;base64,${resource.f_image.toString('base64')}`;
        } catch (error) {
          console.error(`Error encoding image for ${resource.f_id}:`, error);
        }
      } else if (resource.f_image) {
        console.error(`Invalid f_image for ${resource.f_id}: not a Buffer`);
      }
      return {
        f_id: resource.f_id,
        f_name: resource.f_name,
        f_description: resource.f_description,
        category: resource.category,
        image_url: imageUrl,
      };
    });

    res.status(200).json(resources);
  });
});

module.exports = router;