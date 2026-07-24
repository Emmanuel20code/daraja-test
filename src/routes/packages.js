const router = require("express").Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

router.get("/", requireAuth(), async (req, res) => {
  const { active } = req.query;
  let q = "SELECT * FROM packages";
  const params = [];
  if (active === "true") { q += " WHERE active = TRUE"; }
  q += " ORDER BY display_order, id";
  const result = await pool.query(q, params);
  res.json({ packages: result.rows });
});

router.post("/", requireAuth("administrator", "manager"), async (req, res) => {
  try {
    const { name, description, price, duration, download_speed, upload_speed, burst_speed,
            priority, data_cap_mb, unlimited, device_limit, active, display_order } = req.body;
    if (!name || !price || !duration) return res.status(400).json({ error: "Name, price, and duration are required" });
    const result = await pool.query(
      `INSERT INTO packages (name, description, price, duration, download_speed, upload_speed, burst_speed,
        priority, data_cap_mb, unlimited, device_limit, active, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [name, description, price, duration, download_speed || 5, upload_speed || 3, burst_speed,
       priority || 8, data_cap_mb, unlimited !== false, device_limit || 1, active !== false, display_order || 0]
    );
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, description)
       VALUES ($1,'create','package',$2,$3)`,
      [req.admin.id, result.rows[0].id, `Created package: ${name}`]
    );
    res.status(201).json({ package: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", requireAuth("administrator", "manager"), async (req, res) => {
  try {
    const { name, description, price, duration, download_speed, upload_speed, burst_speed,
            priority, data_cap_mb, unlimited, device_limit, active, display_order } = req.body;
    const result = await pool.query(
      `UPDATE packages SET name=$1,description=$2,price=$3,duration=$4,download_speed=$5,
        upload_speed=$6,burst_speed=$7,priority=$8,data_cap_mb=$9,unlimited=$10,
        device_limit=$11,active=$12,display_order=$13 WHERE id=$14 RETURNING *`,
      [name, description, price, duration, download_speed, upload_speed, burst_speed,
       priority, data_cap_mb, unlimited, device_limit, active, display_order, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Package not found" });
    res.json({ package: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", requireAuth("administrator"), async (req, res) => {
  await pool.query("UPDATE packages SET active = FALSE WHERE id = $1", [req.params.id]);
  res.json({ message: "Package deactivated" });
});

module.exports = router;
