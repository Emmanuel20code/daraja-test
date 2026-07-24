const router = require("express").Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

router.get("/", requireAuth(), async (req, res) => {
  const result = await pool.query("SELECT key, value, description FROM settings ORDER BY key");
  const settings = {};
  for (const row of result.rows) settings[row.key] = row.value;
  res.json({ settings });
});

router.put("/", requireAuth("administrator"), async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "settings object required" });
    }
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        "UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2",
        [String(value), key]
      );
    }
    await pool.query(
      "INSERT INTO audit_logs (admin_id, action, resource_type, description) VALUES ($1,'update','settings','Settings updated')",
      [req.admin.id]
    );
    res.json({ message: "Settings updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
