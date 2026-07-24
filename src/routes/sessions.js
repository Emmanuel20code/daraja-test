const router = require("express").Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const mikrotik = require("../services/mikrotik");
const logger = require("../utils/logger");

router.get("/", requireAuth(), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = "";
    if (status) { params.push(status); where = `WHERE s.status = $1`; }
    params.push(parseInt(limit), offset);
    const rows = await pool.query(
      `SELECT s.*, c.phone, c.full_name, pk.name AS package_name, r.name AS router_name
       FROM sessions s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN packages pk ON pk.id = s.package_id
       LEFT JOIN routers r ON r.id = s.router_id
       ${where} ORDER BY s.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ sessions: rows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Force disconnect a session
router.post("/:id/disconnect", requireAuth("administrator", "manager"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, r.ip_address, r.api_username, r.api_password, r.api_port, r.name AS router_name
       FROM sessions s LEFT JOIN routers r ON r.id = s.router_id WHERE s.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Session not found" });
    const session = result.rows[0];

    await pool.query(
      "UPDATE sessions SET status='disconnected', disconnect_time=NOW() WHERE id=$1",
      [req.params.id]
    );

    if (session.ip_address && session.hotspot_username) {
      try {
        await mikrotik.disconnectActiveUser(
          { ip_address: session.ip_address, api_username: session.api_username,
            api_password: session.api_password, api_port: session.api_port, name: session.router_name },
          session.hotspot_username
        );
      } catch (err) {
        logger.warn("Could not disconnect from router", { error: err.message });
      }
    }
    res.json({ message: "Session disconnected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
