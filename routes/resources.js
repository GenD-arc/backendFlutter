const express = require("express");
const router = express.Router();
const connection = require('../controllers/database');

// GET /api/resources/approver/:approverId - Get resources assigned to an approver
router.get("/approver/:approverId", (req, res) => {
  const { approverId } = req.params;
  
  const query = `
    SELECT DISTINCT ur.f_id, ur.f_name, ur.f_description, ur.category, ur.f_image 
    FROM university_resources ur
    JOIN facility_approval_workflows faw ON ur.f_id = faw.f_id
    WHERE faw.user_id = ?
    ORDER BY ur.f_name
  `;

  connection.query(query, [approverId], (err, results) => {
    if (err) {
      console.error("Error fetching resources by approver:", err);
      return res.status(500).json({ error: "Database error" });
    }

    console.log(`Found ${results.length} resources for approver ${approverId}`); // Debug log

    const resources = results.map(resource => {
      let imageUrl = null;
      if (resource.f_image && Buffer.isBuffer(resource.f_image)) {
        try {
          imageUrl = `data:image/jpeg;base64,${resource.f_image.toString('base64')}`;
          console.log(`Encoded image for ${resource.f_id}: ${imageUrl.slice(0, 50)}... (length: ${imageUrl.length})`); // Debug log
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