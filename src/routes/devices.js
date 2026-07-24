const router = require("express").Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { normalizeMac } = require("../utils/helpers");

router.get("/", requireAuth(), async (req, res) => {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const sp = `%${search}%`;
    const rows = await pool.query(
      `SELECT d.*, c.phone, c.full_name, r.name AS router_name
       FROM devices d
       LEFT JOIN customers c ON c.id = d.customer_id
       LEFT JOIN routers r ON r.id = d.router_id
       WHERE d.mac_address ILIKE $1 OR d.device_name ILIKE $1 OR c.phone ILIKE $1
       ORDER BY d.last_seen DESC LIMIT $2 OFFSET $3`,
      [sp, parseInt(limit), offset]
    );
    res.json({ devices: rows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bind device to customer
router.post("/bind", requireAuth("administrator", "manager", "technician"), async (req, res) => {
  try {
    const { mac_address, customer_id, device_name } = req.body;
    const mac = normalizeMac(mac_address);
    if (!mac || !customer_id) return res.status(400).json({ error: "MAC address and customer_id required" });

    let devRes = await pool.query("SELECT id FROM devices WHERE mac_address = $1", [mac]);
    let deviceId;
    if (devRes.rows.length) {
      deviceId = devRes.rows[0].id;
      await pool.query(
        "UPDATE devices SET customer_id = $1, device_name = COALESCE($2, device_name) WHERE id = $3",
        [customer_id, device_name, deviceId]
      );
    } else {
      const ins = await pool.query(
        "INSERT INTO devices (mac_address, customer_id, device_name) VALUES ($1,$2,$3) RETURNING id",
        [mac, customer_id, device_name]
      );
      deviceId = ins.rows[0].id;
    }
    await pool.query(
      "INSERT INTO device_history (device_id, customer_id, mac_address, event_type, notes) VALUES ($1,$2,$3,'bound','Manual bind')",
      [deviceId, customer_id, mac]
    );
    res.json({ message: "Device bound", device_id: deviceId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Block/unblock device
router.patch("/:id/block", requireAuth("administrator", "manager"), async (req, res) => {
  const { blocked, reason } = req.body;
  await pool.query("UPDATE devices SET blocked = $1, block_reason = $2 WHERE id = $3", [blocked, reason, req.params.id]);
  res.json({ message: blocked ? "Device blocked" : "Device unblocked" });
});

// Rename device
router.patch("/:id/rename", requireAuth("administrator", "manager"), async (req, res) => {
  await pool.query("UPDATE devices SET device_name = $1 WHERE id = $2", [req.body.name, req.params.id]);
  res.json({ message: "Device renamed" });
});

// Unbind device
router.delete("/:id/unbind", requireAuth("administrator"), async (req, res) => {
  const dev = await pool.query("SELECT * FROM devices WHERE id = $1", [req.params.id]);
  if (!dev.rows.length) return res.status(404).json({ error: "Device not found" });
  await pool.query("INSERT INTO device_history (device_id, customer_id, mac_address, event_type) VALUES ($1,$2,$3,'unbound')",
    [dev.rows[0].id, dev.rows[0].customer_id, dev.rows[0].mac_address]);
  await pool.query("UPDATE devices SET customer_id = NULL WHERE id = $1", [req.params.id]);
  res.json({ message: "Device unbound" });
});

module.exports = router;
