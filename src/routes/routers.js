const router = require("express").Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const mikrotik = require("../services/mikrotik");
const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");

router.get("/", requireAuth(), async (req, res) => {
  const result = await pool.query("SELECT * FROM routers ORDER BY created_at DESC");
  res.json({ routers: result.rows });
});

router.get("/:id", requireAuth(), async (req, res) => {
  const [r, events, heartbeats] = await Promise.all([
    pool.query("SELECT * FROM routers WHERE id = $1", [req.params.id]),
    pool.query("SELECT * FROM router_events WHERE router_id = $1 ORDER BY created_at DESC LIMIT 20", [req.params.id]),
    pool.query("SELECT * FROM router_heartbeats WHERE router_id = $1 ORDER BY created_at DESC LIMIT 60", [req.params.id])
  ]);
  if (!r.rows.length) return res.status(404).json({ error: "Router not found" });
  res.json({ router: r.rows[0], events: events.rows, heartbeats: heartbeats.rows });
});

router.post("/", requireAuth("administrator", "manager"), async (req, res) => {
  try {
    const { name, location, ip_address, api_port, api_username, api_password, hotspot_name } = req.body;
    if (!name) return res.status(400).json({ error: "Router name required" });
    const token = uuidv4();
    const result = await pool.query(
      `INSERT INTO routers (name, location, ip_address, api_port, api_username, api_password, hotspot_name, token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, location, ip_address, api_port || 8728, api_username, api_password, hotspot_name || "hotspot", token]
    );
    res.status(201).json({ router: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", requireAuth("administrator", "manager"), async (req, res) => {
  const { name, location, ip_address, api_port, api_username, api_password, hotspot_name } = req.body;
  const result = await pool.query(
    `UPDATE routers SET name=$1,location=$2,ip_address=$3,api_port=$4,api_username=$5,api_password=$6,hotspot_name=$7
     WHERE id=$8 RETURNING *`,
    [name, location, ip_address, api_port, api_username, api_password, hotspot_name, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Router not found" });
  res.json({ router: result.rows[0] });
});

// Test router connectivity
router.post("/:id/test", requireAuth("administrator", "technician"), async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM routers WHERE id = $1", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "Router not found" });
    const info = await mikrotik.getSystemInfo(r.rows[0]);
    await pool.query(
      "UPDATE routers SET status='online', routeros_version=$1, model=$2, uptime=$3, last_heartbeat=NOW() WHERE id=$4",
      [info.version, info.model, info.uptime, req.params.id]
    );
    res.json({ message: "Connected", info });
  } catch (err) {
    await pool.query("UPDATE routers SET status='offline' WHERE id=$1", [req.params.id]);
    res.status(500).json({ error: err.message });
  }
});

// Heartbeat (called by router)
router.post("/heartbeat", async (req, res) => {
  try {
    const { token, cpu_load, free_memory, active_users, uptime, firmware } = req.body;
    if (!token) return res.status(400).json({ error: "Token required" });
    const r = await pool.query("SELECT id, name FROM routers WHERE token = $1", [token]);
    if (!r.rows.length) return res.status(404).json({ error: "Router not found" });

    const routerId = r.rows[0].id;
    await pool.query(
      `UPDATE routers SET status='online', last_heartbeat=NOW(), cpu_load=$1, free_memory=$2,
       active_users=$3, uptime=$4, firmware=$5 WHERE id=$6`,
      [cpu_load, free_memory, active_users, uptime, firmware, routerId]
    );
    await pool.query(
      "INSERT INTO router_heartbeats (router_id, cpu_load, free_memory, active_users, uptime) VALUES ($1,$2,$3,$4,$5)",
      [routerId, cpu_load, free_memory, active_users, uptime]
    );

    // Return list of usernames to disconnect (expired sessions)
    const expired = await pool.query(
      `SELECT hotspot_username FROM sessions
       WHERE router_id=$1 AND status='active' AND expiry_time <= NOW()`,
      [routerId]
    );

    res.json({
      ok: true,
      disconnect: expired.rows.map(r => r.hotspot_username).filter(Boolean)
    });
  } catch (err) {
    logger.error("Heartbeat error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Generate new onboarding token
router.post("/generate-token", requireAuth("administrator"), async (req, res) => {
  const token = uuidv4();
  await pool.query("INSERT INTO router_tokens (token) VALUES ($1)", [token]);
  const onboardUrl = `${process.env.APP_URL || "https://your-app.onrender.com"}/connect?token=${token}`;
  res.json({ token, onboardUrl });
});

module.exports = router;
